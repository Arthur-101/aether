/**
 * Aether Click-Through Hit Testing
 * The overlay is a transparent, always-on-top Tauri window that is normally
 * only as large as the idle pill. Empty areas must pass clicks to the desktop.
 * Python streams global cursor coordinates (so they keep arriving even while
 * the window ignores the mouse); this hook translates those screen
 * coordinates into window-local CSS pixels and hit-tests them against
 * [data-aether-interactive] regions, toggling OS-level cursor transparency.
 */

import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getOverlayGeometry } from './useOverlayBounds';

type MouseSubscriber = (cb: (x: number, y: number) => void) => () => void;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function useClickThrough(
  subscribeMouse: MouseSubscriber,
  connected: boolean
): void {
  const ignoreRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    const tauriWindow = getCurrentWindow();
    let disposed = false;
    let lastCheck = 0;

    const applyIgnore = async (ignore: boolean) => {
      if (disposed || ignoreRef.current === ignore) return;
      const previous = ignoreRef.current;
      ignoreRef.current = ignore;
      try {
        await tauriWindow.setIgnoreCursorEvents(ignore);
      } catch (err) {
        // Never leave the ref claiming a state the OS rejected. Otherwise the
        // guard above suppresses every retry and the fullscreen window stays
        // interactive, swallowing clicks meant for the desktop.
        if (!disposed && ignoreRef.current === ignore) {
          ignoreRef.current = previous;
        }
        console.warn('setIgnoreCursorEvents failed:', err);
      }
    };

    const isOverInteractiveRegion = (x: number, y: number, pad: number): boolean => {
      const regions = document.querySelectorAll('[data-aether-interactive]');
      for (const region of regions) {
        const rect = region.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        // The auto-hide sensor occupies only the top bezel. It must release
        // input immediately when the cursor exits rather than inheriting the
        // shell's 8px hysteresis, which would otherwise create a tiny trap.
        const regionPad = region.hasAttribute('data-aether-interactive-strict')
          ? 0
          : pad;
        if (
          x >= rect.left - regionPad &&
          x <= rect.right + regionPad &&
          y >= rect.top - regionPad &&
          y <= rect.bottom + regionPad
        ) {
          return true;
        }
      }
      return false;
    };

    // Start fully click-through. The first mouse position re-enables UI hover.
    if (!connected) {
      // Offline: the Python cursor stream is gone, so per-region hit-testing
      // cannot run. Keep the overlay click-through — making the fullscreen
      // window interactive would trap the user's entire desktop. Retry until
      // the OS confirms the state instead of trusting an unverified ref.
      ignoreRef.current = null;
      void applyIgnore(true);
      const retry = window.setInterval(() => {
        if (ignoreRef.current !== true) void applyIgnore(true);
      }, 500);
      return () => {
        disposed = true;
        window.clearInterval(retry);
      };
    }

    void applyIgnore(true);

    let lastX: number | null = null;
    let lastY: number | null = null;

    const evaluate = (physicalX: number, physicalY: number) => {
      lastX = physicalX;
      lastY = physicalY;

      // Python reports global physical pixels. The window is no longer
      // guaranteed to start at (0, 0) or cover the whole screen, so subtract
      // its physical origin before converting to CSS pixels.
      const bounds = getOverlayGeometry();
      const scale = bounds.dpr || 1;
      const x = (physicalX - bounds.x) / scale;
      const y = (physicalY - bounds.y) / scale;
      const width = bounds.width / scale;
      const height = bounds.height / scale;

      if (x < 0 || y < 0 || x > width || y > height) {
        void applyIgnore(true);
        return;
      }

      // Hysteresis: pad the rects while interactive to avoid flicker at edges.
      const interactive = isOverInteractiveRegion(x, y, ignoreRef.current === false ? 8 : 0);
      void applyIgnore(!interactive);
    };

    const unsubscribe = subscribeMouse((physicalX, physicalY) => {
      const now = performance.now();
      if (now - lastCheck < 16) return;
      lastCheck = now;
      evaluate(physicalX, physicalY);
    });

    // The cursor stream only fires on movement. Re-evaluate the last known
    // point periodically so a rejected/raced IPC call can recover without the
    // user having to jiggle the mouse.
    const watchdog = window.setInterval(() => {
      if (lastX === null || lastY === null) {
        if (ignoreRef.current === null) void applyIgnore(true);
        return;
      }
      evaluate(lastX, lastY);
    }, 500);

    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      unsubscribe();
    };
  }, [connected, subscribeMouse]);
}
