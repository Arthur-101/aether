import React from 'react';
import { Clock3 } from 'lucide-react';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { bootTime, formatUptime } from './statsFormat';

interface StatGaugeProps {
  label: string;
  icon: React.ReactNode;
  /** 0-100, or null when the metric is unavailable. */
  value: number | null;
  /** Text inside the ring, e.g. "48%". */
  display: string;
  caption: string;
  /** Semantic colour for this metric, fixed so the accent cannot blur them. */
  color: string;
}

const SIZE = 92;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A circular gauge.
 *
 * CPU, GPU, and RAM each keep their own colour on purpose: the button accent
 * is a mood, not a metric, and a rose accent must not turn all three rings
 * rose and make them indistinguishable at a glance.
 *
 * End caps are square on purpose: a round cap adds half the stroke (~2.6
 * points at this radius) to each end, so the painted arc overshot every value
 * and left a dot at zero.
 */
export const StatGauge: React.FC<StatGaugeProps> = ({
  label,
  icon,
  value,
  display,
  caption,
  color,
}) => {
  const percent = value == null ? 0 : Math.max(0, Math.min(100, value));
  const offset = CIRCUMFERENCE * (1 - percent / 100);
  const available = value != null;

  return (
    <section className="aether-panel flex min-w-0 flex-col items-center rounded-2xl border border-[var(--aether-line-soft)] px-3 pb-2.5 pt-3">
      <header className="flex w-full items-center justify-between gap-2">
        <h2 className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--aether-text-3)]">
          {label}
        </h2>
        <span style={{ color }}>{icon}</span>
      </header>

      <div className="relative mt-1.5" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--aether-fill-2)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={available ? color : 'var(--aether-line)'}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{
              // No transition on purpose: stats arrive every 2 s, and a 700 ms
              // sweep left the ring visibly behind the number it describes.
              filter: available ? `drop-shadow(0 0 5px ${color}55)` : 'none',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[20px] leading-none text-[var(--aether-text-1)]">
            {available ? display : '—'}
          </span>
        </div>
      </div>

      <p className="mt-2.5 w-full truncate text-center text-[13px] text-[var(--aether-text-3)]">
        {caption}
      </p>
    </section>
  );
};

interface UptimeCardProps {
  seconds?: number | null;
}

/** The fourth card in the gauge row: how long this Windows session has run. */
export const UptimeCard: React.FC<UptimeCardProps> = ({ seconds }) => {
  const timeFormat = useTimeFormat();
  return (
    <section className="aether-panel flex min-w-0 flex-col rounded-2xl border border-[var(--aether-line-soft)] px-3 pb-2.5 pt-3">
      <header className="flex w-full items-center justify-between gap-2">
        <h2 className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--aether-text-3)]">
          Uptime
        </h2>
        <Clock3 size={13} className="text-[var(--aether-text-3)]" />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center">
        <span className="font-mono text-[27px] leading-none text-[var(--aether-text-1)]">
          {formatUptime(seconds)}
        </span>
        <span className="mt-2 text-center text-[13px] leading-snug text-[var(--aether-text-3)]">
          Since boot
        </span>
        <p className="mt-1.5 w-full truncate text-center text-xs text-[var(--aether-text-4)]">
          {bootTime(seconds, timeFormat)}
        </p>
      </div>
    </section>
  );
};
