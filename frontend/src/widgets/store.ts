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
  type WidgetAppearanceOverrides,
  type WidgetKind,
} from './types';

const STORAGE_KEY = 'aether.desktop_widgets';
// Version 2 changed every widget's fixed size. Older layouts are re-flowed so
// a grown card does not land on top of the one below it.
const STORAGE_VERSION = 2;
const LEGACY_VERSION = 1;

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

function overlaps(a: DesktopWidget, b: DesktopWidget): boolean {
  const aSize = WIDGET_SIZES[a.kind];
  const bSize = WIDGET_SIZES[b.kind];
  return (
    a.x < b.x + bSize.width &&
    b.x < a.x + aSize.width &&
    a.y < b.y + bSize.height &&
    b.y < a.y + aSize.height
  );
}

/**
 * Pushes overlapping widgets down in their existing order. The old card sizes
 * were smaller, so a stored layout can overlap once the redesign loads; the x
 * positions and the user's vertical order are kept.
 */
function reflowWidgets(widgets: DesktopWidget[]): DesktopWidget[] {
  const ordered = [...widgets].sort((a, b) => a.y - b.y);
  const placed: DesktopWidget[] = [];
  for (const widget of ordered) {
    let next = { ...widget };
    let moved = true;
    while (moved) {
      moved = false;
      for (const other of placed) {
        if (!overlaps(next, other)) continue;
        next = {
          ...next,
          y: other.y + WIDGET_SIZES[other.kind].height + GAP,
        };
        moved = true;
      }
    }
    placed.push(next);
  }
  return placed.map(onScreen);
}

function normalizeWidgetAppearance(
  value: unknown
): WidgetAppearanceOverrides | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const out: WidgetAppearanceOverrides = {};
  const opacity = (input: unknown) => {
    const number = typeof input === 'number' ? input : Number(input);
    return Number.isFinite(number)
      ? Math.round(Math.max(0, Math.min(1, number)) * 100) / 100
      : undefined;
  };
  const percent = (input: unknown) => {
    const number = typeof input === 'number' ? input : Number(input);
    return Number.isFinite(number)
      ? Math.round(Math.max(0, Math.min(100, number)))
      : undefined;
  };
  const pixels = (input: unknown) => {
    const number = typeof input === 'number' ? input : Number(input);
    return Number.isFinite(number)
      ? Math.round(Math.max(0, Math.min(32, number)))
      : undefined;
  };

  const widgetOpacity = opacity(raw.widget_opacity);
  if (widgetOpacity !== undefined) out.widget_opacity = widgetOpacity;
  const widgetGrain = percent(raw.widget_grain);
  if (widgetGrain !== undefined) out.widget_grain = widgetGrain;
  const widgetPop = percent(raw.widget_pop);
  if (widgetPop !== undefined) out.widget_pop = widgetPop;
  const widgetRadius = pixels(raw.widget_radius);
  if (widgetRadius !== undefined) out.widget_radius = widgetRadius;
  if (typeof raw.widget_text_color === 'string') {
    out.widget_text_color = raw.widget_text_color;
  }
  if (typeof raw.widget_clock_seconds === 'boolean') {
    out.widget_clock_seconds = raw.widget_clock_seconds;
  }
  if (typeof raw.widget_clock_daydate === 'boolean') {
    out.widget_clock_daydate = raw.widget_clock_daydate;
  }
  if (raw.widget_theme === 'default' || raw.widget_theme === 'cozy') {
    out.widget_theme = raw.widget_theme;
  }
  return Object.keys(out).length ? out : undefined;
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
    appearance: normalizeWidgetAppearance(raw.appearance),
  });
}

export function loadWidgets(): DesktopWidget[] {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return [];
    const parsed = JSON.parse(text) as Partial<StoredWidgets>;
    if (
      !parsed ||
      (parsed.version !== LEGACY_VERSION && parsed.version !== STORAGE_VERSION)
    ) {
      return [];
    }
    if (!Array.isArray(parsed.widgets)) return [];
    const seen = new Set<string>();
    const widgets = parsed.widgets
      .map(normalize)
      .filter((widget): widget is DesktopWidget => Boolean(widget))
      .filter((widget) => (seen.has(widget.id) ? false : seen.add(widget.id)));
    return parsed.version === LEGACY_VERSION ? reflowWidgets(widgets) : widgets;
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
