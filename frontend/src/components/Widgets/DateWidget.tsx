import React, { useEffect, useMemo, useState } from 'react';
import { buildMonthGrid } from '../../widgets/format';

/**
 * The date widget: the current month as a small grid with today marked.
 *
 * A minute tick is enough to roll the calendar over at midnight, so the widget
 * costs one timer even while it is in view.
 */
export const DateWidget: React.FC = () => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const grid = useMemo(() => buildMonthGrid(now), [now]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mt-1.5 grid grid-cols-7 gap-y-0.5 pb-2">
        {grid.weekdays.map((day, index) => (
          <span
            key={`${day}-${index}`}
            className="text-center text-[7.5px] font-semibold tracking-wide text-[var(--aether-text-4)] uppercase"
          >
            {day}
          </span>
        ))}
        {grid.weeks.flatMap((week, weekIndex) =>
          week.map((day, dayIndex) => {
            const isToday = day === grid.today;
            return (
              <span
                key={`${weekIndex}-${dayIndex}`}
                className={`flex h-[15px] items-center justify-center rounded-[4px] text-[9px] tabular-nums ${
                  isToday
                    ? 'accent-fill font-semibold text-[var(--aether-accent-contrast)]'
                    : day === null
                      ? ''
                      : 'text-[var(--aether-text-2)]'
                }`}
              >
                {day ?? ''}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
};
