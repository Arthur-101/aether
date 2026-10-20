import React from 'react';
import { Clock, Cpu, HardDrive, Sparkles } from 'lucide-react';
import type { SystemStats } from '../../types/ipc';

interface IslandStatusBarProps {
  systemStats: SystemStats | null;
  now: Date;
}

export const IslandStatusBar: React.FC<IslandStatusBarProps> = ({ systemStats, now }) => (
  <div className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.025] px-2.5 py-1 font-mono text-[9px] text-[#a8a8a8]">
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1" title="CPU usage">
        <Cpu size={10} className="text-[#60cdff]" />
        <span className="text-[#8b8b8b]">CPU</span>
        <span className="text-[#e5e5e5]">
          {Math.round(systemStats?.cpu_percent ?? 0)}%
        </span>
      </span>
      <span className="flex items-center gap-1" title="RAM usage">
        <HardDrive size={10} className="text-[#60cdff]" />
        <span className="text-[#8b8b8b]">RAM</span>
        <span className="text-[#e5e5e5]">
          {Math.round(systemStats?.ram_percent ?? 0)}%
        </span>
      </span>
      <span className="flex items-center gap-1" title="GPU VRAM usage">
        <Sparkles size={10} className="text-[#60cdff]" />
        <span className="text-[#8b8b8b]">GPU</span>
        <span className="text-[#e5e5e5]">
          {systemStats?.gpu_vram_gb != null
            ? `${systemStats.gpu_vram_gb.toFixed(2)}G`
            : '—'}
        </span>
      </span>
    </div>
    <span className="flex items-center gap-1" title="Current time">
      <Clock size={10} className="text-[#60cdff]" />
      <span className="text-[#e5e5e5]">
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </span>
  </div>
);
