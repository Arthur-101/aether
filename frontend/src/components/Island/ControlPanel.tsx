import React from 'react';
import { Info } from 'lucide-react';

/**
 * Shared chrome for the Controls panels.
 *
 * Each panel is a card with a small-caps label, an accent glyph on the
 * trailing edge, and an optional footer strip. The label and glyph pattern
 * is what makes the panels read as one family rather than three widgets.
 */

interface ControlPanelProps {
  label: string;
  icon?: React.ReactNode;
  iconClassName?: string;
  /** Optional trailing control rendered before the icon. */
  action?: React.ReactNode;
  className?: string;
  /** Lets the body scroll instead of growing the panel. */
  scroll?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  label,
  icon,
  iconClassName = 'text-[var(--aether-accent)]',
  action,
  className = '',
  scroll = false,
  children,
  footer,
}) => (
  <section
    className={`aether-panel flex min-h-0 min-w-0 flex-col rounded-2xl border border-[var(--aether-line-soft)] p-4 ${className}`}
  >
    <header className="flex shrink-0 items-center justify-between gap-2">
      <h2 className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--aether-text-3)]">
        {label}
      </h2>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {icon ? <span className={iconClassName}>{icon}</span> : null}
      </div>
    </header>
    <div
      className={`mt-3 flex min-w-0 flex-1 flex-col ${
        scroll ? 'min-h-0 overflow-y-auto' : ''
      }`}
    >
      {children}
    </div>
    {footer ? (
      <div className="mt-3 shrink-0 border-t border-[var(--aether-line-soft)] pt-2.5">
        {footer}
      </div>
    ) : null}
  </section>
);

interface PanelFooterRowProps {
  left: React.ReactNode;
  right?: React.ReactNode;
  /** Native hover hint for the trailing value, shown with a small info glyph. */
  rightTitle?: string;
  leftClassName?: string;
  rightClassName?: string;
}

export const PanelFooterRow: React.FC<PanelFooterRowProps> = ({
  left,
  right,
  rightTitle,
  leftClassName = 'text-[9px] text-[var(--aether-text-3)]',
  rightClassName = 'text-[9.5px] font-medium text-[var(--aether-text-1)]',
}) => (
  <div className="flex items-center justify-between gap-2">
    <span className={leftClassName}>{left}</span>
    {right ? (
      <span
        className={`${rightClassName} ${
          rightTitle ? 'inline-flex cursor-help items-center gap-1' : ''
        }`}
        title={rightTitle}
      >
        {right}
        {rightTitle ? (
          <Info size={9} className="shrink-0 opacity-55" aria-hidden />
        ) : null}
      </span>
    ) : null}
  </div>
);
