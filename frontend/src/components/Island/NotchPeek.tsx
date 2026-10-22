import React from 'react';
import { Plus } from 'lucide-react';
import type { TaskbarPinnedApp } from '../../types/ipc';
import { AppDock } from './AppDock';
import { MediaBars } from './MediaBars';
import { CLOCK_GAP, CLOCK_WIDTH, type PeekLayout } from './peekLayout';

interface NotchPeekProps {
  now: Date;
  layout: PeekLayout;
  apps: TaskbarPinnedApp[];
  mediaActive: boolean;
  spotify: boolean;
  onOpen: () => void;
  onLaunch?: (app: TaskbarPinnedApp) => void;
  onManageApps: () => void;
}

export const NotchPeek: React.FC<NotchPeekProps> = ({
  now,
  layout,
  apps,
  mediaActive,
  spotify,
  onOpen,
  onLaunch,
  onManageApps,
}) => {
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const left = apps.slice(0, layout.leftCount);
  const right = apps.slice(layout.leftCount);

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
          className="fluent-focus absolute left-5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2.5 py-1.5 text-[10px] text-[var(--aether-text-2)] outline-none transition hover:border-[var(--aether-accent)] hover:text-[var(--aether-text-1)]"
        >
          <Plus size={13} />
          Pin apps
        </button>
      ) : (
        <div
          className="absolute top-1/2 flex -translate-y-1/2 items-center"
          style={{ right: `calc(50% + ${CLOCK_WIDTH / 2 + CLOCK_GAP}px)` }}
        >
          <AppDock apps={left} side="left" step={layout.step} onLaunch={onLaunch} />
        </div>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        aria-label={`Open Aether command center. ${time}`}
        className="absolute left-1/2 top-1/2 flex h-full w-[150px] -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[var(--aether-text-1)] outline-none"
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
        <AppDock apps={right} side="right" step={layout.step} onLaunch={onLaunch} />
      </div>
    </div>
  );
};
