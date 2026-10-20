import React from 'react';
import { ChevronRight } from 'lucide-react';

interface ControlSliderProps {
  icon: React.ReactNode;
  label: string;
  display: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  onIconClick?: () => void;
  iconTitle?: string;
  onSettings?: () => void;
  settingsTitle?: string;
}

export const ControlSlider: React.FC<ControlSliderProps> = ({
  icon,
  label,
  display,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onIconClick,
  iconTitle,
  onSettings,
  settingsTitle,
}) => {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className="rounded-lg border border-white/10 bg-[#2b2b2b]/80 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onIconClick}
          title={iconTitle}
          className="shrink-0 rounded p-0.5 transition hover:bg-white/10"
        >
          {icon}
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ '--fill': `${fill}%` } as React.CSSProperties}
          className="win-slider h-4 min-w-0 flex-1 cursor-pointer"
        />
        <span className="w-7 shrink-0 text-right font-mono text-[10px] text-[#c7c7c7]">
          {display}
        </span>
        {onSettings ? (
          <button
            type="button"
            onClick={onSettings}
            title={settingsTitle}
            className="shrink-0 rounded p-0.5 text-[#8b8b8b] transition hover:bg-white/10 hover:text-white"
          >
            <ChevronRight size={13} />
          </button>
        ) : null}
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-wider text-[#8b8b8b]">
        {label}
      </div>
    </div>
  );
};
