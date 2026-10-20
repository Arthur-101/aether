/**
 * Keeps a slider responsive while commands are sent to the Windows backend.
 *
 * The displayed value is local and updates immediately. Backend sends are
 * throttled, and telemetry echoes are ignored while dragging plus a short
 * settle window afterwards so the thumb never jumps backwards mid-drag.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface LiveControlOptions {
  throttleMs?: number;
  settleMs?: number;
}

export function useLiveControl(
  externalValue: number,
  send: (value: number) => void,
  { throttleMs = 60, settleMs = 800 }: LiveControlOptions = {}
) {
  const initial = Number.isFinite(externalValue) ? externalValue : 0;
  const [value, setValue] = useState(initial);
  const valueRef = useRef(initial);
  const sendRef = useRef(send);
  const draggingRef = useRef(false);
  const lastChangeRef = useRef(-Infinity);
  const lastSentAtRef = useRef(0);
  const lastSentRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    if (draggingRef.current) return;
    if (performance.now() - lastChangeRef.current < settleMs) return;
    const next = Number.isFinite(externalValue) ? externalValue : 0;
    if (Math.abs(next - valueRef.current) < 0.5) return;
    valueRef.current = next;
    setValue(next);
  }, [externalValue, settleMs]);

  const flush = useCallback(() => {
    timerRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) return;
    if (lastSentRef.current !== null && Math.abs(pending - lastSentRef.current) < 0.01) {
      return;
    }
    lastSentRef.current = pending;
    lastSentAtRef.current = performance.now();
    sendRef.current(pending);
  }, []);

  const schedule = useCallback(
    (next: number) => {
      const now = performance.now();
      if (now - lastSentAtRef.current >= throttleMs) {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        pendingRef.current = null;
        lastSentRef.current = next;
        lastSentAtRef.current = now;
        sendRef.current(next);
        return;
      }
      pendingRef.current = next;
      if (timerRef.current === null) {
        timerRef.current = window.setTimeout(
          flush,
          Math.max(0, throttleMs - (now - lastSentAtRef.current))
        );
      }
    },
    [flush, throttleMs]
  );

  const onChange = useCallback(
    (next: number) => {
      valueRef.current = next;
      setValue(next);
      lastChangeRef.current = performance.now();
      schedule(next);
    },
    [schedule]
  );

  const onInteractionStart = useCallback(() => {
    draggingRef.current = true;
    lastChangeRef.current = performance.now();
  }, []);

  const onInteractionEnd = useCallback(() => {
    draggingRef.current = false;
    lastChangeRef.current = performance.now();
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) return;
    if (lastSentRef.current !== null && Math.abs(pending - lastSentRef.current) < 0.01) {
      return;
    }
    lastSentRef.current = pending;
    lastSentAtRef.current = performance.now();
    sendRef.current(pending);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  return { value, onChange, onInteractionStart, onInteractionEnd };
}
