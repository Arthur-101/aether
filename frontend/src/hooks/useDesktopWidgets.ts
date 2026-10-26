/**
 * The main window's desktop-widget manager.
 *
 * One hook owns everything about popped-out widgets, because they only make
 * sense together:
 *
 * * the **list** (persisted layout) and the native windows that mirror it,
 * * the **state broadcast** the widget windows render from, and
 * * the **messages** widget windows send back (move, pin, remove, media control).
 *
 * Widget windows deliberately hold no state of their own, so this stays the
 * single source of truth and no second backend connection is needed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AppearanceConfig,
  AudioOutputDevice,
  MediaControlAction,
  MediaSnapshot,
  TimeFormat,
} from '../types/ipc';
import {
  createWidget,
  loadWidgets,
  saveWidgets,
} from '../widgets/store';
import {
  WIDGET_MEDIA_CONTROL_EVENT,
  WIDGET_MOVED_EVENT,
  WIDGET_PIN_EVENT,
  WIDGET_REMOVE_EVENT,
  WIDGET_SIZES,
  WIDGET_STATE_EVENT,
  WIDGET_STATE_REQUEST,
  deviceScale,
  type DesktopWidget,
  type WidgetAppearanceOverrides,
  type WidgetIdMessage,
  type WidgetKind,
  type WidgetMoveMessage,
  type WidgetPinMessage,
  type WidgetStatePayload,
} from '../widgets/types';

interface UseDesktopWidgetsOptions {
  appearance: AppearanceConfig;
  theme: 'light' | 'dark';
  timeFormat: TimeFormat;
  media: MediaSnapshot | null;
  audioDevices: AudioOutputDevice[];
  /** Current desktop wallpaper thumbnail, used by the aura widget theme. */
  wallpaper: string | null;
  onMediaControl: (action: MediaControlAction) => void;
}

export interface DesktopWidgetsApi {
  widgets: DesktopWidget[];
  addWidget: (kind: WidgetKind) => void;
  removeWidget: (id: string) => void;
  setWidgetAlwaysOnTop: (id: string, value: boolean) => void;
  setWidgetAppearance: (id: string, patch: WidgetAppearanceOverrides) => void;
  resetWidgetAppearance: (id: string) => void;
}

export function useDesktopWidgets({
  appearance,
  theme,
  timeFormat,
  media,
  audioDevices,
  wallpaper,
  onMediaControl,
}: UseDesktopWidgetsOptions): DesktopWidgetsApi {
  const [widgets, setWidgets] = useState<DesktopWidget[]>(() => loadWidgets());

  const payload = useMemo<WidgetStatePayload>(
    () => ({
      appearance,
      theme,
      timeFormat,
      media,
      audioDevices,
      wallpaper,
      widgets,
    }),
    [appearance, theme, timeFormat, media, audioDevices, wallpaper, widgets]
  );
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const mediaControlRef = useRef(onMediaControl);
  mediaControlRef.current = onMediaControl;

  useEffect(() => {
    saveWidgets(widgets);
  }, [widgets]);

  // Mirror the list onto native windows: creates the missing ones and closes
  // the ones whose widget is gone. The stored layout is logical (CSS) pixels;
  // the window host needs physical ones, so convert with the real device pixel
  // ratio here — see `deviceScale`.
  useEffect(() => {
    if (!isTauri()) return;
    const ratio = deviceScale();
    const specs = widgets.map((widget) => {
      const size = WIDGET_SIZES[widget.kind];
      return {
        ...widget,
        x: Math.round(widget.x * ratio),
        y: Math.round(widget.y * ratio),
        width: Math.round(size.width * ratio),
        height: Math.round(size.height * ratio),
      };
    });
    void invoke('sync_widgets', { specs }).catch((error) => {
      console.warn('sync_widgets failed:', error);
    });
  }, [widgets]);

  // Broadcast the render payload whenever anything a widget shows changes.
  useEffect(() => {
    if (!isTauri()) return;
    void emit(WIDGET_STATE_EVENT, payloadRef.current).catch(() => undefined);
  }, [payload]);

  useEffect(() => {
    if (!isTauri()) return;
    const disposers: UnlistenFn[] = [];
    let cancelled = false;
    const track = (pending: Promise<UnlistenFn>) => {
      void pending
        .then((unlisten) => {
          if (cancelled) unlisten();
          else disposers.push(unlisten);
        })
        .catch(() => undefined);
    };

    // A widget window asks for a snapshot as soon as it mounts.
    track(
      listen(WIDGET_STATE_REQUEST, () => {
        void emit(WIDGET_STATE_EVENT, payloadRef.current).catch(() => undefined);
      })
    );

    track(
      listen<WidgetMoveMessage>(WIDGET_MOVED_EVENT, (event) => {
        const { id, x, y } = event.payload;
        setWidgets((current) =>
          current.map((widget) =>
            widget.id === id ? { ...widget, x, y } : widget
          )
        );
      })
    );

    track(
      listen<WidgetPinMessage>(WIDGET_PIN_EVENT, (event) => {
        const { id, always_on_top } = event.payload;
        setWidgets((current) =>
          current.map((widget) =>
            widget.id === id ? { ...widget, always_on_top } : widget
          )
        );
      })
    );

    track(
      listen<WidgetIdMessage>(WIDGET_REMOVE_EVENT, (event) => {
        setWidgets((current) =>
          current.filter((widget) => widget.id !== event.payload.id)
        );
      })
    );

    track(
      listen<{ action: MediaControlAction }>(WIDGET_MEDIA_CONTROL_EVENT, (event) => {
        mediaControlRef.current(event.payload.action);
      })
    );

    return () => {
      cancelled = true;
      disposers.forEach((unlisten) => unlisten());
    };
  }, []);

  const addWidget = useCallback((kind: WidgetKind) => {
    setWidgets((current) => {
      // One widget of each kind lives on the desktop. The picker disables the
      // button for a kind that is already placed; this is the guard behind it.
      if (current.some((widget) => widget.kind === kind)) return current;
      return [...current, createWidget(kind, current)];
    });
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets((current) => current.filter((widget) => widget.id !== id));
  }, []);

  const setWidgetAlwaysOnTop = useCallback((id: string, value: boolean) => {
    setWidgets((current) =>
      current.map((widget) =>
        widget.id === id ? { ...widget, always_on_top: value } : widget
      )
    );
  }, []);

  const setWidgetAppearance = useCallback(
    (id: string, patch: WidgetAppearanceOverrides) => {
      setWidgets((current) =>
        current.map((widget) =>
          widget.id === id
            ? { ...widget, appearance: { ...widget.appearance, ...patch } }
            : widget
        )
      );
    },
    []
  );

  const resetWidgetAppearance = useCallback((id: string) => {
    setWidgets((current) =>
      current.map((widget) => {
        if (widget.id !== id) return widget;
        const { appearance: _appearance, ...rest } = widget;
        return rest;
      })
    );
  }, []);

  return {
    widgets,
    addWidget,
    removeWidget,
    setWidgetAlwaysOnTop,
    setWidgetAppearance,
    resetWidgetAppearance,
  };
}
