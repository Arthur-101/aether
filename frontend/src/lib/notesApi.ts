/**
 * Aether Notes HTTP helpers
 * Clipboard images are uploaded to the vault over the local FastAPI server.
 */

const API_BASE = 'http://127.0.0.1:8765';
const MAX_EDGE = 1600;
const MAX_DIRECT_BYTES = 3_000_000;

export function noteAssetUrl(pathOrName: string): string {
  const name = pathOrName.split(/[\\/]/).pop() || '';
  return `${API_BASE}/notes/assets/${encodeURIComponent(name)}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}

async function prepareImage(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= MAX_DIRECT_BYTES) {
      bitmap.close();
      return readAsDataUrl(file);
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return readAsDataUrl(file);
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const keepsAlpha = file.type === 'image/png' || file.type === 'image/webp';
    return canvas.toDataURL(keepsAlpha ? 'image/png' : 'image/jpeg', 0.86);
  } catch {
    return readAsDataUrl(file);
  }
}

export async function uploadNoteImageData(
  dataUrl: string,
  fileName: string
): Promise<string> {
  const response = await fetch(`${API_BASE}/notes/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: fileName, data_url: dataUrl }),
  });
  if (!response.ok) {
    let detail = 'Could not save the image.';
    try {
      const body = await response.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* keep the fallback message */
    }
    throw new Error(detail);
  }
  const data = await response.json();
  return typeof data.path === 'string' ? data.path : '';
}

export async function uploadNoteImage(file: File): Promise<string> {
  const dataUrl = await prepareImage(file);
  return uploadNoteImageData(dataUrl, file.name);
}

export async function openNotesFolder(): Promise<void> {
  try {
    await fetch(`${API_BASE}/notes/open-folder`);
  } catch (err) {
    console.error('Could not open notes folder:', err);
  }
}
