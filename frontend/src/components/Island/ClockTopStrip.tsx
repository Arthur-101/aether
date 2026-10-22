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

/**
 * The strip above the tasks.
 *
 * Three columns: the weather takes the width of two, the timer and the
 * stopwatch stack in the next, and the next alarm runs the full height of
 * the last.
 */
export const ClockTopStrip: React.FC<ClockTopStripProps> = (props) => (
  <div className="grid grid-cols-[2fr_1fr_1fr] grid-rows-[auto_auto] gap-2.5">
    <div className="col-start-1 row-start-1 row-span-2">
      <WeatherCard
        now={props.now}
        weather={props.weather}
        clockConfig={props.clockConfig}
        onSaveWeather={props.onSaveWeather}
        onRefreshWeather={props.onRefreshWeather}
      />
    </div>
    <div className="col-start-2 row-start-1">
      <TimerCard clockTools={props.clockTools} />
    </div>
    <div className="col-start-2 row-start-2">
      <StopwatchCard clockTools={props.clockTools} />
    </div>
    <div className="col-start-3 row-start-1 row-span-2">
      <AlarmCard tasks={props.tasks} onNewAlarm={props.onNewAlarm} />
    </div>
  </div>
);
