import React from 'react';
import { Power, Settings, X } from 'lucide-react';

interface NotchHeaderProps {
  now: Date;
  onOpenSettings: () => void;
  onKill: () => void;
  onClose: () => void;
}

const controlClass =
  'flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] text-[var(--aether-text-1)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';

export const NotchHeader: React.FC<NotchHeaderProps> = ({
  now,
  onOpenSettings,
  onKill,
  onClose,
}) => {
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <header className="relative flex h-16 shrink-0 items-center justify-between border-b border-[var(--aether-line-soft)] px-5">
      <div className="flex items-center gap-2.5 text-[var(--aether-text-1)]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 1L23 12L12 23L1 12L12 1Z"
            fill="var(--aether-accent)"
            opacity="0.92"
          />
          <path d="M12 6L17 12L12 18L7 12L12 6Z" fill="#17140e" opacity="0.72" />
          <circle cx="12" cy="12" r="1.6" fill="#f9e7ad" />
        </svg>
        <span className="text-sm font-semibold tracking-[0.01em]">Aether</span>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5">
        <span className="font-mono text-[15px] font-semibold tabular-nums tracking-[0.01em] text-[var(--aether-text-1)]">
          {time}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onKill}
          className={`${controlClass} text-[#ef9a9a] hover:text-[var(--aether-text-1)]`}
          title="Kill Aether (dev): free ports 8765/1420/8089 and stop the app"
          aria-label="Kill Aether"
        >
          <Power size={14} />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className={controlClass}
          title="Settings"
          aria-label="Open settings"
        >
          <Settings size={15} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className={controlClass}
          title="Close"
          aria-label="Close Aether"
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
};
