import type { CSSProperties } from 'react';
import type {
  AppearanceConfig,
  ClockConfig,
  DashboardTabId,
  GlowColor,
  GlowStyle,
  TaskbarAppsConfig,
  ThemeMode,
  TimeFormat,
  WidgetTheme,
} from '../../types/ipc';
import { normalizeHex, accentVisuals } from './contrast';
import { normalizeDashboardTabs } from './tabRegistry';

export const GOLD_PRIMARY = '#E8C56B';
export const GOLD_SECONDARY = '#F4DF9A';

export const DEFAULT_CLOCK_CONFIG: ClockConfig = {
  weather_mode: 'auto',
  weather_city: '',
  weather_latitude: null,
  weather_longitude: null,
  weather_unit: 'celsius',
  weather_label: '',
};

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  dashboard_tabs: [
    'controls',
    'chat',
    'clock',
    'stats',
    'notes',
    'wallpaper',
    'power',
  ],
  theme_mode: 'system',
  glow_style: 'glass',
  glow_color: 'source',
  pill_opacity: 0.88,
  island_opacity: 0.92,
  pill_grain: 5,
  island_grain: 5,
  pill_pop: 60,
  island_pop: 60,
  widget_opacity: 0.9,
  widget_grain: 5,
  widget_pop: 60,
  widget_radius: 16,
  widget_clock_seconds: true,
  widget_clock_daydate: true,
  widget_theme: 'default',
  widget_text_color: '',
  button_primary: GOLD_PRIMARY,
  button_secondary: GOLD_SECONDARY,
  button_gradient: true,
  close_on_outside_click: false,
  auto_hide_pill: false,
  time_format: '12h',
};

export interface AccentPreset {
  id: string;
  label: string;
  primary: string;
  secondary: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'gold', label: 'Gold', primary: GOLD_PRIMARY, secondary: GOLD_SECONDARY },
  { id: 'copper', label: 'Copper', primary: '#D98B5F', secondary: '#F0B38A' },
  { id: 'sage', label: 'Sage', primary: '#9DBE8D', secondary: '#C8DDBB' },
  { id: 'ocean', label: 'Ocean', primary: '#5FB4D9', secondary: '#9AD7EF' },
  { id: 'iris', label: 'Iris', primary: '#9A8CF0', secondary: '#C5BCFF' },
  { id: 'rose', label: 'Rose', primary: '#E792A8', secondary: '#F4BCCB' },
];

function clampOpacity(value: unknown, fallback: number, minimum = 0.3): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.max(minimum, Math.min(1, number)) * 100) / 100;
}

function clampPercent(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.max(0, Math.min(100, number)));
}

/** Empty means "follow the theme"; otherwise a #RGB/#RRGGBB colour. */
function normalizeWidgetTextColor(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw ? normalizeHex(raw, '') : '';
}

/** Clamps a pixel length, used for the widget corner radius. */
function clampPixels(value: unknown, fallback: number, limit: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.max(0, Math.min(limit, number)));
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  const mode = String(value ?? '').trim().toLowerCase();
  return mode === 'light' || mode === 'dark' ? mode : 'system';
}

export function normalizeGlowStyle(value: unknown): GlowStyle {
  const style = String(value ?? '').trim().toLowerCase();
  return GLOW_STYLES.includes(style as GlowStyle)
    ? (style as GlowStyle)
    : DEFAULT_APPEARANCE.glow_style;
}

export function normalizeGlowColor(value: unknown): GlowColor {
  const color = String(value ?? '').trim().toLowerCase();
  return color === 'theme' ? 'theme' : 'source';
}

export function normalizeTimeFormat(value: unknown): TimeFormat {
  return String(value ?? '').trim().toLowerCase() === '24h' ? '24h' : '12h';
}

/** Unknown or stale values fall back to the original glass media card. */
export function normalizeWidgetTheme(value: unknown): WidgetTheme {
  return String(value ?? '').trim().toLowerCase() === 'cozy' ? 'cozy' : 'default';
}

export const GLOW_STYLES: GlowStyle[] = [
  'off',
  'soft',
  'glass',
  'neon',
  'pulse',
];

/**
 * Resolves the theme the overlay should paint.
 *
 * `system` follows the Windows theme, so the island, the pill, and Settings
 * all flip with the desktop. An explicit light or dark choice overrides it.
 */
export function resolveTheme(
  mode: ThemeMode,
  windowsDarkMode: boolean | null | undefined
): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return windowsDarkMode === false ? 'light' : 'dark';
}

export function resolveAppearance(
  value?: Partial<AppearanceConfig> | null
): AppearanceConfig {
  const raw = value ?? {};
  return {
    dashboard_tabs: normalizeDashboardTabs(raw.dashboard_tabs as string[] | undefined),
    theme_mode: normalizeThemeMode(raw.theme_mode),
    glow_style: normalizeGlowStyle(raw.glow_style),
    glow_color: normalizeGlowColor(raw.glow_color),
    pill_opacity: clampOpacity(raw.pill_opacity, DEFAULT_APPEARANCE.pill_opacity),
    island_opacity: clampOpacity(raw.island_opacity, DEFAULT_APPEARANCE.island_opacity),
    pill_grain: clampPercent(raw.pill_grain, DEFAULT_APPEARANCE.pill_grain),
    island_grain: clampPercent(raw.island_grain, DEFAULT_APPEARANCE.island_grain),
    pill_pop: clampPercent(raw.pill_pop, DEFAULT_APPEARANCE.pill_pop),
    island_pop: clampPercent(raw.island_pop, DEFAULT_APPEARANCE.island_pop),
    // The widget surface may be taken all the way to transparent so the text
    // can sit directly on the wallpaper.
    widget_opacity: clampOpacity(
      raw.widget_opacity,
      DEFAULT_APPEARANCE.widget_opacity,
      0
    ),
    widget_grain: clampPercent(raw.widget_grain, DEFAULT_APPEARANCE.widget_grain),
    widget_pop: clampPercent(raw.widget_pop, DEFAULT_APPEARANCE.widget_pop),
    widget_radius: clampPixels(
      raw.widget_radius,
      DEFAULT_APPEARANCE.widget_radius,
      32
    ),
    widget_clock_seconds:
      typeof raw.widget_clock_seconds === 'boolean'
        ? raw.widget_clock_seconds
        : DEFAULT_APPEARANCE.widget_clock_seconds,
    widget_clock_daydate:
      typeof raw.widget_clock_daydate === 'boolean'
        ? raw.widget_clock_daydate
        : DEFAULT_APPEARANCE.widget_clock_daydate,
    widget_theme: normalizeWidgetTheme(raw.widget_theme),
    widget_text_color: normalizeWidgetTextColor(raw.widget_text_color),
    button_primary: normalizeHex(
      String(raw.button_primary ?? ''),
      GOLD_PRIMARY
    ),
    button_secondary: normalizeHex(
      String(raw.button_secondary ?? ''),
      GOLD_SECONDARY
    ),
    button_gradient:
      typeof raw.button_gradient === 'boolean'
        ? raw.button_gradient
        : DEFAULT_APPEARANCE.button_gradient,
    close_on_outside_click:
      typeof raw.close_on_outside_click === 'boolean'
        ? raw.close_on_outside_click
        : DEFAULT_APPEARANCE.close_on_outside_click,
    auto_hide_pill:
      typeof raw.auto_hide_pill === 'boolean'
        ? raw.auto_hide_pill
        : DEFAULT_APPEARANCE.auto_hide_pill,
    time_format: normalizeTimeFormat(raw.time_format),
  };
}

export function resolveTaskbarApps(
  value?: Partial<TaskbarAppsConfig> | null
): TaskbarAppsConfig {
  return {
    mode: value?.mode === 'custom' ? 'custom' : 'mirror',
    pinned: Array.isArray(value?.pinned) ? value.pinned : [],
  };
}

export function accentStyle(appearance: AppearanceConfig): CSSProperties {
  const accent = accentVisuals(
    appearance.button_primary,
    appearance.button_secondary,
    appearance.button_gradient
  );
  return {
    background: accent.background,
    color: accent.text,
  };
}

export function accentGradientSuppressed(appearance: AppearanceConfig): boolean {
  return accentVisuals(
    appearance.button_primary,
    appearance.button_secondary,
    appearance.button_gradient
  ).gradientSuppressed;
}

export function appearanceCssVars(
  appearance: AppearanceConfig,
  theme?: 'light' | 'dark'
): CSSProperties {
  const accent = accentVisuals(
    appearance.button_primary,
    appearance.button_secondary,
    appearance.button_gradient
  );
  return {
    '--aether-accent': appearance.button_primary,
    '--aether-accent-secondary': appearance.button_secondary,
    '--aether-accent-gradient': accent.background,
    '--aether-accent-contrast': accent.text,
    // A custom property that references another is resolved where it is
    // declared, so the accent text colour has to be set alongside the accent
    // itself rather than derived in the stylesheet.
    ...(theme
      ? {
          '--aether-accent-text':
            theme === 'light'
              ? `color-mix(in srgb, ${appearance.button_primary} 82%, black)`
              : appearance.button_primary,
        }
      : {}),
    '--aether-grain': appearance.island_grain,
    '--aether-pop': appearance.island_pop,
  } as CSSProperties;
}

export function visibleTabIds(appearance: AppearanceConfig): DashboardTabId[] {
  return normalizeDashboardTabs(appearance.dashboard_tabs);
}
