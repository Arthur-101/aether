import React from 'react';
import { Layers, MonitorCog, Moon, Palette, PanelTop, Sparkles, Sun } from 'lucide-react';
import type {
  AppearanceConfig,
  GlowStyle,
  TaskbarAppsConfig,
  TaskbarAppsState,
  ThemeMode,
} from '../../../types/ipc';
import { ButtonColorSettings } from './ButtonColorSettings';
import { DashboardTabsSettings } from './DashboardTabsSettings';
import { GrainSlider, OpacitySlider, PopSlider } from './SurfaceSliders';
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

interface AppearanceSettingsProps {
  appearance: AppearanceConfig;
  taskbarApps: TaskbarAppsConfig;
  taskbarState: TaskbarAppsState | null;
  onChange: (appearance: AppearanceConfig) => void;
  onTaskbarChange: (taskbarApps: TaskbarAppsConfig) => void;
  onRefreshTaskbar: () => void;
}

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ icon, title, description, children }) => (
  <section className="border-b border-[var(--aether-line-soft)] pb-4 last:border-b-0 last:pb-0">
    <div className="mb-2 flex items-start gap-2">
      <span className="mt-0.5 accent-text">{icon}</span>
      <div>
        <h4 className="text-xs font-semibold text-[var(--aether-text-1)]">{title}</h4>
        <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--aether-text-3)]">
          {description}
        </p>
      </div>
    </div>
    {children}
  </section>
);

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({
  appearance,
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
      <Section
        icon={<PanelTop size={14} />}
        title="Notch & Island"
        description="Opacity, grain, and pop depth apply to the background surface only; text and icons stay readable."
      >
        <div className="grid grid-cols-2 gap-2">
          <OpacitySlider
            label="Pill opacity"
            value={appearance.pill_opacity}
            onChange={(pill_opacity) => update({ pill_opacity })}
          />
          <OpacitySlider
            label="Island opacity"
            value={appearance.island_opacity}
            onChange={(island_opacity) => update({ island_opacity })}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <GrainSlider
            label="Pill grain"
            value={appearance.pill_grain}
            onChange={(pill_grain) => update({ pill_grain })}
          />
          <GrainSlider
            label="Island grain"
            value={appearance.island_grain}
            onChange={(island_grain) => update({ island_grain })}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <PopSlider
            label="Pill pop"
            value={appearance.pill_pop}
            onChange={(pill_pop) => update({ pill_pop })}
          />
          <PopSlider
            label="Island pop"
            value={appearance.island_pop}
            onChange={(island_pop) => update({ island_pop })}
          />
        </div>
      </Section>

      <DashboardTabsSettings
        visible={appearance.dashboard_tabs}
        onChange={(dashboard_tabs) => update({ dashboard_tabs })}
      />

      <Section
        icon={<Palette size={14} />}
        title="Theme"
        description="System follows the Windows theme, so the island, the pill, and Settings flip with the desktop."
      >
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((option) => {
            const active = appearance.theme_mode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => update({ theme_mode: option.id })}
                className={`flex flex-col items-start gap-1.5 rounded-lg border px-2.5 py-2 text-left transition ${
                  active
                    ? 'border-[var(--aether-accent)] bg-[var(--aether-accent)]/12'
                    : 'border-[var(--aether-line)] bg-black/15 hover:border-[var(--aether-line-strong)]'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-md border ${
                    active
                      ? 'border-[var(--aether-accent)]/50 bg-[var(--aether-surface-1)]'
                      : 'border-[var(--aether-line)] bg-[var(--aether-surface-1)]'
                  }`}
                >
                  <option.icon size={13} className="text-[var(--aether-text-2)]" />
                </span>
                <span className="text-[10.5px] font-semibold text-[var(--aether-text-1)]">
                  {option.label}
                </span>
                <span className="text-[9px] leading-snug text-[var(--aether-text-3)]">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        icon={<Sparkles size={14} />}
        title="Media glow"
        description="The halo around the player. Source colour reads the app that is playing: green for Spotify, red for YouTube."
      >
        <div className="flex flex-wrap gap-1.5">
          {GLOW_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => update({ glow_style: option.id })}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] transition ${
                appearance.glow_style === option.id
                  ? 'border-[var(--aether-line-strong)] bg-[var(--aether-fill-2)] text-[var(--aether-text-1)]'
                  : 'border-[var(--aether-line)] text-[var(--aether-text-2)] hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]'
              }`}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{
                  background:
                    option.id === 'off'
                      ? 'transparent'
                      : 'radial-gradient(circle, var(--aether-accent), transparent 70%)',
                  boxShadow:
                    option.id === 'off' ? 'none' : '0 0 8px -1px var(--aether-accent)',
                }}
              />
              {option.label}
            </button>
          ))}
        </div>

        <label className="mt-2 flex cursor-pointer items-center justify-between rounded-lg border border-[var(--aether-line)] bg-black/15 px-2.5 py-2">
          <span className="text-[11px] text-[var(--aether-text-2)]">
            Colour follows the media source
          </span>
          <input
            type="checkbox"
            checked={appearance.glow_color === 'source'}
            onChange={(event) =>
              update({ glow_color: event.target.checked ? 'source' : 'theme' })
            }
            className="accent-[var(--aether-accent)]"
          />
        </label>
      </Section>

      <ButtonColorSettings appearance={appearance} onChange={onChange} />

      <Section
        icon={<Sparkles size={14} />}
        title="Close behavior"
        description="The close button is always available. Outside-click closing is optional."
      >
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--aether-line)] bg-black/15 px-2.5 py-2">
          <span className="text-[11px] text-[var(--aether-text-2)]">Close when clicking outside</span>
          <button
            type="button"
            role="switch"
            aria-checked={appearance.close_on_outside_click}
            onClick={() =>
              update({ close_on_outside_click: !appearance.close_on_outside_click })
            }
            className={`relative h-5 w-9 rounded-full transition ${
              appearance.close_on_outside_click ? 'bg-[var(--aether-accent)]' : 'bg-[var(--aether-fill-3)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                appearance.close_on_outside_click ? 'left-[18px]' : 'left-0.5'
              }`}
            />
          </button>
        </label>
        <p className="mt-1.5 text-[9px] text-[var(--aether-text-3)]">
          When enabled, the outside click is consumed while the island is open.
        </p>
      </Section>

      <Section
        icon={<Layers size={14} />}
        title="Taskbar apps"
        description="The hover dock mirrors Windows taskbar pins by default."
      >
        <TaskbarAppsSettings
          config={taskbarApps}
          state={taskbarState}
          onChange={onTaskbarChange}
          onRefresh={onRefreshTaskbar}
        />
      </Section>
    </div>
  );
};
