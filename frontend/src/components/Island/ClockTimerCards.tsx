import React, { useState } from 'react';
import { AlarmClock, Pause, Play, RotateCcw, Timer } from 'lucide-react';
import type { ScheduledTask } from '../../types/ipc';
import { CardArt } from './CardArt';
import type { ClockTools } from './useClockTools';
import { TIMER_PRESETS } from './useClockTools';
import { alarmLabel, formatStopwatch, formatTimer, upcomingAlarms } from './clockFormat';
import { formatSchedule } from './taskFormat';

const cardClass =
  'notch-card motif-card relative flex min-h-[126px] flex-col overflow-hidden rounded-2xl p-3';

const roundButton =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';

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
      <CardArt
        variant="dial"
        className="pointer-events-none absolute right-1 top-1 h-[118px] w-[118px]"
      />

      <div className="relative flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
        <span className="flex items-center gap-1.5">
          <Timer size={12} /> Timer
        </span>
        {timer.finished ? (
          <button
            type="button"
            onClick={clockTools.dismissTimerFinished}
            className="accent-text text-[10px] font-semibold"
          >
            Time&apos;s up
          </button>
        ) : null}
      </div>

      <span className="relative mt-2 font-mono text-[32px] font-semibold leading-none text-[var(--aether-text-1)]">
        {formatTimer(timer.remainingMs)}
      </span>

      <div className="relative mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--aether-fill-2)]">
        <div
          className="h-full rounded-full transition-[width] duration-200"
          style={{ width: `${progress * 100}%`, background: 'var(--aether-accent)' }}
        />
      </div>

      <div className="relative mt-auto flex items-center gap-1.5 pt-2.5">
        <button
          type="button"
          onClick={clockTools.toggleTimer}
          className="accent-fill flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          aria-label={timer.running ? 'Pause timer' : 'Start timer'}
        >
          {timer.running ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          type="button"
          onClick={clockTools.resetTimer}
          aria-label="Reset timer"
          title="Reset timer"
          className={roundButton}
        >
          <RotateCcw size={13} />
        </button>
        <div className="ml-auto flex items-center gap-0.5">
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
                className="h-8 w-12 min-w-0 rounded-lg border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-1 text-center font-mono text-[11px] text-[var(--aether-text-1)] outline-none focus:border-[var(--aether-accent)] [color-scheme:dark]"
              />
              <button
                type="button"
                onClick={applyCustom}
                className="rounded-lg bg-[var(--aether-fill-2)] px-2 py-1.5 text-[11px] text-[var(--aether-text-1)] hover:bg-[var(--aether-fill-3)]"
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
                  className={`rounded-lg px-1.5 py-1 text-[12px] font-medium transition ${
                    timer.durationSec === minutes * 60
                      ? 'accent-text bg-[var(--aether-fill-2)]'
                      : 'text-[var(--aether-text-3)] hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]'
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
                className="rounded-lg px-1.5 py-1 text-[12px] text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)] disabled:opacity-40"
                aria-label="Custom timer duration"
              >
                ···
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const StopwatchCard: React.FC<{ clockTools: ClockTools }> = ({
  clockTools,
}) => (
  <div className={cardClass}>
    <CardArt
      variant="sweep"
      className="pointer-events-none absolute right-1 top-1 h-[118px] w-[118px]"
    />

    <div className="relative flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
      <span>Stopwatch</span>
    </div>
    <span className="relative mt-2 font-mono text-[30px] font-semibold leading-none text-[var(--aether-text-1)]">
      {formatStopwatch(clockTools.stopwatch.elapsedMs)}
    </span>
    <div className="relative mt-1.5 min-h-[16px] truncate text-[11px] text-[var(--aether-text-2)]">
      {clockTools.stopwatch.laps.length
        ? `Lap ${clockTools.stopwatch.laps.length}: ${formatStopwatch(
            clockTools.stopwatch.laps[0]
          )}`
        : 'No laps yet'}
    </div>
    <div className="relative mt-auto flex items-center gap-1.5 pt-2.5">
      <button
        type="button"
        onClick={clockTools.toggleStopwatch}
        className="accent-fill flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        aria-label={
          clockTools.stopwatch.running ? 'Pause stopwatch' : 'Start stopwatch'
        }
      >
        {clockTools.stopwatch.running ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <button
        type="button"
        onClick={clockTools.resetStopwatch}
        aria-label="Reset stopwatch"
        title="Reset stopwatch"
        className={roundButton}
      >
        <RotateCcw size={13} />
      </button>
      <button
        type="button"
        onClick={clockTools.lapStopwatch}
        disabled={!clockTools.stopwatch.running}
        className="ml-auto rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] px-3 py-1.5 text-[12px] font-medium text-[var(--aether-text-1)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)] disabled:opacity-40"
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
  const upcoming = upcomingAlarms(tasks, 4);
  const next = upcoming[0] ?? null;
  const alarmCount = tasks.filter((task) => task.kind === 'alarm').length;
  return (
    <div className={`${cardClass} h-full`}>
      <CardArt
        variant="pulse"
        className="pointer-events-none absolute bottom-0 right-0 h-[130px] w-[130px]"
      />

      <div className="relative flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
        <span className="flex items-center gap-1.5">
          <AlarmClock size={12} /> Next alarm
        </span>
        <button
          type="button"
          onClick={onNewAlarm}
          aria-label="New alarm"
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-1)] transition hover:bg-[var(--aether-fill-2)]"
        >
          <span className="text-[14px] leading-none">+</span>
        </button>
      </div>

      {next ? (
        <>
          <span className="relative mt-2 block font-mono text-[30px] font-semibold leading-none text-[var(--aether-text-1)]">
            {alarmLabel(next)}
          </span>
          <p className="relative mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--aether-text-2)]">
            {next.prompt_to_execute}
          </p>
          <p className="relative text-[10px] text-[var(--aether-text-3)]">
            {formatSchedule(next)}
          </p>
        </>
      ) : (
        <div className="relative mt-2 flex flex-1 flex-col items-start justify-center">
          <span className="font-mono text-[23px] font-semibold leading-none text-[var(--aether-text-1)]">
            No alarm set
          </span>
          <p className="mt-2 text-[11px] text-[var(--aether-text-3)]">
            {alarmCount
              ? `${alarmCount} alarm${alarmCount === 1 ? '' : 's'} paused`
              : 'Snooze 5m available when it rings'}
          </p>
        </div>
      )}

      {/* The card is twice the height of its neighbours, so the rest of the
          schedule fills it rather than leaving dead space. */}
      {upcoming.length > 1 ? (
        <div className="relative mt-auto flex flex-col gap-1 pt-2">
          {upcoming.slice(1).map((alarm) => (
            <div
              key={alarm.id}
              className="flex items-center justify-between gap-2 border-t border-[var(--aether-line-soft)] pt-1 text-[11px]"
            >
              <span className="min-w-0 truncate text-[var(--aether-text-2)]">
                {alarm.prompt_to_execute}
              </span>
              <span className="shrink-0 font-mono text-[var(--aether-text-3)]">
                {alarmLabel(alarm)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

