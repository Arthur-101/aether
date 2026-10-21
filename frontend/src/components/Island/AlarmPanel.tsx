import React, { useState } from 'react';
import {
  AlarmClock,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { ScheduledTask, TaskInput } from '../../types/ipc';
import { taskTimeParts } from './taskFormat';

interface AlarmPanelProps {
  alarms: ScheduledTask[];
  onCreate: (task: TaskInput) => void;
  onUpdate: (task: TaskInput & { task_id: string }) => void;
  onDelete: (taskId: string) => void;
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function nextAlarmTime(): string {
  const next = new Date(Date.now() + 5 * 60 * 1000);
  return `${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

function localIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function alarmTimeLabel(alarm: ScheduledTask): string {
  const { time } = taskTimeParts(alarm);
  const [hour, minute] = time.split(':').map(Number);
  const display = new Date();
  display.setHours(hour, minute, 0, 0);
  return display.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const iconButton =
  'flex h-6 w-6 items-center justify-center rounded-md text-[#7f796e] transition hover:bg-white/10 hover:text-white';

export const AlarmPanel: React.FC<AlarmPanelProps> = ({
  alarms,
  onCreate,
  onUpdate,
  onDelete,
  onPause,
  onResume,
}) => {
  const [formOpen, setFormOpen] = useState(false);
  const [time, setTime] = useState('07:00');
  const [label, setLabel] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [error, setError] = useState('');

  const resetForm = () => {
    setEditing(null);
    setLabel('');
    setRepeat(false);
    setError('');
    setTime(nextAlarmTime());
    setFormOpen(false);
  };

  const startNew = () => {
    resetForm();
    setTime(nextAlarmTime());
    setFormOpen(true);
  };

  const startEdit = (alarm: ScheduledTask) => {
    setEditing(alarm);
    setTime(taskTimeParts(alarm).time);
    setLabel(alarm.prompt_to_execute);
    setRepeat(Boolean(alarm.is_recurring));
    setError('');
    setFormOpen(true);
  };

  const save = () => {
    const [hour, minute] = time.split(':').map(Number);
    if (
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      setError('Choose a valid time.');
      return;
    }

    const prompt = label.trim() || 'Alarm';
    const base = {
      prompt,
      schedule_type: repeat ? ('daily' as const) : ('once' as const),
      is_recurring: repeat,
      kind: 'alarm' as const,
    };

    if (repeat) {
      const payload: TaskInput = { ...base, hour, minute };
      if (editing) onUpdate({ ...payload, task_id: editing.id });
      else onCreate(payload);
      resetForm();
      return;
    }

    const runAt = new Date();
    runAt.setHours(hour, minute, 0, 0);
    if (runAt.getTime() <= Date.now()) {
      runAt.setDate(runAt.getDate() + 1);
    }
    const payload: TaskInput = { ...base, run_at_iso: localIso(runAt) };
    if (editing) onUpdate({ ...payload, task_id: editing.id });
    else onCreate(payload);
    resetForm();
  };

  return (
    <section className="notch-card flex min-h-0 flex-col rounded-2xl p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] accent-text">
            <AlarmClock size={14} />
          </span>
          <div>
            <h3 className="text-[12px] font-semibold text-[#f2efe7]">Alarms</h3>
            <p className="text-[9px] text-[#777168]">
              {alarms.length ? `${alarms.length} scheduled` : 'Chime + snooze 5m'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={startNew}
          aria-label="New alarm"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-[#c9c3b7] transition hover:bg-white/12 hover:text-white"
        >
          <Plus size={13} />
        </button>
      </div>

      {formOpen ? (
        <div className="mt-2 rounded-xl border border-white/[0.075] bg-black/15 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8f897d]">
              {editing ? 'Edit alarm' : 'New alarm'}
            </span>
            <button
              type="button"
              onClick={resetForm}
              className={iconButton}
              aria-label="Cancel alarm"
            >
              <X size={11} />
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="time"
              value={time}
              onChange={(event) => {
                setTime(event.target.value);
                setError('');
              }}
              className="w-[92px] shrink-0 rounded-md border border-white/10 bg-[#2b2b2b] px-1.5 py-1 font-mono text-[13px] text-white outline-none [color-scheme:dark] focus:border-[var(--aether-accent)]"
            />
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Wake up"
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#2b2b2b] px-2 py-1.5 text-[10px] text-white outline-none placeholder:text-[#777168] focus:border-[var(--aether-accent)]"
            />
            <button
              type="button"
              onClick={save}
              className="accent-fill shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-semibold"
            >
              {editing ? 'Save' : 'Set'}
            </button>
          </div>
          <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-1.5 text-[9px] text-[#a8a196]">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(event) => setRepeat(event.target.checked)}
              className="h-3 w-3 accent-[var(--aether-accent)]"
            />
            Repeat every day
          </label>
          {error ? <p className="mt-1 text-[9px] text-red-300">{error}</p> : null}
        </div>
      ) : null}

      {alarms.length ? (
        <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
          {alarms.map((alarm) => {
            const paused = alarm.status === 'paused';
            return (
              <div
                key={alarm.id}
                className={`group flex items-center gap-2 rounded-xl border border-white/[0.055] bg-white/[0.025] px-2.5 py-2 ${
                  paused ? 'opacity-60' : ''
                }`}
              >
                <AlarmClock size={14} className="shrink-0 accent-text" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[14px] font-semibold leading-tight text-white">
                    {alarmTimeLabel(alarm)}
                  </p>
                  <p className="truncate text-[9px] text-[#837d72]">
                    {alarm.prompt_to_execute} ·{' '}
                    {alarm.is_recurring ? 'Every day' : 'One time'}
                    {paused ? ' · Paused' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                  {alarm.is_recurring ? (
                    <button
                      type="button"
                      onClick={() =>
                        paused ? onResume(alarm.id) : onPause(alarm.id)
                      }
                      className={iconButton}
                      aria-label={paused ? 'Resume alarm' : 'Pause alarm'}
                    >
                      {paused ? <Play size={11} /> : <Pause size={11} />}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => startEdit(alarm)}
                    className={iconButton}
                    aria-label="Edit alarm"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(alarm.id)}
                    className={`${iconButton} hover:text-red-300`}
                    aria-label="Delete alarm"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : !formOpen ? (
        <div className="mt-2 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-4 text-center">
          <AlarmClock size={20} className="text-[#6f6a61]" />
          <p className="mt-1.5 text-[10px] font-medium text-[#b8b2a7]">
            No alarms yet
          </p>
          <p className="mt-1 text-[9px] leading-relaxed text-[#777168]">
            Aether chimes and offers Snooze 5m.
          </p>
        </div>
      ) : null}
    </section>
  );
};
