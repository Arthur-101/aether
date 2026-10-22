import React from 'react';
import { MemoryStick } from 'lucide-react';
import type { TopAppStat } from '../../types/ipc';
import { ControlPanel, PanelFooterRow } from './ControlPanel';
import { formatAppRam } from './statsFormat';

interface TopAppsPanelProps {
  apps: TopAppStat[];
  totalGb?: number | null;
}

const RAM_COLOR = '#6ee7b7';

/**
 * Top apps by RAM.
 *
 * Processes are grouped by name upstream, so a browser with thirty children
 * is one line rather than thirty. The bar is scaled to the leader, which
 * keeps the comparison readable even when one app dwarfs the rest.
 */
export const TopAppsPanel: React.FC<TopAppsPanelProps> = ({ apps, totalGb }) => {
  const peak = apps.reduce((value, app) => Math.max(value, app.ram_mb), 0);

  return (
    <ControlPanel
      label="Top apps by RAM"
      icon={<MemoryStick size={14} className="text-[#6ee7b7]" />}
      className="h-full"
      footer={
        <PanelFooterRow
          left="Grouped by process name"
          right={totalGb != null ? `${Math.round(totalGb)} GB installed` : '—'}
        />
      }
    >
      {apps.length === 0 ? (
        <p className="py-6 text-center text-[10px] text-[var(--aether-text-3)]">
          Reading processes…
        </p>
      ) : (
        <ol className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          {apps.map((app, index) => (
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
                    width: `${peak > 0 ? (app.ram_mb / peak) * 100 : 0}%`,
                    backgroundColor: RAM_COLOR,
                  }}
                />
              </span>
              <span className="w-[58px] shrink-0 text-right font-mono text-[9.5px] text-[var(--aether-text-2)]">
                {formatAppRam(app.ram_mb)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </ControlPanel>
  );
};
