import React from 'react';
import { AudioLines, FileSearch, FolderOpen, Play } from 'lucide-react';
import type { VoiceConfig } from '../../../types/ipc';
import { pickNativePath } from '../../../lib/system';
import { placementBesideSettings } from '../../../lib/externalWindows';
import { SettingsGroup } from '../SettingsControls';
import {
  settingsCardClass,
  settingsHintClass,
  settingsLabelClass,
  settingsMonoInputClass,
  settingsSecondaryButtonClass,
} from '../settingsStyles';
import { SliderRow } from './SurfaceSliders';

interface VoiceSettingsProps {
  voice: VoiceConfig;
  onChange: (patch: Partial<VoiceConfig>) => void;
}

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({ voice, onChange }) => {
  const browseStt = async () => {
    const path = await pickNativePath('directory', 'all', placementBesideSettings());
    if (path) onChange({ stt_model_dir: path });
  };

  const browseTts = async () => {
    const path = await pickNativePath('file', 'onnx');
    if (path) onChange({ tts_model_path: path });
  };

  return (
    <div className="flex flex-col gap-4 pb-2">
      <SettingsGroup
        icon={<AudioLines size={13} />}
        title="Models"
        hint="Phonon-2 handles speech-to-text; Paradee renders speech at 24 kHz."
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="aether-stt-folder" className={settingsLabelClass}>
              Speech-to-text folder
            </label>
            <div className="flex gap-1.5">
              <input
                id="aether-stt-folder"
                type="text"
                value={voice.stt_model_dir}
                onChange={(event) => onChange({ stt_model_dir: event.target.value })}
                placeholder="Select the Phonon-2 model directory…"
                spellCheck={false}
                className={`${settingsMonoInputClass} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={browseStt}
                className={settingsSecondaryButtonClass}
              >
                <FolderOpen size={12} />
                Browse
              </button>
            </div>
            <p className={settingsHintClass}>
              Microphone capture is live. Wire a real Phonon decoder to enable transcription.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="aether-tts-model" className={settingsLabelClass}>
              Text-to-speech model
            </label>
            <div className="flex gap-1.5">
              <input
                id="aether-tts-model"
                type="text"
                value={voice.tts_model_path}
                onChange={(event) => onChange({ tts_model_path: event.target.value })}
                placeholder="Select paradee.onnx…"
                spellCheck={false}
                className={`${settingsMonoInputClass} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={browseTts}
                className={settingsSecondaryButtonClass}
              >
                <FileSearch size={12} />
                Browse
              </button>
            </div>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup icon={<Play size={13} />} title="Playback">
        <div className={settingsCardClass}>
          <div className="px-2.5">
            <SliderRow
              label="Speed"
              min={0.8}
              max={1.4}
              step={0.05}
              value={voice.tts_speed}
              display={`${voice.tts_speed.toFixed(2)}×`}
              onChange={(tts_speed) => onChange({ tts_speed })}
            />
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className={settingsLabelClass}>Voice preset</span>
          <input
            type="text"
            value={voice.tts_voice_id}
            onChange={(event) => onChange({ tts_voice_id: event.target.value })}
            className={`${settingsMonoInputClass} w-full`}
          />
        </label>
      </SettingsGroup>
    </div>
  );
};
