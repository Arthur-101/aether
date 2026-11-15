import React from 'react';
import { Hourglass, Timer } from 'lucide-react';
import { useTimeFormat } from '../../hooks/useTimeFormat';
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
  onOpen: () => void;
}

export const NotchIdle: React.FC<NotchIdleProps> = ({
  now,
  mediaActive,
  spotify,
  stats,
  showClock,
  clockTools,
  onOpen,
}) => {
  const timeFormat = useTimeFormat();
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
