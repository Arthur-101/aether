import { useEffect, useRef } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

/**
 * Handles files dropped anywhere on the transparent overlay.
 * While the Radial Wheel owns a drag, its slice action is authoritative and
 * the native Tauri drop must not attach the file to Quick Chat as well.
 */
export function useTauriFileDrop(
  onFileDrop: (filePath: string) => void,
  wheelFile: string | null
): void {
  const wheelOpen = useRef(false);
  const suppressUntil = useRef(0);

  if (wheelFile) {
    wheelOpen.current = true;
  } else if (wheelOpen.current) {
    // WebSocket and native drop events can arrive in either order, so keep
    // suppressing Explorer drops briefly after the wheel closes. Matching the
    // exact path is unreliable (the wheel may hold a different path than the
    // one Windows reports), so any drop landing in this window is treated as
    // belonging to the wheel rather than leaking into Quick Chat.
    wheelOpen.current = false;
    suppressUntil.current = Date.now() + 1500;
  }

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;

        if (wheelOpen.current || Date.now() < suppressUntil.current) return;

        event.payload.paths.forEach((filePath) => onFileDrop(filePath));
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((error) => console.warn('Tauri file drop listener failed:', error));
    return () => unlisten?.();
  }, [onFileDrop]);
}
