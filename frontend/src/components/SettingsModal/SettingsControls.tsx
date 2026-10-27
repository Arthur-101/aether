import React from 'react';
import { RotateCcw } from 'lucide-react';

/**
 * Shared Settings building blocks.
 *
 * Class tokens live in settingsStyles.ts so this file exports components only
 * and keeps Fast Refresh happy. The Appearance tab is the visual reference for
 * the group header, toggle row, and reset action below.
 */

export const SettingsGroup: React.FC<{
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}> = ({ icon, title, action, hint, children }) => (
  <section className="flex flex-col gap-2">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--aether-text-3)]">{icon}</span>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--aether-text-2)]">
          {title}
        </h4>
      </div>
      {action}
    </div>
    {hint ? <p className="-mt-1 text-[9px] leading-snug text-[var(--aether-text-3)]">{hint}</p> : null}
    {children}
  </section>
);

export const SettingsToggleRow: React.FC<{
  label: React.ReactNode;
  hint?: string;
  badge?: React.ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}> = ({ label, hint, badge, checked, onChange, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-disabled={disabled}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`flex w-full items-center justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)] ${
      disabled ? 'cursor-not-allowed opacity-45' : ''
    }`}
  >
    <span className="min-w-0">
      <span className="flex items-center gap-1.5">
        <span className="block text-[11px] text-[var(--aether-text-2)]">{label}</span>
        {badge}
      </span>
      {hint ? (
        <span className="mt-0.5 block text-[9px] leading-snug text-[var(--aether-text-3)]">
          {hint}
        </span>
      ) : null}
    </span>
    <span
      aria-hidden
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${
        checked ? 'bg-[var(--aether-accent)]' : 'bg-[var(--aether-fill-3)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </span>
  </button>
);

export const SettingsResetButton: React.FC<{
  onClick: () => void;
  label?: string;
  title?: string;
  ariaLabel?: string;
}> = ({ onClick, label = 'Reset', title, ariaLabel }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={ariaLabel ?? title ?? label}
    className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)]"
  >
    <RotateCcw size={10} />
    {label}
  </button>
);
