/**
 * Media jobs for the Radial Wheel popups.
 *
 * The daemon sizes a compression by encoding a real sample and runs the job on
 * its own queue, so these are one HTTP read and one WebSocket submit; progress
 * arrives through the shared backend socket.
 */

import type { MediaEstimate } from '../types/ipc';

const API_BASE = 'http://127.0.0.1:8765';

export async function estimateMedia(
  filePath: string,
  quality: number,
  targetMb?: number | null
): Promise<MediaEstimate | null> {
  const params = new URLSearchParams({
    path: filePath,
    quality: String(quality),
  });
  if (targetMb && targetMb > 0) params.set('target_mb', String(targetMb));

  try {
    const response = await fetch(`${API_BASE}/api/media/estimate?${params}`);
    if (!response.ok) return null;
    return (await response.json()) as MediaEstimate;
  } catch (err) {
    console.error('Media estimate failed:', err);
    return null;
  }
}

const AV_EXTENSIONS =
  /\.(mp4|mov|mkv|avi|webm|m4v|wmv|flv|mp3|wav|m4a|aac|ogg|opus|flac|wma)$/i;

/** True for the files FFmpeg converts and can report progress for. */
export function isTimedMedia(filePath: string): boolean {
  return AV_EXTENSIONS.test(filePath);
}

/** A job id the popup can track from submit through to its result. */
export function newMediaJobId(): string {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Saving as a whole percentage; negative values mean the file would grow. */
export function savingPercent(estimate: MediaEstimate | null): number | null {
  if (!estimate?.ratio || !Number.isFinite(estimate.ratio)) return null;
  return Math.round((1 - estimate.ratio) * 100);
}
