import React, { useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type {
  AudioOutputDevice,
  MediaControlAction,
  MediaSnapshot,
  WidgetTheme,
} from '../../types/ipc';
import { formatTime, usePosition } from '../Island/MediaWidget';
import { CozyMediaCard } from './CozyMediaCard';

interface DesktopMediaWidgetProps {
  media: MediaSnapshot | null;
  audioDevices: AudioOutputDevice[];
  onControl: (action: MediaControlAction) => void;
  theme?: WidgetTheme;
}

/** The active endpoint, shortened to the part before its driver description. */
function outputLabel(devices: AudioOutputDevice[]): string {
  const active = devices.find((device) => device.active);
  const name = active?.name?.trim();
  if (!name) return 'Speakers';
  return name.split('(')[0].trim() || name;
}

const MediaArtwork: React.FC<{ src: string | null; size: number }> = ({
  src,
  size,
}) => {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt="Album art"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-2xl object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  // A vinyl placeholder keeps the empty card from looking like a broken image.
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl border border-[var(--aether-line)] bg-[var(--aether-fill)]"
      style={{ width: size, height: size }}
    >
      <div
        className="flex items-center justify-center rounded-full border border-[var(--aether-line)] bg-[var(--aether-fill-2)]"
        style={{ width: size * 0.68, height: size * 0.68 }}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--aether-accent)]" />
      </div>
    </div>
  );
};

/**
 * The original popped-out media card: a compact session header, artwork on the
 * left, and a progress dock with transport controls.
 */
const DefaultMediaCard: React.FC<
  Omit<DesktopMediaWidgetProps, 'theme'>
> = ({ media, audioDevices, onControl }) => {
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

  const controlClass =
    'flex h-7 w-7 items-center justify-center rounded-full text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)] disabled:cursor-default disabled:opacity-35';

  return (
    <div className="flex h-full w-full flex-col justify-between px-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[8.5px] font-semibold uppercase tracking-[0.18em] text-[var(--aether-text-3)]">
          Media session
        </span>
        <span className="flex min-w-0 max-w-[150px] items-center gap-1.5 rounded-full border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-1 text-[8.5px] font-semibold text-[var(--aether-text-2)]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--aether-accent)]" />
          <span className="truncate">{outputLabel(audioDevices)}</span>
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <MediaArtwork
          key={session?.artwork ?? 'none'}
          src={session?.artwork ?? null}
          size={64}
        />
        <div className="min-w-0 flex-1">
          <div
            data-media-title
            className="truncate text-[17px] font-semibold leading-tight text-[var(--aether-text-1)]"
          >
            {title}
          </div>
          <div className="mt-1 truncate text-[11px] text-[var(--aether-text-3)]">
            {subtitle}
          </div>
        </div>
        <div
          aria-hidden
          className={`flex h-7 shrink-0 items-end gap-[3px] ${
            playing
              ? 'aether-equalizer text-[var(--aether-accent-text)]'
              : 'text-[var(--aether-text-4)]'
          }`}
        >
          {[0.5, 0.75, 1, 0.62, 0.86].map((scale, index) => (
            <span
              key={index}
              className="w-[2.5px] rounded-full bg-current"
              style={{ height: `${scale * 100}%` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-[var(--aether-line)] bg-[var(--aether-fill)] px-3 py-2.5">
        <div className="relative h-1 w-full rounded-full bg-[var(--aether-fill-3)]">
          <div
            className="h-full rounded-full bg-[var(--aether-accent)]"
            style={{ width: `${progress}%` }}
          />
          {progress > 0 ? (
            <span
              className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--aether-accent)]"
              style={{ left: `${progress}%` }}
            />
          ) : null}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1 font-mono text-[9px] tabular-nums">
            <span className="text-[var(--aether-accent-text)]">
              {formatTime(position)}
            </span>
            <span className="text-[var(--aether-text-4)]">/</span>
            <span className="text-[var(--aether-text-3)]">
              {duration > 0 ? formatTime(duration) : '--:--'}
            </span>
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
              <SkipBack size={14} />
            </button>
            <button
              type="button"
              aria-label={playing ? 'Pause' : 'Play'}
              title={playing ? 'Pause' : 'Play'}
              disabled={!canToggle}
              onClick={() => onControl('play_pause')}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--aether-accent)] text-[var(--aether-accent-contrast)] transition hover:brightness-110 disabled:cursor-default disabled:opacity-75"
            >
              {playing ? (
                <Pause size={15} fill="currentColor" />
              ) : (
                <Play size={15} fill="currentColor" />
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
              <SkipForward size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * The popped-out media widget.
 *
 * It keeps the full session card even when nothing is playing, so the widget
 * never collapses into a different shape. The island's compact media row is a
 * separate component; this one is tuned for the desktop card. `theme` picks
 * between the original glass card and the alternate cozy artwork card.
 */
export const DesktopMediaWidget: React.FC<DesktopMediaWidgetProps> = ({
  theme = 'default',
  ...props
}) => {
  if (theme === 'cozy') {
    return (
      <CozyMediaCard media={props.media} onControl={props.onControl} />
    );
  }
  return <DefaultMediaCard {...props} />;
};
