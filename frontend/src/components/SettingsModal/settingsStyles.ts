/**
 * Shared visual tokens for every Settings tab.
 *
 * The Appearance tab is the reference: quiet uppercase group headers, one
 * compact control height, subtle accent tints for selected states, and 9px
 * hints. Keeping the classes here stops each tab drifting back to its own
 * scale, while SettingsControls owns the reusable component wrappers.
 */

export const settingsInputClass =
  'h-8 rounded-md border border-[var(--aether-line)] bg-black/15 px-2.5 text-[11px] text-[var(--aether-text-1)] outline-none transition placeholder:text-[var(--aether-text-3)] focus:border-[var(--aether-accent)]';

export const settingsMonoInputClass = `${settingsInputClass} font-mono`;

export const settingsLabelClass =
  'text-[10px] font-medium text-[var(--aether-text-2)]';

export const settingsHintClass =
  'text-[9px] leading-snug text-[var(--aether-text-3)]';

export const settingsSecondaryButtonClass =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2.5 text-[10px] font-medium text-[var(--aether-text-1)] transition hover:border-[var(--aether-line-strong)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)] disabled:opacity-40';

export const settingsCardClass =
  'overflow-hidden rounded-lg border border-[var(--aether-line)] bg-black/10';

export const settingsRowClass =
  'flex items-center justify-between gap-3 border-b border-[var(--aether-line-soft)] px-2.5 py-2 last:border-b-0';

export const settingsSegmentClass = (active: boolean) =>
  `flex h-8 items-center justify-center gap-1.5 rounded-md border text-[10px] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)] ${
    active
      ? 'border-[var(--aether-accent)] bg-[var(--aether-accent)]/12 text-[var(--aether-text-1)]'
      : 'border-[var(--aether-line)] bg-black/15 text-[var(--aether-text-2)] hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]'
  }`;

export const settingsChipClass = (active: boolean) =>
  `flex h-7 items-center gap-1.5 rounded-md border px-2 text-[10px] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)] ${
    active
      ? 'border-[var(--aether-line-strong)] bg-[var(--aether-fill-2)] text-[var(--aether-text-1)]'
      : 'border-[var(--aether-line)] text-[var(--aether-text-2)] hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]'
  }`;
