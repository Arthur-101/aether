/**
 * Keeps the island at the top of the topmost window band.
 *
 * The main window is member of the topmost band by config, but Windows
 * re-orders *within* the band whenever any topmost window is activated, so a
 * window the user pinned "always on top" (or an overlay) can bury the island
 * between widget syncs. This hook asks the Rust side to re-assert the standing
 * Z order — the main window plus the on-top widgets — at a slow, fixed pace.
 *
 * Each re-assert is a handful of native `SetWindowPos` calls (microsecond
 * scale, no repaint): cheap enough that the interval is not a timer-risk.
 */

import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

/** How often the standing Z order is re-asserted, in milliseconds. */
const REASSERT_INTERVAL = 5_000;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function useIslandOnTop(): void {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    void invoke('ensure_on_top').catch(() => undefined);
    const timer = window.setInterval(() => {
      void invoke('ensure_on_top').catch(() => undefined);
    }, REASSERT_INTERVAL);

    return () => window.clearInterval(timer);
  }, []);
}
