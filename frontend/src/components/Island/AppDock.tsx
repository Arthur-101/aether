import React, { useState } from 'react';
import { AppWindow } from 'lucide-react';
import type { DockApp } from './dockApps';

const FALLBACK_COLORS = ['#7dd3fc', '#c4b5fd', '#f0c36a', '#86efac', '#f9a8d4'];

function fallbackColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

const DockIcon: React.FC<{ app: DockApp }> = ({ app }) => {
  const [failed, setFailed] = useState(false);
  if (app.icon && !failed) {
    return (
      <img
        src={app.icon}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        className="h-[18px] w-[18px] rounded-[4px] object-contain"
      />
    );
  }
  return (
    <AppWindow
      size={16}
      strokeWidth={1.8}
      style={{ color: fallbackColor(app.name) }}
      aria-hidden
    />
  );
};

interface AppDockProps {
  apps: DockApp[];
  side: 'left' | 'right';
  maxWidth?: number;
  onLaunch?: (app: DockApp) => void;
}

export const AppDock: React.FC<AppDockProps> = ({ apps, side, maxWidth, onLaunch }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const tiltFor = (index: number) => {
    if (apps.length < 2) return 0;
    const ratio =
      side === 'left' ? (apps.length - 1 - index) / (apps.length - 1) : index / (apps.length - 1);
    return (side === 'left' ? -1 : 1) * ratio * 12;
  };
  const step =
    maxWidth && apps.length > 1
      ? Math.min(30, Math.max(18, (maxWidth - 28) / (apps.length - 1)))
      : 18;

  if (apps.length === 0) return null;

  return (
    <div
      className={`flex items-center ${side === 'left' ? 'justify-end' : 'justify-start'}`}
      aria-label={side === 'left' ? 'Pinned apps' : 'More pinned apps'}
    >
      {apps.map((app, index) => {
        const isHovered = hovered === index;
        const pushed = hovered === null || isHovered ? 0 : index < hovered ? -6 : 6;
        return (
          <button
            key={app.id}
            type="button"
            title={app.missing ? `${app.name} (missing)` : app.name}
            aria-label={`${app.name}${app.missing ? ' (missing)' : ''}`}
            onPointerEnter={() => setHovered(index)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(index)}
            onBlur={() => setHovered(null)}
            onClick={(event) => {
              event.stopPropagation();
              onLaunch?.(app);
            }}
            className="notch-tilt fluent-focus relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border outline-none"
            style={{
              marginLeft: index === 0 ? 0 : step - 28,
              zIndex: isHovered ? 30 : 10 - Math.abs(index - (hovered ?? 0)),
              opacity: app.missing ? 0.55 : 1,
              transform: `translateX(${pushed}px) translateY(${isHovered ? -1 : 0}px) rotate(${
                isHovered ? 0 : tiltFor(index)
              }deg) scale(${isHovered ? 1.28 : 1})`,
              backgroundColor: 'rgba(255,255,255,0.055)',
              borderColor: isHovered ? 'var(--aether-accent)' : 'rgba(255,255,255,0.12)',
              boxShadow: isHovered
                ? '0 6px 18px rgba(0,0,0,0.4), 0 0 0 1px var(--aether-accent)'
                : undefined,
            }}
          >
            <DockIcon app={app} />
            {app.running === true ? (
              <span
                className="absolute left-1/2 -translate-x-1/2 rounded-full"
                style={{
                  bottom: -6,
                  width: isHovered ? 13 : 3,
                  height: 3,
                  opacity: isHovered ? 1 : 0.72,
                  backgroundColor: 'var(--aether-accent)',
                  transition: 'width 200ms var(--aether-tilt-spring), opacity 160ms ease',
                }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
