import { useEffect, useState } from 'react';

const API_BASE = 'http://127.0.0.1:8765';

export interface ImagePreviewData {
  width: number;
  height: number;
  previewWidth: number;
  previewHeight: number;
  dataUrl: string;
}

interface PreviewState {
  path: string;
  status: 'ready' | 'error';
  data?: ImagePreviewData;
  error?: string;
}

interface PreviewResponse {
  width: number;
  height: number;
  preview_width: number;
  preview_height: number;
  data_url: string;
}

/**
 * Loads the oriented size and a thumbnail for a local image. State is keyed by
 * path so a previous image never flashes while the next one is loading.
 */
export function useImagePreview(
  filePath: string,
  enabled: boolean,
  reloadToken = 0
): {
  preview: ImagePreviewData | null;
  loading: boolean;
  error: string | null;
} {
  const [state, setState] = useState<PreviewState | null>(null);

  useEffect(() => {
    if (!enabled || !filePath) return;
    let cancelled = false;
    const controller = new AbortController();

    fetch(
      `${API_BASE}/api/media/preview?path=${encodeURIComponent(filePath)}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) {
          let detail = 'Could not load the image preview.';
          try {
            const body = (await response.json()) as { detail?: string };
            if (body?.detail) detail = String(body.detail);
          } catch {
            /* keep the fallback message */
          }
          throw new Error(detail);
        }
        return response.json() as Promise<PreviewResponse>;
      })
      .then((payload) => {
        if (cancelled) return;
        setState({
          path: filePath,
          status: 'ready',
          data: {
            width: Number(payload.width),
            height: Number(payload.height),
            previewWidth: Number(payload.preview_width),
            previewHeight: Number(payload.preview_height),
            dataUrl: String(payload.data_url),
          },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          path: filePath,
          status: 'error',
          error: error instanceof Error ? error.message : 'Could not load the image preview.',
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [filePath, enabled, reloadToken]);

  const current = state?.path === filePath ? state : null;
  return {
    preview: current?.status === 'ready' ? current.data ?? null : null,
    loading: enabled && Boolean(filePath) && !current,
    error:
      current?.status === 'error'
        ? current.error ?? 'Could not load the image preview.'
        : null,
  };
}
