import React from 'react';

/**
 * Surface controls for the notch and island.
 *
 * Grain is painted by the webview, so it needs no desktop access. Pop depth
 * drives the outward shadow stack that lifts the surface off the wallpaper.
 * Every control applies live, so no preview swatches are needed.
 */

/**
 * A borderless slider row for the Appearance tab. Label and value share the
 * first line so six surface controls can sit in three tight rows.
 */
export const SurfaceSlider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** The lowest value the surface may reach. Opacity starts at 30. */
  min?: number;
  max?: number;
  /** Unit shown after the value. Defaults to a percent sign. */
  suffix?: string;
}> = ({ label, value, onChange, min = 30, max = 100, suffix = '%' }) => {
  const rounded = Math.round(value);
  const span = Math.max(1, max - min);
  return (
    <label className="block min-w-0">
      <span className="flex items-center justify-between gap-2 text-[10px] leading-none">
        <span className="truncate text-[var(--aether-text-2)]">{label}</span>
        <span className="font-mono text-[var(--aether-text-1)]">
          {rounded}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={rounded}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--fill': `${((rounded - min) / span) * 100}%` } as React.CSSProperties}
        className="win-slider mt-1.5 h-4 w-full cursor-pointer"
        aria-label={label}
      />
    </label>
  );
};

/**
 * A compact slider for the widget panel: label, track, and value on one line.
 */
export const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, display, step = 1, onChange }) => {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="grid grid-cols-[82px_1fr_40px] items-center gap-2 py-1.5">
      <span className="text-[10px] text-[var(--aether-text-2)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        className="win-slider h-4 w-full cursor-pointer"
        aria-label={label}
      />
      <span className="text-right font-mono text-[10px] text-[var(--aether-text-1)]">
        {display}
      </span>
    </div>
  );
};

export const RadiusSlider: React.FC<{
  label: string;
  value: number;
  max?: number;
  onChange: (value: number) => void;
}> = ({ label, value, max = 32, onChange }) => (
  <div className="rounded-lg border border-[var(--aether-line)] bg-black/15 p-2.5">
    <div className="mb-1.5 flex items-center justify-between text-[10px]">
      <span className="text-[var(--aether-text-2)]">{label}</span>
      <span className="font-mono text-[var(--aether-text-1)]">{value}px</span>
    </div>
    <input
      type="range"
      min={0}
      max={max}
      step={1}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{ '--fill': `${(value / max) * 100}%` } as React.CSSProperties}
      className="win-slider h-4 w-full cursor-pointer"
      aria-label={label}
    />
  </div>
);
