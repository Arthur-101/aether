import React from 'react';
import {
  Wifi,
  WifiOff,
  Bluetooth,
  BluetoothOff,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Cpu,
  HardDrive,
  Sparkles,
  Plane,
  RadioTower,
} from 'lucide-react';
import type { SystemStats } from '../../types/ipc';

interface IslandControlsProps {
  stats: SystemStats | null;
  onSetVolume: (level: number) => void;
  onSetMuted: (muted: boolean) => void;
  onSetBrightness: (level: number) => void;
  onToggleWifi: (enabled?: boolean) => void;
  onToggleBluetooth: (enabled?: boolean) => void;
  onToggleAirplaneMode: (enabled?: boolean) => void;
  onToggleHotspot: (enabled?: boolean) => void;
  onToggleDarkMode: (enabled?: boolean) => void;
}

const Tile: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active: boolean | null;
}> = ({ onClick, icon, title, subtitle, active }) => (
  <button
    onClick={onClick}
    className="flex min-w-0 flex-col justify-between rounded-lg border border-white/10 bg-[#2b2b2b]/80 p-3 text-left transition hover:border-white/20 hover:bg-[#323232]"
  >
    <div className="flex w-full items-center justify-between">
      <span className={active === false ? 'text-[#8b8b8b]' : 'text-[#60cdff]'}>{icon}</span>
      <span
        className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
          active === null
            ? 'bg-white/8 text-[#8b8b8b]'
            : active
              ? 'bg-[#6ccb5f]/15 text-[#9be58f]'
              : 'bg-white/8 text-[#8b8b8b]'
        }`}
      >
        {active === null ? 'N/A' : active ? 'On' : 'Off'}
      </span>
    </div>
    <div className="mt-2 min-w-0">
      <div className="text-xs font-semibold text-white">{title}</div>
      <div className="truncate text-[10px] text-[#8b8b8b]">{subtitle}</div>
    </div>
  </button>
);

const SliderCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  display: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ icon, label, display, value, min = 0, max = 100, step = 1, onChange }) => (
  <div className="flex min-w-0 flex-col justify-between rounded-lg border border-white/10 bg-[#2b2b2b]/80 p-3">
    <div className="flex items-center justify-between">
      <span className="text-[#60cdff]">{icon}</span>
      <span className="font-mono text-[10px] text-[#c7c7c7]">{display}</span>
    </div>
    <div className="mt-3">
      <div className="mb-1 text-xs font-semibold text-white">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-[#0067c0]"
      />
    </div>
  </div>
);

export const IslandControls: React.FC<IslandControlsProps> = ({
  stats,
  onSetVolume,
  onSetMuted,
  onSetBrightness,
  onToggleWifi,
  onToggleBluetooth,
  onToggleAirplaneMode,
  onToggleHotspot,
  onToggleDarkMode,
}) => {
  const wifi = stats?.wifi ?? null;
  const bluetooth = stats?.bluetooth ?? null;
  const airplane = stats?.airplane_mode ?? null;
  const hotspot = stats?.hotspot ?? null;
  const darkMode = stats?.dark_mode ?? true;
  const muted = stats?.muted ?? false;
  const volume = stats?.volume ?? 0.5;
  const brightness = stats?.brightness ?? 50;
  const wifiName = stats?.wifi_ssid;
  const bluetoothName = stats?.bluetooth_device;

  return (
    <div className="grid grid-cols-2 gap-2.5 pt-1">
      <Tile
        onClick={() => onToggleWifi()}
        icon={wifi === false ? <WifiOff size={18} /> : <Wifi size={18} />}
        title="Wi-Fi"
        subtitle={wifi ? (wifiName || 'Connected') : wifi === null ? 'Radio unavailable' : 'Disconnected'}
        active={wifi}
      />
      <Tile
        onClick={() => onToggleBluetooth()}
        icon={bluetooth === false ? <BluetoothOff size={18} /> : <Bluetooth size={18} />}
        title="Bluetooth"
        subtitle={
          bluetooth
            ? bluetoothName || 'Enabled · No device'
            : bluetooth === null
              ? 'Radio unavailable'
              : 'Disabled'
        }
        active={bluetooth}
      />
      <Tile
        onClick={() => onToggleAirplaneMode(!airplane)}
        icon={<Plane size={18} />}
        title="Airplane Mode"
        subtitle={airplane ? 'Radios disabled' : 'Radios enabled'}
        active={airplane}
      />
      <Tile
        onClick={() => onToggleHotspot(!hotspot)}
        icon={<RadioTower size={18} />}
        title="Mobile Hotspot"
        subtitle={hotspot === null ? 'Status unavailable' : hotspot ? 'Broadcasting' : 'Off'}
        active={hotspot}
      />
      <Tile
        onClick={() => onToggleDarkMode(!darkMode)}
        icon={darkMode ? <Moon size={18} /> : <Sun size={18} />}
        title="Windows Theme"
        subtitle={darkMode ? 'Dark mode' : 'Light mode'}
        active={darkMode}
      />

      <div className="flex items-center justify-around rounded-lg border border-white/10 bg-[#2b2b2b]/80 p-3 font-mono text-[10px]">
        <div className="flex items-center gap-1 text-[#c7c7c7]">
          <Cpu size={12} className="text-[#60cdff]" />
          <span>{stats?.cpu_percent ?? 0}%</span>
        </div>
        <div className="h-3 w-px bg-white/10" />
        <div className="flex items-center gap-1 text-[#c7c7c7]">
          <HardDrive size={12} className="text-[#60cdff]" />
          <span>{stats?.ram_percent ?? 0}%</span>
        </div>
        <div className="h-3 w-px bg-white/10" />
        <div className="flex items-center gap-1 text-[#c7c7c7]">
          <Sparkles size={12} />
          <span>{stats?.gpu_vram_gb != null ? `${stats.gpu_vram_gb}G` : 'CPU'}</span>
        </div>
      </div>

      <div className="col-span-2 grid grid-cols-2 gap-2.5">
        <SliderCard
          icon={
            muted ? (
              <VolumeX size={18} className="text-[#ff99a4]" />
            ) : (
              <Volume2 size={18} />
            )
          }
          label="Volume"
          display={muted ? 'Muted' : `${Math.round(volume * 100)}%`}
          value={volume * 100}
          onChange={(value) => {
            onSetMuted(false);
            onSetVolume(value / 100);
          }}
        />
        <SliderCard
          icon={<Sun size={18} />}
          label="Brightness"
          display={stats?.brightness == null ? '--' : `${brightness}%`}
          value={brightness}
          onChange={onSetBrightness}
        />
      </div>
    </div>
  );
};
