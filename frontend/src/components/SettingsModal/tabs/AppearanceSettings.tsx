import React from 'react';
import { Layers, PanelTop, Sparkles } from 'lucide-react';
import type {
  AppearanceConfig,
  TaskbarAppsConfig,
  TaskbarAppsState,
} from '../../../types/ipc';
import { ButtonColorSettings } from './ButtonColorSettings';
import { DashboardTabsSettings } from './DashboardTabsSettings';
import { TaskbarAppsSettings } from './TaskbarAppsSettings';

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

const BlurSlider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => (
  <div className="rounded-lg border border-white/10 bg-black/15 p-2.5">
    <div className="mb-1.5 flex items-center justify-between text-[10px]">
      <span className="text-[#c7c7c7]">{label}</span>
      <span className="font-mono text-[#e5e5e5]">{value}px</span>
    </div>
    <input
      type="range"
      min={0}
      max={60}
      step={1}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{ '--fill': `${(value / 60) * 100}%` } as React.CSSProperties}
      className="win-slider h-4 w-full cursor-pointer"
      aria-label={label}
    />
    <div className="relative mt-2 h-6 overflow-hidden rounded-md border border-white/10">
      <div
        className="absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(90deg, rgba(232,197,107,0.55) 0 9px, rgba(96,205,255,0.4) 9px 18px, rgba(255,255,255,0.16) 18px 27px)',
        }}
      />
      <div
        className="absolute inset-1.5 rounded border border-white/15 bg-black/20"
        style={{
          backdropFilter: `blur(${value}px)`,
          WebkitBackdropFilter: `blur(${value}px)`,
        }}
      />
    </div>
  </div>
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
        description="Opacity and blur affect the background surface only; text and icons stay readable."
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
          <BlurSlider
            label="Pill blur"
            value={appearance.pill_blur}
            onChange={(pill_blur) => update({ pill_blur })}
          />
          <BlurSlider
            label="Island blur"
            value={appearance.island_blur}
            onChange={(island_blur) => update({ island_blur })}
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
