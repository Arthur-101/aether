import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { TaskbarPinnedApp } from '../../types/ipc';
import { AppDock } from './AppDock';
import { MediaBars } from './MediaBars';

interface NotchPeekProps {
  now: Date;
  width: number;
  apps: TaskbarPinnedApp[];
  mediaActive: boolean;
  spotify: boolean;
  onOpen: () => void;
  onLaunch?: (app: TaskbarPinnedApp) => void;
  onManageApps: () => void;
}

const ICON_WIDTH = 28;
const ICON_STEP = 18;
const EDGE_INSET = 16;
const CLOCK_WIDTH = 150;
const CLOCK_GAP = 6;
const MAX_PER_SIDE = 8;

function deckWidthFor(width: number): number {
  return Math.max(
    ICON_WIDTH,
    (width - EDGE_INSET * 2 - CLOCK_WIDTH - CLOCK_GAP * 2) / 2
  );
}

function iconsPerSide(width: number): number {
  const deckWidth = deckWidthFor(width);
  return Math.max(
    1,
    Math.min(MAX_PER_SIDE, Math.floor((deckWidth - ICON_WIDTH) / ICON_STEP) + 1)
  );
}

export const NotchPeek: React.FC<NotchPeekProps> = ({
  now,
  width,
  apps,
  mediaActive,
  spotify,
  onOpen,
  onLaunch,
  onManageApps,
}) => {
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const deckWidth = deckWidthFor(width);
  const perSide = iconsPerSide(width);
  const visibleCount = perSide * 2;
  const maxStart = Math.max(0, apps.length - visibleCount);
  const overflow = maxStart > 0;
  const [start, setStart] = useState(0);
  const [scrollDir, setScrollDir] = useState<-1 | 0 | 1>(0);
  const offset = Math.min(start, maxStart);

  useEffect(() => {
    if (start > maxStart) setStart(maxStart);
  }, [maxStart, start]);

  useEffect(() => {
    if (!scrollDir || !overflow) return;
    const timer = window.setInterval(() => {
      setStart((value) => {
        const current = Math.min(value, maxStart);
        return Math.max(0, Math.min(maxStart, current + scrollDir));
      });
    }, 300);
    return () => window.clearInterval(timer);
  }, [scrollDir, overflow, maxStart]);

  useEffect(() => {
    if (!overflow) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setScrollDir(0);
      setStart((value) => {
        const current = Math.min(value, maxStart);
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        return Math.max(0, Math.min(maxStart, current + delta));
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overflow, maxStart]);

  const visible = apps.slice(offset, offset + visibleCount);
  const half = Math.ceil(visible.length / 2);
  const left = visible.slice(0, half);
  const right = visible.slice(half);
  const canGoLeft = overflow && offset > 0;
  const canGoRight = overflow && offset < maxStart;
  const startEdgeScroll = (direction: -1 | 1) => {
    if (direction === -1 ? canGoLeft : canGoRight) setScrollDir(direction);
  };
  const stopEdgeScroll = () => setScrollDir(0);

  return (
    <div className="relative h-full w-full">
      {apps.length === 0 ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onManageApps();
          }}
          aria-label="Pin apps for the Aether hover deck"
          className="fluent-focus absolute left-5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] text-[#a7a299] outline-none transition hover:border-[var(--aether-accent)] hover:text-white"
        >
          <Plus size={13} />
          Pin apps
        </button>
      ) : (
        <div
          className="absolute top-1/2 flex -translate-y-1/2 items-center"
          style={{ right: `calc(50% + ${CLOCK_WIDTH / 2 + CLOCK_GAP}px)` }}
        >
          <AppDock apps={left} side="left" maxWidth={deckWidth} onLaunch={onLaunch} />
        </div>
      )}

      {overflow ? (
        <div
          className="absolute inset-y-0 left-0 z-30 w-4 cursor-w-resize"
          onPointerEnter={() => startEdgeScroll(-1)}
          onPointerLeave={stopEdgeScroll}
          onClick={(event) => event.stopPropagation()}
          aria-hidden
        />
      ) : null}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        aria-label={`Open Aether command center. ${time}`}
        className="absolute left-1/2 top-1/2 flex h-full w-[150px] -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[#f4f1e7] outline-none"
      >
        <span className="font-mono text-[13px] font-semibold tabular-nums tracking-[0.01em]">
          {time}
        </span>
        {mediaActive ? (
          <span className="pointer-events-none absolute right-0 flex items-center">
            <MediaBars active spotify={spotify} compact />
          </span>
        ) : null}
      </button>

      <div
        className="absolute top-1/2 flex -translate-y-1/2 items-center"
        style={{ left: `calc(50% + ${CLOCK_WIDTH / 2 + CLOCK_GAP}px)` }}
      >
        <AppDock apps={right} side="right" maxWidth={deckWidth} onLaunch={onLaunch} />
      </div>

      {overflow ? (
        <div
          className="absolute inset-y-0 right-0 z-30 w-4 cursor-e-resize"
          onPointerEnter={() => startEdgeScroll(1)}
          onPointerLeave={stopEdgeScroll}
          onClick={(event) => event.stopPropagation()}
          aria-hidden
        />
      ) : null}
    </div>
  );
};
