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
    <div className="rounded-lg border border-white/10 bg-black/15 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[10px] text-[#c7c7c7]">
          <MonitorUp size={13} className="accent-text" />
          {custom ? `Custom list · ${apps.length} apps` : 'Mirroring Windows pins'}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={add}
            disabled={adding}
            className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-[9px] font-medium text-[#e5e5e5] transition hover:border-white/25 disabled:opacity-40"
          >
            <Plus size={11} />
            {adding ? 'Adding…' : 'Add app'}
          </button>
          <button
            type="button"
            onClick={sync}
            title="Replace the custom list with the current Windows taskbar pins"
            className="rounded-md border border-white/10 p-1.5 text-[#b8b2a7] transition hover:border-white/25 hover:text-white"
            aria-label="Sync from Windows taskbar"
          >
            <RefreshCw size={11} />
          </button>
          <button
            type="button"
            onClick={() => onChange({ mode: 'mirror', pinned: [] })}
            title="Reset to mirror mode"
            className="rounded-md border border-white/10 p-1.5 text-[#b8b2a7] transition hover:border-white/25 hover:text-white"
            aria-label="Reset to mirror mode"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      <p className="mt-1 text-[9px] leading-relaxed text-[#77726a]">
        {state?.message ||
          (custom
            ? 'Drag rows to reorder. Changes apply when you save.'
            : 'Editing switches to a custom list seeded from the mirrored pins.')}
      </p>

      <div className="mt-2 flex max-h-52 flex-col gap-1 overflow-y-auto pr-1">
        {apps.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 px-3 py-5 text-center text-[10px] text-[#777]">
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
                    ? 'border-[var(--aether-accent)] bg-white/[0.07]'
                    : 'border-white/[0.07] bg-white/[0.025]'
                }`}
              >
                <GripVertical
                  size={12}
                  className="shrink-0 cursor-grab text-[#605b53] active:cursor-grabbing"
                />
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.05]">
                  {info?.icon ? (
                    <img src={info.icon} alt="" className="h-4 w-4 object-contain" />
                  ) : (
                    <AppWindow size={12} className="text-[#9a948a]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-medium text-[#e5e0d6]">
                    {app.name}
                    {missing ? (
                      <span className="ml-1 text-[8px] font-normal text-[#fce100]">
                        missing
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[8px] text-[#6f6b63]">
                    {app.path || 'Path unavailable'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${app.name} up`}
                  className="rounded p-1 text-[#777] transition hover:bg-white/5 hover:text-white disabled:opacity-20"
                >
                  <ArrowUp size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === apps.length - 1}
                  aria-label={`Move ${app.name} down`}
                  className="rounded p-1 text-[#777] transition hover:bg-white/5 hover:text-white disabled:opacity-20"
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
