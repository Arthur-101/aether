import React, { useCallback, useEffect, useRef, useState } from 'react';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { appearanceCssVars, resolveAppearance } from '../Island/appearance';
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
import { WidgetFrame } from './WidgetFrame';

interface WidgetWindowProps {
  kind: WidgetKind;
  id: string;
}

/** The four text tokens every widget surface reads. */
function textVarsFor(color: string): Record<string, string> {
  return {
    '--aether-text-1': color,
    '--aether-text-2': `color-mix(in srgb, ${color} 84%, transparent)`,
    '--aether-text-3': `color-mix(in srgb, ${color} 64%, transparent)`,
    '--aether-text-4': `color-mix(in srgb, ${color} 46%, transparent)`,
  };
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

  if (!state) return null;

  // A widget may override the shared surface settings; resolveAppearance
  // clamps the merged values back into the normal ranges.
  const widgetAppearance = resolveAppearance({
    ...state.appearance,
    ...(self?.appearance ?? {}),
  });

  // A fully transparent surface hides the card, border, shadow, and grain while
  // leaving the text and controls on the desktop.
  const clearSurface = widgetAppearance.widget_opacity <= 0;
  const textColor = widgetAppearance.widget_text_color;
  // The cozy wash is available to every kind now: media gets the artwork
  // backdrop, the clock and date get the same warm surface without it.
  const cozyTheme = widgetAppearance.widget_theme === 'cozy';
  // At opacity 0 there is no warm wash left, so Auto text follows the desktop
  // theme again instead of the dark ink used on the cozy surface.
  const cozySurface = cozyTheme && !clearSurface;
  const textVars = textColor
    ? textVarsFor(textColor)
    : cozySurface
      ? textVarsFor('#3a2a2c')
      : {};

  const cozyVars: Record<string, string> = cozyTheme
    ? {
        // Decorative waves follow the chosen text colour on a clear surface.
        '--cozy-wave': textColor
          ? `color-mix(in srgb, ${textColor} 62%, transparent)`
          : cozySurface
            ? 'rgba(255, 248, 240, 0.82)'
            : 'var(--aether-text-3)',
        ...(cozySurface
          ? {
              '--aether-line': 'rgba(58, 42, 47, 0.16)',
              '--aether-line-soft': 'rgba(58, 42, 47, 0.1)',
              '--aether-line-strong': 'rgba(58, 42, 47, 0.26)',
              '--aether-fill': 'rgba(255, 255, 255, 0.26)',
              '--aether-fill-2': 'rgba(255, 255, 255, 0.42)',
              '--aether-fill-3': 'rgba(58, 42, 47, 0.14)',
              '--aether-shadow': 'rgba(58, 42, 47, 0.1)',
              '--aether-accent-text':
                'color-mix(in srgb, var(--aether-accent) 48%, #3a2a2c)',
            }
          : {}),
      }
    : {};

  return (
    <div
      data-theme={state.theme}
      style={
        {
          ...appearanceCssVars(widgetAppearance, state.theme),
          ...textVars,
          ...cozyVars,
          // The widget is its own window with its own surface, so it reads the
          // widget settings rather than the island's. Pop is not exposed here:
          // the window is exactly card-sized, so an outward shadow would be
          // clipped into dark corner wedges.
          '--aether-grain': clearSurface ? 0 : widgetAppearance.widget_grain,
          '--glass-alpha': widgetAppearance.widget_opacity,
        } as React.CSSProperties
      }
      className="h-screen w-screen overflow-hidden bg-transparent select-none"
    >
      <WidgetFrame
        kind={kind}
        alwaysOnTop={alwaysOnTop}
        radius={widgetAppearance.widget_radius}
        tone={cozyTheme ? 'cozy' : 'default'}
        backdrop={
          cozyTheme && kind === 'media' ? state.media?.artwork ?? null : null
        }
        clearSurface={clearSurface}
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
