import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  FlipHorizontal2,
  FlipVertical2,
  GripHorizontal,
  GripVertical,
  Move,
  RotateCw,
  X,
} from 'lucide-react';
import type { DisplayInfo } from '../../types/ipc';
import { RulerFace } from './RulerFace';
import {
  SCALE_UNITS,
  mmPerCssPixel,
  readScale,
  type ScaleUnit,
} from './scaleUnits';

type Orientation = 'horizontal' | 'vertical';

interface ScreenScaleProps {
  initialUnit: ScaleUnit;
  displayInfo: DisplayInfo | null;
  onClose: () => void;
}

interface DragState {
  mode: 'move' | 'resize' | 'indicator';
  orientation: Orientation;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  baseLength: number;
  baseIndicator: number;
  width: number;
  height: number;
}

const TOOLBAR_HEIGHT = 30;
const TOOLBAR_GAP = 6;
const BAR_THICKNESS = 56;
const TOOLBAR_WIDTH = 300;
const MIN_HORIZONTAL = 300;
const MIN_VERTICAL = 220;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

/**
 * The on-screen ruler. It lives in the transparent Aether overlay above every
 * window, so the panel only needs to pass its opening unit and close callback.
 * Both the move grip and the ruler body drag the widget; the end grip resizes
 * the measured length.
 */
export const ScreenScale: React.FC<ScreenScaleProps> = ({
  initialUnit,
  displayInfo,
  onClose,
}) => {
  const [unit, setUnit] = useState<ScaleUnit>(initialUnit);
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [flipped, setFlipped] = useState(false);
  const [lengthPx, setLengthPx] = useState(480);
  const [indicatorPx, setIndicatorPx] = useState(240);
  const [origin, setOrigin] = useState(() => ({
    x: Math.max(16, Math.round((window.innerWidth - 480) / 2)),
    y: Math.max(80, Math.round(window.innerHeight * 0.32)),
  }));
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const mmPerCssPx = useMemo(() => mmPerCssPixel(displayInfo), [displayInfo]);
  const indicatorReading = readScale(indicatorPx, unit, mmPerCssPx);
  const indicatorPosition = indicatorPx;

  const rulerWidth =
    orientation === 'horizontal' ? lengthPx : BAR_THICKNESS;
  const rulerHeight =
    orientation === 'horizontal' ? BAR_THICKNESS : lengthPx;
  // Horizontal mode mirrors the whole stack so the toolbar sits opposite the
  // tick face: unflipped has the toolbar above, flipped has it below.
  const widgetWidth = rulerWidth;
  const widgetHeight =
    orientation === 'horizontal'
      ? rulerHeight + TOOLBAR_HEIGHT + TOOLBAR_GAP
      : rulerHeight;
  const barTop =
    orientation === 'horizontal' && !flipped
      ? TOOLBAR_HEIGHT + TOOLBAR_GAP
      : 0;

  // The toolbar docks to the far end of the ruler and mirrors to the side
  // opposite the tick face, keeping the measured edge clear.
  const toolbarPosition = (() => {
    if (orientation === 'vertical') {
      const right = origin.x + BAR_THICKNESS + TOOLBAR_GAP;
      const left = origin.x - TOOLBAR_WIDTH - TOOLBAR_GAP;
      const canUseRight = right + TOOLBAR_WIDTH <= window.innerWidth - 8;
      const canUseLeft = left >= 8;
      const preferRight = !flipped;
      const x = clamp(
        preferRight
          ? canUseRight
            ? right
            : left
          : canUseLeft
            ? left
            : right,
        8,
        window.innerWidth - TOOLBAR_WIDTH - 8
      );
      const y = clamp(
        origin.y + lengthPx - TOOLBAR_HEIGHT,
        8,
        window.innerHeight - TOOLBAR_HEIGHT - 8
      );
      return { x, y };
    }

    const x = clamp(
      origin.x + lengthPx - TOOLBAR_WIDTH,
      8,
      window.innerWidth - TOOLBAR_WIDTH - 8
    );
    const y = flipped
      ? origin.y + BAR_THICKNESS + TOOLBAR_GAP
      : origin.y;
    return {
      x,
      y: clamp(y, 8, window.innerHeight - TOOLBAR_HEIGHT - 8),
    };
  })();

  useEffect(() => {
    if (!isTauri()) return;
    void getCurrentWindow().setFocus().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!dragging) return;

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.mode === 'move') {
        setOrigin({
          x: clamp(
            drag.originX + event.clientX - drag.startX,
            8,
            window.innerWidth - drag.width - 8
          ),
          y: clamp(
            drag.originY + event.clientY - drag.startY,
            8,
            window.innerHeight - drag.height - 8
          ),
        });
        return;
      }

      const delta =
        drag.orientation === 'horizontal'
          ? event.clientX - drag.startX
          : event.clientY - drag.startY;

      if (drag.mode === 'indicator') {
        setIndicatorPx(
          Math.round(clamp(drag.baseIndicator + delta, 0, drag.baseLength))
        );
        return;
      }

      const minimum =
        drag.orientation === 'horizontal' ? MIN_HORIZONTAL : MIN_VERTICAL;
      const maximum =
        drag.orientation === 'horizontal'
          ? window.innerWidth - drag.originX - 8
          : window.innerHeight - drag.originY - 8;
      const nextLength = Math.round(
        clamp(drag.baseLength + delta, minimum, maximum)
      );
      setLengthPx(nextLength);
      setIndicatorPx((current) => Math.min(current, nextLength));
    };

    const endDrag = () => {
      dragRef.current = null;
      setDragging(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [dragging]);

  const beginMove = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      mode: 'move',
      orientation,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      baseLength: lengthPx,
      baseIndicator: indicatorPx,
      width: widgetWidth,
      height: widgetHeight,
    };
    setDragging(true);
  };

  const beginResize = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode: 'resize',
      orientation,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      baseLength: lengthPx,
      baseIndicator: indicatorPx,
      width: widgetWidth,
      height: widgetHeight,
    };
    setDragging(true);
  };

  const beginIndicator = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode: 'indicator',
      orientation,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      baseLength: lengthPx,
      baseIndicator: indicatorPx,
      width: widgetWidth,
      height: widgetHeight,
    };
    setDragging(true);
  };

  const rotate = () => {
    const next: Orientation =
      orientation === 'horizontal' ? 'vertical' : 'horizontal';
    const nextWidth = next === 'horizontal' ? lengthPx : BAR_THICKNESS;
    const nextHeight =
      next === 'horizontal'
        ? BAR_THICKNESS + TOOLBAR_HEIGHT + TOOLBAR_GAP
        : lengthPx;
    setOrientation(next);
    setOrigin((current) => ({
      x: clamp(current.x, 8, window.innerWidth - nextWidth - 8),
      y: clamp(current.y, 8, window.innerHeight - nextHeight - 8),
    }));
  };

  const resizeHandle = (
    <button
      type="button"
      onPointerDown={beginResize}
      title="Drag to resize the scale"
      aria-label="Resize the scale"
      className={`absolute flex items-center justify-center bg-[var(--aether-fill-2)] text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] ${
        orientation === 'horizontal'
          ? 'top-0 right-0 h-full w-5 cursor-ew-resize'
          : 'bottom-0 left-0 h-5 w-full cursor-ns-resize'
      }`}
    >
      {orientation === 'horizontal' ? (
        <GripVertical size={10} />
      ) : (
        <GripHorizontal size={10} />
      )}
    </button>
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] select-none"
      aria-label="On-screen scale"
    >
      <div
        data-aether-interactive
        className="glass-panel aether-pop pointer-events-auto absolute z-10 flex items-center gap-1 rounded-none px-1.5 py-1"
        style={{
          left: toolbarPosition.x,
          top: toolbarPosition.y,
          width: TOOLBAR_WIDTH,
        }}
      >
          <button
            type="button"
            onPointerDown={beginMove}
            title="Drag the scale"
            aria-label="Drag the scale"
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] ${
              dragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <Move size={12} />
          </button>
          <span
            className="min-w-0 truncate font-mono text-[10px] font-medium text-[var(--aether-text-1)]"
            title={`${indicatorReading.text} from the scale start`}
          >
            {indicatorReading.text}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            {SCALE_UNITS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setUnit(item.id)}
                title={item.title}
                className={`rounded px-1 py-0.5 text-[7.5px] font-semibold tracking-[0.06em] transition ${
                  unit === item.id
                    ? 'accent-fill'
                    : 'text-[var(--aether-text-3)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={rotate}
              title="Rotate the scale"
              aria-label="Rotate the scale"
              className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
            >
              <RotateCw size={11} />
            </button>
            <button
              type="button"
              onClick={() => setFlipped((current) => !current)}
              title="Flip the ruler upside down"
              aria-label="Flip the ruler upside down"
              aria-pressed={flipped}
              className={`flex h-5 w-5 items-center justify-center rounded-full transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] ${
                flipped
                  ? 'bg-[var(--aether-fill-2)] text-[var(--aether-accent)]'
                  : 'text-[var(--aether-text-3)]'
              }`}
            >
              {orientation === 'horizontal' ? (
                <FlipVertical2 size={11} />
              ) : (
                <FlipHorizontal2 size={11} />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close the scale (Esc)"
              aria-label="Close the scale"
              className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
            >
              <X size={12} />
            </button>
          </div>
      </div>

      <div
        className="absolute z-20"
        style={{
          left: origin.x,
          top: origin.y,
          width: widgetWidth,
          height: widgetHeight,
        }}
      >
        <div
          data-aether-interactive
          onPointerDown={beginMove}
          className={`glass-panel aether-pop pointer-events-auto absolute overflow-hidden rounded-none ${
            dragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            top: barTop,
            left: 0,
            width: rulerWidth,
            height: rulerHeight,
          }}
        >
          <RulerFace
            lengthPx={lengthPx}
            unit={unit}
            mmPerCssPx={mmPerCssPx}
            orientation={orientation}
            flipFace={flipped}
          />
          <span
            className={`pointer-events-none absolute bg-[var(--aether-accent)] opacity-70 ${
              orientation === 'horizontal'
                ? flipped
                  ? 'top-0 left-0 h-[2px] w-full'
                  : 'bottom-0 left-0 h-[2px] w-full'
                : flipped
                  ? 'top-0 right-0 h-full w-[2px]'
                  : 'top-0 left-0 h-full w-[2px]'
            }`}
          />
          <button
            type="button"
            onPointerDown={beginIndicator}
            title="Drag the indicator to measure from the start"
            aria-label="Measurement indicator"
            className={`absolute z-10 touch-none ${
              orientation === 'horizontal'
                ? 'top-0 h-full w-4 -translate-x-1/2 cursor-ew-resize'
                : 'left-0 w-full h-4 -translate-y-1/2 cursor-ns-resize'
            }`}
            style={
              orientation === 'horizontal'
                ? { left: indicatorPosition }
                : { top: indicatorPosition }
            }
          >
            <span
              className={`pointer-events-none absolute bg-[var(--aether-accent)] ${
                orientation === 'horizontal'
                  ? 'top-0 bottom-0 left-1/2 w-[2px] -translate-x-1/2'
                  : 'top-1/2 left-0 right-0 h-[2px] -translate-y-1/2'
              }`}
            />
            <span
              className={`pointer-events-none absolute bg-[var(--aether-accent)] ${
                orientation === 'horizontal'
                  ? flipped
                    ? 'bottom-1 left-1/2 h-2 w-2 -translate-x-1/2'
                    : 'top-1 left-1/2 h-2 w-2 -translate-x-1/2'
                  : flipped
                    ? 'right-1 top-1/2 h-2 w-2 -translate-y-1/2'
                    : 'left-1 top-1/2 h-2 w-2 -translate-y-1/2'
              }`}
            />
          </button>
          {resizeHandle}
        </div>
      </div>
    </div>
  );
};
