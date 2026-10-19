import React from 'react';
import { FolderOpen, AlertTriangle } from 'lucide-react';
import type { AIProviderConfig } from '../../../types/ipc';
import { pickNativePath } from '../../../lib/system';

interface AiSettingsProps {
  ai: AIProviderConfig;
  thinkingMode: boolean;
  configError: string | null;
  onToggleThinking: (enabled: boolean) => void;
  onChange: (patch: Partial<AIProviderConfig>) => void;
}

const inputClass =
  'w-full rounded-md border border-white/10 bg-[#2b2b2b] px-3 py-2 font-mono text-[11px] text-[#f3f3f3] outline-none focus:border-[#0067c0]';
const labelClass = 'mb-1 block text-[11px] font-medium text-[#c7c7c7]';

const modes = [
  { id: 'local_gguf', label: 'Local GGUF', hint: 'llama-server · private' },
  { id: 'ollama', label: 'Ollama', hint: '127.0.0.1:11434' },
  { id: 'cloud', label: 'Cloud API', hint: 'Gemini / Groq / OpenAI' },
] as const;

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

  return (
    <div className="flex flex-col gap-3.5 text-xs">
      {configError && (
        <div className="flex items-start gap-2 rounded-md border border-[#ff99a4]/40 bg-[#442726] px-3 py-2 text-[11px] text-[#ffd7d9]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{configError}</span>
        </div>
      )}

      <div>
        <label className={labelClass}>Execution Mode</label>
        <div className="grid grid-cols-2 gap-2 rounded-md bg-[#1f1f1f] p-1">
          <button
            onClick={() => onToggleThinking(false)}
            className={`rounded px-2 py-2 text-center transition ${
              !thinkingMode
                ? 'bg-[#0067c0] text-white'
                : 'text-[#8b8b8b] hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="font-medium">Normal Mode</div>
            <div className="text-[9px] opacity-80">Direct, low latency</div>
          </button>
          <button
            onClick={() => onToggleThinking(true)}
            className={`rounded px-2 py-2 text-center transition ${
              thinkingMode
                ? 'bg-[#0067c0] text-white'
                : 'text-[#8b8b8b] hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="font-medium">Thinking Mode</div>
            <div className="text-[9px] opacity-80">Deeper reasoning</div>
          </button>
        </div>
      </div>

      <div>
        <label className={labelClass}>Inference Backend</label>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-[#1f1f1f] p-1">
          {modes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => onChange({ mode: mode.id })}
              className={`rounded px-2 py-1.5 transition ${
                ai.mode === mode.id
                  ? 'bg-[#383838] text-white'
                  : 'text-[#8b8b8b] hover:text-white'
              }`}
            >
              <div className="font-medium">{mode.label}</div>
              <div className="text-[9px] opacity-70">{mode.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {ai.mode === 'local_gguf' && (
        <>
          <div>
            <label className={labelClass}>GGUF Model</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={ai.gguf_model_path}
                onChange={(event) => onChange({ gguf_model_path: event.target.value })}
                placeholder="Select a .gguf file…"
                className={inputClass}
              />
              <button
                onClick={browseGguf}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#0067c0] px-3 text-[11px] font-medium text-white transition hover:bg-[#1976c9]"
              >
                <FolderOpen size={13} />
                Browse
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass}>Context Length</label>
            <div className="flex gap-2">
              {[4096, 8192, 16384].map((ctx) => (
                <button
                  key={ctx}
                  onClick={() => onChange({ context_length: ctx })}
                  className={`rounded-md border px-3 py-1.5 text-xs transition ${
                    ai.context_length === ctx
                      ? 'border-[#0067c0] bg-[#0067c0]/15 text-[#9dd5ff]'
                      : 'border-white/10 bg-[#2b2b2b] text-[#8b8b8b] hover:text-white'
                  }`}
                >
                  {ctx}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {ai.mode === 'ollama' && (
        <>
          <div>
            <label className={labelClass}>Ollama Base URL</label>
            <input
              type="text"
              value={ai.ollama_base_url}
              onChange={(event) => onChange({ ollama_base_url: event.target.value })}
              placeholder="http://127.0.0.1:11434"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Ollama Model Name</label>
            <input
              type="text"
              value={ai.ollama_model_name}
              onChange={(event) => onChange({ ollama_model_name: event.target.value })}
              placeholder="qwen2.5:7b"
              className={inputClass}
            />
          </div>
        </>
      )}

      {ai.mode === 'cloud' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Provider</label>
              <select
                value={ai.cloud_provider}
                onChange={(event) => onChange({ cloud_provider: event.target.value })}
                className={inputClass}
              >
                <option value="gemini">Google Gemini</option>
                <option value="groq">Groq</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Model</label>
              <input
                type="text"
                value={ai.cloud_model}
                onChange={(event) => onChange({ cloud_model: event.target.value })}
                placeholder="gemini-2.5-flash"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>API Key</label>
            <input
              type="password"
              value={ai.api_key}
              onChange={(event) => onChange({ api_key: event.target.value })}
              placeholder="Stored locally in %APPDATA%/Aether"
              className={inputClass}
            />
          </div>
        </>
      )}
    </div>
  );
};
