/**
 * Aether system helpers for native Windows dialogs.
 */

const API_BASE = 'http://127.0.0.1:8765';

export interface NativeDialogPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function pickNativePath(
  kind: 'file' | 'directory',
  filter: string = 'gguf',
  placement?: NativeDialogPlacement
): Promise<string | null> {
  try {
    const params = new URLSearchParams({ kind, filter });
    if (placement) {
      params.set('x', String(Math.round(placement.x)));
      params.set('y', String(Math.round(placement.y)));
      params.set('width', String(Math.round(placement.width)));
      params.set('height', String(Math.round(placement.height)));
    }
    const response = await fetch(`${API_BASE}/api/system/pick-file?${params.toString()}`);
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.path === 'string' && data.path.length > 0 ? data.path : null;
  } catch (err) {
    console.error('Native file picker failed:', err);
    return null;
  }
}
