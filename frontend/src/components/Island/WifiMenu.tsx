import React from 'react';
import {
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { WifiProfile } from '../../types/ipc';

interface WifiMenuProps {
  profiles: WifiProfile[];
  currentSsid?: string;
  wifiEnabled: boolean | null;
  connecting: string | null;
  loading: boolean;
  onRefresh: () => void;
  onConnect: (profile: string) => void;
  onDisconnect: () => void;
  onToggle: (enabled: boolean) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const iconButton =
  'rounded p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';
const footerButton =
  'flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-1.5 text-[10px] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';

export const WifiMenu: React.FC<WifiMenuProps> = ({
  profiles,
  currentSsid,
  wifiEnabled,
  connecting,
  loading,
  onRefresh,
  onConnect,
  onDisconnect,
  onToggle,
  onOpenSettings,
  onClose,
}) => (
  <div className="controls-menu rounded-lg border border-[var(--aether-line)] bg-[var(--aether-surface-2)] p-2.5 shadow-2xl">
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Wifi size={14} className="shrink-0 text-[var(--aether-accent-text)]" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[var(--aether-text-1)]">Wi-Fi</p>
          <p className="truncate text-[9px] text-[var(--aether-text-3)]">
            {wifiEnabled === false
              ? 'Radio off'
              : currentSsid
                ? `Connected to ${currentSsid}`
                : 'Not connected'}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={onRefresh} title="Refresh saved networks" className={iconButton}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
        <button type="button" onClick={onClose} title="Close" className={iconButton}>
          <X size={12} />
        </button>
      </div>
    </div>

    {wifiEnabled === false ? (
      <div className="mt-2.5 flex items-center justify-between rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--aether-text-2)]">
          <WifiOff size={12} />
          Wi-Fi is turned off
        </span>
        <button
          type="button"
          onClick={() => onToggle(true)}
          className="rounded-md accent-fill px-2 py-1 text-[10px] font-medium transition"
        >
          Turn on
        </button>
      </div>
    ) : (
      <>
        {currentSsid ? (
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-md border border-[#6ccb5f]/25 bg-[#6ccb5f]/10 px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <Check size={12} className="shrink-0 text-[#6ccb5f]" />
              <span className="truncate text-[10px] text-[var(--aether-text-1)]">{currentSsid}</span>
            </div>
            <button
              type="button"
              onClick={onDisconnect}
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] text-[#ffb3b8] transition hover:bg-[var(--aether-fill-2)]"
            >
              Disconnect
            </button>
          </div>
        ) : null}

        <p className="mt-2.5 px-1 text-[9px] uppercase tracking-wider text-[var(--aether-text-3)]">
          Saved networks
        </p>
        <div className="mt-1 max-h-[132px] overflow-y-auto">
          {loading && profiles.length === 0 ? (
            <p className="flex items-center gap-1.5 px-2 py-2 text-[10px] text-[var(--aether-text-3)]">
              <Loader2 size={11} className="animate-spin" />
              Looking for saved networks…
            </p>
          ) : profiles.length === 0 ? (
            <p className="px-2 py-2 text-[10px] text-[var(--aether-text-3)]">
              No saved Wi-Fi profiles. Use Windows settings to add one.
            </p>
          ) : (
            profiles.map((profile) => (
              <div
                key={profile.name}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-[var(--aether-fill)]"
              >
                <span className={profile.connected ? 'text-[#6ccb5f]' : 'text-[var(--aether-text-3)]'}>
                  {profile.connected ? <Check size={12} /> : <Wifi size={12} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--aether-text-1)]">
                  {profile.name}
                </span>
                {profile.connected ? (
                  <span className="text-[9px] text-[#6ccb5f]">Connected</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onConnect(profile.name)}
                    disabled={connecting === profile.name}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-[var(--aether-accent-text)] transition hover:bg-[var(--aether-fill-2)] disabled:opacity-60"
                  >
                    {connecting === profile.name ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : null}
                    Connect
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </>
    )}

    <div className="mt-2 flex gap-1.5">
      <button type="button" onClick={onOpenSettings} className={footerButton}>
        <ExternalLink size={11} />
        Network settings
      </button>
    </div>
  </div>
);
