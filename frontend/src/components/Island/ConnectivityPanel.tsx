import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bluetooth, BluetoothOff, Plane, RadioTower, Settings2, Wifi, WifiOff } from 'lucide-react';
import { ControlPanel } from './ControlPanel';
import { ConnectivityRow } from './ConnectivityRow';

interface ConnectivityPanelProps {
  wifi: boolean | null;
  ssid: string;
  bluetooth: boolean | null;
  bluetoothName: string;
  airplane: boolean | null;
  hotspot: boolean | null;
  onToggleWifi: () => void;
  onToggleBluetooth: () => void;
  onToggleAirplane: () => void;
  onToggleHotspot: () => void;
  onOpenSettings: () => void;
  onOpenWifiMenu: () => void;
  onOpenBluetoothMenu: () => void;
  wifiMenuOpen?: boolean;
  bluetoothMenuOpen?: boolean;
  /** The Wi-Fi flyout, rendered inside the panel so it pushes the tiles down. */
  wifiMenu?: React.ReactNode;
  /** The Bluetooth flyout, rendered inside the panel. */
  bluetoothMenu?: React.ReactNode;
  className?: string;
}

/**
 * The CONNECTIVITY panel. This one keeps the established layout: pill rows
 * for the two radios and compact tiles for the rest.
 */
export const ConnectivityPanel: React.FC<ConnectivityPanelProps> = ({
  wifi,
  ssid,
  bluetooth,
  bluetoothName,
  airplane,
  hotspot,
  onToggleWifi,
  onToggleBluetooth,
  onToggleAirplane,
  onToggleHotspot,
  onOpenSettings,
  onOpenWifiMenu,
  onOpenBluetoothMenu,
  wifiMenuOpen = false,
  bluetoothMenuOpen = false,
  wifiMenu,
  bluetoothMenu,
  className = '',
}) => {
  return (
    <ControlPanel label="Connectivity" scroll className={className}>
      <div className="flex flex-col gap-1.5">
        <ConnectivityRow
          icon={wifi === false ? <WifiOff size={14} /> : <Wifi size={14} />}
          title="Wi-Fi"
          subtitle={
            wifi
              ? ssid || 'Connected'
              : wifi === null
                ? 'Radio unavailable'
                : 'Off'
          }
          active={wifi}
          onClick={onToggleWifi}
          onMenu={onOpenWifiMenu}
          menuOpen={wifiMenuOpen}
        />
        <ConnectivityRow
          icon={
            bluetooth === false ? <BluetoothOff size={14} /> : <Bluetooth size={14} />
          }
          title="Bluetooth"
          subtitle={
            bluetooth
              ? bluetoothName || 'Enabled · No device'
              : bluetooth === null
                ? 'Radio unavailable'
                : 'Off'
          }
          active={bluetooth}
          onClick={onToggleBluetooth}
          onMenu={onOpenBluetoothMenu}
          menuOpen={bluetoothMenuOpen}
        />
      </div>

      <AnimatePresence initial={false}>
        {wifiMenuOpen && wifiMenu ? (
          <motion.div
            key="wifi-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.7 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="pt-1.5">{wifiMenu}</div>
          </motion.div>
        ) : null}
        {bluetoothMenuOpen && bluetoothMenu ? (
          <motion.div
            key="bluetooth-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.7 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="pt-1.5">{bluetoothMenu}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mt-2 grid shrink-0 grid-cols-2 gap-2">
        <CompactTile
          icon={<Plane size={16} />}
          title="Airplane"
          subtitle={airplane ? 'On' : 'Off'}
          onClick={onToggleAirplane}
        />
        <CompactTile
          icon={<RadioTower size={16} />}
          title="Hotspot"
          subtitle={hotspot ? 'On' : 'Off'}
          onClick={onToggleHotspot}
        />
      </div>

      <div className="mt-2 shrink-0">
        <ConnectivityRow
          icon={<Settings2 size={14} />}
          title="Windows Settings"
          subtitle="All system settings"
          active={null}
          onClick={onOpenSettings}
        />
      </div>
    </ControlPanel>
  );
};

interface CompactTileProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}

const CompactTile: React.FC<CompactTileProps> = ({
  icon,
  title,
  subtitle,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] px-1 py-2.5 text-[var(--aether-text-1)] transition hover:border-[var(--aether-line)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
  >
    <span className="flex h-6 w-6 items-center justify-center">{icon}</span>
    <span className="text-[8.5px] font-medium text-[var(--aether-text-1)]">{title}</span>
    <span className="text-[7.5px] text-[var(--aether-text-3)]">{subtitle}</span>
  </button>
);

