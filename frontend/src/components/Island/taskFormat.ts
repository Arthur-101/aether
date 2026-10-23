import type { ScheduledTask, TimeFormat } from '../../types/ipc';
import { formatClockTime } from './timeFormat';

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dateTimeParts(date: Date): { date: string; time: string } {
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function defaultStart(): { date: string; time: string } {
  return dateTimeParts(new Date(Date.now() + 60 * 60 * 1000));
}

export function defaultDate(): string {
  return defaultStart().date;
}

export function defaultTime(): string {
  return defaultStart().time;
}

export function defaultEndDate(): string {
  return dateTimeParts(new Date(Date.now() + 25 * 60 * 60 * 1000)).date;
}

export function parseIsoParts(raw?: string | null): { date: string; time: string } | null {
  if (!raw) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(raw);
  if (match) return { date: match[1], time: match[2] };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  };
}

export function taskTimeParts(task: ScheduledTask): { date: string; time: string } {
  if (task.schedule_type === 'custom' && task.start_at_iso) {
    const parts = parseIsoParts(task.start_at_iso);
    if (parts) return parts;
  }
  if (task.is_recurring) {
    const fallback = /(\d{1,2}):(\d{2})/.exec(task.cron_or_iso);
    const hour = task.hour ?? Number(fallback?.[1] ?? 0);
    const minute = task.minute ?? Number(fallback?.[2] ?? 0);
    return { date: defaultDate(), time: `${pad(hour)}:${pad(minute)}` };
  }
  return parseIsoParts(task.run_at_iso || task.cron_or_iso) || {
    date: defaultDate(),
    time: defaultTime(),
  };
}

function displayTime(time: string, timeFormat: TimeFormat = '12h'): string {
  const [hour, minute] = time.split(':').map(Number);
  const display = new Date();
  display.setHours(hour, minute, 0, 0);
  return formatClockTime(display, timeFormat, false);
}

function displayDate(raw?: string | null): string {
  const parts = parseIsoParts(raw);
  if (!parts) return '';
  const date = new Date(`${parts.date}T${parts.time}:00`);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatSchedule(
  task: ScheduledTask,
  timeFormat: TimeFormat = '12h'
): string {
  if (task.schedule_type === 'custom') {
    const start = taskTimeParts(task);
    const startLabel = displayDate(task.start_at_iso);
    const endLabel = displayDate(task.end_at_iso);
    const range = startLabel && endLabel ? ` · ${startLabel} – ${endLabel}` : '';
    return `Daily · ${displayTime(start.time, timeFormat)}${range}`;
  }

  if (task.is_recurring) {
    const { time } = taskTimeParts(task);
    return `Daily · ${displayTime(time, timeFormat)}`;
  }

  const raw = task.run_at_iso || task.cron_or_iso;
  const parts = parseIsoParts(raw);
  if (!parts) return raw;
  const date = new Date(`${parts.date}T${parts.time}:00`);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (value: Date) =>
    value.getFullYear() === today.getFullYear() &&
    value.getMonth() === today.getMonth() &&
    value.getDate() === today.getDate();
  const time = formatClockTime(date, timeFormat, false);
  if (sameDay(date)) return `Today · ${time}`;
  if (sameDay(tomorrow)) return `Tomorrow · ${time}`;
  return `${date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} · ${time}`;
}
