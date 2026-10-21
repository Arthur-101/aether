import React, { useState } from 'react';
import { CalendarDays, Clock, X } from 'lucide-react';
import type { ScheduledTask, TaskInput, TaskScheduleType } from '../../types/ipc';
import {
  defaultDate,
  defaultEndDate,
  defaultStart,
  parseIsoParts,
  taskTimeParts,
} from './taskFormat';

interface TaskFormProps {
  initial: ScheduledTask | null;
  onCancel: () => void;
  onSubmit: (task: TaskInput) => void;
}

const dateFieldClass =
  'flex flex-1 items-center gap-1.5 rounded-md border border-white/10 bg-[#2b2b2b] px-2 py-1.5';
const timeFieldClass =
  'flex flex-1 items-center gap-1.5 rounded-md border border-white/10 bg-[#2b2b2b] px-2 py-1.5';
const inputClass =
  'w-full bg-transparent text-[10px] text-white outline-none [color-scheme:dark]';

export const TaskForm: React.FC<TaskFormProps> = ({
  initial,
  onCancel,
  onSubmit,
}) => {
  const initialType: TaskScheduleType =
    initial?.schedule_type || (initial?.is_recurring ? 'daily' : 'once');
  const startParts = initial ? taskTimeParts(initial) : null;
  const endParts = initial?.end_at_iso ? parseIsoParts(initial.end_at_iso) : null;
  const defaults = defaultStart();
  const [prompt, setPrompt] = useState(initial?.prompt_to_execute || '');
  const [scheduleType, setScheduleType] = useState<TaskScheduleType>(initialType);
  const [startDate, setStartDate] = useState(startParts?.date || defaults.date);
  const [startTime, setStartTime] = useState(startParts?.time || defaults.time);
  const [endDate, setEndDate] = useState(endParts?.date || defaultEndDate());
  const [endTime, setEndTime] = useState(endParts?.time || startParts?.time || defaults.time);
  const [error, setError] = useState('');

  const isEditingCustom = Boolean(initial && initial.schedule_type === 'custom');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setError('Enter what Aether should do.');
      return;
    }

    if (scheduleType === 'once') {
      const runAt = new Date(`${startDate}T${startTime}:00`);
      if (Number.isNaN(runAt.getTime())) {
        setError('Choose a valid date and time.');
        return;
      }
      if (runAt.getTime() <= Date.now()) {
        setError('Choose a future date and time.');
        return;
      }
      onSubmit({
        prompt: cleanPrompt,
        schedule_type: 'once',
        is_recurring: false,
        run_at_iso: `${startDate}T${startTime}:00`,
      });
      return;
    }

    if (scheduleType === 'daily') {
      const [hour, minute] = startTime.split(':').map(Number);
      onSubmit({
        prompt: cleanPrompt,
        schedule_type: 'daily',
        is_recurring: true,
        hour,
        minute,
      });
      return;
    }

    const start = new Date(`${startDate}T${startTime}:00`);
    const end = new Date(`${endDate}T${endTime}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError('Choose a valid start and end date/time.');
      return;
    }
    if (!isEditingCustom && start.getTime() <= Date.now()) {
      setError('Choose a future start date and time.');
      return;
    }
    if (end.getTime() <= start.getTime()) {
      setError('The end must be after the start.');
      return;
    }
    if (end.getTime() <= Date.now()) {
      setError('Choose a future end date and time.');
      return;
    }
    onSubmit({
      prompt: cleanPrompt,
      schedule_type: 'custom',
      is_recurring: true,
      start_at_iso: `${startDate}T${startTime}:00`,
      end_at_iso: `${endDate}T${endTime}:00`,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.025] p-2.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--aether-accent)]">
          {initial ? 'Edit task' : 'New task'}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-0.5 text-[#8b8b8b] transition hover:bg-white/10 hover:text-white"
          title="Cancel"
        >
          <X size={12} />
        </button>
      </div>
      <input
        autoFocus
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="What should Aether do?"
        className="rounded-md border border-white/10 bg-[#2b2b2b] px-2.5 py-1.5 text-[11px] text-white outline-none placeholder:text-[#777168] focus:border-[var(--aether-accent)]"
      />
      <div className="flex gap-1 rounded-md bg-black/25 p-0.5">
        {(['once', 'custom', 'daily'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setScheduleType(type)}
            className={`flex-1 rounded px-2 py-1 text-[10px] transition ${
              scheduleType === type
                ? 'bg-[#383838] text-white'
                : 'text-[#8b8b8b] hover:text-white'
            }`}
          >
            {type === 'once' ? 'One-time' : type === 'custom' ? 'Custom' : 'Daily'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {scheduleType === 'custom' && (
          <span className="w-6 shrink-0 text-[9px] uppercase tracking-wide text-[#8b8b8b]">
            From
          </span>
        )}
        {scheduleType !== 'daily' && (
          <label className={dateFieldClass}>
            <CalendarDays size={12} className="shrink-0 text-[var(--aether-accent)]" />
            <input
              type="date"
              value={startDate}
              min={isEditingCustom ? undefined : defaultDate()}
              onChange={(event) => setStartDate(event.target.value)}
              className={inputClass}
            />
          </label>
        )}
        <label className={timeFieldClass}>
          <Clock size={12} className="shrink-0 text-[var(--aether-accent)]" />
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {scheduleType === 'custom' && (
        <div className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-[9px] uppercase tracking-wide text-[#8b8b8b]">
            To
          </span>
          <label className={dateFieldClass}>
            <CalendarDays size={12} className="shrink-0 text-[var(--aether-accent)]" />
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className={timeFieldClass}>
            <Clock size={12} className="shrink-0 text-[var(--aether-accent)]" />
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      )}
      {scheduleType === 'custom' && (
        <p className="text-[9px] text-[#8b8b8b]">
          Repeats daily at the start time until the end date/time.
        </p>
      )}
      {error && <p className="text-[10px] text-[#fca5a5]">{error}</p>}
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 text-[10px] text-[#c7c7c7] transition hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="accent-fill rounded-md px-3 py-1 text-[10px] font-semibold"
        >
          {initial ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
};
