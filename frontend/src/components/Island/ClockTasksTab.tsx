import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';
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
    <div className="flex min-h-[458px] flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#857f73]">
            <CalendarClock size={11} /> Clock &amp; Tasks
          </p>
          <h3 className="text-lg font-semibold text-[#f2efe7]">
            Your day, in one place
          </h3>
        </div>
        <p className="max-w-[300px] text-right text-[9px] leading-relaxed text-[#777168]">
          Timers keep running while you switch tabs. Aether can schedule tasks
          through chat, and they finish quietly in the background.
        </p>
      </div>

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

      <div className="grid min-h-[300px] flex-1 grid-cols-[1.55fr_1fr] gap-2.5">
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
  );
};
