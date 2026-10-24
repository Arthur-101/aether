import React, { useCallback, useEffect, useRef, useState } from 'react';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { Music2 } from 'lucide-react';
import { appearanceCssVars } from '../Island/appearance';
import { MediaWidget } from '../Island/MediaWidget';
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
import { WidgetFrame } from './WidgetFrame';
import { buildMonthGrid } from '../../widgets/format';

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

  const dateHeaderLabel = kind === 'date' ? buildMonthGrid(new Date()).label : undefined;

  if (!state) return null;

  return (
    <div
      data-theme={state.theme}
      style={
        {
          ...appearanceCssVars(state.appearance, state.theme),
          // The widget is its own window with its own surface, so it reads the
          // widget settings rather than the island's.
          '--aether-grain': state.appearance.widget_grain,
          '--aether-pop': state.appearance.widget_pop,
          '--glass-alpha': state.appearance.widget_opacity,
        } as React.CSSProperties
      }
      className="h-screen w-screen overflow-hidden bg-transparent select-none"
    >
      <WidgetFrame
        kind={kind}
        alwaysOnTop={alwaysOnTop}
        radius={state.appearance.widget_radius}
        onTogglePinned={togglePinned}
        onClose={close}
        onDragStart={beginDrag}
        headerLabel={dateHeaderLabel}
      >
        {kind === 'media' ? (
          state.media && state.media.available && state.media.has_session ? (
            <MediaWidget
              media={state.media}
              compact
              frameless
              onControl={controlMedia}
            />
          ) : (
            <div className="flex h-full items-center gap-2.5 px-1">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-3)]">
                <Music2 size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-[10.5px] font-semibold text-[var(--aether-text-1)]">
                  Nothing playing
                </div>
                <div className="truncate text-[9px] text-[var(--aether-text-3)]">
                  Start a track and it appears here
                </div>
              </div>
            </div>
          )
        ) : null}
        {kind === 'clock' ? <ClockWidget timeFormat={state.timeFormat} /> : null}
        {kind === 'date' ? <DateWidget /> : null}
      </WidgetFrame>
    </div>
  );
};
