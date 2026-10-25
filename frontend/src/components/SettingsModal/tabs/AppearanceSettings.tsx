import React from 'react';
import {
  AppWindow,
  LayoutGrid,
  MonitorCog,
  Moon,
  Palette,
  PanelTop,
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
import {
  SettingsGroup,
  SettingsResetButton,
  SettingsToggleRow,
} from '../SettingsControls';
import {
  settingsChipClass,
  settingsInputClass,
  settingsSegmentClass,
} from '../settingsStyles';
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
      <SettingsGroup icon={<Palette size={13} />} title="Theme & accent">
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
                className={`${settingsSegmentClass(active)} font-medium`}
              >
                <option.icon size={12} />
                {option.label}
              </button>
            );
          })}
        </div>
        <ButtonColorSettings appearance={appearance} onChange={onChange} />
      </SettingsGroup>

      <SettingsGroup icon={<SlidersHorizontal size={13} />} title="Surface">
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
      </SettingsGroup>

      <SettingsGroup icon={<Type size={13} />} title="Island bar">
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
            className={`${settingsInputClass} w-full`}
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
                  className={`${settingsSegmentClass(active)}`}
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
      </SettingsGroup>

      <SettingsGroup icon={<Sparkles size={13} />} title="Media glow">
        <div className="grid grid-cols-5 gap-1.5">
          {GLOW_OPTIONS.map((option) => {
            const active = appearance.glow_style === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => update({ glow_style: option.id })}
                aria-pressed={active}
                className={`${settingsChipClass(active)} w-full justify-center`}
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
        <SettingsToggleRow
          label="Match the playing app"
          hint="Spotify stays green; other players use their own colour."
          checked={appearance.glow_color === 'source'}
          onChange={(checked) =>
            update({ glow_color: checked ? 'source' : 'theme' })
          }
        />
      </SettingsGroup>

      <SettingsGroup icon={<PanelTop size={13} />} title="Behaviour">
        <SettingsToggleRow
          label="Auto-hide the pill"
          hint="Tuck it into the top bezel; touch the centre band to reveal it."
          checked={appearance.auto_hide_pill}
          onChange={(auto_hide_pill) => update({ auto_hide_pill })}
        />
        <SettingsToggleRow
          label="Close when clicking outside"
          checked={appearance.close_on_outside_click}
          onChange={(close_on_outside_click) =>
            update({ close_on_outside_click })
          }
        />
      </SettingsGroup>

      <SettingsGroup
        icon={<LayoutGrid size={13} />}
        title="Dashboard tabs"
        action={
          <SettingsResetButton
            onClick={() => update({ dashboard_tabs: [...DEFAULT_TAB_IDS] })}
            title="Reset tab order and visibility"
            ariaLabel="Reset dashboard tabs"
          />
        }
      >
        <DashboardTabsSettings
          visible={appearance.dashboard_tabs}
          onChange={(dashboard_tabs) => update({ dashboard_tabs })}
        />
      </SettingsGroup>

      <SettingsGroup icon={<AppWindow size={13} />} title="Taskbar dock">
        <TaskbarAppsSettings
          config={taskbarApps}
          state={taskbarState}
          onChange={onTaskbarChange}
          onRefresh={onRefreshTaskbar}
        />
      </SettingsGroup>
    </div>
  );
};
