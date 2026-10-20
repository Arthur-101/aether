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
  'rounded p-1 text-[#8b8b8b] transition hover:bg-white/10 hover:text-white';
const footerButton =
  'flex flex-1 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-[#d7d7d7] transition hover:bg-white/10 hover:text-white';

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
  <div className="controls-menu rounded-lg border border-white/12 bg-[#232323]/98 p-2.5 shadow-2xl">
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Wifi size={14} className="shrink-0 text-[#60cdff]" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-white">Wi-Fi</p>
          <p className="truncate text-[9px] text-[#8b8b8b]">
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
      <div className="mt-2.5 flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] text-[#c7c7c7]">
          <WifiOff size={12} />
          Wi-Fi is turned off
        </span>
        <button
          type="button"
          onClick={() => onToggle(true)}
          className="rounded-md bg-[#0067c0] px-2 py-1 text-[10px] font-medium text-white transition hover:bg-[#0078d4]"
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
              <span className="truncate text-[10px] text-[#e5e5e5]">{currentSsid}</span>
            </div>
            <button
              type="button"
              onClick={onDisconnect}
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] text-[#ffb3b8] transition hover:bg-white/10"
            >
              Disconnect
            </button>
          </div>
        ) : null}

        <p className="mt-2.5 px-1 text-[9px] uppercase tracking-wider text-[#8b8b8b]">
          Saved networks
        </p>
        <div className="mt-1 max-h-[132px] overflow-y-auto">
          {loading && profiles.length === 0 ? (
            <p className="flex items-center gap-1.5 px-2 py-2 text-[10px] text-[#8b8b8b]">
              <Loader2 size={11} className="animate-spin" />
              Looking for saved networks…
            </p>
          ) : profiles.length === 0 ? (
            <p className="px-2 py-2 text-[10px] text-[#8b8b8b]">
              No saved Wi-Fi profiles. Use Windows settings to add one.
            </p>
          ) : (
            profiles.map((profile) => (
              <div
                key={profile.name}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-white/5"
              >
                <span className={profile.connected ? 'text-[#6ccb5f]' : 'text-[#8b8b8b]'}>
                  {profile.connected ? <Check size={12} /> : <Wifi size={12} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-[#e5e5e5]">
                  {profile.name}
                </span>
                {profile.connected ? (
                  <span className="text-[9px] text-[#6ccb5f]">Connected</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onConnect(profile.name)}
                    disabled={connecting === profile.name}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-[#60cdff] transition hover:bg-white/10 disabled:opacity-60"
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
