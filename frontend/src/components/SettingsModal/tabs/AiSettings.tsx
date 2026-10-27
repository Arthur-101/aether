import React from 'react';
import { AlertTriangle, Box, Brain, FolderOpen, Server, Zap } from 'lucide-react';
import type { AIProviderConfig, CloudProviderEntry } from '../../../types/ipc';
import { pickNativePath } from '../../../lib/system';
import { SettingsGroup } from '../SettingsControls';
import {
  settingsChipClass,
  settingsHintClass,
  settingsInputClass,
  settingsLabelClass,
  settingsMonoInputClass,
  settingsSecondaryButtonClass,
  settingsSegmentClass,
} from '../settingsStyles';

interface AiSettingsProps {
  ai: AIProviderConfig;
  thinkingMode: boolean;
  configError: string | null;
  onToggleThinking: (enabled: boolean) => void;
  onChange: (patch: Partial<AIProviderConfig>) => void;
}

const modes = [
  { id: 'local_gguf', label: 'Local GGUF' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'cloud', label: 'Cloud API' },
] as const;

const MODEL_HINTS: Record<AIProviderConfig['mode'], string> = {
  local_gguf: 'Private and offline. Higher context uses more memory.',
  ollama: 'Talks to a local Ollama server on 127.0.0.1:11434.',
  cloud: 'Keys stay on this machine. Paste an OpenRouter ID as copied.',
};

const CLOUD_PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', placeholder: 'gemini-2.5-flash' },
  { id: 'groq', label: 'Groq', placeholder: 'llama-3.3-70b-versatile' },
  { id: 'openai', label: 'OpenAI', placeholder: 'gpt-4o-mini' },
  { id: 'mistral', label: 'Mistral', placeholder: 'mistral-small-latest' },
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'anthropic/claude-sonnet-4.5' },
] as const;

const emptyEntry: CloudProviderEntry = { api_key: '', model: '' };

export const AiSettings: React.FC<AiSettingsProps> = ({
  ai,
  thinkingMode,
  configError,
  onToggleThinking,
  onChange,
}) => {
  const browseGguf = async () => {
    const path = await pickNativePath('file', 'gguf');
    if (path) onChange({ gguf_model_path: path });
  };

  const cloudProviders = ai.cloud_providers ?? {};
  const cloudEntry = cloudProviders[ai.cloud_provider] ?? emptyEntry;
  const cloudProvider =
    CLOUD_PROVIDERS.find((provider) => provider.id === ai.cloud_provider) ??
    CLOUD_PROVIDERS[0];
  const updateCloudEntry = (patch: Partial<CloudProviderEntry>) =>
    onChange({
      cloud_providers: {
        ...cloudProviders,
        [ai.cloud_provider]: { ...cloudEntry, ...patch },
      },
    });

  return (
    <div className="flex flex-col gap-4 pb-2">
      {configError ? (
        <div className="flex items-start gap-2 rounded-md border border-[#ff99a4]/40 bg-[#442726] px-2.5 py-2 text-[10px] leading-snug text-[#ffd7d9]">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>{configError}</span>
        </div>
      ) : null}

      <SettingsGroup
        icon={<Zap size={13} />}
        title="Execution"
        hint="Normal answers directly. Thinking reasons through harder questions."
      >
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            aria-pressed={!thinkingMode}
            onClick={() => onToggleThinking(false)}
            className={`${settingsSegmentClass(!thinkingMode)} font-medium`}
          >
            <Zap size={12} />
            Normal mode
          </button>
          <button
            type="button"
            aria-pressed={thinkingMode}
            onClick={() => onToggleThinking(true)}
            className={`${settingsSegmentClass(thinkingMode)} font-medium`}
          >
            <Brain size={12} />
            Thinking mode
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup
        icon={<Server size={13} />}
        title="Inference backend"
        hint="Local GGUF runs on this machine. Ollama uses 127.0.0.1:11434. Cloud supports Gemini, Groq, OpenAI, and OpenRouter."
      >
        <div className="grid grid-cols-3 gap-1.5">
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              aria-pressed={ai.mode === mode.id}
              onClick={() => onChange({ mode: mode.id })}
              className={settingsSegmentClass(ai.mode === mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup icon={<Box size={13} />} title="Model" hint={MODEL_HINTS[ai.mode]}>
        {ai.mode === 'local_gguf' ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="aether-gguf-path" className={settingsLabelClass}>
                GGUF file
              </label>
              <div className="flex gap-1.5">
                <input
                  id="aether-gguf-path"
                  type="text"
                  value={ai.gguf_model_path}
                  onChange={(event) => onChange({ gguf_model_path: event.target.value })}
                  placeholder="Select a .gguf file…"
                  spellCheck={false}
                  className={`${settingsMonoInputClass} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={browseGguf}
                  className={settingsSecondaryButtonClass}
                >
                  <FolderOpen size={12} />
                  Browse
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className={settingsLabelClass}>Context length</span>
              <div className="flex gap-1.5">
                {[4096, 8192, 16384].map((ctx) => (
                  <button
                    key={ctx}
                    type="button"
                    aria-pressed={ai.context_length === ctx}
                    onClick={() => onChange({ context_length: ctx })}
                    className={`${settingsChipClass(ai.context_length === ctx)} font-mono`}
                  >
                    {ctx}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {ai.mode === 'ollama' ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className={settingsLabelClass}>Base URL</span>
              <input
                type="text"
                value={ai.ollama_base_url}
                onChange={(event) => onChange({ ollama_base_url: event.target.value })}
                placeholder="http://127.0.0.1:11434"
                spellCheck={false}
                className={`${settingsMonoInputClass} w-full`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={settingsLabelClass}>Model name</span>
              <input
                type="text"
                value={ai.ollama_model_name}
                onChange={(event) => onChange({ ollama_model_name: event.target.value })}
                placeholder="qwen2.5:7b"
                spellCheck={false}
                className={`${settingsMonoInputClass} w-full`}
              />
            </label>
          </div>
        ) : null}

        {ai.mode === 'cloud' ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-1.5">
              <label className="flex min-w-0 flex-col gap-1">
                <span className={settingsLabelClass}>Provider</span>
                <select
                  value={ai.cloud_provider}
                  onChange={(event) => onChange({ cloud_provider: event.target.value })}
                  className={`${settingsInputClass} w-full`}
                >
                  {CLOUD_PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                      {cloudProviders[provider.id]?.api_key ? ' · key saved' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={settingsLabelClass}>Model</span>
                <input
                  type="text"
                  value={cloudEntry.model}
                  onChange={(event) => updateCloudEntry({ model: event.target.value })}
                  placeholder={cloudProvider.placeholder}
                  spellCheck={false}
                  className={`${settingsMonoInputClass} w-full`}
                />
              </label>
            </div>
            {ai.cloud_provider === 'openrouter' ? (
              <span className={settingsHintClass}>
                Paste the model ID exactly as OpenRouter copies it. The
                <span className="font-mono"> openrouter/ </span>
                prefix is added automatically.
              </span>
            ) : null}
            <label className="flex flex-col gap-1">
              <span className={settingsLabelClass}>API key</span>
              <input
                type="password"
                value={cloudEntry.api_key}
                onChange={(event) => updateCloudEntry({ api_key: event.target.value })}
                placeholder="Stored locally in %APPDATA%/Aether"
                className={`${settingsMonoInputClass} w-full`}
              />
            </label>
          </div>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className={settingsLabelClass}>Tavily web search API key</span>
          <input
            type="password"
            value={ai.tavily_api_key ?? ''}
            onChange={(event) => onChange({ tavily_api_key: event.target.value })}
            placeholder="Optional · stored locally in %APPDATA%/Aether"
            className={`${settingsMonoInputClass} w-full`}
          />
          <span className={settingsHintClass}>
            Enables live web search. Direct URL reading works without a key.
          </span>
        </label>
      </SettingsGroup>
    </div>
  );
};
