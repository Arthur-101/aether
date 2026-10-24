/**
 * Persistence for the desktop widget list.
 *
 * The layout is a UI concern that changes on every drag, so it lives in
 * `localStorage` next to the picked colour rather than round-tripping through
 * the Python config on every pointer move. The payload is validated and
 * clamped on read, so a stale entry from a removed monitor can never place a
 * widget off-screen.
 */

import {
  WIDGET_KINDS,
  WIDGET_SIZES,
  type DesktopWidget,
  type WidgetKind,
} from './types';

const STORAGE_KEY = 'aether.desktop_widgets';
const STORAGE_VERSION = 1;

/** Smallest visible strip of a widget that must stay on screen. */
const KEEP_VISIBLE = 48;
const MARGIN = 24;
const TOP_MARGIN = 96;
const GAP = 16;

interface StoredWidgets {
  version: number;
  widgets: DesktopWidget[];
}

function isWidgetKind(value: unknown): value is WidgetKind {
  return typeof value === 'string' && (WIDGET_KINDS as string[]).includes(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Clamps a stored position so at least a sliver of the widget stays reachable. */
function onScreen(widget: DesktopWidget): DesktopWidget {
  const { width, height } = WIDGET_SIZES[widget.kind];
  const maxX = Math.max(MARGIN, window.innerWidth - KEEP_VISIBLE);
  const maxY = Math.max(MARGIN, window.innerHeight - KEEP_VISIBLE);
  return {
    ...widget,
    x: Math.min(Math.max(widget.x, -(width - KEEP_VISIBLE)), maxX),
    y: Math.min(Math.max(widget.y, -(height - KEEP_VISIBLE)), maxY),
  };
}

function normalize(value: unknown): DesktopWidget | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (!isWidgetKind(raw.kind)) return null;
  const x = finiteNumber(raw.x);
  const y = finiteNumber(raw.y);
  if (x === null || y === null) return null;
  return onScreen({
    id: raw.id,
    kind: raw.kind,
    x,
    y,
    always_on_top: raw.always_on_top !== false,
  });
}

export function loadWidgets(): DesktopWidget[] {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return [];
    const parsed = JSON.parse(text) as Partial<StoredWidgets>;
    if (!parsed || parsed.version !== STORAGE_VERSION) return [];
    if (!Array.isArray(parsed.widgets)) return [];
    const seen = new Set<string>();
    return parsed.widgets
      .map(normalize)
      .filter((widget): widget is DesktopWidget => Boolean(widget))
      .filter((widget) => (seen.has(widget.id) ? false : seen.add(widget.id)));
  } catch {
    return [];
  }
}

export function saveWidgets(widgets: DesktopWidget[]): void {
  try {
    const payload: StoredWidgets = { version: STORAGE_VERSION, widgets };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // A full or unavailable store must not break the running UI.
  }
}

export function nextWidgetId(): string {
  // No dashes: the native window label is `widget-<kind>-<id>`.
  return `w${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/**
 * Default spot: a column down the right edge.
 *
 * Widgets are right-aligned, so they share an edge and would sit on top of one
 * another if the slots were assigned by count alone — the date panel is twice
 * the height of the clock, and a fixed row step cannot suit both. Instead the
 * column is scanned for the first slot that clears everything already placed,
 * and it spills into the next column to the left when the column is full.
 */
export function defaultWidgetPosition(
  kind: WidgetKind,
  existing: DesktopWidget[]
): { x: number; y: number } {
  const { width, height } = WIDGET_SIZES[kind];
  const right = window.innerWidth - MARGIN;
  const bottom = window.innerHeight - MARGIN;

  const clears = (x: number, y: number) =>
    !existing.some((widget) => {
      const other = WIDGET_SIZES[widget.kind];
      const overlapsHorizontally =
        widget.x < x + width + GAP && x < widget.x + other.width + GAP;
      const overlapsVertically =
        widget.y < y + height + GAP && y < widget.y + other.height + GAP;
      return overlapsHorizontally && overlapsVertically;
    });

  for (let column = 0; column < 4; column += 1) {
    const x = Math.max(MARGIN, right - width - column * 56);
    for (let y = TOP_MARGIN; y + height <= bottom; y += GAP) {
      if (clears(x, y)) return { x, y };
    }
  }

  // The screen is full: park it at the top of the last column.
  return {
    x: Math.max(MARGIN, right - width - 3 * 56),
    y: TOP_MARGIN,
  };
}

export function createWidget(
  kind: WidgetKind,
  existing: DesktopWidget[]
): DesktopWidget {
  const position = defaultWidgetPosition(kind, existing);
  return {
    id: nextWidgetId(),
    kind,
    x: position.x,
    y: position.y,
    // A new widget starts on top so it is immediately visible where it lands.
    always_on_top: true,
  };
}

export { WIDGET_SIZES };
