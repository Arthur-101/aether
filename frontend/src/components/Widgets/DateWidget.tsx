import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildMonthGrid,
  dayOfYear,
  daysInYear,
  isoWeek,
  type MonthGrid,
} from '../../widgets/format';
import type { WidgetTheme } from '../../types/ipc';

interface DateWidgetProps {
  theme?: WidgetTheme;
}

interface CalendarModel {
  now: Date;
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
    now,
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
 * The newsprint date face. Rather than a month grid it prints today as a
 * newspaper date plaque: masthead, huge day numeral, weekday/month/year, and
 * an edition footer. The card is fixed at 280x320, so the extra space is used
 * deliberately instead of being left blank.
 */
const NewsprintDateFace: React.FC<{ model: CalendarModel }> = ({ model }) => {
  const { now } = model;
  const year = now.getFullYear();
  const day = now.getDate();
  const weekday = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
  }).format(now);
  const month = new Intl.DateTimeFormat(undefined, { month: 'long' }).format(
    now
  );
  const dayNumber = dayOfYear(now);
  const totalDays = daysInYear(now);
  const week = isoWeek(now);

  return (
    <div className="flex h-full w-full flex-col px-3.5 py-3">
      <div className="flex items-center justify-between border-b border-[var(--aether-line)] pb-1 pr-12">
        <span className="font-serif text-[8px] font-semibold uppercase tracking-[0.24em] text-[var(--aether-text-2)]">
          The daily
        </span>
        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--aether-text-4)]">
          Vol. {year}
        </span>
      </div>

      <div className="mt-3">
        <div className="font-serif text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--aether-text-2)]">
          {weekday}
        </div>
        <div className="pb-1 font-serif text-[128px] font-semibold leading-[0.9] tracking-[-0.07em] text-[var(--aether-text-1)] [font-variant-numeric:oldstyle-nums]">
          {day}
        </div>
      </div>

      <div className="mt-1 font-serif text-[22px] leading-tight text-[var(--aether-text-1)]">
        <span className="uppercase">{month}</span>{' '}
        <span className="text-[var(--aether-text-3)]">{year}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--aether-line-soft)] pt-2">
        <div>
          <div className="font-mono text-[7px] uppercase tracking-[0.16em] text-[var(--aether-text-4)]">
            Week
          </div>
          <div className="font-serif text-[18px] leading-tight text-[var(--aether-text-1)]">
            {week}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[7px] uppercase tracking-[0.16em] text-[var(--aether-text-4)]">
            Day
          </div>
          <div className="font-serif text-[18px] leading-tight text-[var(--aether-text-1)]">
            {dayNumber}
            <span className="text-[11px] text-[var(--aether-text-3)]">
              {' '}
              / {totalDays}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--aether-line)] pt-1.5">
        <span className="border border-[var(--aether-text-1)] px-1.5 py-0.5 font-serif text-[8px] font-semibold uppercase tracking-[0.2em] text-[var(--aether-text-1)]">
          Today
        </span>
        <span className="font-serif text-[8px] uppercase tracking-[0.18em] text-[var(--aether-text-4)]">
          Aether
        </span>
      </div>
    </div>
  );
};

/**
 * The aura calendar keeps the normal month grid but sets it on an inset glass
 * sheet so the colour mesh reads around it. The grid itself is unchanged, so
 * month navigation and today's marker behave exactly like the default face.
 */
const AuraDateFace: React.FC<{ model: CalendarModel }> = ({ model }) => {
  const { grid, viewingCurrentMonth, previous, today, next } = model;
  const navClass =
    'flex h-6 w-6 items-center justify-center rounded-full border border-[var(--aura-line)] bg-[var(--aether-fill)] text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';

  return (
    <div className="flex h-full w-full flex-col px-3 pb-3 pt-2.5">
      <div className="flex items-start justify-between gap-2 pr-12">
        <div className="min-w-0">
          <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[var(--aether-text-4)]">
            Calendar
          </div>
          <div className="mt-0.5 truncate text-[20px] font-light leading-tight tracking-[-0.01em] text-[var(--aether-text-1)]">
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

      <div className="mt-2.5 flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--aura-line)] bg-[var(--aura-panel)] p-2.5">
        <div className="grid grid-cols-7 pb-1">
          {grid.weekdays.map((day, index) => (
            <span
              key={`${day}-${index}`}
              className={`text-center text-[8.5px] font-medium uppercase tracking-wide ${
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
                      ? `bg-[var(--aura-band)] ${
                          dayIndex === 0 ? 'rounded-l-lg' : ''
                        } ${dayIndex === 6 ? 'rounded-r-lg' : ''}`
                      : ''
                  }`}
                >
                  <span
                    className={`flex h-6 w-8 items-center justify-center rounded-lg text-[11px] tabular-nums ${
                      isToday
                        ? 'accent-fill font-semibold'
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
 * `theme` picks between the original glass face, the warm cozy face, the
 * printed newsprint today card, and the aura glass month grid; the widget
 * frame owns the surrounding card and backdrop.
 */
export const DateWidget: React.FC<DateWidgetProps> = ({ theme = 'default' }) => {
  const model = useCalendar();
  if (theme === 'cozy') return <CozyDateFace model={model} />;
  if (theme === 'newsprint') return <NewsprintDateFace model={model} />;
  if (theme === 'aura') return <AuraDateFace model={model} />;
  return <DefaultDateFace model={model} />;
};
