/**
 * Aether Click-Through Hit Testing
 * The overlay is a transparent, fullscreen, always-on-top Tauri window. Empty
 * areas must pass clicks to the desktop. Python streams global cursor
 * coordinates (so they keep arriving even while the window ignores the mouse);
 * this hook hit-tests those coordinates against [data-aether-interactive]
 * regions and toggles OS-level cursor transparency accordingly.
 */

import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
    let receivedAny = false;

    const applyIgnore = async (ignore: boolean) => {
      if (disposed || ignoreRef.current === ignore) return;
      ignoreRef.current = ignore;
      try {
        await tauriWindow.setIgnoreCursorEvents(ignore);
      } catch (err) {
        console.warn('setIgnoreCursorEvents failed:', err);
      }
    };

    const isOverInteractiveRegion = (x: number, y: number, pad: number): boolean => {
      const regions = document.querySelectorAll('[data-aether-interactive]');
      for (const region of regions) {
        const rect = region.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        if (
          x >= rect.left - pad &&
          x <= rect.right + pad &&
          y >= rect.top - pad &&
          y <= rect.bottom + pad
        ) {
          return true;
        }
      }
      return false;
    };

    // Start fully click-through. The first mouse position re-enables UI hover.
    void applyIgnore(true);

    const unsubscribe = subscribeMouse((physicalX, physicalY) => {
      receivedAny = true;
      const now = performance.now();
      if (now - lastCheck < 16) return;
      lastCheck = now;

      const scale = window.devicePixelRatio || 1;
      const x = physicalX / scale;
      const y = physicalY / scale;

      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
        void applyIgnore(true);
        return;
      }

      // Hysteresis: pad the rects while interactive to avoid flicker at edges.
      const interactive = isOverInteractiveRegion(x, y, ignoreRef.current === false ? 8 : 0);
      void applyIgnore(!interactive);
    });

    // Safety fallback: if the backend never streams cursor positions, keep the
    // island usable instead of leaving the entire screen unclickable.
    const fallback = window.setTimeout(() => {
      if (!receivedAny) void applyIgnore(false);
    }, 3000);

    return () => {
      disposed = true;
      unsubscribe();
      clearTimeout(fallback);
    };
  }, [subscribeMouse]);

  useEffect(() => {
    if (connected || !isTauriRuntime()) return;
    // Backend offline: let the user click the overlay (cannot hit-test anyway).
    ignoreRef.current = false;
    getCurrentWindow()
      .setIgnoreCursorEvents(false)
      .catch(() => undefined);
  }, [connected]);
}
