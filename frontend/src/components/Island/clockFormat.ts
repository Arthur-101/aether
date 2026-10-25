import type { ScheduledTask, TimeFormat } from '../../types/ipc';
import { taskTimeParts } from './taskFormat';
import { formatClockTime } from './timeFormat';

export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const centiseconds = Math.floor((total % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}.${String(centiseconds).padStart(2, '0')}`;
}

/**
 * Compact duration for the collapsed pill: minutes and seconds, with an hours
 * field only once the value reaches an hour. Countdowns round up so a fresh
 * one-minute timer reads 01:00 rather than 00:59; elapsed time rounds down.
 */
export function formatCompactDuration(
  ms: number,
  mode: 'countdown' | 'elapsed'
): string {
  const rounded =
    mode === 'countdown' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const total = Math.max(0, rounded);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function nextAlarm(tasks: ScheduledTask[]): ScheduledTask | null {
  return upcomingAlarms(tasks, 1)[0] ?? null;
}

export function upcomingAlarms(
  tasks: ScheduledTask[],
  limit = 4
): ScheduledTask[] {
  const alarms = tasks.filter(
    (task) => task.kind === 'alarm' && task.status !== 'paused'
  );
  return alarms
    .map((task) => ({
      task,
      time: task.next_run_at ? new Date(task.next_run_at).getTime() : Infinity,
    }))
    .sort((a, b) => a.time - b.time)
    .slice(0, limit)
    .map((entry) => entry.task);
}

export function alarmLabel(
  task: ScheduledTask | null,
  timeFormat: TimeFormat = '12h'
): string {
  if (!task) return 'No alarm set';
  if (task.next_run_at) {
    return formatClockTime(new Date(task.next_run_at), timeFormat, false);
  }
  const { time } = taskTimeParts(task);
  const [hour, minute] = time.split(':').map(Number);
  const display = new Date();
  display.setHours(hour, minute, 0, 0);
  return formatClockTime(display, timeFormat, false);
}
