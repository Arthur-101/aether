import React, { useState } from 'react';
import { ArrowDown, ArrowUp, HardDrive, Loader2, Sparkles } from 'lucide-react';
import type { SystemStats } from '../../types/ipc';
import { cleanTempFiles, type TempCleanResult } from '../../lib/system';
import { ControlPanel, PanelFooterRow } from './ControlPanel';
import { formatBytes, formatGb, formatRate } from './statsFormat';

interface SystemIoPanelProps {
  stats: SystemStats | null;
}

const DISK_COLOR = '#f0c36a';

/** Disk capacity and live throughput, plus the current network rates. */
export const SystemIoPanel: React.FC<SystemIoPanelProps> = ({ stats }) => {
  const used = stats?.disk_used_gb;
  const total = stats?.disk_total_gb;
  const percent = Math.max(0, Math.min(100, stats?.disk_percent ?? 0));

  const [cleaning, setCleaning] = useState(false);
  const [sweep, setSweep] = useState<TempCleanResult | null>(null);
  const [failed, setFailed] = useState(false);

  const runClean = async () => {
    setCleaning(true);
    setFailed(false);
    const result = await cleanTempFiles();
    setCleaning(false);
    if (!result) {
      setFailed(true);
      return;
    }
    setSweep(result);
  };

  const cleanStatus = cleaning
    ? 'Cleaning temp files...'
    : failed
      ? 'Cleanup failed'
      : sweep
        ? `Freed ${formatBytes(sweep.freed_bytes)} · ${sweep.skipped} in use`
        : 'Temp files older than 10 min';

  return (
    <ControlPanel
      label="Disk & network"
      icon={<HardDrive size={14} className="text-[#f0c36a]" />}
      className="h-full"
      footer={
        <PanelFooterRow
          left={<span className="truncate">{cleanStatus}</span>}
          leftClassName="min-w-0 flex-1 truncate text-[9px] text-[var(--aether-text-3)]"
          right={
            <button
              type="button"
              onClick={runClean}
              disabled={cleaning}
              aria-busy={cleaning}
              title="Delete unlocked files from the Windows temp folder"
              className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-0.5 text-[9px] font-medium text-[var(--aether-text-2)] transition hover:text-[var(--aether-text-1)] disabled:cursor-wait disabled:opacity-60"
            >
              {cleaning ? (
                <Loader2 size={10} className="animate-spin" aria-hidden />
              ) : (
                <Sparkles size={10} aria-hidden />
              )}
              Clean
            </button>
          }
          rightClassName="text-[9.5px] text-[var(--aether-text-2)]"
        />
      }
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
