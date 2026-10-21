import React, { useEffect, useState } from 'react';
import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { MediaControlAction, MediaSnapshot } from '../../types/ipc';

const SPOTIFY_GREEN = '#1DB954';

function accentFor(media: MediaSnapshot): string {
  return media.is_spotify ? SPOTIFY_GREEN : 'var(--aether-accent)';
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const seconds = Math.floor(value % 60);
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function usePosition(media: MediaSnapshot | null): number {
  const [now, setNow] = useState(() => Date.now());
  const playing = Boolean(media?.is_playing);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [playing, media?.updated_at]);
  if (!media) return 0;
  const base = Date.parse(media.updated_at) || now;
  const elapsed = media.is_playing ? Math.max(0, (now - base) / 1000) : 0;
  return Math.min(media.duration_seconds || 0, media.position_seconds + elapsed);
}

const Artwork: React.FC<{ src: string | null; size: number }> = ({ src, size }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt="Album art"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-lg object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-[#8b857a]"
      style={{ width: size, height: size }}
    >
      <Music2 size={Math.max(16, size * 0.4)} />
    </div>
  );
};

interface MediaWidgetProps {
  media: MediaSnapshot | null;
  onControl?: (action: MediaControlAction) => void;
  compact?: boolean;
}

export const MediaWidget: React.FC<MediaWidgetProps> = ({
  media,
  onControl,
  compact = false,
}) => {
  const position = usePosition(media);
  if (!media || !media.available || !media.has_session) return null;
  const accent = accentFor(media);
  const progress = media.duration_seconds
    ? Math.min(100, (position / media.duration_seconds) * 100)
    : 0;
  const canToggle = media.is_playing ? media.can_pause : media.can_play;
  const artSize = compact ? 38 : 58;
  const controlClass =
    'flex items-center justify-center rounded-full border border-white/10 text-[#d7d2c7] transition hover:border-white/25 hover:text-white disabled:cursor-default disabled:opacity-35';

  return (
    <div
      className={`rounded-xl border border-white/[0.08] bg-white/[0.035] ${
        compact ? 'px-2.5 py-2' : 'p-3.5'
      }`}
    >
      <div className="flex items-center gap-3">
        <Artwork src={media.artwork} size={artSize} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[12px] font-semibold text-[#f4f1e7]">
              {media.title}
            </span>
            <span
              className="shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide"
              style={{
                color: accent,
                borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
              }}
            >
              {media.source_label || 'Media'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-[#989188]">
            {media.artist}
            {!compact && media.album ? ` · ${media.album}` : ''}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${progress}%`, backgroundColor: accent }}
              />
            </div>
            <span className="shrink-0 font-mono text-[8px] tabular-nums text-[#8b857a]">
              {formatTime(position)} / {formatTime(media.duration_seconds)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous track"
            disabled={!media.can_previous || !onControl}
            onClick={() => onControl?.('previous')}
            className={`${controlClass} ${compact ? 'h-7 w-7' : 'h-8 w-8'}`}
          >
            <SkipBack size={13} />
          </button>
          <button
            type="button"
            aria-label={media.is_playing ? 'Pause' : 'Play'}
            disabled={!canToggle || !onControl}
            onClick={() => onControl?.('play_pause')}
            className={`${controlClass} ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}
            style={{ backgroundColor: accent, color: media.is_spotify ? '#08130c' : 'var(--aether-accent-contrast)' }}
          >
            {media.is_playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          </button>
          <button
            type="button"
            aria-label="Next track"
            disabled={!media.can_next || !onControl}
            onClick={() => onControl?.('next')}
            className={`${controlClass} ${compact ? 'h-7 w-7' : 'h-8 w-8'}`}
          >
            <SkipForward size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
