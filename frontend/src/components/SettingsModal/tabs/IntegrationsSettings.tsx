import React, { useEffect } from 'react';
import {
  CircleAlert,
  ExternalLink,
  KeyRound,
  LogOut,
  Plug,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { SpotifyAuthState } from '../../../types/ipc';
import { openExternalTarget } from '../../../lib/externalWindows';
import { SettingsGroup } from '../SettingsControls';
import {
  settingsCardClass,
  settingsHintClass,
  settingsLabelClass,
  settingsMonoInputClass,
  settingsRowClass,
  settingsSecondaryButtonClass,
} from '../settingsStyles';

interface IntegrationsSettingsProps {
  clientId: string;
  auth: SpotifyAuthState;
  onClientIdChange: (value: string) => void;
  onConnect: (clientId: string) => void;
  onDisconnect: () => void;
  onRefresh: () => void;
}

const DASHBOARD_URL = 'https://developer.spotify.com/dashboard';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';

const connectButtonClass =
  'accent-fill inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-[10px] font-semibold transition disabled:opacity-40';

/**
 * Third-party connections. Spotify is the first integration; its Client ID is
 * stored in config.json while the PKCE tokens stay in the app-data folder.
 */
export const IntegrationsSettings: React.FC<IntegrationsSettingsProps> = ({
  clientId,
  auth,
  onClientIdChange,
  onConnect,
  onDisconnect,
  onRefresh,
}) => {
  const trimmed = clientId.trim();
  const connected = auth.connected;
  const pending = auth.pending;
  const error = !pending && Boolean(auth.message);

  // Settings mounts this tab on demand, so ask the daemon for the live state.
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const statusLabel = connected
    ? auth.display_name
      ? `Connected as ${auth.display_name}`
      : 'Connected'
    : pending
      ? 'Waiting for sign-in in your browser…'
      : 'Not connected';

  const openDashboard = () => {
    void openExternalTarget(DASHBOARD_URL).then((opened) => {
      if (!opened) {
        window.open(DASHBOARD_URL, '_blank', 'noopener,noreferrer');
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 pb-2">
      <SettingsGroup
        icon={<Plug size={13} />}
        title="Spotify"
        hint="Play, queue, and like music through the Spotify Web API. Playback control requires Spotify Premium."
      >
        <div className={settingsCardClass}>
          <div className={settingsRowClass}>
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${
                  connected
                    ? 'bg-emerald-400'
                    : pending
                      ? 'bg-amber-400'
                      : 'bg-[var(--aether-text-3)]'
                }`}
              />
              <div className="min-w-0">
                <span className="block text-[11px] text-[var(--aether-text-1)]">
                  Account
                </span>
                <span className="block truncate text-[9px] text-[var(--aether-text-3)]">
                  {statusLabel}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh Spotify status"
              aria-label="Refresh Spotify status"
              className="rounded-md p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)]"
            >
              <RefreshCw size={12} className={pending ? 'animate-spin' : ''} />
            </button>
          </div>

          {error ? (
            <div className="flex items-start gap-2 border-b border-[var(--aether-line-soft)] px-2.5 py-2 text-[10px] leading-snug text-[#ffd7d9]">
              <CircleAlert size={13} className="mt-0.5 shrink-0 text-[#ff99a4]" />
              <span>{auth.message}</span>
            </div>
          ) : null}

          <div className={settingsRowClass}>
            <div className="flex w-full flex-col gap-1.5">
              <label className={settingsLabelClass} htmlFor="spotify-client-id">
                Client ID
              </label>
              <div className="flex gap-1.5">
                <input
                  id="spotify-client-id"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={clientId}
                  onChange={(event) => onClientIdChange(event.target.value)}
                  placeholder="Paste your Spotify app Client ID"
                  className={`${settingsMonoInputClass} min-w-0 flex-1`}
                />
                {connected || pending ? (
                  <button
                    type="button"
                    onClick={onDisconnect}
                    className={settingsSecondaryButtonClass}
                    title="Disconnect Spotify"
                  >
                    <LogOut size={12} />
                    Disconnect
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onConnect(trimmed)}
                  disabled={!trimmed || pending}
                  className={connectButtonClass}
                  title={
                    connected
                      ? 'Sign in to Spotify again'
                      : 'Connect Aether to Spotify'
                  }
                >
                  <KeyRound size={12} />
                  {pending ? 'Waiting…' : connected ? 'Reconnect' : 'Connect'}
                </button>
              </div>
              <p className={settingsHintClass}>
                The Client ID is stored in config.json. Access and refresh tokens
                stay in your Windows app-data folder and are never sent to the
                chat model.
              </p>
              {!trimmed && auth.client_id_set ? (
                <p className={settingsHintClass}>
                  A Client ID is already saved. Paste it again to reconnect or
                  switch Spotify apps.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        icon={<ShieldCheck size={13} />}
        title="Developer app setup"
        hint="Aether signs in with Authorization Code + PKCE, so the app needs no client secret."
      >
        <div className={settingsCardClass}>
          <div className="flex flex-col gap-2 px-2.5 py-2">
            <ol className="list-decimal space-y-1 pl-4 text-[10px] leading-snug text-[var(--aether-text-2)]">
              <li>
                Open the Spotify Developer Dashboard and create an app (the name
                does not matter).
              </li>
              <li>
                Add this exact Redirect URI in the app settings:
                <span className="mt-1 block select-all rounded border border-[var(--aether-line)] bg-black/20 px-2 py-1 font-mono text-[10px] text-[var(--aether-text-1)]">
                  {REDIRECT_URI}
                </span>
              </li>
              <li>Copy the app's Client ID, paste it above, then choose Connect.</li>
              <li>Sign in and approve the requested scopes in your browser.</li>
            </ol>
            <div className="flex items-center justify-between gap-2 border-t border-[var(--aether-line-soft)] pt-2">
              <p className={settingsHintClass}>
                Never paste your Client Secret here. Aether never asks for it and
                never stores it.
              </p>
              <button
                type="button"
                onClick={openDashboard}
                className={settingsSecondaryButtonClass}
              >
                <ExternalLink size={12} />
                Open dashboard
              </button>
            </div>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
};
