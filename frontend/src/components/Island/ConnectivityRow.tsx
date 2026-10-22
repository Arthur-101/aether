import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * A connectivity row: circular badge, title, subtitle, and a chevron.
 * Active rows are filled with the accent, inactive ones stay flat.
 *
 * When the row has a menu, the trailing 40% of it is the menu button. A
 * 13px chevron on its own is far too small a target to hit reliably.
 */

interface ConnectivityRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active: boolean | null;
  onClick: () => void;
  onMenu?: () => void;
  menuOpen?: boolean;
}

export const ConnectivityRow: React.FC<ConnectivityRowProps> = ({
  icon,
  title,
  subtitle,
  active,
  onClick,
  onMenu,
  menuOpen = false,
}) => {
  const on = active === true;

  const shell = `flex w-full items-stretch overflow-hidden rounded-full border transition ${
    on
      ? 'accent-fill border-transparent'
      : 'border-[var(--aether-line-soft)] bg-[var(--aether-fill)] text-[var(--aether-text-1)] hover:border-[var(--aether-line-strong)] hover:bg-[var(--aether-fill-2)]'
  }`;

  const body = (
    <>
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          on ? 'bg-black/15' : 'bg-[var(--aether-fill-2)]'
        }`}
      >
        <span className={on ? 'text-[#18140c]' : 'text-[var(--aether-text-2)]'}>
          {icon}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold">{title}</span>
        <span
          className={`block truncate text-[9px] ${on ? 'opacity-70' : 'text-[var(--aether-text-3)]'}`}
        >
          {subtitle}
        </span>
      </span>
    </>
  );

  if (!onMenu) {
    return (
      <button type="button" onClick={onClick} className={`${shell} items-center gap-2.5 px-2.5 py-2 text-left`}>
        {body}
        <ChevronRight
          size={18}
          strokeWidth={2}
          className={`shrink-0 ${on ? 'opacity-70' : 'text-[var(--aether-text-4)]'}`}
        />
      </button>
    );
  }

  return (
    <div className={shell}>
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
      >
        {body}
      </button>
      <button
        type="button"
        onClick={onMenu}
        title={`${title} options`}
        aria-label={`${title} options`}
        className={`flex w-[40%] shrink-0 items-center justify-center transition ${
          on ? 'hover:bg-black/10' : 'hover:bg-[var(--aether-fill-2)]'
        }`}
      >
        <ChevronRight
          size={18}
          strokeWidth={2}
          className={menuOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
        />
      </button>
    </div>
  );
};
