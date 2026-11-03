/**
 * External Windows windows launched from Aether.
 *
 * The Python daemon can start Explorer/Settings, but it cannot reliably bring
 * them to the foreground. These actions go through a Tauri command running in
 * the Aether process instead.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';

export interface ExternalPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SETTINGS_URIS: Record<string, string> = {
  wifi: 'ms-settings:network-wifi',
  bluetooth: 'ms-settings:bluetooth',
  sound: 'ms-settings:sound',
  display: 'ms-settings:display',
  network: 'ms-settings:network',
  settings: 'ms-settings:',
};

export function settingsUri(page: string): string | null {
  return SETTINGS_URIS[(page || '').trim().toLowerCase()] ?? null;
}

export async function openExternalTarget(
  target: string,
  placement?: ExternalPlacement
): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    await invoke('open_external', { target, placement });
    return true;
  } catch (error) {
    console.error('Could not open external window:', error);
    return false;
  }
}

export async function openSettingsPageExternal(page: string): Promise<boolean> {
  const uri = settingsUri(page);
  if (!uri) return false;
  return openExternalTarget(uri);
}

/**
 * Picks the largest free side area beside the open Settings panel and returns
 * it in physical screen pixels for SetWindowPos. Settings opens on the right, so
 * this normally puts Explorer on the left; if Settings is dragged past center,
 * Explorer moves to the right instead.
 */
export function placementBesideSettings(): ExternalPlacement | undefined {
  const panel = document.querySelector<HTMLElement>('[data-aether-settings-panel]');
  if (!panel) return undefined;

  const rect = panel.getBoundingClientRect();
  const minWidth = 320;
  // Match the reference layout: a ~800x810 px Explorer at the top-left, with
  // the Settings panel open on the right.
  const height = Math.min(723, window.innerHeight);
  const spaceLeft = rect.left;
  const spaceRight = window.innerWidth - rect.right;
  const useLeft = spaceLeft >= spaceRight;
  const available = useLeft ? spaceLeft : spaceRight;
  if (available < minWidth || height < 240) return undefined;

  const width = Math.min(714, available);
  const left = useLeft ? 0 : window.innerWidth - width;
  const top = 0;
  const dpr = window.devicePixelRatio || 1;
  return {
    x: Math.round((window.screenX + left) * dpr),
    y: Math.round((window.screenY + top) * dpr),
    width: Math.round(width * dpr),
    height: Math.round(height * dpr),
  };
}
