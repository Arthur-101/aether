import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ClockConfig,
  ScheduledTask,
  TaskInput,
  WeatherSnapshot,
} from '../../types/ipc';
import { AiTaskCard } from './AiTaskCard';
import { AlarmPanel, type AlarmPanelHandle } from './AlarmPanel';
import { ClockTopStrip } from './ClockTopStrip';
import { TaskPanel } from './TaskPanel';
import { CLOCK_HEIGHT } from './tabSizes';
import type { ClockTools } from './useClockTools';

interface ClockTasksTabProps {
  tasks: ScheduledTask[];
  weather: WeatherSnapshot | null;
  clockConfig: ClockConfig;
  clockTools: ClockTools;
  onRefreshTasks: () => void;
  onCreateTask: (task: TaskInput) => void;
  onUpdateTask: (task: TaskInput & { task_id: string }) => void;
  onDeleteTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onPauseTask: (taskId: string) => void;
  onResumeTask: (taskId: string) => void;
  onSaveWeather: (patch: Partial<ClockConfig>) => void;
  onRefreshWeather: () => void;
  onAskAether: (prompt: string) => void;
}

export const ClockTasksTab: React.FC<ClockTasksTabProps> = ({
  tasks,
  weather,
  clockConfig,
  clockTools,
  onRefreshTasks,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onCompleteTask,
  onPauseTask,
  onResumeTask,
  onSaveWeather,
  onRefreshWeather,
  onAskAether,
}) => {
  const [now, setNow] = useState(() => new Date());
  const alarmPanelRef = useRef<AlarmPanelHandle>(null);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const alarms = useMemo(
    () => tasks.filter((task) => task.kind === 'alarm'),
    [tasks]
  );

  return (
    <div
      className="overflow-y-auto pr-0.5"
      style={{ height: CLOCK_HEIGHT }}
    >
      <div className="flex flex-col gap-3">
        <ClockTopStrip
          now={now}
          weather={weather}
          clockConfig={clockConfig}
          clockTools={clockTools}
          tasks={tasks}
          onSaveWeather={onSaveWeather}
          onRefreshWeather={onRefreshWeather}
          onNewAlarm={() => alarmPanelRef.current?.openCreate()}
        />

        <div className="grid min-h-[320px] grid-cols-[1.55fr_1fr] gap-2.5">
          <TaskPanel
            tasks={tasks}
            onRefresh={onRefreshTasks}
            onCreate={onCreateTask}
            onUpdate={onUpdateTask}
            onDelete={onDeleteTask}
            onComplete={onCompleteTask}
            onPause={onPauseTask}
            onResume={onResumeTask}
          />
          <div className="flex min-h-0 flex-col gap-2.5">
            <AiTaskCard onAskAether={onAskAether} />
            <div className="min-h-0 flex-1">
              <AlarmPanel
                ref={alarmPanelRef}
                alarms={alarms}
                onCreate={onCreateTask}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
                onPause={onPauseTask}
                onResume={onResumeTask}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
