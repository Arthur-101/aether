import React from 'react';

/**
 * Surface controls for the notch and island.
 *
 * Grain is painted by the webview, so it needs no desktop access. Pop depth
 * drives the outward shadow stack that lifts the surface off the wallpaper.
 * Every control applies live, so no preview swatches are needed.
 */

export const OpacitySlider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** The lowest opacity the surface may reach. Widgets allow 0. */
  min?: number;
}> = ({ label, value, onChange, min = 30 }) => {
  const percent = Math.round(value * 100);
  const span = Math.max(1, 100 - min);
  return (
    <div className="rounded-lg border border-[var(--aether-line)] bg-black/15 p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[10px]">
        <span className="text-[var(--aether-text-2)]">{label}</span>
        <span className="font-mono text-[var(--aether-text-1)]">{percent}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        style={{ '--fill': `${((percent - min) / span) * 100}%` } as React.CSSProperties}
        className="win-slider h-4 w-full cursor-pointer"
        aria-label={label}
      />
    </div>
  );
};

export const GrainSlider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => (
  <div className="rounded-lg border border-[var(--aether-line)] bg-black/15 p-2.5">
    <div className="mb-1.5 flex items-center justify-between text-[10px]">
      <span className="text-[var(--aether-text-2)]">{label}</span>
      <span className="font-mono text-[var(--aether-text-1)]">{value}%</span>
    </div>
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{ '--fill': `${value}%` } as React.CSSProperties}
      className="win-slider h-4 w-full cursor-pointer"
      aria-label={label}
    />
  </div>
);

export const PopSlider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => (
  <div className="rounded-lg border border-[var(--aether-line)] bg-black/15 p-2.5">
    <div className="mb-1.5 flex items-center justify-between text-[10px]">
      <span className="text-[var(--aether-text-2)]">{label}</span>
      <span className="font-mono text-[var(--aether-text-1)]">{value}%</span>
    </div>
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{ '--fill': `${value}%` } as React.CSSProperties}
      className="win-slider h-4 w-full cursor-pointer"
      aria-label={label}
    />
  </div>
);

/**
 * A compact slider for the widget panel: label, track, and value on one line.
 * The boxed sliders above are kept for the wider Appearance layout.
 */
export const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, display, onChange }) => {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="grid grid-cols-[82px_1fr_40px] items-center gap-2 py-1.5">
      <span className="text-[10px] text-[var(--aether-text-2)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
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
