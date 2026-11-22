import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  CircleAlert,
  FileArchive,
  Loader2,
  Square,
  X,
} from 'lucide-react';
import type { MediaEstimate, MediaJob } from '../../types/ipc';
import { estimateMedia, savingPercent } from '../../lib/media';
import { formatBytes } from '../Island/statsFormat';

export interface MediaDialog {
  filePath: string;
  mode: 'compress' | 'convert';
  /** Target format, for a conversion. */
  format?: string;
  /** Set once the job is submitted; from then on this is a progress view. */
  jobId?: string;
}

interface CompressModalProps {
  dialog: MediaDialog | null;
  /** The job this dialog started, as the backend currently sees it. */
  job: MediaJob | null;
  /** What is running or queued right now, for the "waits its turn" hint. */
  activeJob: MediaJob | null;
  onStart: (quality: number, targetMb: number | null) => void;
  onStop: () => void;
  onClose: () => void;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export const CompressModal: React.FC<CompressModalProps> = ({
  dialog,
  job,
  activeJob,
  onStart,
  onStop,
  onClose,
}) => {
  const [quality, setQuality] = useState(65);
  const [useTarget, setUseTarget] = useState(false);
  const [targetMb, setTargetMb] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<MediaEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialogPath = dialog?.filePath || '';
  const seenPath = useRef('');

  // A new file starts from the defaults; the estimate fills the rest in.
  useEffect(() => {
    if (!dialogPath) return;
    if (seenPath.current === dialogPath) return;
    seenPath.current = dialogPath;
    setQuality(65);
    setUseTarget(false);
    setTargetMb(null);
    setEstimate(null);
    setFailed(false);
  }, [dialogPath]);

  const optionsOpen = Boolean(dialog && !dialog.jobId && dialog.mode === 'compress');
  const queuedAhead = Boolean(activeJob && activeJob.id !== dialog?.jobId);

  // Target mode starts at about half the source size, which is the saving most
  // people expect; the field can still be overwritten.
  const defaultTargetMb =
    estimate?.original_bytes != null
      ? Number((estimate.original_bytes / (1024 * 1024) / 2).toFixed(1))
      : null;
  const effectiveTarget = useTarget ? targetMb ?? defaultTargetMb : null;

  // Encoding a sample takes a moment, so wait for the slider to settle.
  useEffect(() => {
    if (!optionsOpen || !dialogPath) return;
    let cancelled = false;
    setEstimating(true);
    const timer = window.setTimeout(() => {
      void estimateMedia(dialogPath, quality, effectiveTarget).then((result) => {
        if (cancelled) return;
        setEstimating(false);
        if (result) {
          setEstimate(result);
          setFailed(false);
        } else {
          setFailed(true);
        }
      });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsOpen, dialogPath, quality, useTarget, targetMb]);

  const lossless = estimate?.lossless ?? /\.pdf$/i.test(dialogPath);
  const queued = job?.status === 'queued';
  const running = job?.status === 'running';
  const finished = job?.status === 'done';
  const stopped = job?.status === 'cancelled';
  const errored = job?.status === 'error';
  const percent =
    job?.progress == null ? null : Math.max(0, Math.min(100, Math.round(job.progress * 100)));

  const saving = useMemo(() => savingPercent(estimate), [estimate]);
  const qualityHint = estimate
    ? estimate.lossless
      ? 'Lossless · the quality slider does not apply'
      : [
          estimate.quality_label,
          estimate.ssim != null ? `${Math.round(estimate.ssim * 100)}% similar` : null,
          estimate.detail,
        ]
          .filter(Boolean)
          .join(' · ')
    : '';

  if (!dialog) return null;

  const canStart =
    !dialog.jobId &&
    dialog.mode === 'compress' &&
    !estimating &&
    (!useTarget || (effectiveTarget ?? 0) > 0);

  return (
    <AnimatePresence>
      <div
        data-aether-interactive
        className="aether-interactive fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          className="glass-panel flex max-h-[calc(100vh-32px)] w-[500px] max-w-[calc(100vw-32px)] flex-col gap-3 overflow-y-auto rounded-2xl border border-[var(--aether-line)] p-5 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--aether-line-soft)] pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <FileArchive size={18} className="shrink-0 text-[var(--aether-accent-text)]" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[var(--aether-text-1)]">
                  {dialog.mode === 'convert'
                    ? `Convert to ${(dialog.format || '').toUpperCase()}`
                    : 'Compress'}
                </h3>
                <p
                  title={dialog.filePath}
                  className="truncate text-[9px] text-[var(--aether-text-4)]"
                >
                  {fileName(dialog.filePath)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title={running || queued ? 'Keep running in the background' : 'Close'}
              className="rounded-lg p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
            >
              <X size={16} />
            </button>
          </div>

          {dialog.jobId ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-[var(--aether-line)] bg-[var(--aether-fill)] p-3">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-[var(--aether-text-2)]">
                    {running || queued ? (
                      <Loader2 size={12} className="shrink-0 animate-spin" />
                    ) : finished ? (
                      <CheckCircle2 size={12} className="shrink-0 text-[var(--aether-accent-text)]" />
                    ) : (
                      <CircleAlert size={12} className="shrink-0 text-[var(--aether-danger)]" />
                    )}
                    <span className="truncate">
                      {queued
                        ? job?.message || 'Waiting for the current job...'
                        : running
                          ? 'Working...'
                          : job?.message || (finished ? 'Done.' : '')}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[var(--aether-text-2)]">
                    {percent == null ? '' : `${percent}%`}
                  </span>
                </div>

                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--aether-surface-3)]">
                  {percent == null ? (
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--aether-accent)] motion-reduce:animate-none" />
                  ) : (
                    <div
                      className="h-full rounded-full bg-[var(--aether-accent)] transition-[width] duration-200"
                      style={{ width: `${percent}%` }}
                    />
                  )}
                </div>

                {finished && job?.result ? (
                  <p className="mt-2 truncate text-[9px] text-[var(--aether-text-3)]" title={job.result}>
                    Saved next to the original as {fileName(job.result)}
                  </p>
                ) : null}
                {errored ? (
                  <p className="mt-2 text-[9px] leading-snug text-[var(--aether-danger)]">
                    {job?.message}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-[var(--aether-line-soft)] pt-2">
                <p className="text-[9px] text-[var(--aether-text-4)]">
                  {running || queued
                    ? 'Closing this window keeps it running in the pill.'
                    : stopped
                      ? 'Stopped. The partial output was removed.'
                      : 'The output stays next to the original file.'}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {running || queued ? (
                    <button
                      type="button"
                      onClick={onStop}
                      className="flex items-center gap-1.5 rounded-xl border border-[var(--aether-line)] px-3 py-1.5 text-xs text-[var(--aether-text-2)] transition hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]"
                    >
                      <Square size={11} />
                      Stop
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    className="accent-fill rounded-xl px-4 py-1.5 text-xs font-semibold transition hover:opacity-90"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-[var(--aether-line)] bg-[var(--aether-fill)] p-2.5">
                  <p className="text-[8.5px] uppercase tracking-[0.14em] text-[var(--aether-text-4)]">
                    Original
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] text-[var(--aether-text-1)]">
                    {estimate ? formatBytes(estimate.original_bytes) : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--aether-line)] bg-[var(--aether-fill)] p-2.5">
                  <p className="text-[8.5px] uppercase tracking-[0.14em] text-[var(--aether-text-4)]">
                    Estimate
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] text-[var(--aether-text-1)]">
                    {estimating
                      ? '…'
                      : estimate?.estimated_bytes != null
                        ? formatBytes(estimate.estimated_bytes)
                        : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--aether-line)] bg-[var(--aether-fill)] p-2.5">
                  <p className="text-[8.5px] uppercase tracking-[0.14em] text-[var(--aether-text-4)]">
                    Saving
                  </p>
                  <p
                    className={`mt-0.5 font-mono text-[12px] ${
                      saving != null && saving > 0
                        ? 'text-[var(--aether-accent-text)]'
                        : 'text-[var(--aether-text-2)]'
                    }`}
                  >
                    {saving == null ? '—' : saving > 0 ? `${saving}%` : 'None'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-[var(--aether-line)] bg-[var(--aether-fill)] p-3">
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-[var(--aether-text-2)]">Quality</span>
                  <span className="font-mono text-[var(--aether-text-2)]">
                    {lossless ? 'Lossless' : quality}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={quality}
                  disabled={lossless || useTarget}
                  onChange={(event) => setQuality(Number(event.target.value))}
                  style={{ accentColor: 'var(--aether-accent)' }}
                  className="w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                />
                <p className="text-[9px] leading-snug text-[var(--aether-text-3)]">
                  {qualityHint || (failed ? 'Size estimate unavailable for this file.' : ' ')}
                </p>

                {estimate?.kind === 'video' ? (
                  <div className="mt-1 flex items-center gap-2 border-t border-[var(--aether-line-soft)] pt-2">
                    <button
                      type="button"
                      onClick={() => setUseTarget(false)}
                      className={`rounded-md px-2 py-0.5 text-[9px] font-medium transition ${
                        useTarget
                          ? 'border border-[var(--aether-line)] text-[var(--aether-text-2)]'
                          : 'accent-fill'
                      }`}
                    >
                      Quality
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseTarget(true)}
                      className={`rounded-md px-2 py-0.5 text-[9px] font-medium transition ${
                        useTarget
                          ? 'accent-fill'
                          : 'border border-[var(--aether-line)] text-[var(--aether-text-2)]'
                      }`}
                    >
                      Target size
                    </button>
                    {useTarget ? (
                      <label className="ml-auto flex items-center gap-1.5 text-[9px] text-[var(--aether-text-3)]">
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={targetMb ?? ''}
                          onChange={(event) =>
                            setTargetMb(event.target.value ? Number(event.target.value) : null)
                          }
                          aria-label="Target size in megabytes"
                          className="w-16 rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-3)] px-1.5 py-0.5 text-right font-mono text-[10px] text-[var(--aether-text-1)] outline-none"
                        />
                        MB
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {queuedAhead ? (
                <p className="text-[9px] text-[var(--aether-text-3)]">
                  Another job is running. This one waits its turn.
                </p>
              ) : (
                <p className="text-[9px] text-[var(--aether-text-3)]">
                  The output is written next to the original, never over it.
                </p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-[var(--aether-line-soft)] pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-3 py-1.5 text-xs text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canStart}
                  onClick={() => onStart(quality, effectiveTarget)}
                  className="accent-fill rounded-xl px-4 py-1.5 text-xs font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Start
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
