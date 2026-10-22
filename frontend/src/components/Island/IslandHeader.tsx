import React from 'react';
import { Brain, Menu, Settings } from 'lucide-react';
import { KillAppButton } from './KillAppButton';

interface IslandHeaderProps {
  sessionTitle: string;
  engineLabel: string;
  thinkingMode: boolean;
  onToggleDrawer: () => void;
  onOpenSettings: () => void;
  onKillApp: () => void;
  onClose: () => void;
}

export const IslandHeader: React.FC<IslandHeaderProps> = ({
  sessionTitle,
  engineLabel,
  thinkingMode,
  onToggleDrawer,
  onOpenSettings,
  onKillApp,
  onClose,
}) => (
  <div className="flex items-center justify-between border-b border-[var(--aether-line)] pb-2">
    <div className="flex items-center gap-2">
      <button
        onClick={onToggleDrawer}
        className="rounded-md bg-[var(--aether-fill)] p-1.5 text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)]"
        title="Toggle Session Drawer"
      >
        <Menu size={16} />
      </button>
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-[var(--aether-text-1)]">Aether</h2>
        <p className="max-w-[250px] truncate text-[10px] text-[var(--aether-text-3)]">
          {sessionTitle}
        </p>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <div className="flex max-w-[190px] items-center gap-1.5 rounded-full border border-[var(--aether-accent)]/40 bg-[var(--aether-accent)]/15 px-2.5 py-1 text-[10px] text-[var(--aether-accent-text)]">
        <Brain size={12} className="shrink-0" />
        <span className="truncate">
          {engineLabel} {thinkingMode ? '· Thinking' : ''}
        </span>
      </div>
      <KillAppButton onKill={onKillApp} />
      <button
        onClick={onOpenSettings}
        className="rounded-md bg-[var(--aether-fill)] p-1.5 text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)]"
        title="Settings"
      >
        <Settings size={16} />
      </button>
      <button
        onClick={onClose}
        className="rounded px-2 py-0.5 text-xs text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
      >
        ✕
      </button>
    </div>
  </div>
);
