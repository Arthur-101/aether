import React from 'react';
import {
  Bluetooth,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { BluetoothDeviceInfo } from '../../types/ipc';

interface BluetoothMenuProps {
  devices: BluetoothDeviceInfo[];
  bluetoothEnabled: boolean | null;
  currentDevice?: string;
  loading: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onToggle: (enabled: boolean) => void;
  onClose: () => void;
}

const iconButton =
  'rounded p-1 text-[#8b8b8b] transition hover:bg-white/10 hover:text-white';
const footerButton =
  'flex flex-1 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-[#d7d7d7] transition hover:bg-white/10 hover:text-white';

export const BluetoothMenu: React.FC<BluetoothMenuProps> = ({
  devices,
  bluetoothEnabled,
  currentDevice,
  loading,
  onRefresh,
  onOpenSettings,
  onToggle,
  onClose,
}) => (
  <div className="controls-menu rounded-lg border border-white/12 bg-[#232323]/98 p-2.5 shadow-2xl">
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Bluetooth size={14} className="shrink-0 text-[#60cdff]" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-white">Bluetooth</p>
          <p className="truncate text-[9px] text-[#8b8b8b]">
            {bluetoothEnabled === false
              ? 'Radio off'
              : currentDevice
                ? `Connected to ${currentDevice}`
                : 'On · No device connected'}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={onRefresh} title="Refresh paired devices" className={iconButton}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
        <button type="button" onClick={onClose} title="Close" className={iconButton}>
          <X size={12} />
        </button>
      </div>
    </div>

    {bluetoothEnabled === false ? (
      <div className="mt-2.5 flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
        <span className="text-[10px] text-[#c7c7c7]">Bluetooth is turned off</span>
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
        <p className="mt-2.5 px-1 text-[9px] uppercase tracking-wider text-[#8b8b8b]">
          Paired devices
        </p>
        <div className="mt-1 max-h-[132px] overflow-y-auto">
          {loading && devices.length === 0 ? (
            <p className="flex items-center gap-1.5 px-2 py-2 text-[10px] text-[#8b8b8b]">
              <Loader2 size={11} className="animate-spin" />
              Looking for paired devices…
            </p>
          ) : devices.length === 0 ? (
            <p className="px-2 py-2 text-[10px] text-[#8b8b8b]">
              No paired devices found. Pair one in Windows settings.
            </p>
          ) : (
            devices.map((device) => (
              <button
                key={`${device.name}-${device.instance_id || 'current'}`}
                type="button"
                onClick={onOpenSettings}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white/5"
              >
                <span className={device.connected ? 'text-[#6ccb5f]' : 'text-[#8b8b8b]'}>
                  <Bluetooth size={12} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] text-[#e5e5e5]">
                    {device.name}
                  </span>
                  <span className="block text-[9px] text-[#8b8b8b]">
                    {device.connected ? 'Connected' : device.status || 'Paired'}
                  </span>
                </span>
                <ExternalLink size={10} className="shrink-0 text-[#6f6f6f]" />
              </button>
            ))
          )}
        </div>
      </>
    )}

    <div className="mt-2 flex gap-1.5">
      <button type="button" onClick={onOpenSettings} className={footerButton}>
        <ExternalLink size={11} />
        Manage devices
      </button>
      {bluetoothEnabled !== false ? (
        <button
          type="button"
          onClick={() => onToggle(false)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-[#ffb3b8] transition hover:bg-[#ff99a4]/10"
        >
          Turn off
        </button>
      ) : null}
    </div>
  </div>
);
