import React, { useState } from 'react';
import {
  Check,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  LocateFixed,
  RefreshCw,
  Sun,
  X,
} from 'lucide-react';
import type { ClockConfig, WeatherSnapshot } from '../../types/ipc';

interface WeatherCardProps {
  now: Date;
  weather: WeatherSnapshot | null;
  clockConfig: ClockConfig;
  onSaveWeather: (patch: Partial<ClockConfig>) => void;
  onRefreshWeather: () => void;
}

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
    <div className="notch-card flex min-h-[126px] flex-col rounded-2xl p-3">
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
            onClick={toggleEditing}
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
              {weather?.location ||
                (clockConfig.weather_mode === 'auto'
                  ? 'Auto location'
                  : clockConfig.weather_city || 'Set a city')}
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
