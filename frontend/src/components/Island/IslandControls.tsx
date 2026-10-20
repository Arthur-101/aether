import React, { useCallback, useEffect, useState } from 'react';
import {
  Bluetooth,
  BluetoothOff,
  Moon,
  Plane,
  RadioTower,
  Settings2,
  Sun,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type {
  BluetoothDeviceInfo,
  SystemStats,
  WifiProfile,
} from '../../types/ipc';
import { useLiveControl } from '../../hooks/useLiveControl';
import { ControlSlider } from './ControlSlider';
import { ControlsTile } from './ControlsTile';
import { BluetoothMenu } from './BluetoothMenu';
import { WifiMenu } from './WifiMenu';

type ControlMenu = 'wifi' | 'bluetooth' | null;

interface IslandControlsProps {
  stats: SystemStats | null;
  wifiProfiles: WifiProfile[];
  bluetoothDevices: BluetoothDeviceInfo[];
  onSetVolume: (level: number) => void;
  onSetMuted: (muted: boolean) => void;
  onSetBrightness: (level: number) => void;
  onToggleWifi: (enabled?: boolean) => void;
  onToggleBluetooth: (enabled?: boolean) => void;
  onToggleAirplaneMode: (enabled?: boolean) => void;
  onToggleHotspot: (enabled?: boolean) => void;
  onToggleDarkMode: (enabled?: boolean) => void;
  onRefreshWifiProfiles: () => void;
  onConnectWifi: (profile: string) => void;
  onDisconnectWifi: () => void;
  onRefreshBluetoothDevices: () => void;
  onOpenSettingsPage: (page: string) => void;
}

export const IslandControls: React.FC<IslandControlsProps> = ({
  stats,
  wifiProfiles,
  bluetoothDevices,
  onSetVolume,
  onSetMuted,
  onSetBrightness,
  onToggleWifi,
  onToggleBluetooth,
  onToggleAirplaneMode,
  onToggleHotspot,
  onToggleDarkMode,
  onRefreshWifiProfiles,
  onConnectWifi,
  onDisconnectWifi,
  onRefreshBluetoothDevices,
  onOpenSettingsPage,
}) => {
  const [menu, setMenu] = useState<ControlMenu>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [wifiLoading, setWifiLoading] = useState(false);
  const [bluetoothLoading, setBluetoothLoading] = useState(false);

  const wifi = stats?.wifi ?? null;
  const bluetooth = stats?.bluetooth ?? null;
  const airplane = stats?.airplane_mode ?? null;
  const hotspot = stats?.hotspot ?? null;
  const darkMode = stats?.dark_mode ?? true;
  const muted = stats?.muted ?? false;
  const volumeControl = useLiveControl(
    Math.round((stats?.volume ?? 0.5) * 100),
    (value) => onSetVolume(value / 100),
    { throttleMs: 50, settleMs: 800 }
  );
  const brightnessControl = useLiveControl(stats?.brightness ?? 50, onSetBrightness, {
    throttleMs: 120,
    settleMs: 1200,
  });
  const currentSsid =
    stats?.wifi_ssid || wifiProfiles.find((profile) => profile.connected)?.name || '';
  const bluetoothName =
    bluetoothDevices.find((device) => device.connected)?.name ||
    stats?.bluetooth_device;

  const refreshWifi = useCallback(() => {
    setWifiLoading(true);
    onRefreshWifiProfiles();
  }, [onRefreshWifiProfiles]);

  const refreshBluetooth = useCallback(() => {
    setBluetoothLoading(true);
    onRefreshBluetoothDevices();
  }, [onRefreshBluetoothDevices]);

  useEffect(() => {
    setConnecting(null);
    setWifiLoading(false);
  }, [wifiProfiles]);

  useEffect(() => {
    setBluetoothLoading(false);
  }, [bluetoothDevices]);

  useEffect(() => {
    if (menu === 'wifi') refreshWifi();
    if (menu === 'bluetooth') refreshBluetooth();
  }, [menu, refreshWifi, refreshBluetooth]);

  const toggleMenu = (next: Exclude<ControlMenu, null>) => {
    setMenu((current) => (current === next ? null : next));
  };

  const connect = (profile: string) => {
    setConnecting(profile);
    onConnectWifi(profile);
  };

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="grid grid-cols-3 gap-2">
        <ControlsTile
          onClick={() => onToggleWifi()}
          icon={wifi === false ? <WifiOff size={17} /> : <Wifi size={17} />}
          title="Wi-Fi"
          subtitle={
            wifi
              ? currentSsid || 'Connected'
              : wifi === null
                ? 'Radio unavailable'
                : 'Disconnected'
          }
          active={wifi}
          menuOpen={menu === 'wifi'}
          onMenu={() => toggleMenu('wifi')}
        />
        <ControlsTile
          onClick={() => onToggleBluetooth()}
          icon={bluetooth === false ? <BluetoothOff size={17} /> : <Bluetooth size={17} />}
          title="Bluetooth"
          subtitle={
            bluetooth
              ? bluetoothName || 'Enabled · No device'
              : bluetooth === null
                ? 'Radio unavailable'
                : 'Disabled'
          }
          active={bluetooth}
          menuOpen={menu === 'bluetooth'}
          onMenu={() => toggleMenu('bluetooth')}
        />
        <ControlsTile
          onClick={() => onToggleAirplaneMode(!airplane)}
          icon={<Plane size={17} />}
          title="Airplane Mode"
          subtitle={airplane ? 'Radios disabled' : 'Radios enabled'}
          active={airplane}
        />
        <ControlsTile
          onClick={() => onToggleHotspot(!hotspot)}
          icon={<RadioTower size={17} />}
          title="Mobile Hotspot"
          subtitle={hotspot === null ? 'Status unavailable' : hotspot ? 'Broadcasting' : 'Off'}
          active={hotspot}
        />
        <ControlsTile
          onClick={() => onToggleDarkMode(!darkMode)}
          icon={darkMode ? <Moon size={17} /> : <Sun size={17} />}
          title="Windows Theme"
          subtitle={darkMode ? 'Dark mode' : 'Light mode'}
          active={darkMode}
        />
        <ControlsTile
          onClick={() => onOpenSettingsPage('settings')}
          icon={<Settings2 size={17} />}
          title="Windows Settings"
          subtitle="All system settings"
          active={null}
          showStatus={false}
        />
      </div>

      {menu === 'wifi' ? (
        <WifiMenu
          profiles={wifiProfiles}
          currentSsid={currentSsid}
          wifiEnabled={wifi}
          connecting={connecting}
          loading={wifiLoading}
          onRefresh={refreshWifi}
          onConnect={connect}
          onDisconnect={onDisconnectWifi}
          onToggle={(enabled) => onToggleWifi(enabled)}
          onOpenSettings={() => onOpenSettingsPage('wifi')}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {menu === 'bluetooth' ? (
        <BluetoothMenu
          devices={bluetoothDevices}
          bluetoothEnabled={bluetooth}
          currentDevice={bluetoothName}
          loading={bluetoothLoading}
          onRefresh={refreshBluetooth}
          onOpenSettings={() => onOpenSettingsPage('bluetooth')}
          onToggle={(enabled) => onToggleBluetooth(enabled)}
          onClose={() => setMenu(null)}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <ControlSlider
          icon={
            muted ? (
              <VolumeX size={16} className="text-[#ff99a4]" />
            ) : (
              <Volume2 size={16} className="text-[#60cdff]" />
            )
          }
          label="Volume"
          display={muted ? 'Muted' : `${Math.round(volumeControl.value)}%`}
          value={volumeControl.value}
          onChange={volumeControl.onChange}
          onInteractionStart={() => {
            if (muted) onSetMuted(false);
            volumeControl.onInteractionStart();
          }}
          onInteractionEnd={volumeControl.onInteractionEnd}
          onIconClick={() => onSetMuted(!muted)}
          iconTitle={muted ? 'Unmute' : 'Mute'}
          onSettings={() => onOpenSettingsPage('sound')}
          settingsTitle="Open sound settings"
        />
        <ControlSlider
          icon={<Sun size={16} className="text-[#60cdff]" />}
          label="Brightness"
          display={stats?.brightness == null ? '--' : `${brightnessControl.value}%`}
          value={brightnessControl.value}
          onChange={brightnessControl.onChange}
          onInteractionStart={brightnessControl.onInteractionStart}
          onInteractionEnd={brightnessControl.onInteractionEnd}
          onSettings={() => onOpenSettingsPage('display')}
          settingsTitle="Open display settings"
        />
      </div>
    </div>
  );
};
