import React, { useMemo, useState } from 'react';
import { CalendarClock, ListChecks, Plus, RefreshCw } from 'lucide-react';
import type { ScheduledTask, TaskInput } from '../../types/ipc';
import { CardArt } from './CardArt';
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
    <section className="notch-card motif-card relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl p-3">
      <CardArt
        variant="flow"
        className="pointer-events-none absolute bottom-2 right-2 h-[150px] w-[150px]"
      />

      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--aether-fill)] accent-text">
            <ListChecks size={14} />
          </span>
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--aether-text-1)]">Tasks</h3>
            <p className="text-[10px] text-[var(--aether-text-3)]">
              {workTasks.length} {workTasks.length === 1 ? 'task' : 'tasks'} in your flow
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh tasks"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={openNew}
            className="accent-fill flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
          >
            <Plus size={12} /> New task
          </button>
        </div>
      </div>

      <div className="relative mt-2 flex items-center gap-1 border-b border-[var(--aether-line-soft)] pb-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] transition ${
              filter === item.id
                ? 'bg-[var(--aether-fill-2)] text-[var(--aether-text-1)]'
                : 'text-[var(--aether-text-3)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]'
            }`}
          >
            {item.label}
          </button>
        ))}
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

      <div className="no-scrollbar mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
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
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--aether-line)] p-6 text-center">
            <CalendarClock size={22} className="text-[var(--aether-text-3)]" />
            <p className="mt-2 text-[11px] font-medium text-[var(--aether-text-1)]">
              {workTasks.length ? 'Nothing in this filter' : 'A clear runway'}
            </p>
            <p className="mt-1 max-w-[260px] text-[9.5px] leading-relaxed text-[var(--aether-text-3)]">
              Add a task manually, or ask Aether to schedule one in plain language.
            </p>
            <button
              type="button"
              onClick={openNew}
              className="mt-3 rounded-lg bg-[var(--aether-fill-2)] px-2.5 py-1.5 text-[10px] text-[var(--aether-text-1)] transition hover:bg-white/12"
            >
              Add your first task
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
