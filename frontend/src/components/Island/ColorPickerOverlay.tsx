import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Crosshair, Pipette } from 'lucide-react';
import type { ScreenSample } from '../../types/ipc';

interface ColorPickerOverlayProps {
  sample: ScreenSample | null;
  connected: boolean;
  requestSample: (requestId: string, radius?: number) => void;
  onPick: (hex: string) => void;
  onCancel: () => void;
}

type Point = { x: number; y: number };

const MAGNIFIER_SIZE = 92;
const MAGNIFIER_GAP = 22;
const VIEWPORT_MARGIN = 12;
/** ~12 samples/second is smooth for a magnifier and keeps idle CPU low. */
const SAMPLE_INTERVAL_MS = 80;
const SAMPLE_RECOVER_MS = 250;
const SAMPLE_RADIUS = 9;

/**
 * Full-screen eyedropper. It deliberately draws no tint or scrim: a
 * translucent layer would change the pixels the backend samples. The only
 * UI is a magnifier offset from the cursor, so the sampled patch stays clean.
 */
export const ColorPickerOverlay: React.FC<ColorPickerOverlayProps> = ({
  sample,
  connected,
  requestSample,
  onPick,
  onCancel,
}) => {
  const sessionRef = useRef(
    `pick-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  );
  const sequenceRef = useRef(0);
  const latestPreviewRef = useRef('');
  const captureRef = useRef<string | null>(null);
  const lastRequestRef = useRef(0);
  const previewInFlightRef = useRef(false);
  const pointerReadyRef = useRef(false);
  const lastPointerRef = useRef<Point | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [preview, setPreview] = useState<ScreenSample | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  const nextRequestId = useCallback(() => {
    sequenceRef.current += 1;
    return `${sessionRef.current}-${sequenceRef.current}`;
  }, []);

  const requestPreview = useCallback(
    (force = false) => {
      if (!connected) return;
      const now = performance.now();
      const waiting =
        previewInFlightRef.current &&
        now - lastRequestRef.current < SAMPLE_RECOVER_MS;
      if (!force && (waiting || now - lastRequestRef.current < SAMPLE_INTERVAL_MS)) {
        return;
      }
      lastRequestRef.current = now;
      previewInFlightRef.current = true;
      const id = nextRequestId();
      latestPreviewRef.current = id;
      requestSample(id, SAMPLE_RADIUS);
    },
    [connected, nextRequestId, requestSample]
  );

  useEffect(() => {
    if (!connected) return;
    if (isTauri()) {
      void getCurrentWindow().setFocus().catch(() => undefined);
    }
    const frame = window.requestAnimationFrame(() => requestPreview(true));
    return () => window.cancelAnimationFrame(frame);
  }, [connected, requestPreview]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    if (!sample) return;

    const captureId = captureRef.current;
    if (captureId) {
      if (sample.request_id !== captureId) return;
      if (!sample.available) {
        captureRef.current = null;
        setCapturing(false);
        setPreview(sample);
        setError(sample.message || 'Windows would not share that pixel.');
        return;
      }
      onPick(sample.hex);
      return;
    }

    if (sample.request_id !== latestPreviewRef.current) return;
    previewInFlightRef.current = false;
    setPreview(sample);
    setError(sample.available ? '' : sample.message || 'Could not sample the screen.');
    if (!pointerReadyRef.current && sample.available) {
      const scale = window.devicePixelRatio || 1;
      const point = { x: sample.x / scale, y: sample.y / scale };
      pointerReadyRef.current = true;
      lastPointerRef.current = point;
      setPointer(point);
    }
  }, [onPick, sample]);

  useEffect(() => {
    if (connected) return;
    previewInFlightRef.current = false;
    setCapturing(false);
    setError('Aether is offline; the picker cannot read the screen.');
  }, [connected]);

  const handlePointerMove = (event: React.PointerEvent) => {
    const previous = lastPointerRef.current;
    if (previous && previous.x === event.clientX && previous.y === event.clientY) return;
    const point = { x: event.clientX, y: event.clientY };
    pointerReadyRef.current = true;
    lastPointerRef.current = point;
    setPointer(point);
    if (!capturing) requestPreview();
  };

  const capture = (event?: React.PointerEvent) => {
    if (event) {
      const point = { x: event.clientX, y: event.clientY };
      pointerReadyRef.current = true;
      lastPointerRef.current = point;
      setPointer(point);
    }
    if (!connected) {
      setError('Aether is offline; the picker cannot read the screen.');
      return;
    }
    const id = nextRequestId();
    captureRef.current = id;
    previewInFlightRef.current = false;
    setCapturing(true);
    setError('');
    requestSample(id, SAMPLE_RADIUS);
  };

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let groupLeft = 0;
  let groupTop = 0;
  if (pointer) {
    groupLeft = pointer.x + MAGNIFIER_GAP;
    if (groupLeft + MAGNIFIER_SIZE > viewportWidth - VIEWPORT_MARGIN) {
      groupLeft = pointer.x - MAGNIFIER_GAP - MAGNIFIER_SIZE;
    }
    groupTop = pointer.y + MAGNIFIER_GAP;
    if (groupTop + MAGNIFIER_SIZE + 44 > viewportHeight - VIEWPORT_MARGIN) {
      groupTop = pointer.y - MAGNIFIER_GAP - MAGNIFIER_SIZE - 44;
    }
    groupLeft = Math.min(
      Math.max(groupLeft, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, viewportWidth - MAGNIFIER_SIZE - VIEWPORT_MARGIN)
    );
    groupTop = Math.min(
      Math.max(groupTop, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, viewportHeight - MAGNIFIER_SIZE - 44 - VIEWPORT_MARGIN)
    );
  }

  return (
    <div
      data-aether-interactive
      aria-label="Screen color picker"
      className="fixed inset-0 z-[80] cursor-crosshair select-none"
      onPointerMove={handlePointerMove}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        capture(event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {pointer ? (
        <div
          className="pointer-events-none absolute"
          style={{ left: groupLeft, top: groupTop }}
        >
          <div className="relative h-[92px] w-[92px] overflow-hidden rounded-full border-[3px] border-white/90 bg-[#111] shadow-[0_12px_38px_rgba(0,0,0,0.42)]">
            {preview?.patch ? (
              <img
                src={preview.patch}
                alt=""
                draggable={false}
                className="h-full w-full object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[var(--aether-text-3)]">
                <Crosshair size={20} />
              </div>
            )}
            <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35)]" />
            <span className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-white/75 mix-blend-difference" />
            <span className="pointer-events-none absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-white/75 mix-blend-difference" />
            <span className="pointer-events-none absolute top-1/2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border-2 border-white bg-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.65)]" />
          </div>

          <div className="mt-2 flex h-8 w-[128px] items-center gap-1.5 rounded-full border border-white/20 bg-black/72 px-2.5 text-white shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur-md">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/45"
              style={{ backgroundColor: preview?.hex || 'transparent' }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[9px] font-medium">
              {error ? 'Unavailable' : preview?.hex || 'Move to sample'}
            </span>
            {capturing ? (
              <span className="shrink-0 text-[7px] uppercase tracking-[0.12em] text-white/65">
                wait
              </span>
            ) : (
              <Pipette size={10} className="shrink-0 text-white/65" />
            )}
          </div>
          <div className="mt-1.5 w-[128px] text-center text-[7.5px] text-white/65 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            {error || 'Click to pick · Esc to cancel'}
          </div>
        </div>
      ) : null}
    </div>
  );
};
