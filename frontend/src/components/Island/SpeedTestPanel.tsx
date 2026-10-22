import React from 'react';
import { Loader2, Zap } from 'lucide-react';
import type { SpeedTestResult } from '../../types/ipc';
import { ControlPanel, PanelFooterRow } from './ControlPanel';
import { formatPing, formatSpeed, formatTestedAt } from './statsFormat';

interface SpeedTestPanelProps {
  result: SpeedTestResult | null;
  onRun: () => void;
}

const Metric: React.FC<{ label: string; value: string; unit?: string }> = ({
  label,
  value,
  unit,
}) => (
  <div className="rounded-xl border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] px-1.5 py-2 text-center">
    <p className="text-[8px] uppercase tracking-[0.12em] text-[var(--aether-text-3)]">
      {label}
    </p>
    <p className="mt-1 font-mono text-[16px] leading-none text-[var(--aether-text-1)]">
      {value}
    </p>
    {unit ? (
      <p className="mt-[3px] text-[8px] text-[var(--aether-text-4)]">{unit}</p>
    ) : null}
  </div>
);

/**
 * The on-demand speed test.
 *
 * The backend streams three separate numbers, so a failed upload leg still
 * leaves the ping and download readings on screen instead of blanking the
 * card. The button is disabled while a run is in flight.
 */
export const SpeedTestPanel: React.FC<SpeedTestPanelProps> = ({ result, onRun }) => {
  const running = result?.state === 'running';
  const tested = formatTestedAt(result?.tested_at);

  return (
    <ControlPanel
      label="Speed test"
      icon={<Zap size={14} className="text-[#7dd3fc]" />}
      className="h-full"
      footer={<PanelFooterRow left={result?.server ?? 'Cloudflare'} right={tested ? `Last run ${tested}` : 'Not run yet'} />}
    >
      <div className="flex flex-1 flex-col justify-center gap-3">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Ping" value={formatPing(result?.ping_ms)} unit="ms" />
          <Metric label="Down" value={formatSpeed(result?.download_mbps)} unit="Mb/s" />
          <Metric label="Up" value={formatSpeed(result?.upload_mbps)} unit="Mb/s" />
        </div>

        {result?.state === 'error' ? (
          <p className="text-[8.5px] leading-relaxed text-red-400">
            {result.message ?? 'The test could not finish.'}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="accent-fill flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-xl text-[10.5px] font-semibold transition disabled:cursor-wait disabled:opacity-70"
        >
          {running ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Testing…
            </>
          ) : (
            <>
              <Zap size={13} />
              Run speed test
            </>
          )}
        </button>
      </div>
    </ControlPanel>
  );
};
