import React from 'react';
import { Clock, Cpu, HardDrive, Sparkles } from 'lucide-react';
import type { SystemStats } from '../../types/ipc';

interface IslandStatusBarProps {
  systemStats: SystemStats | null;
  now: Date;
}

export const IslandStatusBar: React.FC<IslandStatusBarProps> = ({ systemStats, now }) => (
  <div className="flex items-center justify-between rounded-md border border-[var(--aether-line-soft)] bg-white/[0.025] px-2.5 py-1 font-mono text-[9px] text-[var(--aether-text-2)]">
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1" title="CPU usage">
        <Cpu size={10} className="text-[var(--aether-accent-text)]" />
        <span className="text-[var(--aether-text-3)]">CPU</span>
        <span className="text-[var(--aether-text-1)]">
          {Math.round(systemStats?.cpu_percent ?? 0)}%
        </span>
      </span>
      <span className="flex items-center gap-1" title="RAM usage">
        <HardDrive size={10} className="text-[var(--aether-accent-text)]" />
        <span className="text-[var(--aether-text-3)]">RAM</span>
        <span className="text-[var(--aether-text-1)]">
          {Math.round(systemStats?.ram_percent ?? 0)}%
        </span>
      </span>
      <span className="flex items-center gap-1" title="GPU VRAM usage">
        <Sparkles size={10} className="text-[var(--aether-accent-text)]" />
        <span className="text-[var(--aether-text-3)]">GPU</span>
        <span className="text-[var(--aether-text-1)]">
          {systemStats?.gpu_vram_gb != null
            ? `${systemStats.gpu_vram_gb.toFixed(2)}G`
            : '—'}
        </span>
      </span>
    </div>
    <span className="flex items-center gap-1" title="Current time">
      <Clock size={10} className="text-[var(--aether-accent-text)]" />
      <span className="text-[var(--aether-text-1)]">
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </span>
  </div>
);
