/**
 * Dynamic bounds for the main overlay window.
 *
 * A fullscreen transparent layered window makes DWM composite the whole
 * monitor every frame, even while the island is idle. That cost lands on the
 * GPU while a game is running. This hook keeps the window wrapped tightly
 * around the idle pill (plus room for its shadow) and grows it back to the
 * full monitor only while a panel that needs the whole screen is open.
 *
 * All geometry sent to Rust is in **physical** pixels. Tauri reports a scale
 * factor of `1.0` on displays where WebView2 paints at a device pixel ratio of
 * `1.12`, so CSS values must be multiplied by the real `devicePixelRatio`
 * before they cross the IPC boundary.
 *
 * The same geometry is read by `useClickThrough` and `useAutoHidePill`, which
 * receive global cursor coordinates from Python. They need to translate those
 * screen coordinates into window-local CSS pixels.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { primaryMonitor } from '@tauri-apps/api/window';
import type { AutoHidePillMetrics } from './useAutoHidePill';

/** Room on each side of the pill so its pop shadow is not clipped. */
const SIDE_PADDING = 40;
/** Room below the pill for the same shadow. */
const BOTTOM_PADDING = 56;
/** Height of the strip that holds the top-edge reveal sensor while tucked. */
const TUCKED_HEIGHT = 7;
/** Width of the notification column that docks under the pill. */
const NOTIFICATION_WIDTH = 320;
/** Distance from the window top to the first notification card. */
const NOTIFICATION_TOP = 52;
/** Room below the last notification for its shadow. */
const NOTIFICATION_BOTTOM_PADDING = 24;
/** Reserve used on the first frame, before the column has been measured. */
const NOTIFICATION_MIN_HEIGHT = 80;
/**
 * A shrink waits for the shell's exit animation. Growing is immediate so a
 * pill that is about to appear is never painted clipped.
 */
const SHRINK_DELAY_MS = 460;
/** Slow re-assert so a monitor/DPI change repairs the window on its own. */
const VERIFY_INTERVAL_MS = 5_000;

export interface OverlayGeometry {
  /** Physical rectangle of the overlay window. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Monitor size in CSS pixels, used for layout that must not depend on the
   * current (possibly tiny) window. */
  screenWidth: number;
  screenHeight: number;
  dpr: number;
}

let geometry: OverlayGeometry | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function fallbackGeometry(): OverlayGeometry {
  const dpr = window.devicePixelRatio || 1;
  return {
    x: Math.round((window.screenX || 0) * dpr),
    y: Math.round((window.screenY || 0) * dpr),
    width: Math.max(1, Math.round(window.innerWidth * dpr)),
    height: Math.max(1, Math.round(window.innerHeight * dpr)),
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    dpr,
  };
}

/**
 * The rectangle the OS window currently occupies, in physical pixels.
 *
 * Hooks that translate global cursor coordinates call this synchronously on
 * every cursor sample, so it must not be async.
 */
export function getOverlayGeometry(): OverlayGeometry {
  return geometry ?? fallbackGeometry();
}

function sameRect(a: OverlayGeometry, b: OverlayGeometry): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

interface BoundsTarget extends OverlayGeometry {
  fullScreen: boolean;
  area: number;
}

async function computeTarget(
  fullScreen: boolean,
  metrics: AutoHidePillMetrics,
  tucked: boolean,
  notificationActive: boolean,
  notificationHeight: number
): Promise<BoundsTarget | null> {
  const monitor = await primaryMonitor();
  if (!monitor) return null;

  // WebView2's DPR is the one that maps CSS pixels to the physical pixels the
  // OS uses for SetWindowPos. Tauri's monitor.scaleFactor is not reliable here.
  const dpr = window.devicePixelRatio || 1;
  const screenWidth = monitor.size.width / dpr;
  const screenHeight = monitor.size.height / dpr;

  if (fullScreen) {
    return {
      x: monitor.position.x,
      // The top pixel sits off-screen, hiding the 1px DWM frame that Windows
      // draws along the top of a transparent borderless window.
      y: monitor.position.y - 1,
      width: monitor.size.width,
      height: monitor.size.height + 1,
      screenWidth,
      screenHeight,
      dpr,
      fullScreen: true,
      area: monitor.size.width * (monitor.size.height + 1),
    };
  }

  const pillWidth = Math.max(metrics.activeWidth, metrics.compactWidth);
  const contentWidth = notificationActive
    ? Math.max(pillWidth, NOTIFICATION_WIDTH)
    : pillWidth;
  const cssWidth = Math.min(contentWidth + SIDE_PADDING * 2, screenWidth);

  let cssHeight: number;
  if (notificationActive) {
    // The notification column starts below the tallest pill and grows with
    // its measured content. The first frame uses a one-card reserve so the
    // toast is not clipped before the ResizeObserver reports.
    const notificationSpace =
      notificationHeight > 0 ? notificationHeight : NOTIFICATION_MIN_HEIGHT;
    cssHeight = Math.min(
      Math.max(
        metrics.activeHeight + BOTTOM_PADDING,
        NOTIFICATION_TOP + notificationSpace + NOTIFICATION_BOTTOM_PADDING
      ),
      screenHeight
    );
  } else if (tucked) {
    cssHeight = TUCKED_HEIGHT;
  } else {
    cssHeight = Math.min(metrics.activeHeight + BOTTOM_PADDING, screenHeight);
  }

  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr) + 1);

  return {
    x: monitor.position.x + Math.round((monitor.size.width - width) / 2),
    y: monitor.position.y - 1,
    width,
    height,
    screenWidth,
    screenHeight,
    dpr,
    fullScreen: false,
    area: width * height,
  };
}

interface UseOverlayBoundsOptions {
  /** True while a panel that needs the whole monitor is open. */
  fullScreen: boolean;
  /** The shell's target size in CSS pixels. */
  metrics: AutoHidePillMetrics;
  /** While tucked the window only needs to hold the reveal sensor. */
  tucked: boolean;
  /** A notification is docked under the pill. */
  notificationActive: boolean;
  /** Measured height of the notification column, in CSS pixels. */
  notificationHeight: number;
}

interface OverlayScreen {
  width: number;
  height: number;
}

/**
 * Keeps the native overlay window in sync with the island.
 *
 * Returns the monitor size in CSS pixels so the shell can lay itself out
 * against the screen rather than the (possibly tiny) window viewport.
 */
export function useOverlayBounds({
  fullScreen,
  metrics,
  tucked,
  notificationActive,
  notificationHeight,
}: UseOverlayBoundsOptions): OverlayScreen {
  const [screen, setScreen] = useState<OverlayScreen>(() => {
    const initial = getOverlayGeometry();
    return { width: initial.screenWidth, height: initial.screenHeight };
  });

  // The interval callback must see the latest values without restarting.
  const stateRef = useRef({
    fullScreen,
    metrics,
    tucked,
    notificationActive,
    notificationHeight,
  });
  useEffect(() => {
    stateRef.current = {
      fullScreen,
      metrics,
      tucked,
      notificationActive,
      notificationHeight,
    };
  }, [fullScreen, metrics, tucked, notificationActive, notificationHeight]);

  const appliedRef = useRef<OverlayGeometry | null>(null);
  const shrinkTimerRef = useRef<number | null>(null);
  const generationRef = useRef(0);

  const clearShrinkTimer = useCallback(() => {
    if (shrinkTimerRef.current === null) return;
    window.clearTimeout(shrinkTimerRef.current);
    shrinkTimerRef.current = null;
  }, []);

  const applyTarget = useCallback(async (target: OverlayGeometry) => {
    const previous = appliedRef.current;
    // Publish the rectangle before the IPC round-trip so cursor hit-testing
    // switches to the new coordinate space as soon as the shell starts using
    // it. A grow lands within a frame; a shrink is only applied after the
    // shell's exit animation, so publishing it here is still correct.
    geometry = target;
    setScreen((current) =>
      current.width === target.screenWidth && current.height === target.screenHeight
        ? current
        : { width: target.screenWidth, height: target.screenHeight }
    );

    if (previous && sameRect(previous, target)) return;
    appliedRef.current = target;
    try {
      await invoke('set_overlay_bounds', {
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
      });
    } catch (error) {
      // Let the slow verify retry instead of believing a rectangle the OS
      // never received.
      if (appliedRef.current === target) {
        appliedRef.current = previous;
        geometry = previous ?? fallbackGeometry();
      }
      console.warn('set_overlay_bounds failed:', error);
    }
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    // Any pending shrink belongs to the previous state and must not fire
    // after a newer target has been chosen.
    clearShrinkTimer();
    const generation = ++generationRef.current;
    let cancelled = false;

    const run = async () => {
      const target = await computeTarget(
        fullScreen,
        metrics,
        tucked,
        notificationActive,
        notificationHeight
      );
      if (cancelled || generation !== generationRef.current || !target) return;

      const previous = appliedRef.current;
      const grows =
        !previous || target.fullScreen || target.area >= previous.width * previous.height;
      if (grows) {
        void applyTarget(target);
        return;
      }

      // The pill/island is animating down; keep the window large until it has
      // finished, otherwise the animation is cut off at the window edge.
      shrinkTimerRef.current = window.setTimeout(() => {
        shrinkTimerRef.current = null;
        if (generation !== generationRef.current) return;
        void applyTarget(target);
      }, SHRINK_DELAY_MS);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    applyTarget,
    clearShrinkTimer,
    fullScreen,
    metrics,
    notificationActive,
    notificationHeight,
    tucked,
  ]);

  // Recompute against the live monitor and DPR on a slow timer. This repairs
  // the window after a resolution, scale or primary-monitor change, and
  // re-asserts the strip if the OS ever resizes the window behind our back.
  const verify = useCallback(async () => {
    const current = stateRef.current;
    const target = await computeTarget(
      current.fullScreen,
      current.metrics,
      current.tucked,
      current.notificationActive,
      current.notificationHeight
    );
    if (!target) return;

    // A state change landed while the monitor was being queried; that change
    // has its own effect run and owns the next bounds.
    const latest = stateRef.current;
    if (
      latest.fullScreen !== current.fullScreen ||
      latest.tucked !== current.tucked ||
      latest.metrics !== current.metrics ||
      latest.notificationActive !== current.notificationActive ||
      latest.notificationHeight !== current.notificationHeight
    ) {
      return;
    }

    const applied = appliedRef.current;
    if (!applied) {
      void applyTarget(target);
      return;
    }
    if (sameRect(applied, target)) return;
    // Never cut a shrink that is waiting for the shell animation.
    if (shrinkTimerRef.current !== null && target.area < applied.width * applied.height) {
      return;
    }

    clearShrinkTimer();
    void applyTarget(target);
  }, [applyTarget, clearShrinkTimer]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const timer = window.setInterval(() => {
      void verify();
    }, VERIFY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [verify]);

  useEffect(() => clearShrinkTimer, [clearShrinkTimer]);

  return screen;
}
