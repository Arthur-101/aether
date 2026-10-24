/**
 * Formatting for the clock and date widgets.
 *
 * The widgets honour the same 12/24-hour preference as the island, so the time
 * is formatted from the user's setting rather than hardcoded.
 */

import type { TimeFormat } from '../types/ipc';

export interface ClockParts {
  time: string;
  seconds: string;
  meridiem: string;
  /** Weekday plus date, without the year: "Saturday, 24 October". */
  dayDate: string;
}

export function clockParts(date: Date, format: TimeFormat): ClockParts {
  const hour12 = format !== '24h';
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    time: `${value('hour')}:${value('minute')}`,
    seconds: value('second'),
    meridiem: hour12 ? value('dayPeriod') : '',
    dayDate: new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date),
  };
}

export interface MonthGrid {
  label: string;
  weekdays: string[];
  weeks: Array<Array<number | null>>;
  /** Day of the month that is "today", or null when another month is shown. */
  today: number | null;
  /** Index of the week that contains today, or -1 for another month. */
  todayWeek: number;
}

export function buildMonthGrid(date: Date, today: Date = date): MonthGrid {
  const year = date.getFullYear();
  const month = date.getMonth();
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = new Date(year, month, 1).getDay();

  const cells: Array<number | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<number | null>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  // 1 September 2024 was a Sunday, so it seeds the weekday headers in order.
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(
      new Date(2024, 8, 1 + index)
    )
  );

  const isCurrentMonth =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth();

  return {
    label: new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric',
    }).format(date),
    weekdays,
    weeks,
    today: isCurrentMonth ? today.getDate() : null,
    todayWeek: isCurrentMonth
      ? Math.floor((leading + today.getDate() - 1) / 7)
      : -1,
  };
}
