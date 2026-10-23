import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Monitor,
  RefreshCw,
} from 'lucide-react';
import type { WallpaperItem, WallpaperState } from '../../types/ipc';
import { pickNativePath } from '../../lib/system';

type WallpaperFilter = 'recent' | 'folder';

interface WallpaperTabProps {
  state: WallpaperState | null;
  onRefresh: () => void;
  onApply: (path: string) => void;
  onSetFolder: (folder: string) => void;
}

function folderLabel(path: string): string {
  if (!path) return 'No folder selected';
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? `${parts[parts.length - 2]}\\${parts[parts.length - 1]}` : path;
}

export const WallpaperTab: React.FC<WallpaperTabProps> = ({
  state,
  onRefresh,
  onApply,
  onSetFolder,
}) => {
  const [filter, setFilter] = useState<WallpaperFilter>('recent');
  const [selectedPath, setSelectedPath] = useState('');
  const [applying, setApplying] = useState(false);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState('');

  const items = useMemo<WallpaperItem[]>(
    () => (filter === 'recent' ? state?.recent ?? [] : state?.folder ?? []),
    [filter, state]
  );
  const selected = items.find((item) => item.path === selectedPath) ?? null;
  const currentItem = items.find((item) => item.is_current) ?? null;

  useEffect(() => {
    if (!items.length) {
      setSelectedPath('');
      return;
    }
    setSelectedPath((previous) => {
      if (previous && items.some((item) => item.path === previous)) return previous;
      return currentItem?.path ?? items[0].path;
    });
  }, [items, currentItem?.path]);

  useEffect(() => {
    if (!applying) return;
    if (selected?.is_current) {
      setApplying(false);
      setNotice('Applied to desktop');
      return;
    }
    const timer = window.setTimeout(() => setApplying(false), 8000);
    return () => window.clearTimeout(timer);
  }, [applying, selected?.is_current]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const chooseFolder = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const folder = await pickNativePath('directory', 'all');
      if (folder) {
        onSetFolder(folder);
        setFilter('folder');
        setNotice('Folder selected');
      }
    } finally {
      setPicking(false);
    }
  };

  const applySelected = () => {
    if (!selected || selected.is_current || applying) return;
    setApplying(true);
    setNotice('');
    onApply(selected.path);
  };

  const switchFilter = (next: WallpaperFilter) => {
    setFilter(next);
    setNotice('');
  };

  const renderCard = (item: WallpaperItem, index: number) => {
    const active = item.path === selectedPath;
    const tilt = index % 2 === 0 ? -6 : 6;
    return (
      <button
        key={item.path}
        type="button"
        onClick={() => setSelectedPath(item.path)}
        className={`group relative h-[132px] w-[214px] shrink-0 overflow-hidden rounded-xl border text-left transition-all duration-300 ${
          active
            ? 'border-[var(--aether-accent)] shadow-[0_18px_38px_rgba(0,0,0,0.28)]'
            : 'border-[var(--aether-line)] opacity-80 hover:opacity-100'
        }`}
        style={{
          transform: active
            ? 'rotateY(0deg) rotateZ(0deg) scale(1.03)'
            : `rotateY(${tilt}deg) rotateZ(${tilt / 4}deg) scale(0.96)`,
          transformStyle: 'preserve-3d',
          scrollSnapAlign: 'center',
        }}
        aria-pressed={active}
        title={item.name}
      >
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            draggable={false}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--aether-surface-3)] text-[var(--aether-text-3)]">
            <ImageIcon size={22} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="truncate text-[10px] font-medium text-white drop-shadow">
            {item.name || 'Wallpaper'}
          </p>
        </div>
        {item.is_current ? (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-white backdrop-blur">
            <Check size={9} /> Current
          </span>
        ) : null}
        {active ? (
          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--aether-accent)] text-[var(--aether-accent-contrast)] shadow">
            <Check size={11} />
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--aether-text-3)]">
            Desktop
          </p>
          <h3 className="mt-0.5 text-[17px] font-semibold text-[var(--aether-text-1)]">
            Wallpaper
          </h3>
          <p className="mt-1 truncate text-[10px] text-[var(--aether-text-3)]">
            Current: {state?.current_name || 'Desktop wallpaper'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] p-1">
          <button
            type="button"
            onClick={() => switchFilter('recent')}
            className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium transition ${
              filter === 'recent'
                ? 'accent-fill'
                : 'text-[var(--aether-text-2)] hover:bg-[var(--aether-fill)]'
            }`}
            aria-pressed={filter === 'recent'}
          >
            Recent
            <span className="ml-1 opacity-60">{state?.recent.length ?? 0}</span>
          </button>
          <button
            type="button"
            onClick={() => switchFilter('folder')}
            className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium transition ${
              filter === 'folder'
                ? 'accent-fill'
                : 'text-[var(--aether-text-2)] hover:bg-[var(--aether-fill)]'
            }`}
            aria-pressed={filter === 'folder'}
          >
            My Folder
            <span className="ml-1 opacity-60">{state?.folder.length ?? 0}</span>
          </button>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--aether-line)] bg-[var(--aether-surface-2)]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--aether-accent) 12%, transparent), transparent 62%)',
          perspective: '1200px',
        }}
      >
        {items.length > 0 ? (
          <div
            className={`no-scrollbar flex items-center gap-4 overflow-x-auto px-5 py-5 ${
              items.length <= 2 ? 'justify-center' : ''
            }`}
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {items.map(renderCard)}
          </div>
        ) : (
          <div className="flex min-h-[172px] flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--aether-fill)] text-[var(--aether-text-3)]">
              <ImageIcon size={19} />
            </span>
            <p className="text-[11px] font-medium text-[var(--aether-text-2)]">
              {filter === 'recent' ? 'No recent wallpapers yet' : 'No images in this folder'}
            </p>
            <p className="max-w-[360px] text-[9.5px] leading-relaxed text-[var(--aether-text-3)]">
              {filter === 'recent'
                ? 'Apply a wallpaper once and it will appear here. You can also browse a folder of your own.'
                : 'Choose a folder containing JPG, PNG, WEBP, BMP, or GIF wallpapers.'}
            </p>
            <button
              type="button"
              onClick={chooseFolder}
              disabled={picking}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--aether-text-1)] transition hover:bg-[var(--aether-fill-2)] disabled:opacity-60"
            >
              {picking ? <Loader2 size={11} className="animate-spin" /> : <FolderOpen size={11} />}
              Choose folder
            </button>
          </div>
        )}
      </div>

      <div className="flex min-h-[42px] items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-medium text-[var(--aether-text-1)]">
            {selected?.name || 'Select a wallpaper'}
          </p>
          <p className="mt-0.5 truncate text-[9px] text-[var(--aether-text-3)]">
            {filter === 'folder'
              ? folderLabel(state?.folder_path || '')
              : selected?.is_current
                ? 'This is your current desktop'
                : notice || 'Preview a recent wallpaper'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh wallpapers"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)]"
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={chooseFolder}
            disabled={picking}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2.5 text-[10px] font-medium text-[var(--aether-text-1)] transition hover:bg-[var(--aether-fill-2)] disabled:opacity-60"
          >
            {picking ? <Loader2 size={11} className="animate-spin" /> : <FolderOpen size={11} />}
            {state?.folder_path ? 'Change folder' : 'Choose folder'}
          </button>
          <button
            type="button"
            onClick={applySelected}
            disabled={!selected || selected.is_current || applying}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[10px] font-semibold transition disabled:cursor-default disabled:opacity-60 accent-fill"
          >
            {applying ? (
              <Loader2 size={11} className="animate-spin" />
            ) : selected?.is_current ? (
              <Check size={11} />
            ) : (
              <Monitor size={11} />
            )}
            {applying
              ? 'Applying…'
              : selected?.is_current
                ? 'Current'
                : 'Apply wallpaper'}
          </button>
        </div>
      </div>

      {notice && !selected?.is_current ? (
        <p className="text-[9px] text-[var(--aether-text-3)]">{notice}</p>
      ) : null}
    </div>
  );
};
