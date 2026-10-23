import React from 'react';
import { Cpu, MemoryStick, Microchip } from 'lucide-react';
import type { SpeedTestResult, SystemStats } from '../../types/ipc';
import { SpeedTestPanel } from './SpeedTestPanel';
import { StatGauge, UptimeCard } from './StatGauge';
import { SystemIoPanel } from './SystemIoPanel';
import { TopAppsPanel } from './TopAppsPanel';
import { formatGb } from './statsFormat';
import { STATS_HEIGHT } from './tabSizes';

interface StatsTabProps {
  stats: SystemStats | null;
  speedTest: SpeedTestResult | null;
  onRunSpeedTest: (durationSeconds: number) => void;
}

/** Fixed so the ring, the cards, and the app list share one steady frame. */
const GAUGE_ROW = 172;

/**
 * Stats.
 *
 * Three semantic gauges and an uptime card ride the first row; the second row
 * carries the RAM leaderboard, live disk/network throughput, and the speed
 * test. Everything is fed by the same two-second SYSTEM_STATS tick that the
 * rest of the island already receives.
 */
export const StatsTab: React.FC<StatsTabProps> = ({ stats, speedTest, onRunSpeedTest }) => {
  const cpuCaption =
    stats?.cpu_threads != null
      ? `${stats.cpu_threads} threads`
      : stats?.cpu_cores != null
        ? `${stats.cpu_cores} cores`
        : 'Live load';

  const gpuCaption =
    stats?.gpu_vram_used_gb != null && stats?.gpu_vram_total_gb != null
      ? `${formatGb(stats.gpu_vram_used_gb)} / ${formatGb(stats.gpu_vram_total_gb, 0)} VRAM${
          stats.gpu_temp_c != null ? ` · ${Math.round(stats.gpu_temp_c)}°C` : ''
        }`
      : stats?.gpu_name ?? 'No GPU telemetry';

  // The ring plots the same quantity as the caption. Plotting NVML utilisation
  // meant an idle dGPU drew an empty ring above "1.0 / 4 GB", which reads as a
  // broken gauge; utilisation stays in the payload, VRAM is what the card shows.
  const gpuMemoryPercent =
    stats?.gpu_vram_used_gb != null && stats?.gpu_vram_total_gb
      ? Math.min(100, (stats.gpu_vram_used_gb / stats.gpu_vram_total_gb) * 100)
      : null;
  const gpuValue = gpuMemoryPercent ?? stats?.gpu_percent ?? null;

  const ramCaption =
    stats?.ram_used_gb != null && stats?.ram_total_gb != null
      ? `${formatGb(stats.ram_used_gb)} / ${formatGb(stats.ram_total_gb, 0)}`
      : 'Live load';

  return (
    <div className="flex flex-col gap-3" style={{ height: STATS_HEIGHT }}>
      <div
        className="grid shrink-0 grid-cols-4 gap-3"
        style={{ height: GAUGE_ROW }}
      >
        <StatGauge
          label="CPU"
          icon={<Cpu size={13} />}
          value={stats?.cpu_percent ?? null}
          display={`${Math.round(stats?.cpu_percent ?? 0)}%`}
          caption={cpuCaption}
          color="#7dd3fc"
        />
        <StatGauge
          label="GPU"
          icon={<Microchip size={13} />}
          value={gpuValue}
          display={`${Math.round(gpuValue ?? 0)}%`}
          caption={gpuCaption}
          color="#c4b5fd"
        />
        <StatGauge
          label="RAM"
          icon={<MemoryStick size={13} />}
          value={stats?.ram_percent ?? null}
          display={`${Math.round(stats?.ram_percent ?? 0)}%`}
          caption={ramCaption}
          color="#6ee7b7"
        />
        <UptimeCard seconds={stats?.uptime_seconds} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1.45fr_1fr_1fr] gap-3">
        <TopAppsPanel
          apps={stats?.top_apps ?? []}
          vramApps={stats?.top_apps_vram ?? []}
          cpuApps={stats?.top_apps_cpu ?? []}
          totalGb={stats?.ram_total_gb}
          vramTotalGb={stats?.gpu_vram_total_gb}
          cpuThreads={stats?.cpu_threads}
        />
        <SystemIoPanel stats={stats} />
        <SpeedTestPanel result={speedTest} onRun={onRunSpeedTest} />
      </div>
    </div>
  );
};
