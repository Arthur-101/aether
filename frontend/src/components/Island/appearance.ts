import type { CSSProperties } from 'react';
import type {
  AppearanceConfig,
  ClockConfig,
  DashboardTabId,
  TaskbarAppsConfig,
} from '../../types/ipc';
import { normalizeHex, accentBackground, accentTextColor } from './contrast';
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
  pill_opacity: 0.88,
  island_opacity: 0.92,
  button_primary: GOLD_PRIMARY,
  button_secondary: GOLD_SECONDARY,
  button_gradient: true,
  close_on_outside_click: false,
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

function clampOpacity(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.max(0.3, Math.min(1, number)) * 100) / 100;
}

export function resolveAppearance(
  value?: Partial<AppearanceConfig> | null
): AppearanceConfig {
  const raw = value ?? {};
  return {
    dashboard_tabs: normalizeDashboardTabs(raw.dashboard_tabs as string[] | undefined),
    pill_opacity: clampOpacity(raw.pill_opacity, DEFAULT_APPEARANCE.pill_opacity),
    island_opacity: clampOpacity(raw.island_opacity, DEFAULT_APPEARANCE.island_opacity),
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
  return {
    background: accentBackground(
      appearance.button_primary,
      appearance.button_secondary,
      appearance.button_gradient
    ),
    color: accentTextColor(
      appearance.button_primary,
      appearance.button_secondary
    ),
  };
}

export function appearanceCssVars(
  appearance: AppearanceConfig
): CSSProperties {
  return {
    '--aether-accent': appearance.button_primary,
    '--aether-accent-secondary': appearance.button_secondary,
    '--aether-accent-gradient': accentBackground(
      appearance.button_primary,
      appearance.button_secondary,
      appearance.button_gradient
    ),
    '--aether-accent-contrast': accentTextColor(
      appearance.button_primary,
      appearance.button_secondary
    ),
  } as CSSProperties;
}

export function visibleTabIds(appearance: AppearanceConfig): DashboardTabId[] {
  return normalizeDashboardTabs(appearance.dashboard_tabs);
}
