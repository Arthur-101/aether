import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Cpu,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Pin,
  Send,
  Server,
  Sparkles,
  StickyNote,
  Wrench,
  X,
} from 'lucide-react';
import type {
  AIProviderConfig,
  AttachmentItem,
  ChatTurn,
  HotkeysConfig,
  ModelStatus,
  SessionItem,
  TimeFormat,
} from '../../types/ipc';
import type { NotesApi } from '../../types/notes';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { AetherMark } from './AetherMark';
import { ChatSessionMenu } from './ChatSessionMenu';
import { parseBackendTimestamp } from './backendTime';
import { formatClockTime } from './timeFormat';

interface QuickChatProps {
  history: ChatTurn[];
  pending: string | null;
  attachments?: AttachmentItem[];
  focusToken?: number;
  openFocusToken?: number;
  hotkeys?: HotkeysConfig;
  model: { status: ModelStatus | null; onLoad: () => void; onRelease: () => void };
  notes: NotesApi;
  ai?: AIProviderConfig | null;
  thinkingMode: boolean;
  onToggleThinking: (enabled: boolean) => void;
  sessions: SessionItem[];
  activeSessionId: string;
  activeSessionTitle: string;
  vectorReady?: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRefreshSessions: () => void;
  onCycleBackend: () => void;
  onBrowseFiles: () => void;
  onSend: (message: string) => void;
  onDetach?: (filePath: string) => void;
}

const PROMPTS = [
  'Summarize what I am working on',
  'What is using the most memory?',
  'Plan the rest of my afternoon',
];

const BACKEND_CYCLE: Record<
  AIProviderConfig['mode'],
  { mode: AIProviderConfig['mode']; label: string }
> = {
  local_gguf: { mode: 'ollama', label: 'Ollama' },
  ollama: { mode: 'cloud', label: 'Cloud' },
  cloud: { mode: 'local_gguf', label: 'Local GGUF' },
};

function attachmentStatus(item: AttachmentItem): string {
  if (item.mode === 'indexing') return 'Indexing…';
  if (item.mode === 'rag_vector') return `${item.chunks ?? 0} chunks · Indexed`;
  if (item.mode === 'inline') return 'Full text · Ready';
  return 'Image · Ready';
}

function engineInfo(ai?: AIProviderConfig | null): {
  label: string;
  detail: string;
  icon: typeof Cpu;
} {
  if (!ai) return { label: 'Engine', detail: 'Waiting for configuration', icon: Cpu };
  if (ai.mode === 'ollama') {
    return {
      label: 'Ollama',
      detail: ai.ollama_model_name || 'No model selected',
      icon: Server,
    };
  }
  if (ai.mode === 'cloud') {
    const provider = ai.cloud_provider || 'Cloud';
    return {
      label: `${provider.charAt(0).toUpperCase()}${provider.slice(1)} Cloud`,
      detail: ai.cloud_model || 'No model selected',
      icon: Cloud,
    };
  }
  const file = ai.gguf_model_path.split(/[\\/]/).pop() || '';
  return {
    label: 'Local GGUF',
    detail: file.replace(/\.gguf$/i, '') || 'No model selected',
    icon: Cpu,
  };
}

function turnTime(timestamp: string | undefined, timeFormat: TimeFormat): string {
  const date = parseBackendTimestamp(timestamp);
  if (!date) return '';
  return formatClockTime(date, timeFormat);
}

/** Compact shortcut label for the composer footer. */
function shortcutLabel(value: string | undefined, fallback: string): string {
  const tokens = (value || fallback)
    .replace(/[<>]/g, '')
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens
    .map((token) => {
      const lower = token.toLowerCase();
      if (lower === 'ctrl' || lower === 'control') return 'Ctrl';
      if (lower === 'cmd' || lower === 'win' || lower === 'meta') return 'Win';
      if (lower === 'shift') return 'Shift';
      if (lower === 'alt') return 'Alt';
      if (lower === 'space') return 'Space';
      if (lower === 'esc' || lower === 'escape') return 'Esc';
      return token.length === 1 ? token.toUpperCase() : token;
    })
    .join('+');
}

export const QuickChat: React.FC<QuickChatProps> = ({
  history,
  pending,
  attachments = [],
  focusToken = 0,
  openFocusToken = 0,
  hotkeys,
  model,
  notes,
  ai,
  thinkingMode,
  onToggleThinking,
  sessions,
  activeSessionId,
  activeSessionTitle,
  vectorReady = false,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRefreshSessions,
  onCycleBackend,
  onBrowseFiles,
  onSend,
  onDetach,
}) => {
  const timeFormat = useTimeFormat();
  const openShortcut = shortcutLabel(hotkeys?.open_island, 'Ctrl+Space');
  const voiceShortcut = shortcutLabel(hotkeys?.toggle_drawer, 'Alt+Space');
  const shortcutsMatch = openShortcut === voiceShortcut;
  const [input, setInput] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachRef = useRef<HTMLDivElement>(null);

  const engine = useMemo(() => engineInfo(ai), [ai]);
  const EngineIcon = engine.icon;
  const nextBackend = ai ? BACKEND_CYCLE[ai.mode] : null;
  const attachedFiles = attachments.filter(
    (item) => item.mode === 'inline' || item.mode === 'rag_vector'
  ).length;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, pending]);

  useEffect(() => {
    if (!focusToken) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [focusToken]);

  // The global Open Island shortcut always lands in Quick Chat. The 80ms
  // delay lets the shell finish expanding before the composer takes focus.
  useEffect(() => {
    if (!openFocusToken) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [openFocusToken]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [input]);

  useEffect(() => {
    if (!attachOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (attachRef.current?.contains(event.target as Node)) return;
      setAttachOpen(false);
      setNotePickerOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [attachOpen]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input);
    setInput('');
  };

  const pickPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const menuItemClass =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10.5px] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';

  const statusChip =
    'inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2.5 text-[10px] text-[var(--aether-text-2)] transition';

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <div className="aether-panel flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--aether-line-soft)] p-2.5">
        <ChatSessionMenu
          sessions={sessions}
          activeSessionId={activeSessionId}
          activeSessionTitle={activeSessionTitle}
          attachmentCount={attachedFiles}
          vectorReady={vectorReady}
          onSelectSession={onSelectSession}
          onNewSession={onNewSession}
          onDeleteSession={onDeleteSession}
          onRefreshSessions={onRefreshSessions}
        />

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onCycleBackend}
            disabled={!ai || !nextBackend}
            title={
              ai && nextBackend
                ? `${engine.label} · ${engine.detail} — click to switch to ${nextBackend.label}`
                : 'Waiting for inference configuration'
            }
            aria-label={
              ai && nextBackend
                ? `Inference backend: ${engine.label}. Switch to ${nextBackend.label}`
                : 'Inference backend'
            }
            className={`${statusChip} hover:border-[var(--aether-line-strong)] hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)] disabled:cursor-wait disabled:opacity-60`}
          >
            <EngineIcon size={11} className="shrink-0 text-[var(--aether-accent-text)]" />
            <span className="max-w-[110px] truncate font-medium text-[var(--aether-text-1)]">
              {engine.label}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onToggleThinking(!thinkingMode)}
            aria-pressed={thinkingMode}
            title={
              thinkingMode
                ? 'Thinking mode on: deeper reasoning, slower replies'
                : 'Thinking mode off: direct, low-latency replies'
            }
            className={`${statusChip} ${
              thinkingMode
                ? 'border-[var(--aether-accent)]/45 bg-[var(--aether-accent)]/15 text-[var(--aether-accent-text)]'
                : 'hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]'
            }`}
          >
            <Brain size={11} className="shrink-0" />
            <span className="font-medium">{thinkingMode ? 'Thinking' : 'Normal'}</span>
          </button>

          {model.status?.local ? (
            <button
              type="button"
              onClick={model.status.loaded ? model.onRelease : model.onLoad}
              disabled={model.status.starting || pending !== null}
              title={
                model.status.loaded
                  ? 'Stop llama-server and free the model from VRAM'
                  : 'Preload the local model into VRAM'
              }
              className={`${statusChip} hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)] disabled:cursor-wait disabled:opacity-60`}
            >
              {model.status.starting ? (
                <Loader2 size={11} className="animate-spin text-[var(--aether-accent-text)]" />
              ) : (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    model.status.loaded ? 'bg-[#6ccb5f]' : 'bg-[#8b8b8b]'
                  }`}
                />
              )}
              <span className="font-medium">
                {model.status.starting
                  ? 'Loading'
                  : model.status.loaded
                    ? 'Model ready'
                    : 'Load model'}
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="aether-panel flex h-[314px] flex-col overflow-hidden rounded-2xl border border-[var(--aether-line-soft)]">
        <div
          ref={scrollRef}
          role="log"
          aria-label="Conversation"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={Boolean(pending)}
          className="flex-1 overflow-y-auto px-4 py-3.5"
        >
          {history.length === 0 && !pending ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-[var(--aether-accent)]/25 bg-[var(--aether-accent)]/10 text-[var(--aether-accent-text)]">
                <AetherMark size={30} />
              </span>
              <div>
                <p className="text-[12px] font-semibold text-[var(--aether-text-1)]">
                  Ask Aether anything.
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--aether-text-3)]">
                  Replies stay in this session. Tools run automatically when needed.
                </p>
              </div>
              <div className="flex max-w-[640px] flex-wrap justify-center gap-1.5">
                {PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => pickPrompt(prompt)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2.5 py-1 text-[9.5px] text-[var(--aether-text-2)] transition hover:border-[var(--aether-line-strong)] hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
                  >
                    <Sparkles size={9} className="text-[var(--aether-accent-text)]" />
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {history.map((turn, index) => (
                <div key={index} className="flex flex-col gap-2">
                  <div className="flex justify-end">
                    <div className="max-w-[78%]">
                      <p className="mb-1 text-right text-[8.5px] font-semibold uppercase tracking-[0.14em] text-[var(--aether-text-3)]">
                        You
                      </p>
                      <div className="accent-fill rounded-2xl rounded-br-md px-3.5 py-2 text-[11.5px] leading-relaxed shadow-[0_6px_18px_rgba(0,0,0,0.14)]">
                        <div className="whitespace-pre-wrap break-words">{turn.user}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="mt-4 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-[var(--aether-accent)]/22 bg-[var(--aether-accent)]/10 text-[var(--aether-accent-text)]">
                      <AetherMark size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.14em] text-[var(--aether-text-3)]">
                        Aether
                        {turnTime(turn.timestamp, timeFormat) ? (
                          <span className="font-normal tracking-normal text-[var(--aether-text-4)]">
                            · {turnTime(turn.timestamp, timeFormat)}
                          </span>
                        ) : null}
                      </p>
                      <div
                        className={`inline-block max-w-[92%] rounded-2xl rounded-bl-md border px-3.5 py-2 text-[11.5px] leading-relaxed ${
                          turn.error
                            ? 'border-[#ff99a4]/40 bg-[#442726] text-[#ffd7d9]'
                            : 'border-[var(--aether-line)] bg-[var(--aether-surface-1)] text-[var(--aether-text-1)]'
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">{turn.ai}</div>
                        {turn.tools_used && turn.tools_used.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {turn.tools_used.map((tool, toolIndex) => (
                              <span
                                key={`${tool.name}-${toolIndex}`}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] px-1.5 py-0.5 text-[9px] text-[var(--aether-text-2)]"
                              >
                                <Wrench size={8} />
                                {tool.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {pending ? (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-end">
                    <div className="max-w-[78%]">
                      <p className="mb-1 text-right text-[8.5px] font-semibold uppercase tracking-[0.14em] text-[var(--aether-text-3)]">
                        You
                      </p>
                      <div className="accent-fill rounded-2xl rounded-br-md px-3.5 py-2 text-[11.5px] leading-relaxed">
                        <div className="whitespace-pre-wrap break-words">{pending}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-4 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-[var(--aether-accent)]/22 bg-[var(--aether-accent)]/10 text-[var(--aether-accent-text)]">
                      <AetherMark size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-[8.5px] font-semibold uppercase tracking-[0.14em] text-[var(--aether-text-3)]">
                        Aether
                      </p>
                      <div className="inline-flex max-w-[92%] items-center gap-2 rounded-2xl rounded-bl-md border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-3.5 py-2 text-[11px] text-[var(--aether-text-2)]">
                        <Loader2
                          size={11}
                          className="animate-spin text-[var(--aether-accent-text)]"
                        />
                        <span>Thinking…</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((item) => (
            <div
              key={item.file_path}
              className="flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-[var(--aether-accent)]/35 bg-[var(--aether-accent)]/12 px-2 py-1 text-[10px] text-[var(--aether-text-2)]"
            >
              {item.mode === 'image' ? (
                <ImageIcon size={11} className="shrink-0 text-[var(--aether-accent-text)]" />
              ) : (
                <FileText size={11} className="shrink-0 text-[var(--aether-accent-text)]" />
              )}
              <span className="max-w-[230px] truncate font-medium">{item.file_name}</span>
              <span className="shrink-0 text-[9px] text-[var(--aether-accent-text)]">
                ({attachmentStatus(item)})
              </span>
              {onDetach ? (
                <button
                  type="button"
                  onClick={() => onDetach(item.file_path)}
                  className="shrink-0 rounded p-0.5 text-[var(--aether-accent-text)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
                  title="Remove attachment"
                >
                  <X size={10} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="aether-panel rounded-2xl border border-[var(--aether-line-soft)] p-2.5">
        <div className="flex items-end gap-2">
          <div ref={attachRef} className="relative">
            <button
              type="button"
              onClick={() => {
                const next = !attachOpen;
                setAttachOpen(next);
                setNotePickerOpen(false);
                if (next) notes.onList();
              }}
              title="Attach a file or note"
              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                attachOpen
                  ? 'border-[var(--aether-accent)] bg-[var(--aether-accent)]/20 text-[var(--aether-accent-text)]'
                  : 'border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-2)] hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]'
              }`}
            >
              <Paperclip size={15} />
            </button>
            {attachOpen ? (
              <div className="absolute bottom-full left-0 z-40 mb-2 w-64 overflow-hidden rounded-xl border border-[var(--aether-line-strong)] bg-[var(--aether-surface-2)] shadow-2xl">
                {notePickerOpen ? (
                  <>
                    <div className="flex items-center gap-1.5 border-b border-[var(--aether-line)] px-2.5 py-2">
                      <button
                        type="button"
                        onClick={() => setNotePickerOpen(false)}
                        className="rounded p-0.5 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
                        title="Back"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <span className="text-[10px] font-medium text-[var(--aether-text-2)]">
                        Attach a note
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      {notes.items.length === 0 ? (
                        <p className="px-2 py-4 text-center text-[10px] text-[var(--aether-text-3)]">
                          No notes yet. Create one in the Notes tab.
                        </p>
                      ) : (
                        notes.items.map((note) => (
                          <button
                            key={note.id}
                            type="button"
                            onClick={() => {
                              setAttachOpen(false);
                              setNotePickerOpen(false);
                              notes.onAttach(note.id);
                              inputRef.current?.focus();
                            }}
                            className={menuItemClass}
                          >
                            <StickyNote
                              size={12}
                              className="shrink-0 text-[var(--aether-accent-text)]"
                            />
                            <span className="min-w-0 flex-1 truncate">{note.title}</span>
                            {note.pinned ? (
                              <Pin
                                size={10}
                                className="shrink-0 text-[var(--aether-accent-text)]"
                              />
                            ) : null}
                          </button>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAttachOpen(false);
                        onBrowseFiles();
                      }}
                      className={menuItemClass}
                    >
                      <FolderOpen size={12} className="shrink-0" />
                      Browse files…
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        notes.onList();
                        setNotePickerOpen(true);
                      }}
                      className={menuItemClass}
                    >
                      <StickyNote size={12} className="shrink-0" />
                      Attach note…
                      <ChevronRight
                        size={11}
                        className="ml-auto shrink-0 text-[var(--aether-text-3)]"
                      />
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <textarea
            ref={inputRef}
            aria-label="Message Aether"
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              attachments.length > 0
                ? 'Ask a question about the attached file…'
                : 'Ask Aether or trigger a tool…'
            }
            className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--aether-text-1)] outline-none placeholder:text-[var(--aether-text-3)] focus:border-[var(--aether-accent)]"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim()}
            aria-label="Send message"
            title="Send message"
            className="accent-fill flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[9px] text-[var(--aether-text-3)]">
          <span>
            <kbd className="rounded bg-[var(--aether-fill-2)] px-1.5 py-0.5">Enter</kbd> send ·{' '}
            <kbd className="rounded bg-[var(--aether-fill-2)] px-1.5 py-0.5">Shift+Enter</kbd> new
            line
          </span>
          <span className="flex items-center gap-1.5">
            <MessageSquare size={9} />
            <span>
              <kbd className="rounded bg-[var(--aether-fill-2)] px-1.5 py-0.5">
                {openShortcut}
              </kbd>{' '}
              open
              {shortcutsMatch ? (
                <> · hold to talk</>
              ) : (
                <>
                  {' '}
                  ·{' '}
                  <kbd className="rounded bg-[var(--aether-fill-2)] px-1.5 py-0.5">
                    {voiceShortcut}
                  </kbd>{' '}
                  hold to talk
                </>
              )}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
