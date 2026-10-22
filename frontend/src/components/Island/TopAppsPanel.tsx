import React, { useState } from 'react';
import { Cpu, MemoryStick, Microchip } from 'lucide-react';
import type { TopAppStat } from '../../types/ipc';
import { ControlPanel, PanelFooterRow } from './ControlPanel';
import { formatAppRam } from './statsFormat';

type Metric = 'ram' | 'vram' | 'cpu';

interface TopAppsPanelProps {
  apps: TopAppStat[];
  vramApps?: TopAppStat[];
  cpuApps?: TopAppStat[];
  totalGb?: number | null;
  vramTotalGb?: number | null;
  cpuThreads?: number | null;
}

interface MetricConfig {
  label: string;
  color: string;
  Icon: typeof MemoryStick;
  value: (app: TopAppStat) => number;
  format: (value: number) => string;
}

const METRICS: Record<Metric, MetricConfig> = {
  ram: {
    label: 'RAM',
    color: '#6ee7b7',
    Icon: MemoryStick,
    value: (app) => app.ram_mb ?? 0,
    format: formatAppRam,
  },
  vram: {
    label: 'VRAM',
    color: '#c4b5fd',
    Icon: Microchip,
    value: (app) => app.vram_mb ?? 0,
    format: formatAppRam,
  },
  cpu: {
    label: 'CPU',
    color: '#7dd3fc',
    Icon: Cpu,
    value: (app) => app.cpu_percent ?? 0,
    format: (value) => `${value.toFixed(1)}%`,
  },
};

const METRIC_KEYS = Object.keys(METRICS) as Metric[];

/**
 * Top apps by RAM, dedicated VRAM, or CPU.
 *
 * Processes are grouped by name upstream, so a browser with thirty children
 * is one line rather than thirty. The bar is scaled to the leader of the
 * active ranking, which keeps the comparison readable even when one app
 * dwarfs the rest.
 */
export const TopAppsPanel: React.FC<TopAppsPanelProps> = ({
  apps,
  vramApps = [],
  cpuApps = [],
  totalGb,
  vramTotalGb,
  cpuThreads,
}) => {
  const [metric, setMetric] = useState<Metric>('ram');
  const meta = METRICS[metric];
  const rows = metric === 'ram' ? apps : metric === 'vram' ? vramApps : cpuApps;
  const peak = rows.reduce((value, app) => Math.max(value, meta.value(app)), 0);
  const loading =
    apps.length === 0 && vramApps.length === 0 && cpuApps.length === 0;

  const footerRight =
    metric === 'ram'
      ? totalGb != null
        ? `${Math.round(totalGb)} GB installed`
        : '—'
      : metric === 'vram'
        ? vramTotalGb != null
          ? `${Math.round(vramTotalGb)} GB VRAM`
          : '—'
        : cpuThreads != null
          ? `${cpuThreads} threads`
          : '—';

  return (
    <ControlPanel
      label={`Top apps by ${meta.label}`}
      icon={<meta.Icon size={14} color={meta.color} />}
      action={
        <div className="flex items-center gap-0.5 rounded-full border border-[var(--aether-line-soft)] p-0.5">
          {METRIC_KEYS.map((key) => {
            const item = METRICS[key];
            const active = key === metric;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setMetric(key)}
                className={`rounded-full px-1.5 py-[2px] text-[8px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  active
                    ? ''
                    : 'text-[var(--aether-text-4)] hover:text-[var(--aether-text-2)]'
                }`}
                style={
                  active
                    ? { color: item.color, backgroundColor: `${item.color}1a` }
                    : undefined
                }
              >
                {item.label}
              </button>
            );
          })}
        </div>
      }
      className="h-full"
      footer={
        <PanelFooterRow left="Grouped by process name" right={footerRight} />
      }
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[10px] text-[var(--aether-text-3)]">
          {loading ? 'Reading processes…' : 'No activity in this sample'}
        </p>
      ) : (
        <ol className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          {rows.map((app, index) => {
            const value = meta.value(app);
            return (
              <li
                key={app.name}
                className="flex items-center gap-2.5 rounded-lg px-1.5 py-[5px] transition hover:bg-[var(--aether-fill)]"
              >
                <span className="w-3 shrink-0 font-mono text-[9px] text-[var(--aether-text-4)]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-[var(--aether-text-1)]">
                  {app.name}
                  {app.processes > 1 ? (
                    <span className="ml-1.5 font-mono text-[8.5px] font-normal text-[var(--aether-text-4)]">
                      ×{app.processes}
                    </span>
                  ) : null}
                </span>
                <span
                  className="h-1.5 w-[86px] shrink-0 overflow-hidden rounded-full bg-[var(--aether-fill-2)]"
                  aria-hidden
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${peak > 0 ? (value / peak) * 100 : 0}%`,
                      backgroundColor: meta.color,
                    }}
                  />
                </span>
                <span className="w-[58px] shrink-0 text-right font-mono text-[9.5px] text-[var(--aether-text-2)]">
                  {meta.format(value)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </ControlPanel>
  );
};
