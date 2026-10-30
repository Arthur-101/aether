import React, { useEffect } from 'react';
import {
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Globe,
  KeyRound,
  LogOut,
  Plug,
  RefreshCw,
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
  tavilyKey: string;
  onTavilyKeyChange: (value: string) => void;
}

const DASHBOARD_URL = 'https://developer.spotify.com/dashboard';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const TAVILY_URL = 'https://app.tavily.com/home';

const connectButtonClass =
  'accent-fill inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-[10px] font-semibold transition disabled:opacity-40';

const setupSummaryClass =
  'flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-[10px] text-[var(--aether-text-2)] transition hover:text-[var(--aether-text-1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)] [&::-webkit-details-marker]:hidden';

function openLink(url: string) {
  void openExternalTarget(url).then((opened) => {
    if (!opened) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  });
}

const StatusDot: React.FC<{ tone: 'on' | 'pending' | 'off' }> = ({ tone }) => (
  <span
    aria-hidden
    className={`h-2 w-2 shrink-0 rounded-full ${
      tone === 'on'
        ? 'bg-emerald-400'
        : tone === 'pending'
          ? 'bg-amber-400'
          : 'bg-[var(--aether-text-3)]'
    }`}
  />
);

/**
 * Third-party connections. Each service is one compact card: status header,
 * a single credential row, and (where needed) collapsible setup steps. Spotify
 * keeps its Client ID in config.json while PKCE tokens stay in app-data; the
 * Tavily key lives in the AI config section but is managed here.
 */
export const IntegrationsSettings: React.FC<IntegrationsSettingsProps> = ({
  clientId,
  auth,
  onClientIdChange,
  onConnect,
  onDisconnect,
  onRefresh,
  tavilyKey,
  onTavilyKeyChange,
}) => {
  const trimmed = clientId.trim();
  const connected = auth.connected;
  const pending = auth.pending;
  const error = !pending && Boolean(auth.message);
  const tavilyReady = Boolean(tavilyKey.trim());

  // Settings mounts this tab on demand, so ask the daemon for the live state.
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const statusTitle = connected
    ? 'Connected'
    : pending
      ? 'Connecting…'
      : 'Not connected';
  const statusDetail = connected
    ? auth.display_name
      ? `Signed in as ${auth.display_name}`
      : 'Spotify account linked'
    : pending
      ? 'Waiting for sign-in in your browser'
      : 'Add a Client ID to connect';

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
              <StatusDot tone={connected ? 'on' : pending ? 'pending' : 'off'} />
              <div className="min-w-0">
                <span className="block text-[11px] text-[var(--aether-text-1)]">
                  {statusTitle}
                </span>
                <span className="block truncate text-[9px] text-[var(--aether-text-3)]">
                  {statusDetail}
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

          <div className="flex flex-col gap-2 px-2.5 py-2.5">
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
                {pending ? 'Waiting...' : connected ? 'Reconnect' : 'Connect'}
              </button>
            </div>
            {connected || pending ? (
              <button
                type="button"
                onClick={onDisconnect}
                className={`${settingsSecondaryButtonClass} self-start`}
                title="Disconnect Spotify"
              >
                <LogOut size={12} />
                Disconnect
              </button>
            ) : null}
            <p className={settingsHintClass}>
              The Client ID is stored in config.json. Access and refresh tokens
              stay in your Windows app-data folder and are never sent to the chat
              model.
            </p>
            {!trimmed && auth.client_id_set ? (
              <p className={settingsHintClass}>
                A Client ID is already saved. Paste it again to reconnect or
                switch Spotify apps.
              </p>
            ) : null}
          </div>

          <details className="group border-t border-[var(--aether-line-soft)]">
            <summary className={setupSummaryClass}>
              <span className="flex items-center gap-1.5">
                <KeyRound size={11} />
                Developer app setup
              </span>
              <ChevronDown
                size={13}
                className="shrink-0 text-[var(--aether-text-3)] transition group-open:rotate-180"
              />
            </summary>
            <div className="flex flex-col gap-2 border-t border-[var(--aether-line-soft)] px-2.5 py-2">
              <ol className="list-decimal space-y-1 pl-4 text-[10px] leading-snug text-[var(--aether-text-2)]">
                <li>Create an app in the Spotify Developer Dashboard.</li>
                <li>
                  Add this exact Redirect URI in the app settings:
                  <span className="mt-1 block select-all rounded border border-[var(--aether-line)] bg-black/20 px-2 py-1 font-mono text-[10px] text-[var(--aether-text-1)]">
                    {REDIRECT_URI}
                  </span>
                </li>
                <li>Copy the Client ID, paste it above, then choose Connect.</li>
              </ol>
              <div className="flex items-center justify-between gap-2 border-t border-[var(--aether-line-soft)] pt-2">
                <p className={settingsHintClass}>
                  Aether uses PKCE and never asks for a Client Secret.
                </p>
                <button
                  type="button"
                  onClick={() => openLink(DASHBOARD_URL)}
                  className={settingsSecondaryButtonClass}
                >
                  <ExternalLink size={12} />
                  Open dashboard
                </button>
              </div>
            </div>
          </details>
        </div>
      </SettingsGroup>

      <SettingsGroup
        icon={<Globe size={13} />}
        title="Web search"
        hint="Live search results for the assistant. Reading a known URL works without a key."
      >
        <div className={settingsCardClass}>
          <div className={settingsRowClass}>
            <div className="flex min-w-0 items-center gap-2">
              <StatusDot tone={tavilyReady ? 'on' : 'off'} />
              <div className="min-w-0">
                <span className="block text-[11px] text-[var(--aether-text-1)]">
                  {tavilyReady ? 'Key saved' : 'No key yet'}
                </span>
                <span className="block truncate text-[9px] text-[var(--aether-text-3)]">
                  Tavily · powers live web search
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 px-2.5 py-2.5">
            <label className={settingsLabelClass} htmlFor="tavily-api-key">
              Tavily API key
            </label>
            <input
              id="tavily-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={tavilyKey}
              onChange={(event) => onTavilyKeyChange(event.target.value)}
              placeholder="tvly-..."
              className={`${settingsMonoInputClass} w-full`}
            />
            <div className="flex items-center justify-between gap-2">
              <p className={settingsHintClass}>
                Stored locally in %APPDATA%/Aether and only used by the backend.
              </p>
              <button
                type="button"
                onClick={() => openLink(TAVILY_URL)}
                className={settingsSecondaryButtonClass}
              >
                <ExternalLink size={12} />
                Get a key
              </button>
            </div>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
};