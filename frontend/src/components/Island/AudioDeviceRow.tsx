import React from 'react';
import { Headphones, Speaker } from 'lucide-react';
import type { AudioOutputDevice } from '../../types/ipc';

/**
 * One row in the output device list.
 *
 * The live device is filled with the accent and carries a dot, matching the
 * reference design; the rest are flat cards that only lift on hover.
 */

interface AudioDeviceRowProps {
  device: AudioOutputDevice;
  onSelect: (device: AudioOutputDevice) => void;
}

export const AudioDeviceRow: React.FC<AudioDeviceRowProps> = ({
  device,
  onSelect,
}) => {
  const active = device.active;
  const Glyph = /headphone|headset/i.test(device.name) ? Headphones : Speaker;

  return (
    <button
      type="button"
      onClick={() => onSelect(device)}
      title={active ? `${device.name} (active)` : `Switch audio to ${device.name}`}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
        active
          ? 'accent-fill border-transparent'
          : 'border-[var(--aether-line-soft)] bg-[var(--aether-fill)] text-[var(--aether-text-1)] hover:border-[var(--aether-line)] hover:bg-[var(--aether-fill)]'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          active ? 'bg-black/15' : 'bg-[var(--aether-fill)]'
        }`}
      >
        <Glyph
          size={14}
          className={active ? 'text-[#18140c]' : 'text-[var(--aether-text-1)]'}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold">
          {device.name}
        </span>
        <span
          className={`block truncate text-[9px] ${
            active ? 'opacity-70' : 'text-[var(--aether-text-3)]'
          }`}
        >
          {device.description || 'Audio output device'}
        </span>
      </span>
      {active ? (
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#18140c]" />
      ) : null}
    </button>
  );
};
