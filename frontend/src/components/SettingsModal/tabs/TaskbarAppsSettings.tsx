import React, { useEffect, useState } from 'react';
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  GripVertical,
  MonitorUp,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import type {
  TaskbarAppsConfig,
  TaskbarAppsState,
  TaskbarPinnedApp,
} from '../../../types/ipc';
import { placementBesideSettings } from '../../../lib/externalWindows';
import { pickNativePath } from '../../../lib/system';

interface TaskbarAppsSettingsProps {
  config: TaskbarAppsConfig;
  state: TaskbarAppsState | null;
  onChange: (config: TaskbarAppsConfig) => void;
  onRefresh: () => void;
}

function appNameFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() || path;
  return base.replace(/\.(exe|lnk|url)$/i, '') || base;
}

function compactApp(app: TaskbarPinnedApp): TaskbarPinnedApp {
  return { id: app.id, name: app.name, path: app.path };
}

function appKey(app: TaskbarPinnedApp): string {
  return `${app.id}|${app.path}`.toLowerCase();
}

export const TaskbarAppsSettings: React.FC<TaskbarAppsSettingsProps> = ({
  config,
  state,
  onChange,
  onRefresh,
}) => {
  const [dragging, setDragging] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingSync, setPendingSync] = useState<TaskbarAppsState | null>(null);

  const mirrorApps = state?.discovered ?? [];
  const custom = config.mode === 'custom';
  const apps = custom ? config.pinned : mirrorApps;
  const known = [...mirrorApps, ...(state?.pinned ?? []), ...(state?.apps ?? [])];

  const seed = (): TaskbarPinnedApp[] =>
    custom ? config.pinned.map(compactApp) : mirrorApps.map(compactApp);

  const commit = (next: TaskbarPinnedApp[]) => {
    onChange({ mode: 'custom', pinned: next });
  };

  const metadata = (app: TaskbarPinnedApp) =>
    known.find(
      (candidate) =>
        candidate.path.toLowerCase() === app.path.toLowerCase() ||
        candidate.id === app.id
    );

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = seed();
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    commit(next);
  };

  const remove = (app: TaskbarPinnedApp) => {
    commit(seed().filter((item) => appKey(item) !== appKey(app)));
  };

  const add = async () => {
    setAdding(true);
    try {
      const path = await pickNativePath('file', 'app', placementBesideSettings());
      if (!path) return;
      const base = seed();
      if (base.some((item) => item.path.toLowerCase() === path.toLowerCase())) return;
      commit([
        ...base,
        {
          id: `custom:${path.toLowerCase()}`,
          name: appNameFromPath(path),
          path,
        },
      ]);
    } finally {
      setAdding(false);
    }
  };

  const sync = () => {
    setPendingSync(state);
    onRefresh();
  };

  useEffect(() => {
    if (!pendingSync || state === pendingSync) return;
    setPendingSync(null);
    onChange({ mode: 'custom', pinned: (state?.discovered ?? []).map(compactApp) });
  }, [state, pendingSync, onChange]);

  return (
    <div className="rounded-lg border border-[var(--aether-line)] bg-black/15 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[10px] text-[var(--aether-text-2)]">
          <MonitorUp size={13} className="accent-text" />
          {custom ? `Custom list · ${apps.length} apps` : 'Mirroring Windows pins'}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={add}
            disabled={adding}
            className="flex items-center gap-1 rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-1 text-[9px] font-medium text-[var(--aether-text-1)] transition hover:border-[var(--aether-line-strong)] disabled:opacity-40"
          >
            <Plus size={11} />
            {adding ? 'Adding…' : 'Add app'}
          </button>
          <button
            type="button"
            onClick={sync}
            title="Replace the custom list with the current Windows taskbar pins"
            className="rounded-md border border-[var(--aether-line)] p-1.5 text-[var(--aether-text-1)] transition hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]"
            aria-label="Sync from Windows taskbar"
          >
            <RefreshCw size={11} />
          </button>
          <button
            type="button"
            onClick={() => onChange({ mode: 'mirror', pinned: [] })}
            title="Reset to mirror mode"
            className="rounded-md border border-[var(--aether-line)] p-1.5 text-[var(--aether-text-1)] transition hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]"
            aria-label="Reset to mirror mode"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      <p className="mt-1 text-[9px] leading-relaxed text-[var(--aether-text-3)]">
        {state?.message ||
          (custom
            ? 'Drag rows to reorder. Changes apply when you save.'
            : 'Editing switches to a custom list seeded from the mirrored pins.')}
      </p>

      <div className="mt-2 flex max-h-52 flex-col gap-1 overflow-y-auto pr-1">
        {apps.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--aether-line)] px-3 py-5 text-center text-[10px] text-[var(--aether-text-3)]">
            {custom
              ? 'No custom apps yet. Add an app or sync from Windows.'
              : 'No Windows taskbar pins found. Add apps to build a custom list.'}
          </div>
        ) : (
          apps.map((app, index) => {
            const info = metadata(app);
            const missing = info?.missing;
            return (
              <div
                key={appKey(app)}
                draggable
                onDragStart={(event) => {
                  setDragging(index);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging !== null) move(dragging, index);
                  setDragging(null);
                }}
                onDragEnd={() => setDragging(null)}
                className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 transition ${
                  dragging === index
                    ? 'border-[var(--aether-accent)] bg-[var(--aether-fill-2)]'
                    : 'border-[var(--aether-line-soft)] bg-white/[0.025]'
                }`}
              >
                <GripVertical
                  size={12}
                  className="shrink-0 cursor-grab text-[var(--aether-text-3)] active:cursor-grabbing"
                />
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)]">
                  {info?.icon ? (
                    <img src={info.icon} alt="" className="h-4 w-4 object-contain" />
                  ) : (
                    <AppWindow size={12} className="text-[var(--aether-text-3)]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-medium text-[var(--aether-text-1)]">
                    {app.name}
                    {missing ? (
                      <span className="ml-1 text-[8px] font-normal text-[#fce100]">
                        missing
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[8px] text-[var(--aether-text-3)]">
                    {app.path || 'Path unavailable'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${app.name} up`}
                  className="rounded p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] disabled:opacity-20"
                >
                  <ArrowUp size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === apps.length - 1}
                  aria-label={`Move ${app.name} down`}
                  className="rounded p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] disabled:opacity-20"
                >
                  <ArrowDown size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(app)}
                  aria-label={`Remove ${app.name}`}
                  className="rounded p-1 text-[#8b6f6f] transition hover:bg-[#ff99a4]/10 hover:text-[#ff99a4]"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
