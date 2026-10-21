import React from 'react';
import { AppDock } from './AppDock';
import type { DockApp } from './dockApps';
import { MediaBars } from './MediaBars';

interface NotchPeekProps {
  now: Date;
  apps: DockApp[];
  mediaActive: boolean;
  spotify: boolean;
  onOpen: () => void;
  onLaunch?: (app: DockApp) => void;
}

export const NotchPeek: React.FC<NotchPeekProps> = ({
  now,
  apps,
  mediaActive,
  spotify,
  onOpen,
  onLaunch,
}) => {
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const half = Math.ceil(apps.length / 2);

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-16 top-1/2 -translate-y-1/2">
        <AppDock apps={apps.slice(0, half)} side="left" onLaunch={onLaunch} />
      </div>
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
      <div className="absolute right-14 top-1/2 -translate-y-1/2">
        <AppDock apps={apps.slice(half)} side="right" onLaunch={onLaunch} />
      </div>
    </div>
  );
};
