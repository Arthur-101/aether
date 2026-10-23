import React, { useState } from 'react';
import { Check, Droplets, LocateFixed, RefreshCw, Sun, Wind, X } from 'lucide-react';
import type { ClockConfig, WeatherSnapshot } from '../../types/ipc';
import { WeatherArt, isDaytime, sceneFor } from './WeatherArt';

interface WeatherCardProps {
  now: Date;
  weather: WeatherSnapshot | null;
  clockConfig: ClockConfig;
  onSaveWeather: (patch: Partial<ClockConfig>) => void;
  onRefreshWeather: () => void;
}

/**
 * The weather card.
 *
 * It sits in a two-by-two slot, so the illustration carries the card and the
 * numbers sit beside it rather than under it.
 */
export const WeatherCard: React.FC<WeatherCardProps> = ({
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

  const scene = sceneFor(weather?.icon, weather?.condition);
  const day = isDaytime(now);

  const toggleEditing = () => {
    if (!editing) {
      setMode(clockConfig.weather_mode);
      setCity(clockConfig.weather_city);
      setUnit(clockConfig.weather_unit);
    }
    setEditing((value) => !value);
  };

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
    <div className="notch-card relative flex h-full min-h-[252px] flex-col overflow-hidden rounded-2xl p-3.5">
      <WeatherArt
        scene={scene}
        isDay={day}
        cover
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute inset-0 bg-[var(--aether-scrim)]" />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-2)]">
              {now.toLocaleDateString([], { weekday: 'long' })}
            </p>
            <p className="text-[13px] text-[var(--aether-text-1)]">
              {now.toLocaleDateString([], { month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefreshWeather}
              aria-label="Refresh weather"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
            >
              <RefreshCw size={12} />
            </button>
            <button
              type="button"
              onClick={toggleEditing}
              aria-label="Weather settings"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
            >
              <LocateFixed size={12} />
            </button>
          </div>
        </div>

        {editing ? (
          <div className="mt-2 flex flex-1 flex-col justify-end gap-1.5">
            <div className="flex rounded-md bg-[var(--aether-surface-3)]/80 p-0.5">
              {(['auto', 'manual'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`flex-1 rounded px-1.5 py-1 text-[9px] font-semibold transition ${
                    mode === value
                      ? 'bg-[var(--aether-fill-3)] text-[var(--aether-text-1)]'
                      : 'text-[var(--aether-text-3)] hover:text-[var(--aether-text-1)]'
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
                className="min-w-0 flex-1 rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-4)]/80 px-1.5 py-1 text-[9px] text-[var(--aether-text-1)] outline-none placeholder:text-[var(--aether-text-3)]"
              />
              <select
                value={unit}
                onChange={(event) =>
                  setUnit(event.target.value as ClockConfig['weather_unit'])
                }
                className="rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-4)]/80 px-1 py-1 text-[9px] text-[var(--aether-text-1)] outline-none"
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
                className="flex items-center justify-center rounded-md bg-[var(--aether-surface-3)]/80 px-2 text-[var(--aether-text-1)] hover:text-[var(--aether-text-1)]"
                aria-label="Cancel weather settings"
              >
                <X size={11} />
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-auto flex flex-col gap-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[52px] font-semibold leading-none text-[var(--aether-text-1)]">
                {weather?.temperature != null
                  ? `${Math.round(weather.temperature)}°`
                  : '—'}
              </span>
              <span className="text-[13px] text-[var(--aether-text-2)]">
                {weather?.unit || 'C'}
              </span>
            </div>
            <p className="truncate text-[15px] font-medium text-[var(--aether-text-1)]">
              {weather?.available ? weather.condition : 'Weather offline'}
            </p>
            <p className="truncate text-[11px] text-[var(--aether-text-2)]">
              {weather?.location ||
                (clockConfig.weather_mode === 'auto'
                  ? 'Auto location'
                  : clockConfig.weather_city || 'Set a city')}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/10 pt-2 text-[12px]">
              <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[var(--aether-text-2)]">
                <Sun size={12} className="shrink-0" />
                Sky
                <span className="font-mono font-medium text-[var(--aether-text-1)]">
                  {day ? 'Day' : 'Night'}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[var(--aether-text-2)]">
                <Droplets size={12} className="shrink-0" />
                Humidity
                <span className="font-mono font-medium text-[var(--aether-text-1)]">
                  {weather?.humidity != null ? `${weather.humidity}%` : '—'}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[var(--aether-text-2)]">
                <Wind size={12} className="shrink-0" />
                Wind
                <span className="font-mono font-medium text-[var(--aether-text-1)]">
                  {weather?.wind_kph != null ? `${weather.wind_kph} km/h` : '—'}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
