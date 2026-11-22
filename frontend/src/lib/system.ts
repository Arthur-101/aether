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

export interface TempCleanResult {
  path: string;
  freed_bytes: number;
  deleted: number;
  /** Entries left behind, almost always because another process holds them. */
  skipped: number;
}

/** Sweeps %TEMP% on the daemon side; null when the daemon could not run it. */
export async function cleanTempFiles(): Promise<TempCleanResult | null> {
  try {
    const response = await fetch(`${API_BASE}/api/system/clean-temp`, {
      method: 'POST',
    });
    if (!response.ok) return null;
    const data = (await response.json()) as TempCleanResult;
    if (typeof data.freed_bytes !== 'number') return null;
    return data;
  } catch (err) {
    console.error('Temp cleanup failed:', err);
    return null;
  }
}
