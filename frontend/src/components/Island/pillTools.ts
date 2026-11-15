/**
 * Compact timer/stopwatch status for the collapsed pill.
 *
 * Both tools live above the tab content, so the pill can read the same state
 * without duplicating it. Indicators are hidden while idle and keep a frozen
 * value when their tool is paused, so a paused countdown never looks finished.
 */

import type { AppearanceConfig, SystemStats } from '../../types/ipc';
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
/** Gap between the label and the value of one stat, and between two stats. */
const PILL_STAT_LABEL_GAP = 4;
const PILL_STAT_GAP = 6;
/** Uppercase mono letters run a little wider than the tabular digits. */
const PILL_STAT_LABEL_WIDTH = 6;

export interface PillStat {
  label: string;
  value: string;
}

/**
 * The clock is the pill's fallback readout: hiding it while every stat is also
 * off would leave an empty pill, so it is forced back on. The media glyph does
 * not count, because it is a state cue rather than a reading.
 */
export function pillClockVisible(appearance: AppearanceConfig): boolean {
  const anyStat =
    appearance.pill_show_cpu || appearance.pill_show_gpu || appearance.pill_show_ram;
  return appearance.pill_show_clock || !anyStat;
}

/** The system stats the user switched on for the collapsed pill, in order. */
export function pillStats(
  appearance: AppearanceConfig,
  stats: SystemStats | null
): PillStat[] {
  if (!stats) return [];
  const percent = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value)
      ? `${Math.round(value)}%`
      : '—';
  const out: PillStat[] = [];
  if (appearance.pill_show_cpu) {
    out.push({ label: 'CPU', value: percent(stats.cpu_percent) });
  }
  if (appearance.pill_show_gpu) {
    // GPU readings come from vendor sensors and stay null on some machines;
    // the dash keeps the pill from lying about a value it cannot read.
    out.push({ label: 'GPU', value: percent(stats.gpu_percent) });
  }
  if (appearance.pill_show_ram) {
    out.push({ label: 'RAM', value: percent(stats.ram_percent) });
  }
  return out;
}

/** Width the pill has to reserve for its stats, measured like the clock. */
export function pillStatsWidth(stats: PillStat[]): number {
  if (!stats.length) return 0;
  return (
    stats.reduce(
      (total, stat) =>
        total +
        stat.label.length * PILL_STAT_LABEL_WIDTH +
        stat.value.length * PILL_DIGIT_WIDTH +
        PILL_STAT_LABEL_GAP,
      0
    ) +
    (stats.length - 1) * PILL_STAT_GAP
  );
}

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
  showClock: boolean,
  clockWidth: number,
  statsWidth = 0
): number {
  const timer = isTimerVisible(tools.timer);
  const stopwatch = isStopwatchVisible(tools.stopwatch);
  if (!timer && !stopwatch && statsWidth === 0) {
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
    ? PILL_MEDIA_MARK_WIDTH +
      (stopwatch || statsWidth > 0 ? PILL_MEDIA_GAP : 0)
    : 0;
  const rightWidth = statsWidth + stopwatchWidth + mediaWidth;

  // The active indicators and clock form one centred group. Empty slots are
  // not reserved, so a lone timer or stopwatch stays close to the clock rather
  // than leaving a matching hole on the other side.
  const cells = (timer ? 1 : 0) + (showClock ? 1 : 0) + (rightWidth > 0 ? 1 : 0);
  const gaps = Math.max(0, cells - 1) * PILL_COLUMN_GAP;

  return Math.max(
    PILL_BASE_WIDTH,
    Math.ceil(
      PILL_SHELL_BORDER +
        PILL_HORIZONTAL_PADDING +
        (showClock ? clockWidth : 0) +
        timerWidth +
        rightWidth +
        gaps
    )
  );
}
