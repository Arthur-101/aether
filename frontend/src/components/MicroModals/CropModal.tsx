import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CircleAlert,
  Crop,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react';
import { useImagePreview, type ImagePreviewData } from './useImagePreview';

interface CropModalProps {
  isOpen: boolean;
  filePath: string;
  onApply: (
    filePath: string,
    width: number,
    height: number,
    ratio: string,
    x: number,
    y: number
  ) => void;
  onClose: () => void;
}

type CropRatio = 'Free' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragState {
  mode: 'move' | 'resize';
  dir?: HandleDir;
  startX: number;
  startY: number;
  crop: CropRect;
}

const RATIOS: CropRatio[] = ['Free', '1:1', '16:9', '9:16', '4:3', '3:4'];
const RATIO_VALUES: Record<Exclude<CropRatio, 'Free'>, number> = {
  '1:1': 1,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
};
const CORNER_HANDLES: HandleDir[] = ['nw', 'ne', 'se', 'sw'];
const ALL_HANDLES: HandleDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN_CROP = 8;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

const handleStyle = (dir: HandleDir): React.CSSProperties => {
  const horizontal = dir.includes('w') ? '0%' : dir.includes('e') ? '100%' : '50%';
  const vertical = dir.includes('n') ? '0%' : dir.includes('s') ? '100%' : '50%';
  const cursor =
    dir === 'nw' || dir === 'se'
      ? 'nwse-resize'
      : dir === 'ne' || dir === 'sw'
        ? 'nesw-resize'
        : dir === 'n' || dir === 's'
          ? 'ns-resize'
          : 'ew-resize';
  return {
    left: horizontal,
    top: vertical,
    transform: 'translate(-50%, -50%)',
    cursor,
  };
};

const CropEditor: React.FC<{
  filePath: string;
  image: ImagePreviewData;
  onApply: CropModalProps['onApply'];
}> = ({ filePath, image, onApply }) => {
  const [ratio, setRatio] = useState<CropRatio>('Free');
  const [crop, setCrop] = useState<CropRect>({
    x: 0,
    y: 0,
    w: image.width,
    h: image.height,
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  const maxPreviewWidth = 500;
  const maxPreviewHeight = 280;
  const scale = Math.min(
    maxPreviewWidth / Math.max(image.width, 1),
    maxPreviewHeight / Math.max(image.height, 1)
  );
  const displayWidth = image.width * scale;
  const displayHeight = image.height * scale;

  useEffect(() => {
    if (!dragging) return;

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        dragRef.current = null;
        setDragging(false);
        return;
      }
      const dx = (event.clientX - drag.startX) / scale;
      const dy = (event.clientY - drag.startY) / scale;

      if (drag.mode === 'move') {
        setCrop({
          ...drag.crop,
          x: Math.round(clamp(drag.crop.x + dx, 0, image.width - drag.crop.w)),
          y: Math.round(clamp(drag.crop.y + dy, 0, image.height - drag.crop.h)),
        });
        return;
      }

      const dir = drag.dir ?? 'se';
      if (ratio === 'Free') {
        let { x, y, w, h } = drag.crop;
        if (dir.includes('w')) {
          const right = x + w;
          x = clamp(x + dx, 0, right - MIN_CROP);
          w = right - x;
        }
        if (dir.includes('e')) {
          w = clamp(w + dx, MIN_CROP, image.width - x);
        }
        if (dir.includes('n')) {
          const bottom = y + h;
          y = clamp(y + dy, 0, bottom - MIN_CROP);
          h = bottom - y;
        }
        if (dir.includes('s')) {
          h = clamp(h + dy, MIN_CROP, image.height - y);
        }
        setCrop({
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(w),
          h: Math.round(h),
        });
        return;
      }

      const ratioValue = RATIO_VALUES[ratio];
      const anchorX = dir.includes('w') ? drag.crop.x + drag.crop.w : drag.crop.x;
      const anchorY = dir.includes('n') ? drag.crop.y + drag.crop.h : drag.crop.y;
      const startCornerX = dir.includes('w') ? drag.crop.x : drag.crop.x + drag.crop.w;
      const startCornerY = dir.includes('n') ? drag.crop.y : drag.crop.y + drag.crop.h;
      let width = Math.abs(startCornerX + dx - anchorX);
      let height = Math.abs(startCornerY + dy - anchorY);
      width = Math.max(MIN_CROP, width);
      height = Math.max(MIN_CROP, height);
      if (width / height > ratioValue) width = height * ratioValue;
      else height = width / ratioValue;

      const maxWidth = dir.includes('w') ? anchorX : image.width - anchorX;
      const maxHeight = dir.includes('n') ? anchorY : image.height - anchorY;
      width = Math.min(width, maxWidth);
      height = Math.min(height, maxHeight);
      if (width / height > ratioValue) width = height * ratioValue;
      else height = width / ratioValue;

      const x = dir.includes('w') ? anchorX - width : anchorX;
      const y = dir.includes('n') ? anchorY - height : anchorY;
      setCrop({
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(width),
        h: Math.round(height),
      });
    };

    const onPointerUp = () => {
      dragRef.current = null;
      setDragging(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onPointerUp);
    };
  }, [dragging, scale, image.width, image.height, ratio]);

  const startDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    mode: DragState['mode'],
    dir?: HandleDir
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode,
      dir,
      startX: event.clientX,
      startY: event.clientY,
      crop: { ...crop },
    };
    setDragging(true);
  };

  const selectRatio = (nextRatio: CropRatio) => {
    setRatio(nextRatio);
    if (nextRatio === 'Free') return;
    const ratioValue = RATIO_VALUES[nextRatio];
    let width = image.width;
    let height = width / ratioValue;
    if (height > image.height) {
      height = image.height;
      width = height * ratioValue;
    }
    setCrop({
      x: Math.round((image.width - width) / 2),
      y: Math.round((image.height - height) / 2),
      w: Math.round(width),
      h: Math.round(height),
    });
  };

  const centerCrop = (width: number, height: number) => {
    const w = Math.round(clamp(width, MIN_CROP, image.width));
    const h = Math.round(clamp(height, MIN_CROP, image.height));
    const centerX = crop.x + crop.w / 2;
    const centerY = crop.y + crop.h / 2;
    setCrop({
      x: Math.round(clamp(centerX - w / 2, 0, image.width - w)),
      y: Math.round(clamp(centerY - h / 2, 0, image.height - h)),
      w,
      h,
    });
  };

  const changeWidth = (value: number) => {
    if (!Number.isFinite(value)) return;
    let width = clamp(value, MIN_CROP, image.width);
    let height = crop.h;
    if (ratio !== 'Free') {
      height = width / RATIO_VALUES[ratio];
      if (height > image.height) {
        height = image.height;
        width = height * RATIO_VALUES[ratio];
      }
    }
    centerCrop(width, height);
  };

  const changeHeight = (value: number) => {
    if (!Number.isFinite(value)) return;
    let height = clamp(value, MIN_CROP, image.height);
    let width = crop.w;
    if (ratio !== 'Free') {
      width = height * RATIO_VALUES[ratio];
      if (width > image.width) {
        width = image.width;
        height = width / RATIO_VALUES[ratio];
      }
    }
    centerCrop(width, height);
  };

  const reset = () => {
    setRatio('Free');
    setCrop({ x: 0, y: 0, w: image.width, h: image.height });
  };

  const handles = ratio === 'Free' ? ALL_HANDLES : CORNER_HANDLES;

  return (
    <>
      <div className="relative flex h-[300px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--aether-line)] bg-[var(--aether-surface-3)]">
        <div
          className="relative touch-none select-none"
          style={{ width: displayWidth, height: displayHeight }}
        >
          <img
            src={image.dataUrl}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
          />
          <div
            data-crop-box
            onPointerDown={(event) => startDrag(event, 'move')}
            className="absolute cursor-move border-2 border-[var(--aether-accent)]"
            style={{
              left: crop.x * scale,
              top: crop.y * scale,
              width: crop.w * scale,
              height: crop.h * scale,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.48)',
            }}
          >
            {crop.w * scale >= 90 && crop.h * scale >= 24 ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-1 text-center font-mono text-[10px] font-medium text-white drop-shadow">
                {Math.round(crop.w)} × {Math.round(crop.h)} ({ratio})
              </span>
            ) : null}
            {handles.map((dir) => (
              <div
                key={dir}
                data-crop-handle={dir}
                onPointerDown={(event) => startDrag(event, 'resize', dir)}
                className="absolute h-2.5 w-2.5 rounded-[1px] border border-[var(--aether-accent)] bg-[var(--aether-text-1)] shadow"
                style={handleStyle(dir)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-[10px] text-[var(--aether-text-3)]">
        <span>
          Image {image.width} × {image.height} px
        </span>
        <span className="font-mono text-[var(--aether-text-2)]">
          Crop {Math.round(crop.w)} × {Math.round(crop.h)} px
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-[var(--aether-text-2)]">
          Aspect Ratio
        </label>
        <div className="flex flex-wrap gap-1.5">
          {RATIOS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={ratio === item}
              onClick={() => selectRatio(item)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                ratio === item
                  ? 'accent-fill shadow-md'
                  : 'border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-2)] hover:bg-[var(--aether-fill-2)]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-[var(--aether-text-2)]">
            Width (px)
          </label>
          <input
            type="number"
            min={MIN_CROP}
            max={image.width}
            value={Math.round(crop.w)}
            onChange={(event) => changeWidth(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-[var(--aether-line)] bg-[var(--aether-surface-2)] px-2.5 py-1.5 text-xs text-[var(--aether-text-1)] outline-none focus:border-[var(--aether-accent)]"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-[var(--aether-text-2)]">
            Height (px)
          </label>
          <input
            type="number"
            min={MIN_CROP}
            max={image.height}
            value={Math.round(crop.h)}
            onChange={(event) => changeHeight(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-[var(--aether-line)] bg-[var(--aether-surface-2)] px-2.5 py-1.5 text-xs text-[var(--aether-text-1)] outline-none focus:border-[var(--aether-accent)]"
          />
        </div>
      </div>

      <p className="text-[9px] leading-snug text-[var(--aether-text-4)]">
        Drag inside the selection to move it. Drag a handle to resize; Free mode
        exposes handles on every side.
      </p>

      <div className="flex items-center justify-between border-t border-[var(--aether-line-soft)] pt-2">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
        >
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>
        <button
          type="button"
          onClick={() =>
            onApply(
              filePath,
              Math.round(crop.w),
              Math.round(crop.h),
              ratio,
              Math.round(crop.x),
              Math.round(crop.y)
            )
          }
          className="accent-fill flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shadow-lg transition hover:opacity-90"
        >
          <Check size={14} />
          <span>Apply Crop</span>
        </button>
      </div>
    </>
  );
};

export const CropModal: React.FC<CropModalProps> = ({
  isOpen,
  filePath,
  onApply,
  onClose,
}) => {
  const [reloadToken, setReloadToken] = useState(0);
  const { preview, loading, error } = useImagePreview(filePath, isOpen, reloadToken);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        data-aether-interactive
        className="aether-interactive fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="glass-panel flex max-h-[calc(100vh-32px)] w-[560px] max-w-[calc(100vw-32px)] flex-col gap-3 overflow-y-auto rounded-2xl border border-[var(--aether-line)] p-5 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--aether-line-soft)] pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <Crop
                size={18}
                className="shrink-0 text-[var(--aether-accent-text)]"
              />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[var(--aether-text-1)]">
                  Crop Image
                </h3>
                <p
                  title={filePath}
                  className="truncate text-[9px] text-[var(--aether-text-4)]"
                >
                  {filePath}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
            >
              <X size={16} />
            </button>
          </div>

          {loading ? (
            <div className="flex h-[300px] items-center justify-center gap-2 rounded-xl border border-[var(--aether-line)] bg-[var(--aether-surface-3)] text-[11px] text-[var(--aether-text-2)]">
              <Loader2 size={14} className="animate-spin" />
              Loading image…
            </div>
          ) : error ? (
            <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-[var(--aether-line)] bg-[var(--aether-surface-3)] text-center">
              <CircleAlert size={16} className="text-[var(--aether-danger)]" />
              <p className="max-w-[320px] text-[10px] leading-snug text-[var(--aether-text-2)]">
                {error}
              </p>
              <button
                type="button"
                onClick={() => setReloadToken((value) => value + 1)}
                className="rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2.5 py-1 text-[10px] text-[var(--aether-text-1)] transition hover:border-[var(--aether-line-strong)]"
              >
                Try again
              </button>
            </div>
          ) : preview ? (
            <CropEditor
              key={`${filePath}:${preview.width}x${preview.height}`}
              filePath={filePath}
              image={preview}
              onApply={onApply}
            />
          ) : null}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
