import React from 'react';
import { Layers, MonitorUp, PanelTop, Sparkles } from 'lucide-react';
import type { AppearanceConfig, TaskbarAppsConfig } from '../../../types/ipc';
import { ButtonColorSettings } from './ButtonColorSettings';
import { DashboardTabsSettings } from './DashboardTabsSettings';

interface AppearanceSettingsProps {
  appearance: AppearanceConfig;
  taskbarApps: TaskbarAppsConfig;
  onChange: (appearance: AppearanceConfig) => void;
}

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ icon, title, description, children }) => (
  <section className="border-b border-white/[0.07] pb-4 last:border-b-0 last:pb-0">
    <div className="mb-2 flex items-start gap-2">
      <span className="mt-0.5 accent-text">{icon}</span>
      <div>
        <h4 className="text-xs font-semibold text-white">{title}</h4>
        <p className="mt-0.5 text-[10px] leading-relaxed text-[#8b8b8b]">
          {description}
        </p>
      </div>
    </div>
    {children}
  </section>
);

const OpacitySlider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => {
  const percent = Math.round(value * 100);
  return (
    <div className="rounded-lg border border-white/10 bg-black/15 p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[10px]">
        <span className="text-[#c7c7c7]">{label}</span>
        <span className="font-mono text-[#e5e5e5]">{percent}%</span>
      </div>
      <input
        type="range"
        min={30}
        max={100}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        style={{ '--fill': `${((percent - 30) / 70) * 100}%` } as React.CSSProperties}
        className="win-slider h-4 w-full cursor-pointer"
        aria-label={label}
      />
      <div
        className="mt-2 h-6 rounded-md border border-white/10"
        style={{
          background: `linear-gradient(180deg, rgba(25,27,31,${value}), rgba(10,11,14,${value}))`,
        }}
      />
    </div>
  );
};

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({
  appearance,
  taskbarApps,
  onChange,
}) => {
  const update = (patch: Partial<AppearanceConfig>) =>
    onChange({ ...appearance, ...patch });

  return (
    <div className="flex flex-col gap-4 pb-2">
      <Section
        icon={<PanelTop size={14} />}
        title="Notch & Island"
        description="Opacity affects the background surface only; text and icons stay readable."
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
      </Section>

      <DashboardTabsSettings
        visible={appearance.dashboard_tabs}
        onChange={(dashboard_tabs) => update({ dashboard_tabs })}
      />

      <ButtonColorSettings appearance={appearance} onChange={onChange} />

      <Section
        icon={<Sparkles size={14} />}
        title="Close behavior"
        description="The close button is always available. Outside-click closing is optional."
      >
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/15 px-2.5 py-2">
          <span className="text-[11px] text-[#d7d7d7]">Close when clicking outside</span>
          <button
            type="button"
            role="switch"
            aria-checked={appearance.close_on_outside_click}
            onClick={() =>
              update({ close_on_outside_click: !appearance.close_on_outside_click })
            }
            className={`relative h-5 w-9 rounded-full transition ${
              appearance.close_on_outside_click ? 'bg-[#60cdff]' : 'bg-white/15'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                appearance.close_on_outside_click ? 'left-[18px]' : 'left-0.5'
              }`}
            />
          </button>
        </label>
        <p className="mt-1.5 text-[9px] text-[#6f6b63]">
          When enabled, the outside click is consumed while the island is open.
        </p>
      </Section>

      <Section
        icon={<Layers size={14} />}
        title="Taskbar apps"
        description="The hover dock mirrors Windows taskbar pins by default."
      >
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/15 px-2.5 py-2 text-[10px]">
          <span className="flex items-center gap-2 text-[#c7c7c7]">
            <MonitorUp size={13} className="accent-text" />
            {taskbarApps.mode === 'mirror' ? 'Mirror Windows pins' : 'Custom list'}
          </span>
          <span className="text-[#777]">
            {taskbarApps.pinned.length > 0
              ? `${taskbarApps.pinned.length} custom`
              : 'Live mirror'}
          </span>
        </div>
        <p className="mt-1.5 text-[9px] text-[#6f6b63]">
          Add, remove, reorder, sync, and reset land with live taskbar discovery in
          Phase 3.
        </p>
      </Section>
    </div>
  );
};
