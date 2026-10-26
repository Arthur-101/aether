import React, { useState } from 'react';
import { Music2 } from 'lucide-react';
import type {
  AudioOutputDevice,
  MediaControlAction,
  MediaSnapshot,
} from '../../types/ipc';
import { formatTime, usePosition } from '../Island/MediaWidget';

interface NewsprintMediaCardProps {
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

const NewsprintArtwork: React.FC<{ src: string | null }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src && !failed);

  return (
    <div className="newsprint-art group/art relative h-[102px] w-[102px] shrink-0 overflow-hidden border border-[var(--aether-line-strong)] bg-[var(--aether-fill)]">
      {showImage ? (
        <img
          src={src ?? ''}
          alt="Album art"
          onError={() => setFailed(true)}
          className="newsprint-art-img h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[var(--aether-line)]">
            <div className="absolute inset-[14%] rounded-full border border-[var(--aether-line-soft)]" />
            <div className="absolute inset-[32%] rounded-full border border-[var(--aether-line-soft)]" />
            <Music2
              size={16}
              className="relative text-[var(--aether-text-4)]"
              aria-hidden
            />
          </div>
        </div>
      )}
      <span aria-hidden className="newsprint-halftone pointer-events-none absolute inset-0" />
    </div>
  );
};

const transportClass =
  'border border-transparent px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--aether-text-2)] transition hover:border-[var(--aether-line)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] disabled:cursor-default disabled:opacity-30';

/**
 * The newsprint media face. The card reads as a printed concert ticket: a
 * halftone cover, a perforated control strip, and bracket text transport in
 * place of the glass dock. Colour returns to the cover only on hover/focus.
 */
export const NewsprintMediaCard: React.FC<NewsprintMediaCardProps> = ({
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
      <div className="flex items-center justify-between gap-2 border-b border-[var(--aether-line)] pb-1 pr-12">
        <span className="font-serif text-[8px] font-semibold uppercase tracking-[0.22em] text-[var(--aether-text-2)]">
          Now playing
        </span>
        <span className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--aether-text-4)]">
          {outputLabel(audioDevices)}
        </span>
      </div>

      <div className="mt-2.5 flex min-h-0 flex-1 items-start gap-3">
        <NewsprintArtwork
          key={session?.artwork ?? 'none'}
          src={session?.artwork ?? null}
        />

        <div className="min-w-0 flex-1 pt-0.5">
          <div
            data-media-title
            className="line-clamp-2 font-serif text-[20px] font-semibold leading-[1.05] tracking-[-0.01em] text-[var(--aether-text-1)]"
          >
            {title}
          </div>
          <div className="mt-1 truncate font-serif text-[11px] italic text-[var(--aether-text-3)]">
            {subtitle}
          </div>
          <div className="mt-2 border-t border-dashed border-[var(--aether-line-soft)] pt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--aether-text-4)]">
            <span className="block truncate">
              {session?.album?.trim() || (session ? 'Single' : 'No signal')}
            </span>
            <span className="mt-0.5 block text-[var(--aether-text-3)]">
              {session?.source_label?.trim() || 'Aether desktop'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2 border-t border-dashed border-[var(--aether-line)] pt-1.5">
        <div className="flex items-baseline justify-between font-mono text-[8px] tabular-nums">
          <span className="text-[var(--aether-text-1)]">
            {formatTime(position)}
          </span>
          <span className="text-[var(--aether-text-3)]">
            {duration > 0 ? formatTime(duration) : '--:--'}
          </span>
        </div>
        <div className="mt-1 h-[2px] w-full bg-[var(--aether-fill-3)]">
          <div
            className="h-full bg-[var(--aether-text-1)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="font-serif text-[8px] uppercase tracking-[0.18em] text-[var(--aether-text-4)]">
            {playing ? 'On air' : session ? 'Paused' : 'Off air'}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Previous track"
              title="Previous track"
              disabled={!session?.can_previous}
              onClick={() => onControl('previous')}
              className={transportClass}
            >
              [ Prev ]
            </button>
            <button
              type="button"
              aria-label={playing ? 'Pause' : 'Play'}
              title={playing ? 'Pause' : 'Play'}
              disabled={!canToggle}
              onClick={() => onControl('play_pause')}
              className={transportClass}
            >
              [ {playing ? 'Pause' : 'Play'} ]
            </button>
            <button
              type="button"
              aria-label="Next track"
              title="Next track"
              disabled={!session?.can_next}
              onClick={() => onControl('next')}
              className={transportClass}
            >
              [ Next ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
