import React from 'react';

/**
 * The macOS-style value slider: a thick pill track with the glyph pinned to
 * the leading edge, the live readout in a chip on the trailing edge, and a
 * knob that rides the fill.
 *
 * The native range input is kept transparent on top so the control stays
 * keyboard accessible and draggable; the visible track is drawn underneath.
 */

interface ValueSliderProps {
  icon: React.ReactNode;
  value: number;
  display: string;
  fill: string;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  onChange: (value: number) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

export const ValueSlider: React.FC<ValueSliderProps> = ({
  icon,
  value,
  display,
  fill,
  min = 0,
  max = 100,
  step = 1,
  label,
  onChange,
  onInteractionStart,
  onInteractionEnd,
}) => {
  const span = max - min;
  const ratio = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0;
  const percent = ratio * 100;
  // The leading glyph sits on the fill once the value clears it, and on the
  // bare track before that, so it has to change colour with the level.
  const glyphOnFill = percent > 9;

  return (
    <div className="group relative h-11 w-full select-none">
      <div className="absolute inset-0 rounded-full border border-[var(--aether-line-soft)] bg-white/[0.055]" />
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${percent}%`, background: fill }}
      />
      <span
        className="pointer-events-none absolute left-3 top-1/2 z-20 -translate-y-1/2"
        style={{ color: glyphOnFill ? '#241d10' : '#c9c5bb' }}
      >
        {icon}
      </span>
      <span
        className="pointer-events-none absolute right-1.5 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/45 px-2 py-[3px] font-mono text-[10px] font-semibold tabular-nums text-[var(--aether-text-1)]"
        aria-hidden
      >
        {display}
      </span>
      <span
        className="pointer-events-none absolute top-1/2 z-10 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-black/45 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.45)]"
        style={{ left: `${Math.min(94, Math.max(11, percent))}%` }}
        aria-hidden
      />
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={onInteractionStart}
        onPointerUp={onInteractionEnd}
        onPointerCancel={onInteractionEnd}
        onBlur={onInteractionEnd}
        className="absolute inset-0 z-30 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
};
