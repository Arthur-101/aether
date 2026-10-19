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
  const wheelPath = useRef('');
  const wheelDropGuard = useRef<{ path: string; until: number } | null>(null);

  if (wheelFile) {
    wheelOpen.current = true;
    wheelPath.current = wheelFile;
  } else if (wheelOpen.current) {
    // WebSocket and native drop events can arrive in either order, so keep
    // suppressing the matching Explorer drop briefly after the wheel closes.
    wheelOpen.current = false;
    wheelDropGuard.current = {
      path: wheelPath.current,
      until: Date.now() + 1500,
    };
  }

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;

        const guard = wheelDropGuard.current;
        const wheelOwnsDrop =
          wheelOpen.current ||
          Boolean(
            guard &&
              Date.now() < guard.until &&
              event.payload.paths.includes(guard.path)
          );
        if (wheelOwnsDrop) return;

        event.payload.paths.forEach((filePath) => onFileDrop(filePath));
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((error) => console.warn('Tauri file drop listener failed:', error));
    return () => unlisten?.();
  }, [onFileDrop]);
}
