import React, { useEffect, useState } from 'react';
import type { TimeFormat } from '../../types/ipc';
import { clockParts } from '../../widgets/format';

/**
 * The clock widget. It ticks locally once a second, which is the only work it
 * does, and reads the app's 12/24-hour preference rather than hardcoding one.
 */
export const ClockWidget: React.FC<{ timeFormat: TimeFormat }> = ({ timeFormat }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const parts = clockParts(now, timeFormat);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-[30px] leading-none font-semibold tracking-tight tabular-nums text-[var(--aether-text-1)]">
          {parts.time}
        </span>
        {parts.meridiem ? (
          <span className="text-[10px] font-semibold text-[var(--aether-text-3)]">
            {parts.meridiem}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-mono text-[10.5px] tabular-nums text-[var(--aether-accent-text)]">
          {parts.seconds}
        </span>
        <span className="text-[9.5px] text-[var(--aether-text-3)]">{parts.weekday}</span>
      </div>
    </div>
  );
};
