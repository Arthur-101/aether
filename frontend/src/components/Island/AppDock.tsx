import React, { useState } from 'react';
import type { DockApp } from './dockApps';

const LEFT_TILTS = [-10, -5, -2];
const RIGHT_TILTS = [2, 6, 10];

interface AppDockProps {
  apps: DockApp[];
  side: 'left' | 'right';
  onLaunch?: (app: DockApp) => void;
}

export const AppDock: React.FC<AppDockProps> = ({ apps, side, onLaunch }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const tilts = side === 'left' ? LEFT_TILTS : RIGHT_TILTS;

  return (
    <div
      className={`flex items-center ${side === 'left' ? 'justify-end' : 'justify-start'}`}
      aria-label={`${side === 'left' ? 'Pinned' : 'Recent'} apps`}
    >
      {apps.map((app, index) => {
        const Icon = app.icon;
        const isHovered = hovered === index;
        const pushed = hovered === null || isHovered ? 0 : index < hovered ? -5 : 5;
        return (
          <button
            key={app.id}
            type="button"
            title={app.name}
            aria-label={app.name}
            onPointerEnter={() => setHovered(index)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(index)}
            onBlur={() => setHovered(null)}
            onClick={(event) => {
              event.stopPropagation();
              onLaunch?.(app);
            }}
            className="notch-tilt relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
            style={{
              marginLeft: index === 0 ? 0 : -10,
              zIndex: isHovered ? 30 : 10 - Math.abs(index - (hovered ?? 0)),
              transform: `translateX(${pushed}px) translateY(${isHovered ? -1 : 0}px) rotate(${
                isHovered ? 0 : tilts[index] ?? 0
              }deg) scale(${isHovered ? 1.28 : 1})`,
              backgroundColor: `${app.color}18`,
              borderColor: `${app.color}55`,
              color: app.color,
              boxShadow: isHovered ? `0 5px 16px ${app.color}33` : undefined,
            }}
          >
            <Icon size={15} strokeWidth={1.8} />
            {app.running ? (
              <span
                className="absolute left-1/2 -translate-x-1/2 rounded-full bg-current transition-all duration-200"
                style={{
                  bottom: -6,
                  width: isHovered ? 13 : 3,
                  height: 3,
                  opacity: isHovered ? 1 : 0.7,
                }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
