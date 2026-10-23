import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Loader2,
  LockKeyhole,
  Moon,
  Power,
  RotateCcw,
  ShieldAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { PowerAction, PowerActionResult } from '../../types/ipc';

interface PowerTabProps {
  result: PowerActionResult | null;
  onAction: (action: PowerAction, confirm?: boolean) => void;
}

interface PowerActionDefinition {
  id: PowerAction;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  danger?: boolean;
  confirmTitle?: string;
  confirmBody?: string;
  confirmLabel?: string;
}

const ACTIONS: PowerActionDefinition[] = [
  {
    id: 'lock',
    title: 'Lock',
    subtitle: 'Secure this session',
    icon: LockKeyhole,
  },
  {
    id: 'sleep',
    title: 'Sleep',
    subtitle: 'Low-power standby',
    icon: Moon,
  },
  {
    id: 'restart',
    title: 'Restart',
    subtitle: 'Reboot Windows',
    icon: RotateCcw,
    danger: true,
    confirmTitle: 'Restart this PC?',
    confirmBody: 'Save your work first. Aether will send the Windows restart command immediately.',
    confirmLabel: 'Restart now',
  },
  {
    id: 'shutdown',
    title: 'Shut down',
    subtitle: 'Power off this PC',
    icon: Power,
    danger: true,
    confirmTitle: 'Shut down this PC?',
    confirmBody: 'Save your work first. Aether will send the Windows shutdown command immediately.',
    confirmLabel: 'Shut down',
  },
];

export const PowerTab: React.FC<PowerTabProps> = ({ result, onAction }) => {
  const [pending, setPending] = useState<PowerAction | null>(null);
  const [running, setRunning] = useState<PowerAction | null>(null);
  const [lastAction, setLastAction] = useState<PowerAction | null>(null);

  const pendingDefinition = useMemo(
    () => ACTIONS.find((action) => action.id === pending) ?? null,
    [pending]
  );

  useEffect(() => {
    if (result && lastAction && result.action === lastAction) {
      setRunning(null);
    }
  }, [result, lastAction]);

  const execute = (action: PowerAction, confirm = false) => {
    setPending(null);
    setRunning(action);
    setLastAction(action);
    onAction(action, confirm);
  };

  const choose = (definition: PowerActionDefinition) => {
    if (running) return;
    if (definition.danger) {
      setPending(definition.id);
      return;
    }
    execute(definition.id);
  };

  return (
    <div className="relative flex min-h-[354px] flex-col gap-3">
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--aether-text-3)]">
          Session
        </p>
        <h3 className="mt-0.5 text-[17px] font-semibold text-[var(--aether-text-1)]">
          Power
        </h3>
        <p className="mt-1 text-[10px] text-[var(--aether-text-3)]">
          Lock, sleep, or end this Windows session.
        </p>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-3">
        {ACTIONS.map((definition) => {
          const Icon = definition.icon;
          const isRunning = running === definition.id;
          return (
            <button
              key={definition.id}
              type="button"
              onClick={() => choose(definition)}
              disabled={Boolean(running)}
              className={`notch-card group relative flex min-h-[126px] flex-col justify-between rounded-2xl p-4 text-left transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aether-accent)] disabled:cursor-default disabled:opacity-60 ${
                definition.danger
                  ? 'hover:border-[var(--aether-danger-line)]'
                  : 'hover:border-[var(--aether-line-strong)]'
              }`}
              aria-label={`${definition.title}: ${definition.subtitle}`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    definition.danger
                      ? 'bg-[var(--aether-danger-soft)] text-[var(--aether-danger)]'
                      : 'bg-[var(--aether-fill)] text-[var(--aether-accent)]'
                  }`}
                >
                  <Icon size={18} />
                </span>
                {isRunning ? (
                  <Loader2
                    size={15}
                    className="animate-spin text-[var(--aether-text-3)]"
                  />
                ) : (
                  <ChevronRight
                    size={15}
                    className={`transition-transform group-hover:translate-x-0.5 ${
                      definition.danger
                        ? 'text-[var(--aether-danger)]'
                        : 'text-[var(--aether-text-3)]'
                    }`}
                  />
                )}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[var(--aether-text-1)]">
                  {definition.title}
                </p>
                <p
                  className={`mt-0.5 text-[9.5px] ${
                    definition.danger
                      ? 'text-[var(--aether-danger)]'
                      : 'text-[var(--aether-text-3)]'
                  }`}
                >
                  {isRunning ? 'Sending command…' : definition.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {result && lastAction && result.action === lastAction ? (
        <p
          className={`text-[9.5px] ${
            result.ok
              ? 'text-[var(--aether-text-3)]'
              : 'text-[var(--aether-danger)]'
          }`}
        >
          {result.message}
        </p>
      ) : null}

      {pendingDefinition ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-black/35 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[380px] rounded-2xl border border-[var(--aether-danger-line)] bg-[var(--aether-surface-1)] p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--aether-danger-soft)] text-[var(--aether-danger)]">
                <ShieldAlert size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[var(--aether-text-1)]">
                  {pendingDefinition.confirmTitle}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--aether-text-3)]">
                  {pendingDefinition.confirmBody}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-3 text-[10px] font-medium text-[var(--aether-text-1)] transition hover:bg-[var(--aether-fill-2)]"
              >
                <X size={11} />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => execute(pendingDefinition.id, true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--aether-danger)] px-3 text-[10px] font-semibold text-[var(--aether-danger-contrast)] transition hover:brightness-105"
              >
                <ShieldAlert size={11} />
                {pendingDefinition.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
