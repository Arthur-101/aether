/**
 * Shared contract for the desktop widgets.
 *
 * A widget lives in its own native window (see `src-tauri/src/widgets.rs`), so
 * types and event names have to stay in one place: the main window owns the
 * widget list and the widget windows only render what they are told.
 */

import type { AppearanceConfig, MediaSnapshot, TimeFormat } from '../types/ipc';

export type WidgetKind = 'media' | 'clock' | 'date';

export const WIDGET_KINDS: WidgetKind[] = ['media', 'clock', 'date'];

export interface DesktopWidget {
  id: string;
  kind: WidgetKind;
  /** Top-left corner in logical (CSS) pixels, matching the window builder. */
  x: number;
  y: number;
  /**
   * `true` keeps the widget above every other window. `false` pins it to the
   * desktop, so the user's windows cover it and typing is never interrupted.
   */
  always_on_top: boolean;
}

export interface WidgetSize {
  width: number;
  height: number;
}

/**
 * Fixed content sizes. Widgets are not resizable: each kind has one layout that
 * is measured to fit its content, which keeps the native window from ever
 * clipping or padding the card.
 */
export const WIDGET_SIZES: Record<WidgetKind, WidgetSize> = {
  media: { width: 372, height: 112 },
  clock: { width: 224, height: 112 },
  date: { width: 244, height: 164 },
};

/**
 * Physical pixels per logical (CSS) pixel on the display the widget lives on.
 *
 * Tauri's own `scaleFactor()` reports `1.0` on this machine while WebView2
 * paints at `1.12`, so the two disagree and a native window sized from the
 * builder comes out ~11% small. The device pixel ratio is the value the webview
 * actually renders with, so it is what converts the CSS layout used everywhere
 * else into the physical rectangle the window manager expects.
 */
export function deviceScale(): number {
  const ratio = window.devicePixelRatio || 1;
  return ratio > 0 ? ratio : 1;
}

export const WIDGET_LABELS: Record<WidgetKind, string> = {
  media: 'Media player',
  clock: 'Clock',
  date: 'Date',
};

export const WIDGET_DESCRIPTIONS: Record<WidgetKind, string> = {
  media: 'Now playing with transport controls',
  clock: 'Live time in the app time format',
  date: 'Day, date, and month',
};

/** Payload the main window broadcasts to every widget window. */
export interface WidgetStatePayload {
  appearance: AppearanceConfig;
  theme: 'light' | 'dark';
  timeFormat: TimeFormat;
  media: MediaSnapshot | null;
  widgets: DesktopWidget[];
}

/* Tauri event names. `aether://` keeps them apart from backend event types. */
export const WIDGET_STATE_EVENT = 'aether://widget-state';
export const WIDGET_STATE_REQUEST = 'aether://widget-state-request';
export const WIDGET_MOVED_EVENT = 'aether://widget-moved';
export const WIDGET_MEDIA_CONTROL_EVENT = 'aether://widget-media-control';
export const WIDGET_PIN_EVENT = 'aether://widget-pin';
export const WIDGET_REMOVE_EVENT = 'aether://widget-remove';

export interface WidgetMoveMessage {
  id: string;
  x: number;
  y: number;
}

export interface WidgetPinMessage {
  id: string;
  always_on_top: boolean;
}

export interface WidgetIdMessage {
  id: string;
}
