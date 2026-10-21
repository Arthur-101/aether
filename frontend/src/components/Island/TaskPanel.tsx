import React, { useMemo, useState } from 'react';
import { CalendarClock, ListChecks, Plus, RefreshCw } from 'lucide-react';
import type { ScheduledTask, TaskInput } from '../../types/ipc';
import { TaskForm } from './TaskForm';
import { TaskRow } from './TaskRow';

interface TaskPanelProps {
  tasks: ScheduledTask[];
  onRefresh: () => void;
  onCreate: (task: TaskInput) => void;
  onUpdate: (task: TaskInput & { task_id: string }) => void;
  onDelete: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
}

type TaskFilter = 'all' | 'upcoming' | 'recurring';

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'recurring', label: 'Recurring' },
];

export const TaskPanel: React.FC<TaskPanelProps> = ({
  tasks,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
  onComplete,
  onPause,
  onResume,
}) => {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);

  const workTasks = useMemo(
    () => tasks.filter((task) => task.kind !== 'alarm'),
    [tasks]
  );
  const visible = workTasks.filter((task) => {
    if (filter === 'upcoming') return !task.is_recurring;
    if (filter === 'recurring') return task.is_recurring;
    return true;
  });

  const openNew = () => {
    setEditingTask(null);
    setFormOpen(true);
  };

  const openEdit = (task: ScheduledTask) => {
    setEditingTask(task);
    setFormOpen(true);
  };

  const submit = (task: TaskInput) => {
    if (editingTask) {
      onUpdate({ ...task, task_id: editingTask.id });
    } else {
      onCreate(task);
    }
    setFormOpen(false);
    setEditingTask(null);
  };

  return (
    <section className="notch-card flex h-full min-h-0 flex-col rounded-2xl p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] accent-text">
            <ListChecks size={14} />
          </span>
          <div>
            <h3 className="text-[12px] font-semibold text-[#f2efe7]">Tasks</h3>
            <p className="text-[9px] text-[#777168]">
              {workTasks.length} {workTasks.length === 1 ? 'task' : 'tasks'} in your flow
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh tasks"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8f897d] transition hover:bg-white/10 hover:text-white"
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={openNew}
            className="accent-fill flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold"
          >
            <Plus size={12} /> New task
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1 border-b border-white/[0.055] pb-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full px-2.5 py-1 text-[9.5px] transition ${
              filter === item.id
                ? 'bg-white/[0.09] text-white'
                : 'text-[#8f897d] hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-[#6f6a61]">
          One-time tasks use a checkmark · recurring tasks pause/resume
        </span>
      </div>

      {formOpen ? (
        <div className="mt-2 rounded-xl border border-white/[0.075] bg-black/15 p-2">
          <TaskForm
            key={editingTask?.id || 'new-task'}
            initial={editingTask}
            onCancel={() => {
              setFormOpen(false);
              setEditingTask(null);
            }}
            onSubmit={submit}
          />
        </div>
      ) : null}

      <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {visible.length ? (
          visible.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onEdit={openEdit}
              onDelete={onDelete}
              onComplete={onComplete}
              onPause={onPause}
              onResume={onResume}
            />
          ))
        ) : (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-6 text-center">
            <CalendarClock size={22} className="text-[#6f6a61]" />
            <p className="mt-2 text-[11px] font-medium text-[#b8b2a7]">
              {workTasks.length ? 'Nothing in this filter' : 'A clear runway'}
            </p>
            <p className="mt-1 max-w-[260px] text-[9.5px] leading-relaxed text-[#777168]">
              Add a task manually, or ask Aether to schedule one in plain language.
            </p>
            <button
              type="button"
              onClick={openNew}
              className="mt-3 rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[10px] text-white transition hover:bg-white/12"
            >
              Add your first task
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
