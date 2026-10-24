import React, { useEffect, useState } from 'react';
import type { TimeFormat, WidgetTheme } from '../../types/ipc';
import { clockParts } from '../../widgets/format';

interface ClockWidgetProps {
  timeFormat: TimeFormat;
  showSeconds: boolean;
  showDayDate: boolean;
  theme?: WidgetTheme;
}

/** Ticks once a second; used by both faces. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

interface ClockFaceProps {
  timeFormat: TimeFormat;
  showSeconds: boolean;
  showDayDate: boolean;
}

/**
 * The original glass clock. Seconds sit beside the minutes so the time stays
 * the focal point, and the day/date line can be switched off.
 */
const DefaultClockFace: React.FC<ClockFaceProps> = ({
  timeFormat,
  showSeconds,
  showDayDate,
}) => {
  const parts = clockParts(useNow(), timeFormat);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <div className="flex items-baseline justify-center gap-1.5">
        <span className="font-mono text-[60px] leading-[0.9] font-semibold tracking-tight tabular-nums text-[var(--aether-text-1)]">
          {parts.time}
        </span>
        {showSeconds ? (
          <span className="font-mono text-[21px] leading-none font-semibold tabular-nums text-[var(--aether-accent-text)]">
            {parts.seconds}
          </span>
        ) : null}
        {parts.meridiem ? (
          <span className="text-[19px] leading-none font-semibold uppercase tracking-wide text-[var(--aether-text-3)]">
            {parts.meridiem}
          </span>
        ) : null}
      </div>
      {showDayDate ? (
        <div className="mt-2 max-w-full truncate text-center text-[19px] leading-tight text-[var(--aether-text-3)]">
          {parts.dayDate}
        </div>
      ) : null}
    </div>
  );
};

/**
 * The cozy clock face: the same time, but set on the warm wash with a soft
 * local-time eyebrow, a translucent seconds pill, and the day/date in a
 * matching chip. It deliberately keeps the type large and quiet.
 */
const CozyClockFace: React.FC<ClockFaceProps> = ({
  timeFormat,
  showSeconds,
  showDayDate,
}) => {
  const parts = clockParts(useNow(), timeFormat);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-2">
      <div className="flex items-baseline justify-center gap-1.5">
        <span className="font-mono text-[54px] leading-[0.9] font-semibold tracking-tight tabular-nums text-[var(--aether-text-1)] drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]">
          {parts.time}
        </span>
        {showSeconds ? (
          <span className="rounded-full border border-white/40 bg-white/25 px-1.5 py-0.5 font-mono text-[15px] leading-none font-semibold tabular-nums text-[var(--aether-text-1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
            {parts.seconds}
          </span>
        ) : null}
        {parts.meridiem ? (
          <span className="text-[16px] leading-none font-semibold uppercase tracking-wide text-[var(--aether-text-3)]">
            {parts.meridiem}
          </span>
        ) : null}
      </div>

      {showDayDate ? (
        <div className="mt-2 max-w-full truncate rounded-full border border-white/35 bg-white/20 px-3 py-1 text-center text-[12.5px] leading-tight text-[var(--aether-text-2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
          {parts.dayDate}
        </div>
      ) : null}
    </div>
  );
};

/**
 * The clock widget. It ticks locally once a second, which is the only work it
 * does, and reads the app's 12/24-hour preference rather than hardcoding one.
 *
 * `theme` picks between the original glass face and the warm cozy face; the
 * widget frame owns the surrounding card and backdrop.
 */
export const ClockWidget: React.FC<ClockWidgetProps> = ({
  theme = 'default',
  ...props
}) => {
  if (theme === 'cozy') return <CozyClockFace {...props} />;
  return <DefaultClockFace {...props} />;
};
