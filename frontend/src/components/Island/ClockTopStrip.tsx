import React from 'react';
import type { ClockConfig, ScheduledTask, WeatherSnapshot } from '../../types/ipc';
import { AlarmCard, StopwatchCard, TimerCard } from './ClockTimerCards';
import { WeatherCard } from './ClockWeatherCard';
import type { ClockTools } from './useClockTools';

interface ClockTopStripProps {
  now: Date;
  weather: WeatherSnapshot | null;
  clockConfig: ClockConfig;
  clockTools: ClockTools;
  tasks: ScheduledTask[];
  onSaveWeather: (patch: Partial<ClockConfig>) => void;
  onRefreshWeather: () => void;
  onNewAlarm: () => void;
}

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
    <AlarmCard tasks={props.tasks} onNewAlarm={props.onNewAlarm} />
  </div>
);
