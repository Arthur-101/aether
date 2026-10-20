import React, { useState } from 'react';
import { Clock, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { ScheduledTask, TaskInput } from '../../types/ipc';
import { AlarmPanel } from './AlarmPanel';
import { TaskForm } from './TaskForm';
import { formatSchedule } from './taskFormat';

interface TaskPanelProps {
  tasks: ScheduledTask[];
  onRefresh: () => void;
  onCreate: (task: TaskInput) => void;
  onUpdate: (task: TaskInput & { task_id: string }) => void;
  onDelete: (taskId: string) => void;
}

export const TaskPanel: React.FC<TaskPanelProps> = ({
  tasks,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const alarms = tasks.filter((task) => task.kind === 'alarm');
  const routines = tasks.filter((task) => task.kind !== 'alarm');

  const openNew = () => {
    setEditingTask(null);
    setFormOpen(true);
  };

  const openEdit = (task: ScheduledTask) => {
    setEditingTask(task);
    setFormOpen(true);
  };

  const submit = (task: TaskInput) => {
    if (editingTask) onUpdate({ ...task, task_id: editingTask.id });
    else onCreate(task);
    setFormOpen(false);
    setEditingTask(null);
  };

  return (
    <div className="flex min-h-[180px] flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-[#f3f3f3]">
            {tasks.length === 0
              ? 'No active tasks'
              : `${tasks.length} active task${tasks.length === 1 ? '' : 's'}`}
          </p>
          <p className="text-[10px] text-[#8b8b8b]">
            Alarms, one-time reminders, and daily routines
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onRefresh}
            className="rounded-md bg-white/5 p-1.5 text-[#c7c7c7] transition hover:bg-white/10 hover:text-white"
            title="Refresh tasks"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-1 rounded-md bg-[#0067c0] px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#0078d4]"
          >
            <Plus size={12} />
            Add task
          </button>
        </div>
      </div>

      <AlarmPanel
        alarms={alarms}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />

      {formOpen && (
        <TaskForm
          key={editingTask?.id || 'new'}
          initial={editingTask}
          onCancel={() => {
            setFormOpen(false);
            setEditingTask(null);
          }}
          onSubmit={submit}
        />
      )}

      <div className="flex max-h-[230px] flex-col gap-1.5 overflow-y-auto pr-0.5">
        {tasks.length === 0 && !formOpen && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
            <Clock size={20} className="text-[#6f6f6f]" />
            <p className="text-xs text-[#c7c7c7]">No pending alarms or routines.</p>
            <p className="text-[10px] text-[#8b8b8b]">
              Set an alarm above, add a task, or ask Aether in Quick Chat.
            </p>
          </div>
        )}

        {tasks.length > 0 && routines.length === 0 && !formOpen ? (
          <p className="px-1 py-1 text-[9px] text-[#6f6f6f]">
            No scheduled tasks or routines.
          </p>
        ) : null}

        {routines.map((task) => (
          <div
            key={task.id}
            className="group flex items-start gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2"
          >
            <div className="mt-0.5 rounded-md bg-[#0067c0]/15 p-1.5 text-[#60cdff]">
              <Clock size={12} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-[#f3f3f3]">
                {task.prompt_to_execute}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-[#8b8b8b]">
                <span>{formatSchedule(task)}</span>
                <span className="truncate text-[#6f6f6f]">
                  {task.session_title || 'Unknown session'}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition group-hover:opacity-100">
              <button
                onClick={() => openEdit(task)}
                className="rounded p-1 text-[#c7c7c7] transition hover:bg-white/10 hover:text-white"
                title="Edit task"
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={() => onDelete(task.id)}
                className="rounded p-1 text-[#8b8b8b] transition hover:bg-[#ff99a4]/10 hover:text-[#ff99a4]"
                title="Delete task"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
