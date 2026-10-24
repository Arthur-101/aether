import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildMonthGrid, type MonthGrid } from '../../widgets/format';
import type { WidgetTheme } from '../../types/ipc';

interface DateWidgetProps {
  theme?: WidgetTheme;
}

interface CalendarModel {
  grid: MonthGrid;
  viewingCurrentMonth: boolean;
  previous: () => void;
  today: () => void;
  next: () => void;
}

/** Month state shared by the glass and cozy faces. */
function useCalendar(): CalendarModel {
  const [now, setNow] = useState(() => new Date());
  const [monthOffset, setMonthOffset] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const viewDate = useMemo(
    () => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1),
    [now, monthOffset]
  );
  const grid = useMemo(() => buildMonthGrid(viewDate, now), [viewDate, now]);

  return {
    grid,
    viewingCurrentMonth: monthOffset === 0,
    previous: () => setMonthOffset((value) => value - 1),
    today: () => setMonthOffset(0),
    next: () => setMonthOffset((value) => value + 1),
  };
}

const navClass =
  'flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--aether-line)] text-[var(--aether-text-3)] transition hover:border-[var(--aether-line-strong)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]';

/** The original glass calendar. */
const DefaultDateFace: React.FC<{ model: CalendarModel }> = ({ model }) => {
  const { grid, viewingCurrentMonth, previous, today, next } = model;

  return (
    <div className="flex h-full w-full flex-col px-1 pb-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[8.5px] font-semibold uppercase tracking-[0.18em] text-[var(--aether-text-3)]">
            Calendar
          </div>
          <div className="mt-0.5 truncate text-[19px] font-semibold leading-tight text-[var(--aether-text-1)]">
            {grid.label}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <button
            type="button"
            aria-label="Previous month"
            title="Previous month"
            onClick={previous}
            className={navClass}
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            aria-label="Jump to today"
            title="Jump to today"
            onClick={today}
            className={navClass}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                viewingCurrentMonth
                  ? 'bg-[var(--aether-accent)]'
                  : 'bg-[var(--aether-text-4)]'
              }`}
            />
          </button>
          <button
            type="button"
            aria-label="Next month"
            title="Next month"
            onClick={next}
            className={navClass}
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--aether-line)] bg-[var(--aether-fill)] p-2.5">
        <div className="grid grid-cols-7 pb-1">
          {grid.weekdays.map((day, index) => (
            <span
              key={`${day}-${index}`}
              className={`text-center text-[8.5px] font-semibold uppercase tracking-wide ${
                index === 0 || index === 6
                  ? 'text-[var(--aether-accent-text)]'
                  : 'text-[var(--aether-text-4)]'
              }`}
            >
              {day}
            </span>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7">
          {grid.weeks.flatMap((week, weekIndex) =>
            week.map((day, dayIndex) => {
              const isToday = day !== null && day === grid.today;
              const isCurrentWeek = weekIndex === grid.todayWeek;
              return (
                <span
                  key={`${weekIndex}-${dayIndex}`}
                  className={`flex items-center justify-center ${
                    isCurrentWeek
                      ? `bg-[var(--aether-fill-2)] ${
                          dayIndex === 0 ? 'rounded-l-lg' : ''
                        } ${dayIndex === 6 ? 'rounded-r-lg' : ''}`
                      : ''
                  }`}
                >
                  <span
                    className={`flex h-6 w-8 items-center justify-center rounded-lg text-[11px] tabular-nums ${
                      isToday
                        ? 'accent-fill font-semibold text-[var(--aether-accent-contrast)]'
                        : day === null
                          ? ''
                          : 'text-[var(--aether-text-2)]'
                    }`}
                  >
                    {day ?? ''}
                  </span>
                </span>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * The cozy calendar: the same grid on the warm wash, with the month inset on a
 * frosted sheet, soft round navigation, and the weekend letters picked out in
 * the accent colour. The today pill and current-week band carry over so the
 * two themes read as the same widget.
 */
const CozyDateFace: React.FC<{ model: CalendarModel }> = ({ model }) => {
  const { grid, viewingCurrentMonth, previous, today, next } = model;

  return (
    <div className="flex h-full w-full flex-col px-1 pb-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[20px] font-semibold leading-tight text-[var(--aether-text-1)] drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]">
            {grid.label}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <button
            type="button"
            aria-label="Previous month"
            title="Previous month"
            onClick={previous}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-white/45 bg-white/20 text-[var(--aether-text-2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition hover:bg-white/35 hover:text-[var(--aether-text-1)]"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            aria-label="Jump to today"
            title="Jump to today"
            onClick={today}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-white/45 bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition hover:bg-white/35"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                viewingCurrentMonth
                  ? 'bg-[var(--aether-accent)]'
                  : 'bg-[var(--aether-text-4)]'
              }`}
            />
          </button>
          <button
            type="button"
            aria-label="Next month"
            title="Next month"
            onClick={next}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-white/45 bg-white/20 text-[var(--aether-text-2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition hover:bg-white/35 hover:text-[var(--aether-text-1)]"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-2xl border border-white/45 bg-white/20 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
        <div className="grid grid-cols-7 pb-1">
          {grid.weekdays.map((day, index) => (
            <span
              key={`${day}-${index}`}
              className={`text-center text-[8.5px] font-semibold uppercase tracking-wide ${
                index === 0 || index === 6
                  ? 'text-[var(--aether-accent-text)]'
                  : 'text-[var(--aether-text-4)]'
              }`}
            >
              {day}
            </span>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7">
          {grid.weeks.flatMap((week, weekIndex) =>
            week.map((day, dayIndex) => {
              const isToday = day !== null && day === grid.today;
              const isCurrentWeek = weekIndex === grid.todayWeek;
              return (
                <span
                  key={`${weekIndex}-${dayIndex}`}
                  className={`flex items-center justify-center ${
                    isCurrentWeek
                      ? `bg-white/30 ${
                          dayIndex === 0 ? 'rounded-l-lg' : ''
                        } ${dayIndex === 6 ? 'rounded-r-lg' : ''}`
                      : ''
                  }`}
                >
                  <span
                    className={`flex h-6 w-8 items-center justify-center rounded-lg text-[11px] tabular-nums ${
                      isToday
                        ? 'accent-fill font-semibold text-[var(--aether-accent-contrast)] shadow-[0_2px_6px_rgba(58,32,40,0.24)]'
                        : day === null
                          ? ''
                          : 'text-[var(--aether-text-2)]'
                    }`}
                  >
                    {day ?? ''}
                  </span>
                </span>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * The date widget: a month grid with today marked.
 *
 * The arrows move one month at a time and the centre dot returns to the
 * current month, so the panel is useful without turning into a full calendar
 * app. A minute tick is enough to roll the calendar over at midnight.
 *
 * `theme` picks between the original glass face and the warm cozy face; the
 * widget frame owns the surrounding card and backdrop.
 */
export const DateWidget: React.FC<DateWidgetProps> = ({ theme = 'default' }) => {
  const model = useCalendar();
  if (theme === 'cozy') return <CozyDateFace model={model} />;
  return <DefaultDateFace model={model} />;
};
