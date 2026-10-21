import type { ScheduledTask } from '../../types/ipc';
import { taskTimeParts } from './taskFormat';

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function nextAlarmTime(): string {
  const next = new Date(Date.now() + 5 * 60 * 1000);
  return `${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

export function localIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

export function alarmTimeLabel(alarm: ScheduledTask): string {
  const { time } = taskTimeParts(alarm);
  const [hour, minute] = time.split(':').map(Number);
  const display = new Date();
  display.setHours(hour, minute, 0, 0);
  return display.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
