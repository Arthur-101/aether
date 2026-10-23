import { useCallback, useEffect, useRef, useState } from 'react';

export type MouseSubscriber = (cb: (x: number, y: number) => void) => () => void;

export interface AutoHidePillMetrics {
  /** The idle pill width, used for the deliberately narrow top-edge reveal band. */
  compactWidth: number;
  /** The current idle or peek shell width, used to keep an active pill visible. */
  activeWidth: number;
  /** The current idle or peek shell height, used to keep an active pill visible. */
  activeHeight: number;
}

interface UseAutoHidePillOptions {
  enabled: boolean;
  suspended: boolean;
  subscribeMouse: MouseSubscriber;
  metrics: AutoHidePillMetrics;
}

interface ViewportPoint {
  x: number;
  y: number;
}

const REVEAL_BAND_HEIGHT = 6;
const REVEAL_DWELL_MS = 120;
const RETRACT_DELAY_MS = 600;
const ACTIVE_ZONE_PADDING = 8;

function toPrimaryViewportPoint(physicalX: number, physicalY: number): ViewportPoint | null {
  const scale = window.devicePixelRatio || 1;
  const x = physicalX / scale;
  const y = physicalY / scale;

  // The overlay itself is deliberately sized to the primary monitor. Do not
  // let a cursor on another display arm the primary display's reveal band.
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
    return null;
  }
  return { x, y };
}

function isInRevealBand(point: ViewportPoint | null, compactWidth: number): boolean {
  if (!point || point.y > REVEAL_BAND_HEIGHT) return false;
  const centreX = window.innerWidth / 2;
  const halfWidth = compactWidth / 2;
  return point.x >= centreX - halfWidth && point.x <= centreX + halfWidth;
}

function isOverActivePill(point: ViewportPoint | null, metrics: AutoHidePillMetrics): boolean {
  if (!point) return false;
  const centreX = window.innerWidth / 2;
  const halfWidth = metrics.activeWidth / 2 + ACTIVE_ZONE_PADDING;
  return (
    point.x >= centreX - halfWidth &&
    point.x <= centreX + halfWidth &&
    point.y >= 0 &&
    point.y <= metrics.activeHeight + ACTIVE_ZONE_PADDING
  );
}

/**
 * Controls the tucked state without creating a cursor-position render loop.
 * The cursor stream only arms/cancels timers; React updates when the pill
 * actually changes between visible and tucked.
 */
export function useAutoHidePill({
  enabled,
  suspended,
  subscribeMouse,
  metrics,
}: UseAutoHidePillOptions): { tucked: boolean } {
  const [tucked, setTucked] = useState(false);
  const tuckedRef = useRef(false);
  const latestPointRef = useRef<ViewportPoint | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const retractTimerRef = useRef<number | null>(null);
  const optionsRef = useRef({ enabled, suspended, metrics });

  const setTuckedState = useCallback((next: boolean) => {
    if (tuckedRef.current === next) return;
    tuckedRef.current = next;
    setTucked(next);
  }, []);

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current === null) return;
    window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = null;
  }, []);

  const clearRetractTimer = useCallback(() => {
    if (retractTimerRef.current === null) return;
    window.clearTimeout(retractTimerRef.current);
    retractTimerRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    clearRevealTimer();
    clearRetractTimer();
  }, [clearRevealTimer, clearRetractTimer]);

  const scheduleReveal = useCallback(() => {
    if (revealTimerRef.current !== null) return;
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null;
      const current = optionsRef.current;
      if (
        current.enabled &&
        !current.suspended &&
        tuckedRef.current &&
        isInRevealBand(latestPointRef.current, current.metrics.compactWidth)
      ) {
        clearRetractTimer();
        setTuckedState(false);
      }
    }, REVEAL_DWELL_MS);
  }, [clearRetractTimer, setTuckedState]);

  const scheduleRetract = useCallback(() => {
    if (retractTimerRef.current !== null) return;
    retractTimerRef.current = window.setTimeout(() => {
      retractTimerRef.current = null;
      const current = optionsRef.current;
      if (
        current.enabled &&
        !current.suspended &&
        !tuckedRef.current &&
        !isOverActivePill(latestPointRef.current, current.metrics)
      ) {
        clearRevealTimer();
        setTuckedState(true);
      }
    }, RETRACT_DELAY_MS);
  }, [clearRevealTimer, setTuckedState]);

  useEffect(() => {
    optionsRef.current = { enabled, suspended, metrics };
  }, [enabled, suspended, metrics]);

  useEffect(() => {
    const unsubscribe = subscribeMouse((physicalX, physicalY) => {
      const current = optionsRef.current;
      const point = toPrimaryViewportPoint(physicalX, physicalY);
      latestPointRef.current = point;

      if (!current.enabled || current.suspended) return;

      if (tuckedRef.current) {
        clearRetractTimer();
        if (isInRevealBand(point, current.metrics.compactWidth)) {
          scheduleReveal();
        } else {
          clearRevealTimer();
        }
        return;
      }

      clearRevealTimer();
      if (isOverActivePill(point, current.metrics)) {
        clearRetractTimer();
      } else {
        scheduleRetract();
      }
    });

    return unsubscribe;
  }, [clearRetractTimer, clearRevealTimer, scheduleRetract, scheduleReveal, subscribeMouse]);

  useEffect(() => {
    // Disabled means the pill must always be reachable.
    if (!enabled) {
      clearTimers();
      setTuckedState(false);
      return;
    }
    // While suspended (expanded, Settings, colour picker) the state machine
    // simply pauses; the current tucked state is preserved across the gap so
    // closing a panel does not flash the pill in and out.
    if (suspended) {
      clearTimers();
      return;
    }
    // Resuming, or the feature just turned on. If the cursor is over the pill
    // it stays out; otherwise it retracts shortly. This makes enabling the
    // option hide the pill even before the next cursor movement arrives.
    clearTimers();
    if (isOverActivePill(latestPointRef.current, optionsRef.current.metrics)) {
      setTuckedState(false);
    } else if (!tuckedRef.current) {
      scheduleRetract();
    }
  }, [clearTimers, enabled, scheduleRetract, setTuckedState, suspended]);

  useEffect(() => clearTimers, [clearTimers]);

  return { tucked };
}
