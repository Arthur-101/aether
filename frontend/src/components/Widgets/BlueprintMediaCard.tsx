import React, { useState } from 'react';
import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type {
  AudioOutputDevice,
  MediaControlAction,
  MediaSnapshot,
} from '../../types/ipc';
import { formatTime, usePosition } from '../Island/MediaWidget';

interface BlueprintMediaCardProps {
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

const BlueprintArtwork: React.FC<{ src: string | null }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src && !failed);

  return (
    <div className="blueprint-art group/art relative h-[102px] w-[102px] shrink-0 overflow-hidden border border-[var(--aether-line-strong)] bg-[var(--aether-fill)]">
      {showImage ? (
        <img
          src={src ?? ''}
          alt="Album art"
          onError={() => setFailed(true)}
          className="blueprint-art-img h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div className="relative flex h-14 w-14 items-center justify-center border border-[var(--aether-line)]">
            <div className="absolute inset-2 border border-[var(--aether-line-soft)]" />
            <Music2
              size={14}
              className="relative text-[var(--aether-text-4)]"
              aria-hidden
            />
          </div>
        </div>
      )}
      <span
        aria-hidden
        className="blueprint-art-grid pointer-events-none absolute inset-0"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-[rgba(220,240,255,0.25)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/2 h-px w-full bg-[rgba(220,240,255,0.25)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-1 border border-[rgba(220,240,255,0.18)]"
      />
      <span className="absolute bottom-1 left-1 bg-[rgba(9,24,40,0.74)] px-0.5 font-mono text-[6px] uppercase tracking-[0.16em] text-[var(--aether-text-2)]">
        Art / 01
      </span>
      <span
        aria-hidden
        className="absolute right-1 top-1 h-1 w-1 border border-[var(--aether-accent)]"
      />
    </div>
  );
};

const transportClass =
  'flex h-6 w-6 items-center justify-center border border-[var(--aether-line)] bg-transparent text-[var(--aether-text-2)] transition hover:border-[var(--aether-line-strong)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] disabled:cursor-default disabled:opacity-30';

const playClass =
  'flex h-6 w-6 items-center justify-center border border-[var(--aether-accent)] bg-[var(--aether-accent)] text-[var(--aether-accent-contrast)] transition hover:brightness-110 disabled:cursor-default disabled:opacity-30';

/**
 * The blueprint media face. The card is a test-bench readout: a duotone proof
 * cover with registration marks, mono data fields, a ticked progress rail, and
 * square transport keys. There is no glass, blur, or soft shadow.
 */
export const BlueprintMediaCard: React.FC<BlueprintMediaCardProps> = ({
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
    <div className="flex h-full w-full flex-col px-3.5 pb-3 pt-2.5">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--aether-line)] pb-1 pr-14">
        <span className="flex items-center gap-1.5 font-mono text-[7.5px] font-semibold uppercase tracking-[0.22em] text-[var(--aether-text-2)]">
          <span className="h-1 w-1 bg-[var(--aether-accent)]" />
          Audio in
        </span>
        <span className="min-w-0 truncate font-mono text-[7.5px] uppercase tracking-[0.12em] text-[var(--aether-text-4)]">
          {outputLabel(audioDevices)}
        </span>
      </div>

      <div className="mt-2.5 flex min-h-0 flex-1 items-start gap-3">
        <BlueprintArtwork
          key={session?.artwork ?? 'none'}
          src={session?.artwork ?? null}
        />

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center justify-between gap-2 font-mono text-[7px] uppercase tracking-[0.16em] text-[var(--aether-text-4)]">
            <span>Track</span>
            <span>{playing ? 'Live' : session ? 'Hold' : 'Idle'}</span>
          </div>
          <div
            data-media-title
            className="mt-0.5 line-clamp-2 font-mono text-[18px] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--aether-text-1)]"
          >
            {title}
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-[var(--aether-text-3)]">
            {subtitle}
          </div>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t border-[var(--aether-line-soft)] pt-1.5 font-mono text-[7px] uppercase tracking-[0.12em]">
            <span className="text-[var(--aether-text-4)]">Album</span>
            <span className="truncate text-[var(--aether-text-3)]">
              {session?.album?.trim() || (session ? 'Single' : 'No signal')}
            </span>
            <span className="text-[var(--aether-text-4)]">Source</span>
            <span className="truncate text-[var(--aether-text-3)]">
              {session?.source_label?.trim() || 'Aether desktop'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2 border-t border-[var(--aether-line)] pt-1.5">
        <div className="flex items-baseline justify-between font-mono text-[8px] tabular-nums">
          <span className="text-[var(--aether-text-1)]">
            {formatTime(position)}
          </span>
          <span className="text-[var(--aether-text-4)]">
            {duration > 0 ? formatTime(duration) : '--:--'}
          </span>
        </div>
        <div className="relative mt-1 h-[3px] w-full bg-[var(--aether-fill-3)]">
          <div
            className="absolute inset-y-0 left-0 bg-[var(--aether-accent)]"
            style={{ width: `${progress}%` }}
          />
          {[25, 50, 75].map((tick) => (
            <span
              key={tick}
              aria-hidden
              className="absolute -top-[2px] h-[7px] w-px bg-[var(--aether-line-strong)]"
              style={{ left: `${tick}%` }}
            />
          ))}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="font-mono text-[7px] uppercase tracking-[0.16em] text-[var(--aether-text-4)]">
            {playing ? 'Transmit' : session ? 'Standby' : 'No signal'}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous track"
              title="Previous track"
              disabled={!session?.can_previous}
              onClick={() => onControl('previous')}
              className={transportClass}
            >
              <SkipBack size={11} />
            </button>
            <button
              type="button"
              aria-label={playing ? 'Pause' : 'Play'}
              title={playing ? 'Pause' : 'Play'}
              disabled={!canToggle}
              onClick={() => onControl('play_pause')}
              className={playClass}
            >
              {playing ? (
                <Pause size={11} fill="currentColor" />
              ) : (
                <Play size={11} fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              aria-label="Next track"
              title="Next track"
              disabled={!session?.can_next}
              onClick={() => onControl('next')}
              className={transportClass}
            >
              <SkipForward size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
