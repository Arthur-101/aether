import React from 'react';
import {
  AudioLines,
  Cloud,
  FileSearch,
  FolderOpen,
  KeyRound,
  Mic,
  Play,
} from 'lucide-react';
import type { AIProviderConfig, VoiceConfig } from '../../../types/ipc';
import { pickNativePath } from '../../../lib/system';
import { placementBesideSettings } from '../../../lib/externalWindows';
import {
  LOCAL_VOICE_LABEL,
  VOICE_PROVIDERS,
  voiceProvider,
} from '../../../lib/voiceProviders';
import { SettingsGroup } from '../SettingsControls';
import {
  settingsCardClass,
  settingsHintClass,
  settingsInputClass,
  settingsLabelClass,
  settingsMonoInputClass,
  settingsSecondaryButtonClass,
} from '../settingsStyles';
import { SliderRow } from './SurfaceSliders';

interface VoiceSettingsProps {
  voice: VoiceConfig;
  ai: AIProviderConfig;
  onChange: (patch: Partial<VoiceConfig>) => void;
}

const KeyStatus: React.FC<{
  providerId: string;
  keySaved: boolean;
}> = ({ providerId, keySaved }) => {
  const provider = voiceProvider(providerId);
  const label = provider?.label ?? providerId;

  if (keySaved) {
    return (
      <p className="flex items-center gap-1.5 text-[9px] leading-snug text-[var(--aether-accent)]">
        <KeyRound size={10} className="shrink-0" />
        Uses the {label} key saved in AI Engine → Cloud API.
      </p>
    );
  }

  return (
    <p className="flex items-start gap-1.5 rounded-md border border-[#fce100]/35 bg-[#fce100]/10 px-2 py-1.5 text-[9px] leading-snug text-[#fce100]">
      <KeyRound size={11} className="mt-0.5 shrink-0" />
      <span>
        No {label} key saved. Add one in AI Engine → Cloud API. Until then, voice
        uses the local model when it is installed.
      </span>
    </p>
  );
};

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({
  voice,
  ai,
  onChange,
}) => {
  const sttProviderId = voice.stt_provider || 'local';
  const ttsProviderId = voice.tts_provider || 'local';
  const sttProvider = voiceProvider(sttProviderId);
  const ttsProvider = voiceProvider(ttsProviderId);
  const sttIsCloud = Boolean(sttProvider);
  const ttsIsCloud = Boolean(ttsProvider);
  const keySaved = (providerId: string) =>
    Boolean(ai.cloud_providers?.[providerId]?.api_key);

  const browseStt = async () => {
    const path = await pickNativePath('directory', 'all', placementBesideSettings());
    if (path) onChange({ stt_model_dir: path });
  };

  const browseTts = async () => {
    const path = await pickNativePath('file', 'onnx');
    if (path) onChange({ tts_model_path: path });
  };

  const selectSttProvider = (nextId: string) => {
    const previous = voiceProvider(sttProviderId);
    const next = voiceProvider(nextId);
    const currentModel = voice.stt_model?.trim() ?? '';
    const modelIsDefault =
      !currentModel || (previous ? currentModel === previous.sttModel : false);
    const sttModel = next
      ? modelIsDefault
        ? next.sttModel
        : currentModel
      : modelIsDefault
        ? ''
        : currentModel;
    onChange({ stt_provider: nextId, stt_model: sttModel });
  };

  const selectTtsProvider = (nextId: string) => {
    const previous = voiceProvider(ttsProviderId);
    const next = voiceProvider(nextId);
    const currentModel = voice.tts_model?.trim() ?? '';
    const currentVoice = voice.tts_voice_id?.trim() ?? '';
    const modelIsDefault =
      !currentModel || (previous ? currentModel === previous.ttsModel : false);
    const voiceIsDefault =
      !currentVoice ||
      currentVoice === 'af_heart' ||
      (previous ? currentVoice === previous.ttsVoice : false);

    const ttsModel = next
      ? modelIsDefault
        ? next.ttsModel
        : currentModel
      : modelIsDefault
        ? ''
        : currentModel;
    const ttsVoice = next
      ? voiceIsDefault
        ? next.ttsVoice
        : currentVoice
      : voiceIsDefault
        ? 'af_heart'
        : currentVoice;
    onChange({
      tts_provider: nextId,
      tts_model: ttsModel,
      tts_voice_id: ttsVoice,
    });
  };

  return (
    <div className="flex flex-col gap-4 pb-2">
      <SettingsGroup
        icon={<Mic size={13} />}
        title="Speech to text"
        hint="Hold-to-talk dictation. Local Phonon-2 runs offline; cloud providers send the recorded clip to their API."
      >
        <label className="flex flex-col gap-1">
          <span className={settingsLabelClass}>Provider</span>
          <select
            value={sttProviderId}
            onChange={(event) => selectSttProvider(event.target.value)}
            className={`${settingsInputClass} w-full`}
          >
            <option value="local">{LOCAL_VOICE_LABEL} · Phonon-2</option>
            {VOICE_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
                {keySaved(provider.id) ? ' · key saved' : ''}
              </option>
            ))}
          </select>
        </label>

        {sttIsCloud && sttProvider ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className={settingsLabelClass}>Model</span>
              <input
                type="text"
                list={`aether-stt-models-${sttProvider.id}`}
                value={voice.stt_model}
                onChange={(event) => onChange({ stt_model: event.target.value })}
                placeholder={sttProvider.sttModel}
                spellCheck={false}
                className={`${settingsMonoInputClass} w-full`}
              />
              <datalist id={`aether-stt-models-${sttProvider.id}`}>
                {sttProvider.sttModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <span className={settingsHintClass}>
                Any model ID the provider accepts can be typed here.
              </span>
            </label>
            <KeyStatus
              providerId={sttProvider.id}
              keySaved={keySaved(sttProvider.id)}
            />
          </div>
        ) : (
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
              Requires the isolated Phonon-2 runtime. Run setup_stt.ps1 once if
              dictation is unavailable.
            </p>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup
        icon={<AudioLines size={13} />}
        title="Text to speech"
        hint="Spoken replies. Local Paradee renders on this machine; cloud providers send the reply text to their API."
      >
        <label className="flex flex-col gap-1">
          <span className={settingsLabelClass}>Provider</span>
          <select
            value={ttsProviderId}
            onChange={(event) => selectTtsProvider(event.target.value)}
            className={`${settingsInputClass} w-full`}
          >
            <option value="local">{LOCAL_VOICE_LABEL} · Paradee</option>
            {VOICE_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
                {keySaved(provider.id) ? ' · key saved' : ''}
              </option>
            ))}
          </select>
        </label>

        {ttsIsCloud && ttsProvider ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-1.5">
              <label className="flex min-w-0 flex-col gap-1">
                <span className={settingsLabelClass}>Model</span>
                <input
                  type="text"
                  list={`aether-tts-models-${ttsProvider.id}`}
                  value={voice.tts_model}
                  onChange={(event) => onChange({ tts_model: event.target.value })}
                  placeholder={ttsProvider.ttsModel}
                  spellCheck={false}
                  className={`${settingsMonoInputClass} w-full`}
                />
                <datalist id={`aether-tts-models-${ttsProvider.id}`}>
                  {ttsProvider.ttsModels.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={settingsLabelClass}>Voice</span>
                <input
                  type="text"
                  list={`aether-tts-voices-${ttsProvider.id}`}
                  value={voice.tts_voice_id}
                  onChange={(event) =>
                    onChange({ tts_voice_id: event.target.value })
                  }
                  placeholder={ttsProvider.ttsVoice}
                  spellCheck={false}
                  className={`${settingsMonoInputClass} w-full`}
                />
                <datalist id={`aether-tts-voices-${ttsProvider.id}`}>
                  {ttsProvider.voices.map((voiceId) => (
                    <option key={voiceId} value={voiceId} />
                  ))}
                </datalist>
              </label>
            </div>
            <span className={settingsHintClass}>
              Custom model and voice IDs are accepted. Groq speaks in short
              segments; longer replies are split automatically.
            </span>
            <KeyStatus
              providerId={ttsProvider.id}
              keySaved={keySaved(ttsProvider.id)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
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
            <label className="flex flex-col gap-1">
              <span className={settingsLabelClass}>Voice preset</span>
              <input
                type="text"
                value={voice.tts_voice_id}
                onChange={(event) => onChange({ tts_voice_id: event.target.value })}
                placeholder="af_heart"
                className={`${settingsMonoInputClass} w-full`}
              />
            </label>
          </div>
        )}
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
        <span className={settingsHintClass}>
          Speed applies to local Paradee and OpenAI TTS. Other cloud providers
          speak at their natural pace.
        </span>
      </SettingsGroup>

      {sttIsCloud || ttsIsCloud ? (
        <div className="flex items-start gap-2 rounded-md border border-[var(--aether-line)] bg-black/10 px-2.5 py-2 text-[9px] leading-snug text-[var(--aether-text-2)]">
          <Cloud size={12} className="mt-0.5 shrink-0" />
          <span>
            Cloud voice is opt-in. Recorded audio goes to the selected
            speech-to-text provider, and spoken replies go to the selected
            text-to-speech provider. If a cloud call fails, Aether retries
            locally when that model is installed. Local voice never uploads
            automatically.
          </span>
        </div>
      ) : null}
    </div>
  );
};
