import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/** Let the daemon finish its handshake before the first network request. */
const FIRST_CHECK_DELAY_MS = 3_000;

export type UpdatePhase =
  | 'idle'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'error';

export interface UpdaterApi {
  phase: UpdatePhase;
  version: string | null;
  notes: string | null;
  /** 0..1 while downloading; null until the server reports a content length. */
  progress: number | null;
  error: string | null;
  install: () => void;
  dismiss: () => void;
}

/**
 * Silent update check against the signed GitHub Releases manifest.
 *
 * One check runs shortly after launch and paints nothing while the app is
 * current. When a newer version exists the notice docks under the island;
 * installing downloads in the background, then hands off to the NSIS updater,
 * which exits the app and relaunches it on Windows. "Later" hides the notice
 * for this session only — the next launch checks again.
 *
 * A browser preview and a dev build never check: they run from source, so
 * there is no installed release to replace.
 */
export function useUpdater(): UpdaterApi {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    if (!isTauri() || import.meta.env.DEV) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      void check()
        .then((update) => {
          if (disposed || !update) return;
          updateRef.current = update;
          setVersion(update.version);
          setNotes(update.body?.trim() || null);
          setPhase('available');
        })
        .catch((reason) => {
          // Offline or a manifest hiccup is not worth interrupting the user.
          console.warn('Update check failed:', reason);
        });
    }, FIRST_CHECK_DELAY_MS);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      void updateRef.current?.close().catch(() => undefined);
      updateRef.current = null;
    };
  }, []);

  const install = useCallback(() => {
    const update = updateRef.current;
    if (!update) return;
    setError(null);
    setPhase('downloading');
    let total = 0;
    let downloaded = 0;
    void update
      .downloadAndInstall(
        (event) => {
          if (event.event === 'Started') {
            total = event.data.contentLength ?? 0;
            setProgress(0);
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            setProgress(total > 0 ? Math.min(1, downloaded / total) : null);
          } else {
            setProgress(null);
            setPhase('installing');
          }
        },
        { restartAfterInstall: true }
      )
      .then(() => relaunch())
      .catch((reason) => {
        setError(String(reason));
        setPhase('error');
      });
  }, []);

  const dismiss = useCallback(() => {
    const current = updateRef.current;
    if (current) {
      void current.close().catch(() => undefined);
      updateRef.current = null;
    }
    setError(null);
    setPhase('idle');
  }, []);

  return { phase, version, notes, progress, error, install, dismiss };
}
