import React from 'react';

/**
 * A wide switch card: glyph on the leading edge, switch on the trailing
 * edge, and the label block underneath.
 *
 * The whole card is the button, not just the switch, so the target is
 * comfortable to hit.
 */

interface ToggleCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  tone?: 'accent' | 'neutral';
  /** A tighter card, for panels that share a column with something else. */
  compact?: boolean;
}

export const ToggleCard: React.FC<ToggleCardProps> = ({
  icon,
  title,
  subtitle,
  checked,
  onToggle,
  tone = 'accent',
  compact = false,
}) => {
  const on = checked && tone === 'accent';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      title={title}
      onClick={() => onToggle(!checked)}
      className={`flex w-full flex-col rounded-xl border text-left transition ${
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'
      } ${
        on
          ? 'accent-fill border-transparent'
          : 'border-[var(--aether-line-soft)] bg-[var(--aether-fill)] text-[var(--aether-text-1)] hover:bg-[var(--aether-fill-2)]'
      }`}
    >
      {compact ? (
        <div className="flex items-center gap-2">
          <span className={on ? 'opacity-90' : 'text-[var(--aether-text-2)]'}>
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-semibold">{title}</span>
            <span
              className={`block truncate text-[8.5px] ${
                on ? 'opacity-70' : 'text-[var(--aether-text-3)]'
              }`}
            >
              {subtitle}
            </span>
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className={on ? 'opacity-90' : 'text-[var(--aether-text-2)]'}>
              {icon}
            </span>
            <span
              aria-hidden
              className={`relative h-[16px] w-[28px] shrink-0 rounded-full border transition ${
                checked ? 'border-black/25 bg-black/40' : 'border-white/10 bg-white/10'
              }`}
            >
              <span
                className={`absolute top-[2px] h-[10px] w-[10px] rounded-full transition-all ${
                  checked ? 'left-[14px] bg-white' : 'left-[2px] bg-[#c9c5bb]'
                }`}
              />
            </span>
          </div>
          <div className="mt-2 min-w-0">
            <div className="truncate text-[11px] font-semibold">{title}</div>
            <div
              className={`truncate text-[9px] ${
                on ? 'opacity-70' : 'text-[var(--aether-text-3)]'
              }`}
            >
              {subtitle}
            </div>
          </div>
        </>
      )}
    </button>
  );
};
