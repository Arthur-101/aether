/**
 * Compact timer/stopwatch status for the collapsed pill.
 *
 * Both tools live above the tab content, so the pill can read the same state
 * without duplicating it. Indicators are hidden while idle and keep a frozen
 * value when their tool is paused, so a paused countdown never looks finished.
 */

import type { ClockTools } from './useClockTools';
import { formatCompactDuration } from './clockFormat';

const PILL_BASE_WIDTH = 140;
const PILL_MEDIA_ONLY_WIDTH = 176;
const PILL_SHELL_BORDER = 2;
const PILL_HORIZONTAL_PADDING = 24;
/**
 * Breathing room between the clock and the active indicators. This is the
 * visual gap the collapsed pill uses; it does not depend on the pill width.
 */
const PILL_COLUMN_GAP = 18;
/** 10px icon plus the 4px gap before the value. */
const PILL_TOOL_CHROME = 14;
/** Measured advance of the 10px mono digit pair used by both indicators. */
const PILL_DIGIT_WIDTH = 5.5;
/** Pulse dot and its margin on a finished timer. */
const PILL_FINISHED_DOT = 6;
/** Compact media glyph. */
const PILL_MEDIA_MARK_WIDTH = 14;
/** Space between a stopwatch and the media glyph in the right-hand group. */
const PILL_MEDIA_GAP = 6;

export function isTimerVisible(timer: ClockTools['timer']): boolean {
  return (
    timer.running ||
    timer.finished ||
    (timer.remainingMs > 0 && timer.remainingMs < timer.durationSec * 1000)
  );
}

export function isStopwatchVisible(
  stopwatch: ClockTools['stopwatch']
): boolean {
  return stopwatch.running || stopwatch.elapsedMs > 0;
}

export function formatPillTimer(ms: number): string {
  return formatCompactDuration(ms, 'countdown');
}

export function formatPillStopwatch(ms: number): string {
  return formatCompactDuration(ms, 'elapsed');
}

export function compactPillWidth(
  tools: ClockTools,
  mediaActive: boolean,
  clockWidth: number
): number {
  const timer = isTimerVisible(tools.timer);
  const stopwatch = isStopwatchVisible(tools.stopwatch);
  if (!timer && !stopwatch) {
    return mediaActive ? PILL_MEDIA_ONLY_WIDTH : PILL_BASE_WIDTH;
  }

  const timerWidth = timer
    ? PILL_TOOL_CHROME +
      formatPillTimer(tools.timer.remainingMs).length * PILL_DIGIT_WIDTH +
      (tools.timer.finished ? PILL_FINISHED_DOT : 0)
    : 0;
  const stopwatchWidth = stopwatch
    ? PILL_TOOL_CHROME +
      formatPillStopwatch(tools.stopwatch.elapsedMs).length * PILL_DIGIT_WIDTH
    : 0;
  const mediaWidth = mediaActive
    ? PILL_MEDIA_MARK_WIDTH + (stopwatch ? PILL_MEDIA_GAP : 0)
    : 0;
  const rightWidth = stopwatchWidth + mediaWidth;

  // The active indicators and clock form one centred group. Empty slots are
  // not reserved, so a lone timer or stopwatch stays close to the clock rather
  // than leaving a matching hole on the other side.
  const cells = (timer ? 1 : 0) + 1 + (rightWidth > 0 ? 1 : 0);
  const gaps = (cells - 1) * PILL_COLUMN_GAP;

  return Math.max(
    PILL_BASE_WIDTH,
    Math.ceil(
      PILL_SHELL_BORDER +
        PILL_HORIZONTAL_PADDING +
        clockWidth +
        timerWidth +
        rightWidth +
        gaps
    )
  );
}
