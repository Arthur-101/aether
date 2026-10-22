import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AudioOutputDevice,
  BluetoothDeviceInfo,
  DisplayInfo,
  GlowColor,
  GlowStyle,
  MediaControlAction,
  MediaSnapshot,
  SystemStats,
  WifiProfile,
} from '../../types/ipc';
import { useLiveControl } from '../../hooks/useLiveControl';
import { AudioPanel } from './AudioPanel';
import { BluetoothMenu } from './BluetoothMenu';
import { ConnectivityPanel } from './ConnectivityPanel';
import { DisplayPanel } from './DisplayPanel';
import { MediaWidget } from './MediaWidget';
import { WidgetsPanel } from './WidgetsPanel';
import { WifiMenu } from './WifiMenu';
import { CONTROLS_HEIGHT } from './tabSizes';

type ControlMenu = 'wifi' | 'bluetooth' | null;

interface IslandControlsProps {
  stats: SystemStats | null;
  wifiProfiles: WifiProfile[];
  bluetoothDevices: BluetoothDeviceInfo[];
  audioDevices: AudioOutputDevice[];
  displayInfo: DisplayInfo | null;
  glowStyle: GlowStyle;
  glowColor: GlowColor;
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
  onRefreshAudioDevices: () => void;
  onSelectAudioDevice: (deviceId: string) => void;
  onOpenSettingsPage: (page: string) => void;
  media: MediaSnapshot | null;
  onMediaControl: (action: MediaControlAction) => void;
}

export const IslandControls: React.FC<IslandControlsProps> = ({
  stats,
  wifiProfiles,
  bluetoothDevices,
  audioDevices,
  displayInfo,
  glowStyle,
  glowColor,
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
  onRefreshAudioDevices,
  onSelectAudioDevice,
  onOpenSettingsPage,
  media,
  onMediaControl,
}) => {
  const [menu, setMenu] = useState<ControlMenu>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [wifiLoading, setWifiLoading] = useState(false);
  const [bluetoothLoading, setBluetoothLoading] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    onRefreshAudioDevices();
  }, [onRefreshAudioDevices]);

  const toggleMenu = (next: Exclude<ControlMenu, null>) => {
    setMenu((current) => (current === next ? null : next));
  };

  const connect = (profile: string) => {
    setConnecting(profile);
    onConnectWifi(profile);
  };

  const selectDevice = (device: AudioOutputDevice) => {
    if (device.active) return;
    onSelectAudioDevice(device.id);
  };

  return (
    <div className="flex flex-col gap-3">
      {media?.has_session ? (
        <MediaWidget
          media={media}
          onControl={onMediaControl}
          glowStyle={glowStyle}
          glowColor={glowColor}
        />
      ) : null}

      <div
        ref={gridRef}
        style={{ height: CONTROLS_HEIGHT }}
        className="grid grid-cols-[1.12fr_1.02fr_0.86fr] grid-rows-[minmax(0,1fr)] items-stretch gap-3"
      >
        <AudioPanel
          volume={volumeControl.value}
          muted={muted}
          devices={audioDevices}
          onVolumeChange={volumeControl.onChange}
          onInteractionStart={volumeControl.onInteractionStart}
          onInteractionEnd={volumeControl.onInteractionEnd}
          onToggleMute={onSetMuted}
          onSelectDevice={selectDevice}
          onOpenSoundSettings={() => onOpenSettingsPage('sound')}
        />
        <div className="flex min-w-0 flex-col gap-3">
          <DisplayPanel
            brightness={brightnessControl.value}
            darkMode={darkMode}
            display={displayInfo}
            onBrightnessChange={brightnessControl.onChange}
            onInteractionStart={brightnessControl.onInteractionStart}
            onInteractionEnd={brightnessControl.onInteractionEnd}
            onToggleDarkMode={(next) => onToggleDarkMode(next)}
            onOpenDisplaySettings={() => onOpenSettingsPage('display')}
          />
          <WidgetsPanel />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <ConnectivityPanel
            wifi={wifi}
            ssid={currentSsid}
            bluetooth={bluetooth}
            bluetoothName={bluetoothName || ''}
            airplane={airplane}
            hotspot={hotspot}
            onToggleWifi={() => onToggleWifi()}
            onToggleBluetooth={() => onToggleBluetooth()}
            onToggleAirplane={() => onToggleAirplaneMode(!airplane)}
            onToggleHotspot={() => onToggleHotspot(!hotspot)}
            onOpenSettings={() => onOpenSettingsPage('settings')}
            onOpenWifiMenu={() => toggleMenu('wifi')}
            onOpenBluetoothMenu={() => toggleMenu('bluetooth')}
            wifiMenuOpen={menu === 'wifi'}
            bluetoothMenuOpen={menu === 'bluetooth'}
            wifiMenu={
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
            }
            bluetoothMenu={
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
            }
          />
        </div>
      </div>
    </div>
  );
};


