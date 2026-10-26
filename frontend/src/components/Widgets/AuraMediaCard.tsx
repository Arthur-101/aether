import React, { useState } from 'react';
import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type {
  AudioOutputDevice,
  MediaControlAction,
  MediaSnapshot,
} from '../../types/ipc';
import { formatTime, usePosition } from '../Island/MediaWidget';

interface AuraMediaCardProps {
  media: MediaSnapshot | null;
  audioDevices: AudioOutputDevice[];
  onControl: (action: MediaControlAction) => void;
}

function outputLabel(devices: AudioOutputDevice[]): string {
  const active = devices.find((device) => device.active);
  const name = active?.name?.trim();
  if (!name) return 'Speakers';
  return name.split('(')[0].trim() || name;
}

const AuraArtwork: React.FC<{ src: string | null }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src && !failed);

  return (
    <div className="relative h-[96px] w-[96px] shrink-0 overflow-hidden rounded-[20px] shadow-[0_16px_34px_rgba(8,8,14,0.32)] ring-1 ring-white/30">
      {showImage ? (
        <img
          src={src ?? ''}
          alt="Album art"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(145deg,rgba(255,255,255,0.24),rgba(255,255,255,0.06))]">
          <div className="relative flex h-[62%] w-[62%] items-center justify-center rounded-full border border-white/35 bg-black/10">
            <div className="absolute inset-[18%] rounded-full border border-white/20" />
            <Music2 size={18} className="relative text-white/70" aria-hidden />
          </div>
        </div>
      )}
    </div>
  );
};

const controlClass =
  'flex h-7 w-7 items-center justify-center rounded-full border border-[var(--aura-line)] bg-[var(--aether-fill)] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)] disabled:cursor-default disabled:opacity-30';

/**
 * The aura media face. The frame paints the blurred full-bleed artwork and the
 * colour mesh; this face floats a sharp cover and a thin transport row on top,
 * with the progress bar running along the card's bottom edge.
 */
export const AuraMediaCard: React.FC<AuraMediaCardProps> = ({
  media,
  audioDevices,
  onControl,
}) => {
  const hasSession = Boolean(media?.available && media.has_session);
  const session = hasSession ? media : null;
  const position = usePosition(session);
  const playing = Boolean(session?.is_playing);
  const title = session?.title?.trim() || 'Nothing playing';
  const subtitle = session
    ? session.artist?.trim() ||
      session.album?.trim() ||
      session.source_label?.trim() ||
      'Unknown artist'
    : 'Play Spotify or browser audio';
  const duration = session?.duration_seconds ?? 0;
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const canToggle = Boolean(
    session && (playing ? session.can_pause : session.can_play)
  );

  return (
    <div className="relative flex h-full w-full flex-col px-3 pb-0 pt-3">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, var(--aura-media-scrim), transparent 64%)',
        }}
      />

      <div className="relative z-10 flex items-center justify-between gap-2 pr-12">
        <span className="text-[8px] font-medium uppercase tracking-[0.22em] text-[var(--aether-text-3)]">
          Now playing
        </span>
        <span className="flex min-w-0 max-w-[150px] items-center gap-1.5 rounded-full border border-[var(--aura-line)] bg-[var(--aether-fill)] px-2 py-0.5 text-[8px] text-[var(--aether-text-2)]">
          <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--aether-accent)]" />
          <span className="truncate">{outputLabel(audioDevices)}</span>
        </span>
      </div>

      <div className="relative z-10 mt-2 flex min-h-0 flex-1 items-center gap-3">
        <AuraArtwork
          key={session?.artwork ?? 'none'}
          src={session?.artwork ?? null}
        />
        <div className="min-w-0 flex-1">
          <div
            data-media-title
            className="line-clamp-2 text-[20px] font-medium leading-[1.1] tracking-[-0.01em] text-[var(--aether-text-1)]"
          >
            {title}
          </div>
          <div className="mt-1 truncate text-[11px] text-[var(--aether-text-2)]">
            {subtitle}
          </div>
          <div className="mt-0.5 truncate text-[9px] text-[var(--aether-text-4)]">
            {session?.album?.trim() || (session ? 'Single' : 'No media session')}
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-auto flex items-center justify-between gap-2 pb-4">
        <div className="flex items-baseline gap-1 font-mono text-[9px] tabular-nums text-[var(--aether-text-3)]">
          <span className="text-[var(--aether-text-1)]">
            {formatTime(position)}
          </span>
          <span className="text-[var(--aether-text-4)]">/</span>
          <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous track"
            title="Previous track"
            disabled={!session?.can_previous}
            onClick={() => onControl('previous')}
            className={controlClass}
          >
            <SkipBack size={13} />
          </button>
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause' : 'Play'}
            disabled={!canToggle}
            onClick={() => onControl('play_pause')}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--aether-accent)] text-[var(--aether-accent-contrast)] transition hover:brightness-110 disabled:cursor-default disabled:opacity-60"
            style={{
              boxShadow:
                '0 0 18px color-mix(in srgb, var(--aether-accent) 55%, transparent)',
            }}
          >
            {playing ? (
              <Pause size={14} fill="currentColor" />
            ) : (
              <Play size={14} fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            aria-label="Next track"
            title="Next track"
            disabled={!session?.can_next}
            onClick={() => onControl('next')}
            className={controlClass}
          >
            <SkipForward size={13} />
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[2px] bg-[var(--aether-fill-3)]">
        <div
          className="h-full bg-[var(--aether-accent)]"
          style={{
            width: `${progress}%`,
            boxShadow: '0 0 12px var(--aether-accent)',
          }}
        />
      </div>
    </div>
  );
};
