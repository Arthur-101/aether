import React from 'react';
import {
  AppWindow,
  LayoutGrid,
  MonitorCog,
  Moon,
  Palette,
  PanelTop,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Type,
} from 'lucide-react';
import type {
  AppearanceConfig,
  GlowStyle,
  TaskbarAppsConfig,
  TaskbarAppsState,
  ThemeMode,
  TimeFormat,
} from '../../../types/ipc';
import { DEFAULT_TAB_IDS } from '../../Island/tabRegistry';
import { ButtonColorSettings } from './ButtonColorSettings';
import { DashboardTabsSettings } from './DashboardTabsSettings';
import { SurfaceSlider } from './SurfaceSliders';
import { TaskbarAppsSettings } from './TaskbarAppsSettings';

const GLOW_OPTIONS: { id: GlowStyle; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'soft', label: 'Soft' },
  { id: 'glass', label: 'Glass' },
  { id: 'neon', label: 'Neon' },
  { id: 'pulse', label: 'Pulse' },
];

const THEME_OPTIONS: {
  id: ThemeMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  {
    id: 'system',
    label: 'System',
    description: 'Follow Windows',
    icon: MonitorCog,
  },
  { id: 'light', label: 'Light', description: 'Always light', icon: Sun },
  { id: 'dark', label: 'Dark', description: 'Always dark', icon: Moon },
];

const TIME_FORMAT_OPTIONS: { id: TimeFormat; label: string; example: string }[] = [
  { id: '12h', label: '12-hour', example: '5:14 pm' },
  { id: '24h', label: '24-hour', example: '17:14' },
];

interface AppearanceSettingsProps {
  appearance: AppearanceConfig;
  brandName: string;
  onBrandNameChange: (value: string) => void;
  taskbarApps: TaskbarAppsConfig;
  taskbarState: TaskbarAppsState | null;
  onChange: (appearance: AppearanceConfig) => void;
  onTaskbarChange: (taskbarApps: TaskbarAppsConfig) => void;
  onRefreshTaskbar: () => void;
}

const Group: React.FC<{
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, title, action, children }) => (
  <section className="flex flex-col gap-2">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--aether-text-3)]">{icon}</span>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--aether-text-2)]">
          {title}
        </h4>
      </div>
      {action}
    </div>
    {children}
  </section>
);

const ToggleRow: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between gap-3 text-left"
  >
    <span className="min-w-0">
      <span className="block text-[11px] text-[var(--aether-text-2)]">{label}</span>
      {hint ? (
        <span className="mt-0.5 block text-[9px] leading-snug text-[var(--aether-text-3)]">
          {hint}
        </span>
      ) : null}
    </span>
    <span
      aria-hidden
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${
        checked ? 'bg-[var(--aether-accent)]' : 'bg-[var(--aether-fill-3)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </span>
  </button>
);

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({
  appearance,
  brandName,
  onBrandNameChange,
  taskbarApps,
  taskbarState,
  onChange,
  onTaskbarChange,
  onRefreshTaskbar,
}) => {
  const update = (patch: Partial<AppearanceConfig>) =>
    onChange({ ...appearance, ...patch });

  return (
    <div className="flex flex-col gap-4 pb-2">
      <Group icon={<Palette size={13} />} title="Theme & accent">
        <div className="grid grid-cols-3 gap-1.5">
          {THEME_OPTIONS.map((option) => {
            const active = appearance.theme_mode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                title={option.description}
                onClick={() => update({ theme_mode: option.id })}
                className={`flex h-8 items-center justify-center gap-1.5 rounded-md border text-[10px] font-medium transition ${
                  active
                    ? 'border-[var(--aether-accent)] bg-[var(--aether-accent)]/12 text-[var(--aether-text-1)]'
                    : 'border-[var(--aether-line)] bg-black/15 text-[var(--aether-text-2)] hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]'
                }`}
              >
                <option.icon size={12} />
                {option.label}
              </button>
            );
          })}
        </div>
        <ButtonColorSettings appearance={appearance} onChange={onChange} />
      </Group>

      <Group icon={<SlidersHorizontal size={13} />} title="Surface">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <SurfaceSlider
            label="Pill opacity"
            min={30}
            value={appearance.pill_opacity * 100}
            onChange={(value) => update({ pill_opacity: value / 100 })}
          />
          <SurfaceSlider
            label="Island opacity"
            min={30}
            value={appearance.island_opacity * 100}
            onChange={(value) => update({ island_opacity: value / 100 })}
          />
          <SurfaceSlider
            label="Pill grain"
            min={0}
            value={appearance.pill_grain}
            onChange={(pill_grain) => update({ pill_grain })}
          />
          <SurfaceSlider
            label="Island grain"
            min={0}
            value={appearance.island_grain}
            onChange={(island_grain) => update({ island_grain })}
          />
          <SurfaceSlider
            label="Pill pop"
            min={0}
            value={appearance.pill_pop}
            onChange={(pill_pop) => update({ pill_pop })}
          />
          <SurfaceSlider
            label="Island pop"
            min={0}
            value={appearance.island_pop}
            onChange={(island_pop) => update({ island_pop })}
          />
        </div>
      </Group>

      <Group icon={<Type size={13} />} title="Island bar">
        <div className="grid grid-cols-[76px_1fr] items-center gap-2">
          <label
            htmlFor="aether-brand-name"
            className="text-[10px] text-[var(--aether-text-2)]"
          >
            Brand name
          </label>
          <input
            id="aether-brand-name"
            value={brandName}
            maxLength={24}
            onChange={(event) => onBrandNameChange(event.target.value)}
            placeholder="Aether"
            spellCheck={false}
            className="h-8 w-full rounded-md border border-[var(--aether-line)] bg-black/15 px-2.5 text-[11px] text-[var(--aether-text-1)] outline-none transition placeholder:text-[var(--aether-text-3)] focus:border-[var(--aether-accent)]"
          />
        </div>
        <div className="grid grid-cols-[76px_1fr] items-center gap-2">
          <span className="text-[10px] text-[var(--aether-text-2)]">Time format</span>
          <div className="grid grid-cols-2 gap-1.5">
            {TIME_FORMAT_OPTIONS.map((option) => {
              const active = appearance.time_format === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ time_format: option.id })}
                  className={`flex h-8 items-center justify-center gap-1.5 rounded-md border text-[10px] transition ${
                    active
                      ? 'border-[var(--aether-accent)] bg-[var(--aether-accent)]/12 text-[var(--aether-text-1)]'
                      : 'border-[var(--aether-line)] bg-black/15 text-[var(--aether-text-2)] hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]'
                  }`}
                >
                  <span className="font-semibold">{option.label}</span>
                  <span className="font-mono text-[9px] text-[var(--aether-text-3)]">
                    {option.example}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Group>

      <Group icon={<Sparkles size={13} />} title="Media glow">
        <div className="grid grid-cols-5 gap-1.5">
          {GLOW_OPTIONS.map((option) => {
            const active = appearance.glow_style === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => update({ glow_style: option.id })}
                aria-pressed={active}
                className={`flex h-7 items-center justify-center gap-1 rounded-md border text-[10px] transition ${
                  active
                    ? 'border-[var(--aether-line-strong)] bg-[var(--aether-fill-2)] text-[var(--aether-text-1)]'
                    : 'border-[var(--aether-line)] text-[var(--aether-text-2)] hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]'
                }`}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{
                    background:
                      option.id === 'off'
                        ? 'transparent'
                        : 'radial-gradient(circle, var(--aether-accent), transparent 70%)',
                    boxShadow:
                      option.id === 'off'
                        ? 'none'
                        : '0 0 6px -1px var(--aether-accent)',
                  }}
                />
                {option.label}
              </button>
            );
          })}
        </div>
        <ToggleRow
          label="Match the playing app"
          hint="Spotify stays green; other players use their own colour."
          checked={appearance.glow_color === 'source'}
          onChange={(checked) =>
            update({ glow_color: checked ? 'source' : 'theme' })
          }
        />
      </Group>

      <Group icon={<PanelTop size={13} />} title="Behaviour">
        <ToggleRow
          label="Auto-hide the pill"
          hint="Tuck it into the top bezel; touch the centre band to reveal it."
          checked={appearance.auto_hide_pill}
          onChange={(auto_hide_pill) => update({ auto_hide_pill })}
        />
        <ToggleRow
          label="Close when clicking outside"
          checked={appearance.close_on_outside_click}
          onChange={(close_on_outside_click) =>
            update({ close_on_outside_click })
          }
        />
      </Group>

      <Group
        icon={<LayoutGrid size={13} />}
        title="Dashboard tabs"
        action={
          <button
            type="button"
            onClick={() => update({ dashboard_tabs: [...DEFAULT_TAB_IDS] })}
            aria-label="Reset dashboard tabs"
            title="Reset tab order and visibility"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
          >
            <RotateCcw size={10} />
            Reset
          </button>
        }
      >
        <DashboardTabsSettings
          visible={appearance.dashboard_tabs}
          onChange={(dashboard_tabs) => update({ dashboard_tabs })}
        />
      </Group>

      <Group icon={<AppWindow size={13} />} title="Taskbar dock">
        <TaskbarAppsSettings
          config={taskbarApps}
          state={taskbarState}
          onChange={onTaskbarChange}
          onRefresh={onRefreshTaskbar}
        />
      </Group>
    </div>
  );
};
