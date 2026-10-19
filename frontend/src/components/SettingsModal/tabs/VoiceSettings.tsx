import React from 'react';
import { FolderOpen, FileSearch } from 'lucide-react';
import type { VoiceConfig } from '../../../types/ipc';
import { pickNativePath } from '../../../lib/system';

interface VoiceSettingsProps {
  voice: VoiceConfig;
  onChange: (patch: Partial<VoiceConfig>) => void;
}

const inputClass =
  'w-full rounded-md border border-white/10 bg-[#2b2b2b] px-3 py-2 font-mono text-[11px] text-[#f3f3f3] outline-none focus:border-[#0067c0]';
const labelClass = 'mb-1 block text-[11px] font-medium text-[#c7c7c7]';

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({ voice, onChange }) => {
  const browseStt = async () => {
    const path = await pickNativePath('directory', 'all');
    if (path) onChange({ stt_model_dir: path });
  };

  const browseTts = async () => {
    const path = await pickNativePath('file', 'onnx');
    if (path) onChange({ tts_model_path: path });
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      <div>
        <label className={labelClass}>Speech-to-Text Model Folder (Phonon-2)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={voice.stt_model_dir}
            onChange={(event) => onChange({ stt_model_dir: event.target.value })}
            placeholder="Select the Phonon-2 model directory…"
            className={inputClass}
          />
          <button
            onClick={browseStt}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#0067c0] px-3 text-[11px] font-medium text-white transition hover:bg-[#1976c9]"
          >
            <FolderOpen size={13} />
            Browse
          </button>
        </div>
        <p className="mt-1 text-[10px] text-[#8b8b8b]">
          Microphone capture is live. Wire a real Phonon decoder to enable transcription.
        </p>
      </div>

      <div>
        <label className={labelClass}>Text-to-Speech Model (Paradee ONNX, 24 kHz)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={voice.tts_model_path}
            onChange={(event) => onChange({ tts_model_path: event.target.value })}
            placeholder="Select paradee.onnx…"
            className={inputClass}
          />
          <button
            onClick={browseTts}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#0067c0] px-3 text-[11px] font-medium text-white transition hover:bg-[#1976c9]"
          >
            <FileSearch size={13} />
            Browse
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className={`${labelClass} mb-0`}>Speech Speed</label>
          <span className="font-mono text-[11px] text-[#9dd5ff]">
            {voice.tts_speed.toFixed(2)}×
          </span>
        </div>
        <input
          type="range"
          min="0.8"
          max="1.4"
          step="0.05"
          value={voice.tts_speed}
          onChange={(event) => onChange({ tts_speed: Number(event.target.value) })}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-[#0067c0]"
        />
      </div>

      <div>
        <label className={labelClass}>Voice Preset</label>
        <input
          type="text"
          value={voice.tts_voice_id}
          onChange={(event) => onChange({ tts_voice_id: event.target.value })}
          className={inputClass}
        />
      </div>
    </div>
  );
};
