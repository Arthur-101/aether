import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import {
  appearanceCssVars,
  DEFAULT_APPEARANCE,
  resolveAppearance,
} from '../Island/appearance';
import type { MediaControlAction } from '../../types/ipc';
import {
  WIDGET_MEDIA_CONTROL_EVENT,
  WIDGET_MOVED_EVENT,
  WIDGET_PIN_EVENT,
  WIDGET_REMOVE_EVENT,
  WIDGET_STATE_EVENT,
  WIDGET_STATE_REQUEST,
  deviceScale,
  type WidgetKind,
  type WidgetStatePayload,
} from '../../widgets/types';
import { ClockWidget } from './ClockWidget';
import { DateWidget } from './DateWidget';
import { DesktopMediaWidget } from './DesktopMediaWidget';
import { useAuraPalette } from './useAuraPalette';
import { WidgetFrame } from './WidgetFrame';
import { buildWidgetSurfaceTheme } from './widgetSurfaceTheme';

interface WidgetWindowProps {
  kind: WidgetKind;
  id: string;
}

/**
 * Root of a popped-out widget window.
 *
 * The window is a pure renderer: the main window owns the widget list and
 * broadcasts state, so this component never opens its own backend connection.
 * It asks for a snapshot on mount, then keeps whatever arrives.
 */
export const WidgetWindow: React.FC<WidgetWindowProps> = ({ kind, id }) => {
  const [state, setState] = useState<WidgetStatePayload | null>(null);
  const receivedRef = useRef(false);

  // Ask the main window for a snapshot. The widget can be created before the
  // main window's listener exists, so the request is retried a few times and
  // then given up: state also arrives on every later change.
  useEffect(() => {
    const request = () => {
      void emitTo('main', WIDGET_STATE_REQUEST, {}).catch(() => undefined);
    };
    request();
    const timers = [250, 750, 1500, 3000].map((delay) =>
      window.setTimeout(() => {
        if (!receivedRef.current) request();
      }, delay)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    let dispose: UnlistenFn | undefined;
    let cancelled = false;
    void listen<WidgetStatePayload>(WIDGET_STATE_EVENT, (event) => {
      receivedRef.current = true;
      setState(event.payload);
    })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else dispose = unlisten;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  // This widget's own entry in the list, which carries its placement.
  const self = state?.widgets.find((widget) => widget.id === id) ?? null;
  const alwaysOnTop = self?.always_on_top ?? true;

  // Resolve the effective surface before the empty-state return so the aura
  // palette hook below can run on every render, not just after state arrives.
  const widgetAppearance = useMemo(
    () =>
      resolveAppearance({
        ...(state?.appearance ?? DEFAULT_APPEARANCE),
        ...(self?.appearance ?? {}),
      }),
    [state?.appearance, self?.appearance]
  );
  const widgetTheme = widgetAppearance.widget_theme;
  const auraTheme = widgetTheme === 'aura';
  const mediaArtwork = state?.media?.has_session
    ? state.media.artwork
    : null;
  const auraSource = auraTheme
    ? mediaArtwork ?? state?.wallpaper ?? null
    : null;
  const auraPalette = useAuraPalette(auraSource);

  /**
   * Moves the native window with the pointer. The stored layout is logical
   * (CSS) pixels and `screenX` is already logical, so only the window's own
   * origin has to be converted from the physical value the window API returns,
   * and the result converted back before it is applied.
   *
   * A widget pinned to the desktop does not move: it belongs to the wallpaper
   * rather than to the working area, so it is dragged only while it is kept on
   * top.
   */
  const beginDrag = useCallback(
    (event: React.PointerEvent) => {
      if (!alwaysOnTop) return;
      if (event.button !== 0) return;
      if ((event.target as HTMLElement | null)?.closest('button, a, input')) return;
      event.preventDefault();

      const appWindow = getCurrentWindow();
      const ratio = deviceScale();
      const startPointer = { x: event.screenX, y: event.screenY };
      let base: { x: number; y: number } | null = null;
      let latest: { x: number; y: number } | null = null;
      let frame = 0;

      void appWindow
        .outerPosition()
        .then((origin) => {
          base = { x: origin.x / ratio, y: origin.y / ratio };
        })
        .catch(() => undefined);

      const flush = () => {
        frame = 0;
        if (!latest) return;
        void appWindow
          .setPosition(
            new PhysicalPosition(
              Math.round(latest.x * ratio),
              Math.round(latest.y * ratio)
            )
          )
          .catch(() => undefined);
      };

      const onMove = (move: PointerEvent) => {
        if (!base) return;
        latest = {
          x: base.x + (move.screenX - startPointer.x),
          y: base.y + (move.screenY - startPointer.y),
        };
        if (!frame) frame = window.requestAnimationFrame(flush);
      };

      const onEnd = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        if (frame) window.cancelAnimationFrame(frame);
        if (latest) {
          void emitTo('main', WIDGET_MOVED_EVENT, {
            id,
            x: Math.round(latest.x),
            y: Math.round(latest.y),
          }).catch(() => undefined);
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    },
    [alwaysOnTop, id]
  );

  const togglePinned = useCallback(() => {
    void emitTo('main', WIDGET_PIN_EVENT, {
      id,
      always_on_top: !alwaysOnTop,
    }).catch(() => undefined);
  }, [alwaysOnTop, id]);

  const close = useCallback(() => {
    void emitTo('main', WIDGET_REMOVE_EVENT, { id }).catch(() => undefined);
  }, [id]);

  const controlMedia = useCallback(
    (action: MediaControlAction) => {
      void emitTo('main', WIDGET_MEDIA_CONTROL_EVENT, { action }).catch(
        () => undefined
      );
    },
    []
  );

  if (!state) return null;

  const surface = buildWidgetSurfaceTheme(
    widgetAppearance,
    auraPalette,
    kind,
    mediaArtwork,
    state.wallpaper
  );

  return (
    <div
      data-theme={state.theme}
      style={
        {
          ...appearanceCssVars(widgetAppearance, state.theme),
          ...surface.textVars,
          ...surface.vars,
          // The widget is its own window with its own surface, so it reads the
          // widget settings rather than the island's. Pop is not exposed here:
          // the window is exactly card-sized, so an outward shadow would be
          // clipped into dark corner wedges.
          '--aether-grain': surface.clearSurface
            ? 0
            : widgetAppearance.widget_grain,
          '--glass-alpha': widgetAppearance.widget_opacity,
        } as React.CSSProperties
      }
      className="h-screen w-screen overflow-hidden bg-transparent select-none"
    >
      <WidgetFrame
        kind={kind}
        alwaysOnTop={alwaysOnTop}
        radius={widgetAppearance.widget_radius}
        tone={surface.tone}
        backdrop={surface.backdrop}
        clearSurface={surface.clearSurface}
        onTogglePinned={togglePinned}
        onClose={close}
        onDragStart={beginDrag}
      >
        {kind === 'media' ? (
          <DesktopMediaWidget
            media={state.media}
            audioDevices={state.audioDevices}
            onControl={controlMedia}
            theme={widgetAppearance.widget_theme}
          />
        ) : null}
        {kind === 'clock' ? (
          <ClockWidget
            timeFormat={state.timeFormat}
            showSeconds={widgetAppearance.widget_clock_seconds}
            showDayDate={widgetAppearance.widget_clock_daydate}
            theme={widgetAppearance.widget_theme}
          />
        ) : null}
        {kind === 'date' ? (
          <DateWidget theme={widgetAppearance.widget_theme} />
        ) : null}
      </WidgetFrame>
    </div>
  );
};
