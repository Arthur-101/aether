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
  'rounded p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';
const footerButton =
  'flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-1.5 text-[10px] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';

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
  <div className="controls-menu rounded-lg border border-[var(--aether-line)] bg-[var(--aether-surface-2)] p-2.5 shadow-2xl">
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Bluetooth size={14} className="shrink-0 text-[var(--aether-accent-text)]" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[var(--aether-text-1)]">Bluetooth</p>
          <p className="truncate text-[9px] text-[var(--aether-text-3)]">
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
      <div className="mt-2.5 flex items-center justify-between rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-1.5">
        <span className="text-[10px] text-[var(--aether-text-2)]">Bluetooth is turned off</span>
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
        <p className="mt-2.5 px-1 text-[9px] uppercase tracking-wider text-[var(--aether-text-3)]">
          Paired devices
        </p>
        <div className="mt-1 max-h-[132px] overflow-y-auto">
          {loading && devices.length === 0 ? (
            <p className="flex items-center gap-1.5 px-2 py-2 text-[10px] text-[var(--aether-text-3)]">
              <Loader2 size={11} className="animate-spin" />
              Looking for paired devices…
            </p>
          ) : devices.length === 0 ? (
            <p className="px-2 py-2 text-[10px] text-[var(--aether-text-3)]">
              No paired devices found. Pair one in Windows settings.
            </p>
          ) : (
            devices.map((device) => (
              <button
                key={`${device.name}-${device.instance_id || 'current'}`}
                type="button"
                onClick={onOpenSettings}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-[var(--aether-fill)]"
              >
                <span className={device.connected ? 'text-[#6ccb5f]' : 'text-[var(--aether-text-3)]'}>
                  <Bluetooth size={12} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] text-[var(--aether-text-1)]">
                    {device.name}
                  </span>
                  <span className="block text-[9px] text-[var(--aether-text-3)]">
                    {device.connected ? 'Connected' : device.status || 'Paired'}
                  </span>
                </span>
                <ExternalLink size={10} className="shrink-0 text-[var(--aether-text-3)]" />
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
          className="rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-1.5 text-[10px] text-[#ffb3b8] transition hover:bg-[#ff99a4]/10"
        >
          Turn off
        </button>
      ) : null}
    </div>
  </div>
);
