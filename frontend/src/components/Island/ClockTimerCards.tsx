import React, { useState } from 'react';
import { AlarmClock, Pause, Play, RotateCcw, Timer } from 'lucide-react';
import type { ScheduledTask } from '../../types/ipc';
import type { ClockTools } from './useClockTools';
import { TIMER_PRESETS } from './useClockTools';
import { alarmLabel, formatStopwatch, formatTimer, nextAlarm } from './clockFormat';
import { formatSchedule } from './taskFormat';

const cardClass = 'notch-card flex min-h-[126px] flex-col rounded-2xl p-3';

export const TimerCard: React.FC<{ clockTools: ClockTools }> = ({
  clockTools,
}) => {
  const { timer } = clockTools;
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(
    String(Math.round(timer.durationSec / 60))
  );
  const progress = Math.max(
    0,
    Math.min(1, timer.remainingMs / Math.max(1, timer.durationSec * 1000))
  );
  const applyCustom = () => {
    const minutes = Number(customMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    clockTools.setTimerDuration(Math.min(240, Math.round(minutes)) * 60);
    setCustomOpen(false);
  };
  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-[#857f73]">
        <span className="flex items-center gap-1">
          <Timer size={11} /> Timer
        </span>
        <button
          type="button"
          onClick={clockTools.resetTimer}
          aria-label="Reset timer"
          className="text-[#777168] transition hover:text-white"
        >
          <RotateCcw size={12} />
        </button>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-[27px] font-semibold leading-none text-[#f4f1e7]">
          {formatTimer(timer.remainingMs)}
        </span>
        {timer.finished ? (
          <button
            type="button"
            onClick={clockTools.dismissTimerFinished}
            className="accent-text text-[9px] font-semibold"
          >
            Time&apos;s up
          </button>
        ) : null}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-1 rounded-full transition-[width] duration-200"
          style={{ width: `${progress * 100}%`, background: 'var(--aether-accent)' }}
        />
      </div>
      <div className="mt-auto flex items-center gap-1 pt-2">
        <button
          type="button"
          onClick={clockTools.toggleTimer}
          className="accent-fill flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          aria-label={timer.running ? 'Pause timer' : 'Start timer'}
        >
          {timer.running ? <Pause size={11} /> : <Play size={11} />}
        </button>
        {customOpen ? (
          <>
            <input
              type="number"
              min={1}
              max={240}
              value={customMinutes}
              onChange={(event) => setCustomMinutes(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyCustom();
              }}
              aria-label="Custom timer minutes"
              className="h-6 w-11 min-w-0 rounded-md border border-white/10 bg-[#2b2b2b] px-1 text-center font-mono text-[9px] text-white outline-none focus:border-[var(--aether-accent)] [color-scheme:dark]"
            />
            <button
              type="button"
              onClick={applyCustom}
              className="rounded bg-white/10 px-1.5 py-1 text-[9px] text-white hover:bg-white/15"
            >
              Set
            </button>
          </>
        ) : (
          <>
            {TIMER_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                disabled={timer.running}
                onClick={() => clockTools.setTimerDuration(minutes * 60)}
                className={`rounded px-1.5 py-1 text-[9px] transition ${
                  timer.durationSec === minutes * 60
                    ? 'accent-text bg-white/10'
                    : 'text-[#8f897d] hover:bg-white/10 hover:text-white'
                } disabled:opacity-40`}
              >
                {minutes}m
              </button>
            ))}
            <button
              type="button"
              disabled={timer.running}
              onClick={() => {
                setCustomMinutes(String(Math.round(timer.durationSec / 60)));
                setCustomOpen(true);
              }}
              className="rounded px-1 py-1 text-[9px] text-[#8f897d] transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              aria-label="Custom timer duration"
            >
              ···
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export const StopwatchCard: React.FC<{ clockTools: ClockTools }> = ({
  clockTools,
}) => (
  <div className={cardClass}>
    <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-[#857f73]">
      <span>Stopwatch</span>
      <button
        type="button"
        onClick={clockTools.resetStopwatch}
        aria-label="Reset stopwatch"
        className="text-[#777168] transition hover:text-white"
      >
        <RotateCcw size={12} />
      </button>
    </div>
    <span className="mt-1 font-mono text-[24px] font-semibold leading-none text-[#f4f1e7]">
      {formatStopwatch(clockTools.stopwatch.elapsedMs)}
    </span>
    <div className="mt-1 min-h-[12px] truncate text-[9px] text-[#777168]">
      {clockTools.stopwatch.laps.length
        ? `Lap ${clockTools.stopwatch.laps.length}: ${formatStopwatch(
            clockTools.stopwatch.laps[0]
          )}`
        : 'No laps yet'}
    </div>
    <div className="mt-auto flex items-center gap-1 pt-2">
      <button
        type="button"
        onClick={clockTools.toggleStopwatch}
        className="accent-fill flex h-6 w-6 items-center justify-center rounded-md"
        aria-label={
          clockTools.stopwatch.running ? 'Pause stopwatch' : 'Start stopwatch'
        }
      >
        {clockTools.stopwatch.running ? <Pause size={11} /> : <Play size={11} />}
      </button>
      <button
        type="button"
        onClick={clockTools.lapStopwatch}
        disabled={!clockTools.stopwatch.running}
        className="rounded bg-white/[0.06] px-2 py-1 text-[9px] text-[#b8b2a7] transition hover:bg-white/10 hover:text-white disabled:opacity-40"
      >
        Lap
      </button>
    </div>
  </div>
);

export const AlarmCard: React.FC<{
  tasks: ScheduledTask[];
  onNewAlarm: () => void;
}> = ({ tasks, onNewAlarm }) => {
  const next = nextAlarm(tasks);
  const alarmCount = tasks.filter((task) => task.kind === 'alarm').length;
  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-[#857f73]">
        <span className="flex items-center gap-1">
          <AlarmClock size={11} /> Next alarm
        </span>
        <button
          type="button"
          onClick={onNewAlarm}
          aria-label="New alarm"
          className="flex h-5 w-5 items-center justify-center rounded text-[#777168] transition hover:bg-white/10 hover:text-white"
        >
          <span className="text-[12px] leading-none">+</span>
        </button>
      </div>
      <span className="mt-1 font-mono text-[26px] font-semibold leading-none text-[#f4f1e7]">
        {alarmLabel(next)}
      </span>
      <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-[#8f897d]">
        {next
          ? `${next.prompt_to_execute} · ${formatSchedule(next)}`
          : 'Create an alarm from the panel below.'}
      </p>
      <div className="mt-auto pt-2 text-[9px] text-[#777168]">
        {next?.next_run_at
          ? new Date(next.next_run_at).toLocaleDateString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
          : alarmCount
            ? `${alarmCount} alarm${alarmCount === 1 ? '' : 's'} paused`
            : 'Snooze 5m available when it rings'}
      </div>
    </div>
  );
};
