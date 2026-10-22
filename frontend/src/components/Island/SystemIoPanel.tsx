import React from 'react';
import { ArrowDown, ArrowUp, HardDrive } from 'lucide-react';
import type { SystemStats } from '../../types/ipc';
import { ControlPanel } from './ControlPanel';
import { formatGb, formatRate } from './statsFormat';

interface SystemIoPanelProps {
  stats: SystemStats | null;
}

const DISK_COLOR = '#f0c36a';

/** Disk capacity and live throughput, plus the current network rates. */
export const SystemIoPanel: React.FC<SystemIoPanelProps> = ({ stats }) => {
  const used = stats?.disk_used_gb;
  const total = stats?.disk_total_gb;
  const percent = Math.max(0, Math.min(100, stats?.disk_percent ?? 0));

  return (
    <ControlPanel
      label="Disk & network"
      icon={<HardDrive size={14} className="text-[#f0c36a]" />}
      className="h-full"
    >
      <div className="flex flex-1 flex-col justify-center gap-3">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] text-[var(--aether-text-2)]">Disk C:</span>
            <span className="font-mono text-[10px] text-[var(--aether-text-1)]">
              {used != null && total != null
                ? `${formatGb(used, 0)} / ${formatGb(total, 0)}`
                : `${Math.round(percent)}%`}
            </span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--aether-fill-2)]"
            role="meter"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Disk usage"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${percent}%`,
                backgroundColor: DISK_COLOR,
                transition: 'width 500ms ease',
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[8.5px] text-[var(--aether-text-3)]">
            <span>R {formatRate(stats?.disk_read_mbps)}</span>
            <span>W {formatRate(stats?.disk_write_mbps)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[8.5px] uppercase tracking-[0.12em] text-[var(--aether-text-3)]">
              <ArrowDown size={9} className="text-[#7dd3fc]" />
              Down
            </p>
            <p className="mt-1 font-mono text-[13px] leading-none text-[var(--aether-text-1)]">
              {formatRate(stats?.net_down_mbps, 'Mb/s')}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[8.5px] uppercase tracking-[0.12em] text-[var(--aether-text-3)]">
              <ArrowUp size={9} className="text-[#c4b5fd]" />
              Up
            </p>
            <p className="mt-1 font-mono text-[13px] leading-none text-[var(--aether-text-1)]">
              {formatRate(stats?.net_up_mbps, 'Mb/s')}
            </p>
          </div>
        </div>
      </div>
    </ControlPanel>
  );
};
