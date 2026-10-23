import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Monitor,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { WallpaperItem, WallpaperState } from '../../types/ipc';
import { pickNativePath } from '../../lib/system';

type WallpaperFilter = 'recent' | 'folder';

interface WallpaperTabProps {
  state: WallpaperState | null;
  onRefresh: () => void;
  onApply: (path: string) => void;
  onSetFolder: (folder: string) => void;
  onClearRecent: () => void;
}

function folderLabel(path: string): string {
  if (!path) return 'No folder selected';
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? `${parts[parts.length - 2]}\\${parts[parts.length - 1]}` : path;
}

/**
 * Coverflow geometry. Indexed by the card's distance from the focused card:
 * the focused card sits flat in the centre, its neighbours fold away into
 * narrow, dimmed slivers, exactly like the reference arrangement.
 */
const CARD_WIDTH = 236;
const CARD_HEIGHT = 133;
const COVERFLOW = [
  { x: 0, rotY: 0, scale: 1, opacity: 1, blur: 0, z: 50 },
  { x: 124, rotY: 54, scale: 0.9, opacity: 0.96, blur: 0, z: 40 },
  { x: 164, rotY: 62, scale: 0.79, opacity: 0.78, blur: 0.6, z: 30 },
  { x: 192, rotY: 66, scale: 0.66, opacity: 0.52, blur: 1.4, z: 20 },
  { x: 212, rotY: 68, scale: 0.56, opacity: 0.28, blur: 2.4, z: 10 },
];

export const WallpaperTab: React.FC<WallpaperTabProps> = ({
  state,
  onRefresh,
  onApply,
  onSetFolder,
  onClearRecent,
}) => {
  const [filter, setFilter] = useState<WallpaperFilter>('recent');
  const [selectedPath, setSelectedPath] = useState('');
  const [hoveredPath, setHoveredPath] = useState('');
  const [applying, setApplying] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState('');

  const items = useMemo<WallpaperItem[]>(
    () => (filter === 'recent' ? state?.recent ?? [] : state?.folder ?? []),
    [filter, state]
  );
  const currentItem = items.find((item) => item.is_current) ?? null;

  const selectedIndex = useMemo(() => {
    const index = items.findIndex((item) => item.path === selectedPath);
    return index >= 0 ? index : 0;
  }, [items, selectedPath]);
  const selected = items[selectedIndex] ?? null;
  const previewItem = items.find((item) => item.path === hoveredPath) ?? selected;

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
    setHoveredPath('');
  }, [filter]);

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

  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  useEffect(() => {
    setConfirmClear(false);
  }, [filter]);

  const clearRecent = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    setNotice('Cleared the recent history');
    onClearRecent();
  };

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

  const move = useCallback(
    (delta: number) => {
      if (!items.length) return;
      setSelectedPath((previous) => {
        const index = Math.max(0, items.findIndex((item) => item.path === previous));
        // Wrap around, so the coverflow is a loop rather than a dead end.
        const next = (((index + delta) % items.length) + items.length) % items.length;
        return items[next]?.path ?? previous;
      });
    },
    [items]
  );

  // The wheel turns the coverflow one card per notch, in a loop. It is bound
  // natively so `preventDefault` works (React's wheel handler is passive), and
  // a short cooldown keeps a track-pad fling from skipping several cards.
  const stripRef = useRef<HTMLDivElement>(null);
  const wheelAt = useRef(0);
  useEffect(() => {
    const element = stripRef.current;
    if (!element || items.length < 2) return;
    const onWheel = (event: WheelEvent) => {
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(delta) < 3) return;
      event.preventDefault();
      const now = performance.now();
      if (now - wheelAt.current < 150) return;
      wheelAt.current = now;
      move(delta > 0 ? 1 : -1);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [items.length, move]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setSelectedPath(items[0]?.path ?? '');
    } else if (event.key === 'End') {
      event.preventDefault();
      setSelectedPath(items[items.length - 1]?.path ?? '');
    }
  };

  const renderCard = (item: WallpaperItem, index: number) => {
    const offset = index - selectedIndex;
    const distance = Math.min(Math.abs(offset), COVERFLOW.length - 1);
    const step = COVERFLOW[distance];
    const sign = Math.sign(offset);
    const active = index === selectedIndex;

    return (
      <button
        key={item.path}
        type="button"
        onClick={() => setSelectedPath(item.path)}
        onPointerEnter={() => setHoveredPath(item.path)}
        onPointerLeave={() =>
          setHoveredPath((previous) => (previous === item.path ? '' : previous))
        }
        onFocus={() => setHoveredPath(item.path)}
        onBlur={() =>
          setHoveredPath((previous) => (previous === item.path ? '' : previous))
        }
        aria-pressed={active}
        aria-label={item.name || 'Wallpaper'}
        className={`absolute left-1/2 top-1/2 overflow-hidden rounded-xl border text-left outline-none ${
          active
            ? 'border-[var(--aether-accent)] shadow-[0_20px_44px_rgba(0,0,0,0.42)]'
            : 'border-[var(--aether-line)] hover:border-[var(--aether-text-3)]'
        }`}
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          marginLeft: -CARD_WIDTH / 2,
          marginTop: -CARD_HEIGHT / 2,
          zIndex: step.z,
          transform: `translateX(${step.x * sign}px) rotateY(${
            -step.rotY * sign
          }deg) scale(${step.scale})`,
          opacity: step.opacity,
          filter: step.blur ? `blur(${step.blur}px)` : undefined,
          transition:
            'transform 420ms cubic-bezier(0.22,0.61,0.36,1), opacity 320ms ease, filter 320ms ease',
          transformStyle: 'preserve-3d',
        }}
      >
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--aether-surface-3)] text-[var(--aether-text-3)]">
            <ImageIcon size={22} />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5">
          <p className="truncate text-[10px] font-medium text-white drop-shadow">
            {item.name || 'Wallpaper'}
          </p>
        </div>
        {item.is_current ? (
          <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-white backdrop-blur">
            <Check size={9} /> Current
          </span>
        ) : null}
        {active ? (
          <span className="pointer-events-none absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--aether-accent)] text-[var(--aether-accent-contrast)] shadow">
            <Check size={11} />
          </span>
        ) : null}
      </button>
    );
  };

  const count = items.length;
  const countLabel = count === 1 ? '1 picture' : `${count} pictures`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => switchFilter('recent')}
            className={`rounded-full px-3 py-1 text-[10px] font-medium transition ${
              filter === 'recent'
                ? 'accent-fill'
                : 'bg-[var(--aether-fill)] text-[var(--aether-text-2)] hover:text-[var(--aether-text-1)]'
            }`}
            aria-pressed={filter === 'recent'}
          >
            Recent
          </button>
          <button
            type="button"
            onClick={() => switchFilter('folder')}
            className={`rounded-full px-3 py-1 text-[10px] font-medium transition ${
              filter === 'folder'
                ? 'accent-fill'
                : 'bg-[var(--aether-fill)] text-[var(--aether-text-2)] hover:text-[var(--aether-text-1)]'
            }`}
            aria-pressed={filter === 'folder'}
          >
            My folder
          </button>
          <span className="ml-1 text-[10px] text-[var(--aether-text-3)]">{countLabel}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {filter === 'recent' && (state?.recent.length ?? 0) > 1 ? (
            <button
              type="button"
              onClick={clearRecent}
              title="Clear the recent wallpaper history"
              className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-medium transition ${
                confirmClear
                  ? 'border-transparent bg-[var(--aether-accent)] text-[var(--aether-accent-contrast)]'
                  : 'border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-2)] hover:text-[var(--aether-text-1)]'
              }`}
            >
              {confirmClear ? <Check size={12} /> : <Trash2 size={12} />}
              {confirmClear ? 'Confirm' : 'Clear'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={chooseFolder}
            disabled={picking}
            title="Choose a wallpaper folder"
            aria-label="Choose a wallpaper folder"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] disabled:opacity-60"
          >
            {picking ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
          </button>
        </div>
      </div>

      <div
        ref={stripRef}
        className="relative h-[178px] select-none overflow-hidden rounded-2xl"
        style={{
          perspective: '1100px',
          backgroundImage:
            'radial-gradient(circle at 50% 6%, color-mix(in srgb, var(--aether-accent) 14%, transparent), transparent 64%)',
        }}
        onKeyDown={handleKeyDown}
      >
        {items.length > 0 ? (
          items.map(renderCard)
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
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
          </div>
        )}

        {items.length > 1 ? (
          <>
            <div className="group absolute inset-y-0 left-0 z-[60] flex w-14 items-center pl-0.5">
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label="Previous wallpaper"
                title="Previous wallpaper"
                className="flex h-9 w-9 translate-x-[-4px] items-center justify-center rounded-full border border-[var(--aether-line)] bg-[var(--aether-surface-2)] text-[var(--aether-text-2)] opacity-0 shadow-[0_8px_22px_rgba(0,0,0,0.45)] backdrop-blur transition-all duration-200 hover:text-[var(--aether-text-1)] focus-visible:translate-x-0 focus-visible:opacity-100 group-hover:translate-x-0 group-hover:opacity-100"
              >
                <ChevronLeft size={18} />
              </button>
            </div>
            <div className="group absolute inset-y-0 right-0 z-[60] flex w-14 items-center justify-end pr-0.5">
              <button
                type="button"
                onClick={() => move(1)}
                aria-label="Next wallpaper"
                title="Next wallpaper"
                className="flex h-9 w-9 translate-x-[4px] items-center justify-center rounded-full border border-[var(--aether-line)] bg-[var(--aether-surface-2)] text-[var(--aether-text-2)] opacity-0 shadow-[0_8px_22px_rgba(0,0,0,0.45)] backdrop-blur transition-all duration-200 hover:text-[var(--aether-text-1)] focus-visible:translate-x-0 focus-visible:opacity-100 group-hover:translate-x-0 group-hover:opacity-100"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative h-[92px] w-[92px] shrink-0">
          <div className="h-full w-full overflow-hidden rounded-full border border-[var(--aether-line)] bg-[var(--aether-surface-3)] shadow-[0_14px_34px_rgba(0,0,0,0.4)]">
            {previewItem?.thumbnail ? (
              <img
                key={previewItem.path}
                src={previewItem.thumbnail}
                alt=""
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[var(--aether-text-3)]">
                <ImageIcon size={20} />
              </div>
            )}
          </div>
          {previewItem?.is_current ? (
            <span className="pointer-events-none absolute -bottom-0.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-white backdrop-blur">
              <Check size={9} /> Current
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--aether-text-3)]">
            Wallpaper
          </p>
          <p className="mt-0.5 truncate text-[12px] font-medium text-[var(--aether-text-1)]">
            {selected?.name || 'Select a wallpaper'}
          </p>
          <p className="mt-0.5 truncate text-[9.5px] text-[var(--aether-text-3)]">
            {filter === 'folder'
              ? folderLabel(state?.folder_path || '')
              : notice ||
                (selected?.is_current
                  ? 'This is your current desktop'
                  : 'Preview a recent wallpaper')}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh wallpapers"
            aria-label="Refresh wallpapers"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)]"
          >
            <RefreshCw size={13} />
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
              ? 'Applying...'
              : selected?.is_current
                ? 'Current'
                : 'Apply wallpaper'}
          </button>
        </div>
      </div>
    </div>
  );
};
