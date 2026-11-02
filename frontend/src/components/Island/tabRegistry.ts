import {
  Activity,
  Calculator,
  CalendarClock,
  Image as ImageIcon,
  MessageSquare,
  Power,
  SlidersHorizontal,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import type { DashboardTabId } from '../../types/ipc';

export interface DashboardTabDefinition {
  id: DashboardTabId;
  label: string;
  icon: LucideIcon;
}

export const DASHBOARD_TABS: DashboardTabDefinition[] = [
  { id: 'controls', label: 'Controls', icon: SlidersHorizontal },
  { id: 'chat', label: 'Quick Chat', icon: MessageSquare },
  { id: 'calc', label: 'Calculator', icon: Calculator },
  { id: 'clock', label: 'Clock & Tasks', icon: CalendarClock },
  { id: 'stats', label: 'Stats', icon: Activity },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'wallpaper', label: 'Wallpaper', icon: ImageIcon },
  { id: 'power', label: 'Power', icon: Power },
];

export const DEFAULT_TAB_IDS: DashboardTabId[] = DASHBOARD_TABS.map((tab) => tab.id);

const TAB_IDS = new Set<string>(DEFAULT_TAB_IDS);

/**
 * Exact tab lists written before the Calculator tab shipped.
 *
 * A config that still holds one of these untouched default lists adopts the
 * current default, so a newly shipped tab appears on upgrade. A layout the
 * user customised or trimmed is left alone.
 */
const LEGACY_DEFAULT_LAYOUTS: DashboardTabId[][] = [
  ['controls', 'chat', 'clock', 'stats', 'notes', 'wallpaper', 'power'],
];

function matchesLayout(tabs: DashboardTabId[], layout: DashboardTabId[]): boolean {
  return (
    tabs.length === layout.length &&
    tabs.every((id, index) => id === layout[index])
  );
}

export function isDashboardTabId(value: string): value is DashboardTabId {
  return TAB_IDS.has(value);
}

export function migrateDashboardTabId(value: string): string {
  return value === 'today' ? 'clock' : value;
}

export function normalizeDashboardTabs(
  value: readonly string[] | null | undefined
): DashboardTabId[] {
  if (!Array.isArray(value)) return [...DEFAULT_TAB_IDS];
  const seen = new Set<DashboardTabId>();
  const result: DashboardTabId[] = [];
  for (const raw of value) {
    const id = migrateDashboardTabId(String(raw));
    if (!isDashboardTabId(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  if (!result.length) return [...DEFAULT_TAB_IDS];
  const isLegacyDefault = LEGACY_DEFAULT_LAYOUTS.some((layout) =>
    matchesLayout(result, layout)
  );
  return isLegacyDefault ? [...DEFAULT_TAB_IDS] : result;
}

export function tabDefinition(id: DashboardTabId): DashboardTabDefinition {
  return DASHBOARD_TABS.find((tab) => tab.id === id) ?? DASHBOARD_TABS[0];
}
