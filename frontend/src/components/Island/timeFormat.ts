import type { TimeFormat } from '../../types/ipc';

/**
 * Formats a clock time according to the user's 12/24-hour preference.
 *
 * `leadingZero` keeps the existing 12-hour presentation per surface: the
 * header uses `05:14 pm`, while alarms and task rows use `5:14 pm`. In
 * 24-hour mode the hour is always two digits (`17:14`, `09:14`).
 */
export function formatClockTime(
  date: Date,
  format: TimeFormat,
  leadingZero = true
): string {
  return date.toLocaleTimeString([], {
    hour: format === '24h' || leadingZero ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: format !== '24h',
  });
}
