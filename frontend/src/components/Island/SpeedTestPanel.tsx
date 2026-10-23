import React, { useId, useState } from 'react';
import { Loader2, Timer, Zap } from 'lucide-react';
import type { SpeedTestPhase, SpeedTestResult, SpeedTestSample } from '../../types/ipc';
import { ControlPanel, PanelFooterRow } from './ControlPanel';
import { formatPing, formatSpeed, formatTestedAt } from './statsFormat';

interface SpeedTestPanelProps {
  result: SpeedTestResult | null;
  onRun: (durationSeconds: number) => void;
}

const DEFAULT_DURATION_SECONDS = 12;
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 60;

function clampDuration(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DURATION_SECONDS;
  return Math.max(MIN_DURATION_SECONDS, Math.min(MAX_DURATION_SECONDS, parsed));
}

const GAUGE_SIZE = 112;
const GAUGE_CENTER = GAUGE_SIZE / 2;
const GAUGE_RADIUS = 45;
const GAUGE_START = 150;
const GAUGE_SWEEP = 240;
const PROGRESS_RADIUS = 53;
const DOWNLOAD_COLOR = '#7dd3fc';
const UPLOAD_COLOR = '#c4b5fd';

function polar(angle: number, radius: number): [number, number] {
  const radians = (angle * Math.PI) / 180;
  return [
    GAUGE_CENTER + radius * Math.cos(radians),
    GAUGE_CENTER + radius * Math.sin(radians),
  ];
}

function arcPath(radius: number, startAngle: number, endAngle: number): string {
  const [x1, y1] = polar(startAngle, radius);
  const [x2, y2] = polar(endAngle, radius);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** A readable gauge ceiling: 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, or 10 × 10ⁿ. */
function niceMax(value: number): number {
  const floor = Math.max(10, value * 1.12);
  const exponent = Math.floor(Math.log10(floor));
  const base = 10 ** exponent;
  const fraction = floor / base;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  const step = steps.find((candidate) => fraction <= candidate) ?? 10;
  return step * base;
}

function phaseLabel(phase: SpeedTestPhase | 'done' | 'error' | 'idle'): string {
  switch (phase) {
    case 'latency':
      return 'Ping';
    case 'download':
      return 'Download';
    case 'upload':
      return 'Upload';
    case 'done':
      return 'Download';
    case 'error':
      return 'Failed';
    default:
      return 'Ready';
  }
}

interface SpeedGaugeProps {
  value: number | null;
  max: number;
  progress: number;
  accent: string;
  label: string;
  running: boolean;
}

const SpeedGauge: React.FC<SpeedGaugeProps> = ({
  value,
  max,
  progress,
  accent,
  label,
  running,
}) => {
  const ratio = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  const needleAngle = GAUGE_START + GAUGE_SWEEP * ratio;
  const progressCircumference = 2 * Math.PI * PROGRESS_RADIUS;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const tickCount = 8;

  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg
        viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
        className="h-full w-full overflow-visible"
        aria-hidden
      >
        <circle
          cx={GAUGE_CENTER}
          cy={GAUGE_CENTER}
          r={PROGRESS_RADIUS}
          fill="none"
          stroke="var(--aether-line)"
          strokeWidth={1.4}
          opacity={0.5}
        />
        <circle
          cx={GAUGE_CENTER}
          cy={GAUGE_CENTER}
          r={PROGRESS_RADIUS}
          fill="none"
          stroke={accent}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeDasharray={progressCircumference}
          strokeDashoffset={progressCircumference * (1 - clampedProgress)}
          transform={`rotate(-90 ${GAUGE_CENTER} ${GAUGE_CENTER})`}
          style={{ transition: 'stroke-dashoffset 450ms ease, stroke 250ms ease' }}
          opacity={running ? 0.9 : 0.65}
        />

        {Array.from({ length: tickCount + 1 }, (_, index) => {
          const fraction = index / tickCount;
          const angle = GAUGE_START + GAUGE_SWEEP * fraction;
          const [x1, y1] = polar(angle, GAUGE_RADIUS - 6);
          const [x2, y2] = polar(angle, GAUGE_RADIUS - 2.5);
          return (
            <line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={fraction <= ratio ? accent : 'var(--aether-line-strong)'}
              strokeWidth={fraction <= ratio ? 1.1 : 0.8}
              strokeLinecap="round"
              opacity={fraction <= ratio ? 0.9 : 0.5}
            />
          );
        })}

        <path
          d={arcPath(GAUGE_RADIUS, GAUGE_START, GAUGE_START + GAUGE_SWEEP)}
          fill="none"
          stroke="var(--aether-line-strong)"
          strokeWidth={4.5}
          strokeLinecap="round"
          opacity={0.35}
        />
        {ratio > 0.002 ? (
          <path
            d={arcPath(GAUGE_RADIUS, GAUGE_START, GAUGE_START + GAUGE_SWEEP)}
            fill="none"
            stroke={accent}
            strokeWidth={4.5}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100 100"
            strokeDashoffset={100 * (1 - ratio)}
            style={{
              transition:
                'stroke-dashoffset 520ms cubic-bezier(0.22, 0.61, 0.36, 1), stroke 250ms ease',
              filter: `drop-shadow(0 0 3px ${accent}55)`,
            }}
          />
        ) : null}

        <g
          style={{
            transformOrigin: `${GAUGE_CENTER}px ${GAUGE_CENTER}px`,
            transform: `rotate(${needleAngle - 270}deg)`,
            transition: 'transform 520ms cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}
        >
          <line
            x1={GAUGE_CENTER}
            y1={GAUGE_CENTER}
            x2={GAUGE_CENTER}
            y2={GAUGE_CENTER - (GAUGE_RADIUS - 12)}
            stroke={accent}
            strokeWidth={1.7}
            strokeLinecap="round"
            opacity={0.95}
          />
        </g>
        <circle cx={GAUGE_CENTER} cy={GAUGE_CENTER} r={2.3} fill={accent} />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center pb-1">
        <span className="font-mono text-[21px] leading-none tracking-tight text-[var(--aether-text-1)]">
          {value == null ? '—' : formatSpeed(value)}
        </span>
        <span className="mt-0.5 text-[7px] uppercase tracking-[0.18em] text-[var(--aether-text-3)]">
          Mbps
        </span>
        <span
          className="mt-0.5 text-[7.5px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: accent }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};

const Readout: React.FC<{
  label: string;
  value: string;
  unit: string;
  accent?: string;
}> = ({ label, value, unit, accent }) => (
  <div className="min-w-0 rounded-lg border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] px-1.5 py-1">
    <p className="text-[7.5px] uppercase tracking-[0.12em] text-[var(--aether-text-3)]">
      {label}
    </p>
    <p
      className="mt-0.5 truncate font-mono text-[12.5px] leading-none"
      style={{ color: accent ?? 'var(--aether-text-1)' }}
    >
      {value}
      <span className="ml-0.5 text-[7px] font-normal text-[var(--aether-text-3)]">
        {unit}
      </span>
    </p>
  </div>
);

interface SpeedChartProps {
  samples: SpeedTestSample[];
  max: number;
  running: boolean;
}

const SpeedChart: React.FC<SpeedChartProps> = ({ samples, max, running }) => {
  const uid = useId().replace(/:/g, '');
  const downloadFill = `speed-down-${uid}`;
  const uploadFill = `speed-up-${uid}`;
  const last = samples.length - 1;
  const lastSample = samples[last];
  const firstTime = samples.length
    ? Math.min(...samples.map((sample, index) => sample.t ?? index))
    : 0;
  const maxTime = Math.max(
    samples.reduce((latest, sample, index) => Math.max(latest, (sample.t ?? index) - firstTime), 0),
    0.001
  );

  const points = samples.map((sample, index) => {
    const time = (sample.t ?? index) - firstTime;
    const x = 2 + (time / maxTime) * 96;
    const y = 29 - Math.min(1, Math.max(0, sample.mbps / max)) * 25;
    return { x, y, phase: sample.phase };
  });
  const downloadPoints = points.filter((point) => point.phase === 'download');
  const uploadPoints = points.filter((point) => point.phase === 'upload');

  const pathFor = (series: { x: number; y: number }[]) =>
    series.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const areaFor = (series: { x: number; y: number }[]) => {
    if (series.length < 2) return '';
    const path = pathFor(series);
    const first = series[0];
    const lastPoint = series[series.length - 1];
    return `${path} L ${lastPoint.x.toFixed(2)} 31 L ${first.x.toFixed(2)} 31 Z`;
  };

  return (
    <div className="relative h-[32px] w-full overflow-hidden rounded-lg border border-[var(--aether-line-soft)] bg-[var(--aether-fill)]">
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id={downloadFill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={DOWNLOAD_COLOR} stopOpacity="0.28" />
            <stop offset="100%" stopColor={DOWNLOAD_COLOR} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={uploadFill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={UPLOAD_COLOR} stopOpacity="0.28" />
            <stop offset="100%" stopColor={UPLOAD_COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="2" y1="8" x2="98" y2="8" stroke="var(--aether-line-soft)" strokeWidth="0.5" />
        <line x1="2" y1="16" x2="98" y2="16" stroke="var(--aether-line-soft)" strokeWidth="0.5" />
        <line x1="2" y1="24" x2="98" y2="24" stroke="var(--aether-line-soft)" strokeWidth="0.5" />

        {downloadPoints.length > 0 ? (
          <>
            <path d={areaFor(downloadPoints)} fill={`url(#${downloadFill})`} />
            <path
              d={pathFor(downloadPoints)}
              fill="none"
              stroke={DOWNLOAD_COLOR}
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
        {uploadPoints.length > 0 ? (
          <>
            <path d={areaFor(uploadPoints)} fill={`url(#${uploadFill})`} />
            <path
              d={pathFor(uploadPoints)}
              fill="none"
              stroke={UPLOAD_COLOR}
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}

        {points.map((point, index) => (
          <circle
            key={`${point.phase}-${index}`}
            cx={point.x}
            cy={point.y}
            r={0.8}
            fill={point.phase === 'download' ? DOWNLOAD_COLOR : UPLOAD_COLOR}
            opacity={index === last ? 1 : 0.55}
          />
        ))}
        {running && lastSample ? (
          <circle
            cx={points[last].x}
            cy={points[last].y}
            r={1.6}
            fill={lastSample.phase === 'download' ? DOWNLOAD_COLOR : UPLOAD_COLOR}
            className="animate-pulse"
          />
        ) : null}
      </svg>
      {samples.length === 0 ? (
        <span className="absolute inset-0 flex items-center justify-center text-[7px] uppercase tracking-[0.16em] text-[var(--aether-text-4)]">
          Live throughput trace
        </span>
      ) : null}
    </div>
  );
};

/**
 * The on-demand speed test.
 *
 * The backend streams latency, download, and upload windows over the requested
 * duration. Each reading is appended to the trace, while the gauge follows the
 * latest window so the card feels live instead of jumping once at the end.
 */
export const SpeedTestPanel: React.FC<SpeedTestPanelProps> = ({ result, onRun }) => {
  const [duration, setDuration] = useState(() =>
    String(result?.duration_seconds ?? DEFAULT_DURATION_SECONDS)
  );
  const activeDuration = clampDuration(duration);
  const running = result?.state === 'running';
  const samples = result?.samples ?? [];
  const phase: SpeedTestPhase | 'done' | 'error' | 'idle' = !result
    ? 'idle'
    : running
      ? result.phase ?? 'latency'
      : result.state === 'error'
        ? 'error'
        : result.state === 'done'
          ? 'done'
          : 'idle';

  const phaseSamples =
    phase === 'download' || phase === 'upload'
      ? samples.filter((sample) => sample.phase === phase)
      : samples;
  const gaugeValue = running
    ? result?.current_mbps ?? (phaseSamples.length ? phaseSamples[phaseSamples.length - 1].mbps : 0)
    : result?.download_mbps ?? result?.upload_mbps ?? 0;
  // Scale against the stable median plus the current window, never the fastest
  // one-off sample. A single spike should not leave the finished gauge mostly
  // empty when it settles on the median download speed.
  const gaugeReference = running
    ? Math.max(
        phase === 'upload' ? result?.upload_mbps ?? 0 : result?.download_mbps ?? 0,
        result?.current_mbps ?? 0
      )
    : result?.download_mbps ?? result?.upload_mbps ?? 0;
  const gaugeMax = niceMax(gaugeReference);
  const chartMax = niceMax(
    Math.max(
      0,
      ...samples.map((sample) => sample.mbps),
      result?.current_mbps ?? 0,
      result?.download_mbps ?? 0,
      result?.upload_mbps ?? 0
    )
  );
  const accent =
    phase === 'upload' ? UPLOAD_COLOR : phase === 'latency' ? '#fbbf24' : DOWNLOAD_COLOR;
  const progress = running
    ? Math.max(0, Math.min(1, result?.progress ?? 0))
    : result?.state === 'done'
      ? 1
      : 0;
  const tested = formatTestedAt(result?.tested_at);
  const failed = result?.state === 'error';
  const shownValue =
    phase === 'latency' && running ? null : gaugeValue > 0 || phase === 'done' ? gaugeValue : null;
  const buttonLabel = running
    ? phase === 'latency'
      ? 'Measuring latency…'
      : phase === 'upload'
        ? 'Testing upload…'
        : 'Testing download…'
    : failed
      ? 'Try again'
      : result?.state === 'done'
        ? 'Test again'
        : 'Run speed test';

  const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDuration(event.target.value.replace(/\D/g, '').slice(0, 2));
  };
  const handleDurationBlur = () => {
    setDuration(String(activeDuration));
  };
  const handleRun = () => {
    const seconds = activeDuration;
    setDuration(String(seconds));
    onRun(seconds);
  };

  return (
    <ControlPanel
      label="Speed test"
      icon={<Zap size={14} className="text-[#7dd3fc]" />}
      className="h-full"
      footer={
        <PanelFooterRow
          left={
            failed ? (
              <span className="truncate text-red-400" title={result?.message}>
                Test failed
              </span>
            ) : (
              `${result?.server ?? 'Cloudflare'} · ${activeDuration}s test`
            )
          }
          right={
            running
              ? 'Sampling…'
              : tested
                ? `Last run ${tested}`
                : failed
                  ? 'Not completed'
                  : 'Not run yet'
          }
        />
      }
    >
      <div className="flex flex-1 flex-col justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <SpeedGauge
            value={shownValue}
            max={gaugeMax}
            progress={progress}
            accent={accent}
            label={phaseLabel(phase)}
            running={running}
          />
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
            <Readout
              label="Ping"
              value={formatPing(result?.ping_ms)}
              unit="ms"
            />
            <Readout
              label="Jitter"
              value={formatPing(result?.jitter_ms)}
              unit="ms"
            />
            <Readout
              label="Down"
              value={formatSpeed(result?.download_mbps)}
              unit="Mbps"
              accent={DOWNLOAD_COLOR}
            />
            <Readout
              label="Up"
              value={formatSpeed(result?.upload_mbps)}
              unit="Mbps"
              accent={UPLOAD_COLOR}
            />
          </div>
        </div>

        <SpeedChart samples={samples} max={chartMax} running={running} />

        <div className="flex h-8 shrink-0 items-stretch gap-1.5">
          <label
            className={`flex shrink-0 items-center gap-1 rounded-lg border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] px-2 transition ${
              running ? 'opacity-55' : 'hover:border-[var(--aether-line)]'
            }`}
            title={`Test duration (${MIN_DURATION_SECONDS}–${MAX_DURATION_SECONDS} seconds)`}
          >
            <Timer size={10} className="shrink-0 text-[var(--aether-text-3)]" aria-hidden />
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={duration}
              onChange={handleDurationChange}
              onBlur={handleDurationBlur}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !running) handleRun();
              }}
              disabled={running}
              maxLength={2}
              aria-label="Test duration in seconds"
              title={`${MIN_DURATION_SECONDS}–${MAX_DURATION_SECONDS} seconds`}
              className="w-5 bg-transparent text-center font-mono text-[10.5px] leading-none text-[var(--aether-text-1)] outline-none disabled:cursor-wait"
            />
            <span className="text-[7px] uppercase tracking-[0.1em] text-[var(--aether-text-3)]">
              s
            </span>
          </label>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            aria-busy={running}
            className="accent-fill flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-[10px] font-semibold transition disabled:cursor-wait disabled:opacity-70"
          >
            {running ? (
              <>
                <Loader2 size={12} className="shrink-0 animate-spin" />
                <span className="truncate">{buttonLabel}</span>
              </>
            ) : (
              <>
                <Zap size={12} className="shrink-0" />
                <span className="truncate">{buttonLabel}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </ControlPanel>
  );
};
