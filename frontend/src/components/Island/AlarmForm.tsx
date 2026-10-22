import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { ScheduledTask, TaskInput } from '../../types/ipc';
import { localIso, nextAlarmTime } from './alarmFormat';
import { taskTimeParts } from './taskFormat';

interface AlarmFormProps {
  editing: ScheduledTask | null;
  onCancel: () => void;
  onSave: (task: TaskInput) => void;
}

export const AlarmForm: React.FC<AlarmFormProps> = ({
  editing,
  onCancel,
  onSave,
}) => {
  const [time, setTime] = useState(
    editing ? taskTimeParts(editing).time : nextAlarmTime()
  );
  const [label, setLabel] = useState(editing?.prompt_to_execute || '');
  const [repeat, setRepeat] = useState(Boolean(editing?.is_recurring));
  const [error, setError] = useState('');

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

    const base = {
      prompt: label.trim() || 'Alarm',
      schedule_type: repeat ? ('daily' as const) : ('once' as const),
      is_recurring: repeat,
      kind: 'alarm' as const,
    };

    if (repeat) {
      onSave({ ...base, hour, minute });
      return;
    }

    const runAt = new Date();
    runAt.setHours(hour, minute, 0, 0);
    if (runAt.getTime() <= Date.now()) {
      runAt.setDate(runAt.getDate() + 1);
    }
    onSave({ ...base, run_at_iso: localIso(runAt) });
  };

  return (
    <div className="mt-2 rounded-xl border border-white/[0.075] bg-black/15 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--aether-text-3)]">
          {editing ? 'Edit alarm' : 'New alarm'}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
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
          className="w-[92px] shrink-0 rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-1.5 py-1 font-mono text-[13px] text-[var(--aether-text-1)] outline-none [color-scheme:dark] focus:border-[var(--aether-accent)]"
        />
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Wake up"
          className="min-w-0 flex-1 rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-2 py-1.5 text-[10px] text-[var(--aether-text-1)] outline-none placeholder:text-[var(--aether-text-3)] focus:border-[var(--aether-accent)]"
        />
        <button
          type="button"
          onClick={save}
          className="accent-fill shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-semibold"
        >
          {editing ? 'Save' : 'Set'}
        </button>
      </div>
      <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-1.5 text-[9px] text-[var(--aether-text-1)]">
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
  );
};
