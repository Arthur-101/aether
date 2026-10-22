import type { ScheduledTask } from '../../types/ipc';
import { taskTimeParts } from './taskFormat';

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

export function alarmLabel(task: ScheduledTask | null): string {
  if (!task) return 'No alarm set';
  if (task.next_run_at) {
    return new Date(task.next_run_at).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  const { time } = taskTimeParts(task);
  const [hour, minute] = time.split(':').map(Number);
  const display = new Date();
  display.setHours(hour, minute, 0, 0);
  return display.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
