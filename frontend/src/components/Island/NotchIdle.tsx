import React from 'react';
import { MediaBars } from './MediaBars';

interface NotchIdleProps {
  now: Date;
  mediaActive: boolean;
  spotify: boolean;
  onOpen: () => void;
}

export const NotchIdle: React.FC<NotchIdleProps> = ({
  now,
  mediaActive,
  spotify,
  onOpen,
}) => {
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      aria-label={`Open Aether command center. ${time}`}
      className="relative flex h-full w-full items-center justify-center text-[var(--aether-text-1)] outline-none"
    >
      <span className="font-mono text-[13px] font-semibold tabular-nums tracking-[0.01em]">
        {time}
      </span>
      {mediaActive ? (
        <span className="pointer-events-none absolute right-3 flex items-center">
          <MediaBars active spotify={spotify} compact />
        </span>
      ) : null}
    </button>
  );
};
