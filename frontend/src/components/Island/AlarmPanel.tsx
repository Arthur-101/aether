import { forwardRef, useImperativeHandle, useState } from 'react';
import { AlarmClock, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import type { ScheduledTask, TaskInput } from '../../types/ipc';
import { alarmTimeLabel } from './alarmFormat';
import { AlarmForm } from './AlarmForm';

export interface AlarmPanelHandle {
  openCreate: () => void;
}

interface AlarmPanelProps {
  alarms: ScheduledTask[];
  onCreate: (task: TaskInput) => void;
  onUpdate: (task: TaskInput & { task_id: string }) => void;
  onDelete: (taskId: string) => void;
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
}

const iconButton =
  'flex h-6 w-6 items-center justify-center rounded-md text-[#7f796e] transition hover:bg-white/10 hover:text-white';

export const AlarmPanel = forwardRef<AlarmPanelHandle, AlarmPanelProps>(
  function AlarmPanel(
    { alarms, onCreate, onUpdate, onDelete, onPause, onResume },
    ref
  ) {
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<ScheduledTask | null>(null);

    const startNew = () => {
      setEditing(null);
      setFormOpen(true);
    };

    useImperativeHandle(ref, () => ({ openCreate: startNew }), []);

    const startEdit = (alarm: ScheduledTask) => {
      setEditing(alarm);
      setFormOpen(true);
    };

    const save = (task: TaskInput) => {
      if (editing) onUpdate({ ...task, task_id: editing.id });
      else onCreate(task);
      setEditing(null);
      setFormOpen(false);
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
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-[#c9c3b7] transition hover:bg-white/10 hover:text-white"
          >
            <Plus size={13} />
          </button>
        </div>

        {formOpen ? (
          <AlarmForm
            key={editing?.id || 'new-alarm'}
            editing={editing}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
            onSave={save}
          />
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
  }
);
