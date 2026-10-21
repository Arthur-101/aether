import React, { useEffect, useState } from 'react';
import {
  AlarmClock,
  Check,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  LocateFixed,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sun,
  Timer,
  X,
} from 'lucide-react';
import type {
  ClockConfig,
  ScheduledTask,
  WeatherSnapshot,
} from '../../types/ipc';
import type { ClockTools } from './useClockTools';
import { TIMER_PRESETS } from './useClockTools';
import { alarmLabel, formatStopwatch, formatTimer, nextAlarm } from './clockFormat';
import { formatSchedule } from './taskFormat';

interface ClockTopStripProps {
  now: Date;
  weather: WeatherSnapshot | null;
  clockConfig: ClockConfig;
  clockTools: ClockTools;
  tasks: ScheduledTask[];
  onSaveWeather: (patch: Partial<ClockConfig>) => void;
  onRefreshWeather: () => void;
}

const cardClass = 'notch-card flex min-h-[126px] flex-col rounded-2xl p-3';

const WeatherIcon: React.FC<{ icon?: string; size?: number }> = ({
  icon,
  size = 18,
}) => {
  const Icon =
    icon === 'sun'
      ? Sun
      : icon === 'cloud-sun'
        ? CloudSun
        : icon === 'rain'
          ? CloudRain
          : icon === 'snow'
            ? CloudSnow
            : icon === 'thunder'
              ? CloudLightning
              : icon === 'fog'
                ? CloudFog
                : Cloud;
  return <Icon size={size} />;
};

const WeatherCard: React.FC<Omit<ClockTopStripProps, 'clockTools' | 'tasks'>> = ({
  now,
  weather,
  clockConfig,
  onSaveWeather,
  onRefreshWeather,
}) => {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState(clockConfig.weather_mode);
  const [city, setCity] = useState(clockConfig.weather_city);
  const [unit, setUnit] = useState(clockConfig.weather_unit);

  useEffect(() => {
    if (editing) return;
    setMode(clockConfig.weather_mode);
    setCity(clockConfig.weather_city);
    setUnit(clockConfig.weather_unit);
  }, [clockConfig, editing]);

  const save = () => {
    onSaveWeather({
      weather_mode: city.trim() ? mode : 'auto',
      weather_city: city.trim(),
      weather_unit: unit,
      weather_latitude: null,
      weather_longitude: null,
      weather_label: '',
    });
    setEditing(false);
    window.setTimeout(onRefreshWeather, 120);
  };

  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#857f73]">
            {now.toLocaleDateString([], { weekday: 'long' })}
          </p>
          <p className="text-[10px] text-[#b8b2a7]">
            {now.toLocaleDateString([], { month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefreshWeather}
            aria-label="Refresh weather"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#8f897d] transition hover:bg-white/10 hover:text-white"
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            aria-label="Weather settings"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#8f897d] transition hover:bg-white/10 hover:text-white"
          >
            <LocateFixed size={12} />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-2 flex flex-1 flex-col gap-1.5">
          <div className="flex rounded-md bg-white/[0.05] p-0.5">
            {(['auto', 'manual'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`flex-1 rounded px-1.5 py-1 text-[9px] font-semibold transition ${
                  mode === value
                    ? 'bg-white/15 text-white'
                    : 'text-[#8f897d] hover:text-white'
                }`}
              >
                {value === 'auto' ? 'Auto' : 'City'}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="City override"
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#242424] px-1.5 py-1 text-[9px] text-white outline-none placeholder:text-[#6f6a61]"
            />
            <select
              value={unit}
              onChange={(event) =>
                setUnit(event.target.value as ClockConfig['weather_unit'])
              }
              className="rounded-md border border-white/10 bg-[#242424] px-1 py-1 text-[9px] text-white outline-none"
            >
              <option value="celsius">°C</option>
              <option value="fahrenheit">°F</option>
            </select>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={save}
              className="accent-fill flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[9px] font-semibold"
            >
              <Check size={10} /> Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex items-center justify-center rounded-md bg-white/[0.06] px-2 text-[#a8a196] hover:text-white"
              aria-label="Cancel weather settings"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-1 items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-[27px] font-semibold leading-none text-[#f4f1e7]">
                {weather?.temperature != null
                  ? `${Math.round(weather.temperature)}°`
                  : '—'}
              </span>
              <span className="text-[10px] text-[#8f897d]">
                {weather?.unit || 'C'}
              </span>
            </div>
            <p className="mt-1 truncate text-[10px] font-medium text-[#c9c3b7]">
              {weather?.available ? weather.condition : 'Weather offline'}
            </p>
            <p className="truncate text-[9px] text-[#777168]">
              {weather?.location || (clockConfig.weather_mode === 'auto' ? 'Auto location' : clockConfig.weather_city || 'Set a city')}
            </p>
          </div>
          <span className="accent-text shrink-0">
            <WeatherIcon icon={weather?.icon} size={30} />
          </span>
        </div>
      )}
    </div>
  );
};

const TimerCard: React.FC<{ clockTools: ClockTools }> = ({ clockTools }) => {
  const { timer } = clockTools;
  const progress = Math.max(
    0,
    Math.min(1, timer.remainingMs / Math.max(1, timer.durationSec * 1000))
  );
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
          className="accent-fill flex h-6 w-6 items-center justify-center rounded-md"
          aria-label={timer.running ? 'Pause timer' : 'Start timer'}
        >
          {timer.running ? <Pause size={11} /> : <Play size={11} />}
        </button>
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
      </div>
    </div>
  );
};

const StopwatchCard: React.FC<{ clockTools: ClockTools }> = ({ clockTools }) => (
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
        aria-label={clockTools.stopwatch.running ? 'Pause stopwatch' : 'Start stopwatch'}
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

const AlarmCard: React.FC<{ tasks: ScheduledTask[] }> = ({ tasks }) => {
  const next = nextAlarm(tasks);
  const alarmCount = tasks.filter((task) => task.kind === 'alarm').length;
  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-[#857f73]">
        <span className="flex items-center gap-1">
          <AlarmClock size={11} /> Next alarm
        </span>
        <span className="text-[#777168]">{alarmCount || '—'}</span>
      </div>
      <span className="mt-1 font-mono text-[26px] font-semibold leading-none text-[#f4f1e7]">
        {alarmLabel(next)}
      </span>
      <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-[#8f897d]">
        {next ? `${next.prompt_to_execute} · ${formatSchedule(next)}` : 'Create an alarm from the panel below.'}
      </p>
      <div className="mt-auto pt-2 text-[9px] text-[#777168]">
        {next?.next_run_at
          ? new Date(next.next_run_at).toLocaleDateString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
          : 'Snooze 5m available when it rings'}
      </div>
    </div>
  );
};

export const ClockTopStrip: React.FC<ClockTopStripProps> = (props) => (
  <div className="grid grid-cols-4 gap-2.5">
    <WeatherCard
      now={props.now}
      weather={props.weather}
      clockConfig={props.clockConfig}
      onSaveWeather={props.onSaveWeather}
      onRefreshWeather={props.onRefreshWeather}
    />
    <TimerCard clockTools={props.clockTools} />
    <StopwatchCard clockTools={props.clockTools} />
    <AlarmCard tasks={props.tasks} />
  </div>
);
