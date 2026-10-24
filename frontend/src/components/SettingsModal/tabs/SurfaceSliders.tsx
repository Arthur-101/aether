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
}> = ({ label, value, onChange }) => {
  const percent = Math.round(value * 100);
  return (
    <div className="rounded-lg border border-[var(--aether-line)] bg-black/15 p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[10px]">
        <span className="text-[var(--aether-text-2)]">{label}</span>
        <span className="font-mono text-[var(--aether-text-1)]">{percent}%</span>
      </div>
      <input
        type="range"
        min={30}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        style={{ '--fill': `${((percent - 30) / 70) * 100}%` } as React.CSSProperties}
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
