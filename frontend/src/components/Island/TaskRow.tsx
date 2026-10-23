import React from 'react';
import {
  CalendarClock,
  Check,
  Pause,
  Pencil,
  Play,
  Repeat2,
  Trash2,
} from 'lucide-react';
import type { ScheduledTask } from '../../types/ipc';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { formatSchedule } from './taskFormat';

interface TaskRowProps {
  task: ScheduledTask;
  onEdit: (task: ScheduledTask) => void;
  onDelete: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
}

const iconButton =
  'flex h-6 w-6 items-center justify-center rounded-md text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';

export const TaskRow: React.FC<TaskRowProps> = ({
  task,
  onEdit,
  onDelete,
  onComplete,
  onPause,
  onResume,
}) => {
  const timeFormat = useTimeFormat();
  const paused = task.status === 'paused';
  const recurring = task.is_recurring;

  return (
    <div
      className={`group flex items-center gap-2.5 rounded-xl border border-white/[0.055] bg-white/[0.025] px-2.5 py-2 transition hover:bg-[var(--aether-fill)] ${
        paused ? 'opacity-60' : ''
      }`}
    >
      {recurring ? (
        <button
          type="button"
          onClick={() => (paused ? onResume(task.id) : onPause(task.id))}
          aria-label={paused ? 'Resume recurring task' : 'Pause recurring task'}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
            paused
              ? 'border-[var(--aether-line-strong)] text-[var(--aether-text-1)] hover:border-[var(--aether-accent)]'
              : 'border-[var(--aether-accent)] text-[var(--aether-accent)]'
          }`}
        >
          {paused ? <Play size={9} /> : <Pause size={9} />}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onComplete(task.id)}
          aria-label="Complete task"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--aether-line-strong)] text-transparent transition hover:border-[var(--aether-accent)] hover:text-[var(--aether-accent)]"
        >
          <Check size={10} />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-[var(--aether-text-1)]">
          {task.prompt_to_execute}
        </p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[9px] text-[var(--aether-text-3)]">
          {recurring ? <Repeat2 size={9} /> : <CalendarClock size={9} />}
          {formatSchedule(task, timeFormat)}
          {paused ? <span className="text-[var(--aether-text-1)]">· Paused</span> : null}
        </p>
      </div>

      {task.session_title ? (
        <span className="hidden max-w-[92px] truncate rounded bg-white/[0.045] px-1.5 py-0.5 text-[8px] text-[var(--aether-text-3)] sm:block">
          {task.session_title}
        </span>
      ) : null}

      <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(task)}
          aria-label="Edit task"
          className={iconButton}
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          aria-label="Delete task"
          className={`${iconButton} hover:text-red-300`}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
};
