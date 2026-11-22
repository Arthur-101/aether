import React from 'react';
import { Hourglass, Timer } from 'lucide-react';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import type { MediaJob } from '../../types/ipc';
import { MediaBars } from './MediaBars';
import { formatClockTime } from './timeFormat';
import type { ClockTools } from './useClockTools';
import {
  formatPillStopwatch,
  formatPillTimer,
  isStopwatchVisible,
  isTimerVisible,
  type PillStat,
} from './pillTools';

interface NotchIdleProps {
  now: Date;
  mediaActive: boolean;
  spotify: boolean;
  stats: PillStat[];
  showClock: boolean;
  clockTools: ClockTools;
  /** A running or queued media job, which takes over the pill. */
  job: MediaJob | null;
  onOpen: () => void;
}

export const NotchIdle: React.FC<NotchIdleProps> = ({
  now,
  mediaActive,
  spotify,
  stats,
  showClock,
  clockTools,
  job,
  onOpen,
}) => {
  const timeFormat = useTimeFormat();

  // The job is temporary and more useful than the clock: replace the whole
  // readout with its progress, then fall back to the normal pill on finish.
  if (job) {
    const percent =
      job.progress == null
        ? null
        : Math.max(0, Math.min(100, Math.round(job.progress * 100)));
    const label =
      job.status === 'queued'
        ? 'Queued'
        : job.action === 'COMPRESS'
          ? 'Compressing'
          : 'Converting';
    return (
      <button
        type="button"
        data-aether-island-trigger
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        aria-label={`${label} ${job.file_name}${
          percent == null ? '' : `, ${percent} percent`
        }`}
        className="focus-inset relative flex h-full w-full items-center justify-center px-3 text-[var(--aether-text-1)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--aether-text-3)]">
            {label}
          </span>
          <span className="h-1.5 w-[74px] shrink-0 overflow-hidden rounded-full bg-[var(--aether-surface-3)]">
            <span
              className={`block h-full rounded-full bg-[var(--aether-accent)] ${
                percent == null
                  ? 'w-1/3 animate-pulse motion-reduce:animate-none'
                  : 'transition-[width] duration-200'
              }`}
              style={percent == null ? undefined : { width: `${percent}%` }}
            />
          </span>
          <span className="shrink-0 font-mono text-[10px] font-semibold tabular-nums text-[var(--aether-text-1)]">
            {percent == null ? '…' : `${percent}%`}
          </span>
        </span>
      </button>
    );
  }

  const time = formatClockTime(now, timeFormat);
  const timerVisible = isTimerVisible(clockTools.timer);
  const stopwatchVisible = isStopwatchVisible(clockTools.stopwatch);
  const timerText = formatPillTimer(clockTools.timer.remainingMs);
  const stopwatchText = formatPillStopwatch(clockTools.stopwatch.elapsedMs);
  const hasTools = timerVisible || stopwatchVisible;
  const hasRight = stopwatchVisible || mediaActive || stats.length > 0;
  // The three-column grid keeps the clock dead-centre, but its side columns
  // share the leftover space equally, so a wide right group such as three
  // stats would be squeezed and overlap the clock. Anything with stats uses the
  // centred row instead, the same shape the clock tools already use.
  const grouped = hasTools || stats.length > 0;
  const timerTone = clockTools.timer.finished
    ? 'text-[var(--aether-accent-text)]'
    : clockTools.timer.running
      ? 'text-[var(--aether-text-1)]'
      : 'text-[var(--aether-text-3)]';
  const stopwatchTone = clockTools.stopwatch.running
    ? 'text-[var(--aether-text-1)]'
    : 'text-[var(--aether-text-3)]';
  const status = [
    timerVisible
      ? `Timer ${timerText} ${
          clockTools.timer.finished
            ? 'finished'
            : clockTools.timer.running
              ? 'remaining'
              : 'paused'
        }`
      : null,
    stopwatchVisible
      ? `Stopwatch ${stopwatchText}${
          clockTools.stopwatch.running ? '' : ' paused'
        }`
      : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <button
      type="button"
      data-aether-island-trigger
      aria-keyshortcuts="ArrowUp"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      aria-label={`Open Aether command center. ${time}${
        status ? `. ${status}` : ''
      }`}
      className={`focus-inset relative h-full w-full items-center px-3 text-[var(--aether-text-1)] ${
        grouped
          ? 'flex justify-center gap-[18px]'
          : 'grid grid-cols-[1fr_auto_1fr] gap-2'
      }`}
    >
      {timerVisible ? (
        <span className="pointer-events-none flex min-w-0 items-center">
          <span
            className={`flex items-center gap-1 whitespace-nowrap font-mono text-[10px] font-semibold leading-none tabular-nums ${timerTone}`}
          >
            <Hourglass
              size={10}
              strokeWidth={2.2}
              aria-hidden
              className={
                clockTools.timer.finished || clockTools.timer.running
                  ? 'text-[var(--aether-accent-text)]'
                  : undefined
              }
            />
            {timerText}
            {clockTools.timer.finished ? (
              <span
                aria-hidden
                className="ml-0.5 h-1 w-1 animate-pulse rounded-full bg-[var(--aether-accent)] motion-reduce:animate-none"
              />
            ) : null}
          </span>
        </span>
      ) : !grouped ? (
        <span aria-hidden className="pointer-events-none flex min-w-0" />
      ) : null}

      {showClock ? (
        <span className="shrink-0 whitespace-nowrap text-center font-mono text-[13px] font-semibold tabular-nums tracking-[0.01em]">
          {time}
        </span>
      ) : null}

      {hasRight ? (
        <span
          className={`pointer-events-none flex min-w-0 items-center gap-1.5 ${
            grouped ? '' : 'justify-end'
          }`}
        >
          {stats.map((stat) => (
            <span
              key={stat.label}
              className="flex items-center gap-1 whitespace-nowrap font-mono text-[10px] font-semibold leading-none tabular-nums text-[var(--aether-text-2)]"
            >
              <span className="text-[var(--aether-text-3)]">{stat.label}</span>
              {stat.value}
            </span>
          ))}
          {stopwatchVisible ? (
            <span
              className={`flex items-center gap-1 whitespace-nowrap font-mono text-[10px] font-semibold leading-none tabular-nums ${stopwatchTone}`}
            >
              <Timer
                size={10}
                strokeWidth={2.2}
                aria-hidden
                className={
                  clockTools.stopwatch.running
                    ? 'text-[var(--aether-accent-text)]'
                    : undefined
                }
              />
              {stopwatchText}
            </span>
          ) : null}
          {mediaActive ? (
            <MediaBars active spotify={spotify} compact />
          ) : null}
        </span>
      ) : null}
    </button>
  );
};
