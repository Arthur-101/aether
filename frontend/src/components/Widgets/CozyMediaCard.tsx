import React, { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Music2, Pause, Play } from 'lucide-react';
import type { MediaControlAction, MediaSnapshot } from '../../types/ipc';
import {
  WIDGET_AUDIO_EVENT,
  type AudioLevelPayload,
} from '../../widgets/types';

interface CozyMediaCardProps {
  media: MediaSnapshot | null;
  onControl: (action: MediaControlAction) => void;
}

interface WaveLine {
  y: number;
  amplitude: number;
  opacity: number;
}

/**
 * Five flowing lines per side. The paths start and end outside the viewBox so
 * the horizontal drift never reveals a gap at the card edge.
 */
const WAVE_LINES: WaveLine[] = [
  { y: 50, amplitude: 7, opacity: 0.95 },
  { y: 38, amplitude: 9.5, opacity: 0.62 },
  { y: 62, amplitude: 8.5, opacity: 0.62 },
  { y: 27, amplitude: 5, opacity: 0.38 },
  { y: 73, amplitude: 5, opacity: 0.38 },
];

function wavePath({ y, amplitude }: WaveLine): string {
  return `M-20 ${y} Q -5 ${y - amplitude} 10 ${y} T 40 ${y} T 70 ${y} T 100 ${y} T 130 ${y}`;
}

/**
 * Subscribes the card to the 30 Hz level stream without putting the values in
 * React state. The waves read CSS variables, so only style recalculation runs
 * between audio frames.
 */
function useAudioReactiveWaves(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;

    void listen<AudioLevelPayload>(WIDGET_AUDIO_EVENT, (event) => {
      const node = rootRef.current;
      if (!node) return;
      const levels = event.payload?.levels ?? [];
      for (let index = 0; index < 5; index += 1) {
        // The meter keeps a floor so quiet passages still show a line. Squaring
        // that value gives the waves more contrast: quiet stays a near-flat
        // brush and a beat opens the bundle wide instead of hovering near full.
        const level = levels[index] ?? 0;
        node.style.setProperty(
          `--cozy-level-${index + 1}`,
          String(level ** 1.8)
        );
      }
      node.style.setProperty('--cozy-energy', String(event.payload?.energy ?? 0));
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [rootRef]);
}

const CozyWaves: React.FC<{ mirrored?: boolean }> = ({ mirrored = false }) => (
  <svg
    aria-hidden
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    className={`cozy-waves h-full w-full text-[var(--cozy-wave)] ${
      mirrored ? '-scale-x-100' : ''
    }`}
  >
    {WAVE_LINES.map((line, index) => (
      <path
        key={index}
        d={wavePath(line)}
        className="cozy-wave-line"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.35}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity={line.opacity}
      />
    ))}
  </svg>
);

const CozyArtwork: React.FC<{
  src: string | null;
  playing: boolean;
  canToggle: boolean;
  onToggle: () => void;
}> = ({ src, playing, canToggle, onToggle }) => {
  const [failed, setFailed] = useState(false);

  return (
    <div className="group/art relative h-[120px] w-[120px] shrink-0">
      <div className="h-full w-full overflow-hidden rounded-[26px] shadow-[0_18px_40px_rgba(61,35,44,0.38)] ring-1 ring-white/60">
        {src && !failed ? (
          <img
            src={src}
            alt="Album art"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#f7d9bb,#e8a6a2_46%,#9dbccd)]">
            <div className="relative flex h-[64%] w-[64%] items-center justify-center rounded-full border border-white/55 bg-white/20 shadow-[inset_0_1px_10px_rgba(255,255,255,0.45)]">
              <div className="absolute inset-[22%] rounded-full border border-white/25" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#4a2f39]/75 ring-2 ring-white/50" />
              <Music2 size={14} className="absolute -right-1 -top-1 text-white/80" />
            </div>
          </div>
        )}
      </div>

      {/* Playback controls stay hidden until the artwork is hovered or
          keyboard-focused. `focus-visible` (not `focus-within`) matters: after
          a mouse click the button keeps focus, and the old `focus-within`
          kept the overlay on screen until the next track replaced the
          artwork. Keyboard focus still reveals it. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[26px] bg-black/25 opacity-0 backdrop-blur-[1.5px] transition-opacity duration-200 group-hover/art:pointer-events-auto group-hover/art:opacity-100 group-focus-visible/art:pointer-events-auto group-focus-visible/art:opacity-100">
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          disabled={!canToggle}
          onClick={onToggle}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-[#3a2a2c] shadow-[0_8px_24px_rgba(58,32,40,0.35)] backdrop-blur-md transition hover:scale-105 hover:bg-white disabled:cursor-default disabled:opacity-60"
        >
          {playing ? (
            <Pause size={19} fill="currentColor" />
          ) : (
            <Play size={19} fill="currentColor" />
          )}
        </button>
      </div>
    </div>
  );
};

/**
 * The alternate cozy media card.
 *
 * The artwork is the anchor: it sits in the middle of a warm colour wash with
 * two mirrored SVG wave fields flowing beside it. The waves are pure CSS
 * keyframes, so there is no per-frame JavaScript. Play/pause is revealed over
 * the artwork, and the card deliberately leaves out the timeline and transport
 * dock that the default glass theme carries.
 */
export const CozyMediaCard: React.FC<CozyMediaCardProps> = ({
  media,
  onControl,
}) => {
  const hasSession = Boolean(media?.available && media.has_session);
  const session = hasSession ? media : null;
  const playing = Boolean(session?.is_playing);
  const title = session?.title?.trim() || 'Nothing playing';
  const subtitle = session
    ? session.artist?.trim() ||
      session.album?.trim() ||
      session.source_label?.trim() ||
      'Unknown artist'
    : 'Play Spotify or browser audio';
  const canToggle = Boolean(
    session && (playing ? session.can_pause : session.can_play)
  );
  const cardRef = useRef<HTMLDivElement>(null);
  useAudioReactiveWaves(cardRef);

  return (
    <div
      ref={cardRef}
      data-cozy-card
      className="flex h-full w-full flex-col items-center justify-center"
    >
      <div
        className={`flex h-[120px] w-full items-center justify-center gap-2 ${
          playing ? 'cozy-waves--playing' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <CozyWaves />
        </div>
        <CozyArtwork
          key={session?.artwork ?? 'none'}
          src={session?.artwork ?? null}
          playing={playing}
          canToggle={canToggle}
          onToggle={() => onControl('play_pause')}
        />
        <div className="min-w-0 flex-1">
          <CozyWaves mirrored />
        </div>
      </div>

      <div className="mt-2 w-full min-w-0 px-2 text-center">
        <div
          data-cozy-title
          data-media-title
          className="truncate text-[15px] font-semibold leading-tight text-[var(--aether-text-1)]"
        >
          {title}
        </div>
        <div className="mt-0.5 truncate text-[10px] leading-tight text-[var(--aether-text-3)]">
          {subtitle}
        </div>
      </div>
    </div>
  );
};
