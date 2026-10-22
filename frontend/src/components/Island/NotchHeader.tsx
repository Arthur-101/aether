import React from 'react';
import { Power, Settings, X } from 'lucide-react';
import { AetherMark } from './AetherMark';

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
        <AetherMark size={38} className="shrink-0 text-[var(--aether-accent)]" />
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
