import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { AudioOutputDevice } from '../../types/ipc';
import { ControlPanel, PanelFooterRow } from './ControlPanel';
import { AudioDeviceRow } from './AudioDeviceRow';
import { ValueSlider } from './ValueSlider';

interface AudioPanelProps {
  volume: number;
  muted: boolean;
  devices: AudioOutputDevice[];
  onVolumeChange: (value: number) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  onToggleMute: (next: boolean) => void;
  onSelectDevice: (device: AudioOutputDevice) => void;
  onOpenSoundSettings: () => void;
}

/**
 * The AUDIO panel: output volume, the list of output devices, and the
 * device count in the footer.
 */
export const AudioPanel: React.FC<AudioPanelProps> = ({
  volume,
  muted,
  devices,
  onVolumeChange,
  onInteractionStart,
  onInteractionEnd,
  onToggleMute,
  onSelectDevice,
  onOpenSoundSettings,
}) => {
  const percent = Math.round(volume);
  const count = devices.length;

  return (
    <ControlPanel
      label="Audio"
      icon={
        <button
          type="button"
          onClick={() => onToggleMute(!muted)}
          title={muted ? 'Unmute' : 'Mute'}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className={`rounded p-0.5 transition hover:bg-[var(--aether-fill-2)] ${
            muted ? 'text-[#ef9a9a]' : 'text-[var(--aether-accent)]'
          }`}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      }
      footer={
        <div className="flex flex-col gap-1">
          <PanelFooterRow
            left={
              count === 1 ? '1 output device available' : `${count} output devices available`
            }
            right={
              <button
                type="button"
                onClick={onOpenSoundSettings}
                className="text-[8.5px] text-[var(--aether-accent)] transition hover:underline"
              >
                Volume mixer
              </button>
            }
            rightClassName=""
          />
        </div>
      }
    >
      <ValueSlider
        label="Output volume"
        icon={
          muted ? (
            <VolumeX size={15} className="text-[#241d10]" />
          ) : (
            <Volume2 size={15} className="text-[#241d10]" />
          )
        }
        value={percent}
        display={muted ? 'Muted' : `${percent}%`}
        fill="var(--aether-accent-gradient)"
        onChange={onVolumeChange}
        onInteractionStart={onInteractionStart}
        onInteractionEnd={onInteractionEnd}
      />

      <div className="mt-3 text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
        Output device
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {devices.length === 0 ? (
          <div className="rounded-xl border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] px-2.5 py-2 text-[9px] text-[var(--aether-text-3)]">
            No output devices reported.
          </div>
        ) : (
          devices.map((device) => (
            <AudioDeviceRow
              key={device.id}
              device={device}
              onSelect={onSelectDevice}
            />
          ))
        )}
      </div>
    </ControlPanel>
  );
};
