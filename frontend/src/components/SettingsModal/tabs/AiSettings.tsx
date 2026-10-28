import React from 'react';
import {
  AlertTriangle,
  Box,
  Brain,
  ChevronDown,
  FolderOpen,
  Server,
  Zap,
} from 'lucide-react';
import type { AIProviderConfig, CloudProviderEntry } from '../../../types/ipc';
import { pickNativePath } from '../../../lib/system';
import { SettingsGroup, SettingsResetButton } from '../SettingsControls';
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
  local_gguf: 'Private and offline. Defaults to 2 recent turns + 3 matches.',
  ollama: 'Local Ollama. Defaults to 2 recent turns + 3 matches.',
  cloud: "Cloud models use the provider's context window. Defaults to 8 recent turns + 8 matches.",
};

const CLOUD_PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', placeholder: 'gemini-2.5-flash' },
  { id: 'groq', label: 'Groq', placeholder: 'llama-3.3-70b-versatile' },
  { id: 'openai', label: 'OpenAI', placeholder: 'gpt-4o-mini' },
  { id: 'mistral', label: 'Mistral', placeholder: 'mistral-small-latest' },
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'anthropic/claude-sonnet-4.5' },
] as const;

const emptyEntry: CloudProviderEntry = { api_key: '', model: '' };

const MemoryCountInput: React.FC<{
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}> = ({ id, label, value, min, max, onChange }) => {
  const [draft, setDraft] = React.useState(String(value));

  const commit = () => {
    const parsed = Number(draft);
    const next = Number.isFinite(parsed)
      ? Math.max(min, Math.min(max, Math.round(parsed)))
      : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className={settingsLabelClass}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className={`${settingsInputClass} w-20 text-right font-mono`}
      />
    </div>
  );
};

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
  const toolRounds = Math.max(1, Math.min(10, Math.round(ai.max_tool_rounds ?? 3)));
  const updateCloudEntry = (patch: Partial<CloudProviderEntry>) =>
    onChange({
      cloud_providers: {
        ...cloudProviders,
        [ai.cloud_provider]: { ...cloudEntry, ...patch },
      },
    });

  const memoryIsCloud = ai.mode === 'cloud';
  const memoryRecent = Math.max(
    1,
    Math.min(
      12,
      Math.round(
        (memoryIsCloud
          ? ai.memory_cloud_recent_turns
          : ai.memory_local_recent_turns) ?? (memoryIsCloud ? 8 : 2)
      )
    )
  );
  const memorySemantic = Math.max(
    0,
    Math.min(
      12,
      Math.round(
        (memoryIsCloud
          ? ai.memory_cloud_semantic_matches
          : ai.memory_local_semantic_matches) ?? (memoryIsCloud ? 8 : 3)
      )
    )
  );
  const updateMemoryRecent = (value: number) =>
    onChange(
      memoryIsCloud
        ? { memory_cloud_recent_turns: value }
        : { memory_local_recent_turns: value }
    );
  const updateMemorySemantic = (value: number) =>
    onChange(
      memoryIsCloud
        ? { memory_cloud_semantic_matches: value }
        : { memory_local_semantic_matches: value }
    );
  const memoryEstimate = 400 + (memoryRecent + memorySemantic) * 320;
  const resetMemory = () => {
    onChange(
      memoryIsCloud
        ? {
            memory_cloud_recent_turns: 8,
            memory_cloud_semantic_matches: 8,
          }
        : {
            memory_local_recent_turns: 2,
            memory_local_semantic_matches: 3,
          }
    );
  };

  const contextLengthControl = (
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
  );

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

        <div className="mt-1 flex flex-col gap-1.5 border-t border-[var(--aether-line)] pt-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="aether-max-tool-rounds" className={settingsLabelClass}>
              Tool call rounds
            </label>
            <select
              id="aether-max-tool-rounds"
              value={toolRounds}
              onChange={(event) => onChange({ max_tool_rounds: Number(event.target.value) })}
              className={`${settingsInputClass} w-24`}
            >
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value === 3 ? '3 (default)' : value}
                </option>
              ))}
            </select>
          </div>
          <span className={settingsHintClass}>
            How many model → tool cycles one reply may use. Each round can run
            several tool calls.
          </span>
          {toolRounds > 5 ? (
            <div className="flex items-start gap-1.5 rounded-md border border-[#fce100]/35 bg-[#fce100]/10 px-2 py-1.5 text-[9px] leading-snug text-[#fce100]">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>
                High limits can cause repeated tool calls, long replies, or loops.
              </span>
            </div>
          ) : null}
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
        <span className={settingsHintClass}>
          Thinking mode maps to each provider's own reasoning control. Some
          models enforce a minimum, so Normal mode may still reason briefly.
        </span>
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

            {contextLengthControl}
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
            {contextLengthControl}
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
            <span className={settingsHintClass}>
              Cloud models use their own context window. The context-length chips
              are only applied to Local GGUF and Ollama.
            </span>
          </div>
        ) : null}

        <details className="group rounded-md border border-[var(--aether-line)] bg-black/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)] [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5">
              <span className={settingsLabelClass}>Memory depth</span>
              <span className="font-mono text-[9px] text-[var(--aether-text-3)]">
                {memoryRecent} recent · {memorySemantic} matches
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <SettingsResetButton
                  onClick={resetMemory}
                  label="Reset"
                  title="Restore the default memory depth for this backend"
                />
              </span>
              <ChevronDown
                size={13}
                className="shrink-0 text-[var(--aether-text-3)] transition group-open:rotate-180"
              />
            </span>
          </summary>
          <div className="flex flex-col gap-2 border-t border-[var(--aether-line-soft)] px-2.5 py-2">
            <MemoryCountInput
              key={`recent-${memoryIsCloud ? 'cloud' : 'local'}-${memoryRecent}`}
              id="aether-memory-recent"
              label="Prompt turns"
              value={memoryRecent}
              min={1}
              max={12}
              onChange={updateMemoryRecent}
            />
            <MemoryCountInput
              key={`semantic-${memoryIsCloud ? 'cloud' : 'local'}-${memorySemantic}`}
              id="aether-memory-semantic"
              label="Semantic matches"
              value={memorySemantic}
              min={0}
              max={12}
              onChange={updateMemorySemantic}
            />
            <span className={settingsHintClass}>
              Type a value (prompt turns 1–12, semantic matches 0–12). Prompt
              turns keep the immediate thread; semantic matches recall older
              related exchanges. This pair applies to{' '}
              {memoryIsCloud ? 'Cloud API' : 'Local GGUF and Ollama'}. Estimated
              memory budget: ~{memoryEstimate.toLocaleString()} tokens.
            </span>
            {!memoryIsCloud && memoryRecent + memorySemantic > 10 ? (
              <div className="flex items-start gap-1.5 rounded-md border border-[#fce100]/35 bg-[#fce100]/10 px-2 py-1.5 text-[9px] leading-snug text-[#fce100]">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>
                  Large local memory can crowd the model context. Raise the
                  context length or lower these counts if replies get truncated.
                </span>
              </div>
            ) : null}
          </div>
        </details>

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
