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
  <div className="flex items-center justify-between border-b border-white/10 pb-2">
    <div className="flex items-center gap-2">
      <button
        onClick={onToggleDrawer}
        className="rounded-md bg-white/5 p-1.5 text-[#c7c7c7] transition hover:bg-white/10"
        title="Toggle Session Drawer"
      >
        <Menu size={16} />
      </button>
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-white">Aether</h2>
        <p className="max-w-[250px] truncate text-[10px] text-[#8b8b8b]">
          {sessionTitle}
        </p>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <div className="flex max-w-[190px] items-center gap-1.5 rounded-full border border-[#0067c0]/40 bg-[#0067c0]/15 px-2.5 py-1 text-[10px] text-[#9dd5ff]">
        <Brain size={12} className="shrink-0" />
        <span className="truncate">
          {engineLabel} {thinkingMode ? '· Thinking' : ''}
        </span>
      </div>
      <KillAppButton onKill={onKillApp} />
      <button
        onClick={onOpenSettings}
        className="rounded-md bg-white/5 p-1.5 text-[#c7c7c7] transition hover:bg-white/10"
        title="Settings"
      >
        <Settings size={16} />
      </button>
      <button
        onClick={onClose}
        className="rounded px-2 py-0.5 text-xs text-[#8b8b8b] transition hover:bg-white/10 hover:text-white"
      >
        ✕
      </button>
    </div>
  </div>
);
