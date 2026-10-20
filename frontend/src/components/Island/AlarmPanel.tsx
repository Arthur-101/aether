import React, { useState } from 'react';
import { AlarmClock, Pencil, Trash2, X } from 'lucide-react';
import type { ScheduledTask, TaskInput } from '../../types/ipc';
import { formatSchedule, taskTimeParts } from './taskFormat';

interface AlarmPanelProps {
  alarms: ScheduledTask[];
  onCreate: (task: TaskInput) => void;
  onUpdate: (task: TaskInput & { task_id: string }) => void;
  onDelete: (taskId: string) => void;
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
  'rounded p-1 text-[#8b8b8b] transition hover:bg-white/10 hover:text-white';

export const AlarmPanel: React.FC<AlarmPanelProps> = ({
  alarms,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [time, setTime] = useState(nextAlarmTime);
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
  };

  const startEdit = (alarm: ScheduledTask) => {
    setEditing(alarm);
    setTime(taskTimeParts(alarm).time);
    setLabel(alarm.prompt_to_execute);
    setRepeat(Boolean(alarm.is_recurring));
    setError('');
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
    <div className="flex flex-col gap-1.5">
      <div className="rounded-lg border border-[#0067c0]/35 bg-[#0067c0]/10 p-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9dd5ff]">
            <AlarmClock size={13} />
            {editing ? 'Edit alarm' : 'Alarm clock'}
          </span>
          {editing ? (
            <button type="button" onClick={resetForm} className={iconButton} title="Cancel">
              <X size={12} />
            </button>
          ) : (
            <span className="text-[9px] text-[#8b8b8b]">Plays a Windows chime</span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            type="time"
            value={time}
            onChange={(event) => {
              setTime(event.target.value);
              setError('');
            }}
            className="w-[92px] shrink-0 rounded-md border border-white/10 bg-[#2b2b2b] px-1.5 py-1 font-mono text-[13px] text-white outline-none [color-scheme:dark] focus:border-[#0067c0]"
          />
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Wake up"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#2b2b2b] px-2 py-1.5 text-[10px] text-white placeholder-[#8b8b8b] outline-none focus:border-[#0067c0]"
          />
          <button
            type="button"
            onClick={save}
            className="shrink-0 rounded-md bg-[#0067c0] px-2.5 py-1.5 text-[10px] font-medium text-white transition hover:bg-[#0078d4]"
          >
            {editing ? 'Save' : 'Set'}
          </button>
        </div>
        <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-1.5 text-[9px] text-[#a8a8a8]">
          <input
            type="checkbox"
            checked={repeat}
            onChange={(event) => setRepeat(event.target.checked)}
            className="h-3 w-3 accent-[#0067c0]"
          />
          Repeat every day
        </label>
        {error ? <p className="mt-1 text-[9px] text-[#ff99a4]">{error}</p> : null}
      </div>

      {alarms.length > 0 ? (
        <div className="flex max-h-[116px] flex-col gap-1 overflow-y-auto pr-0.5">
          {alarms.map((alarm) => (
            <div
              key={alarm.id}
              className="group flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
            >
              <AlarmClock size={14} className="shrink-0 text-[#60cdff]" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[14px] font-semibold leading-tight text-white">
                  {alarmTimeLabel(alarm)}
                </p>
                <p className="truncate text-[9px] text-[#8b8b8b]">
                  {alarm.prompt_to_execute} ·{' '}
                  {alarm.is_recurring ? 'Every day' : formatSchedule(alarm)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => startEdit(alarm)}
                  className={iconButton}
                  title="Edit alarm"
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(alarm.id)}
                  className="rounded p-1 text-[#8b8b8b] transition hover:bg-[#ff99a4]/10 hover:text-[#ff99a4]"
                  title="Delete alarm"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
