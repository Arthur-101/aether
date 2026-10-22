import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Loader2,
  Wrench,
  FileText,
  X,
  Image as ImageIcon,
  Paperclip,
  FolderOpen,
  StickyNote,
  ChevronLeft,
  ChevronRight,
  History,
  Pin,
} from 'lucide-react';
import type { AttachmentItem, ChatTurn, ModelStatus } from '../../types/ipc';
import type { NotesApi } from '../../types/notes';

interface QuickChatProps {
  history: ChatTurn[];
  pending: string | null;
  attachments?: AttachmentItem[];
  focusToken?: number;
  model: { status: ModelStatus | null; onLoad: () => void; onRelease: () => void };
  notes: NotesApi;
  onBrowseFiles: () => void;
  onSend: (message: string) => void;
  onDetach?: (filePath: string) => void;
  onOpenSessions?: () => void;
}

function attachmentStatus(item: AttachmentItem): string {
  if (item.mode === 'indexing') return 'Indexing…';
  if (item.mode === 'rag_vector') return `${item.chunks ?? 0} chunks · Indexed`;
  if (item.mode === 'inline') return 'Full text · Ready to Ask';
  return 'Image · Ready to Ask';
}

export const QuickChat: React.FC<QuickChatProps> = ({
  history,
  pending,
  attachments = [],
  focusToken = 0,
  model,
  notes,
  onBrowseFiles,
  onSend,
  onDetach,
  onOpenSessions,
}) => {
  const [input, setInput] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, pending]);

  useEffect(() => {
    if (!focusToken) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [focusToken]);

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

  const menuItemClass =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div
        ref={scrollRef}
        className="h-[220px] overflow-y-auto flex flex-col gap-2 pr-1"
      >
        {history.length === 0 && !pending && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-1">
            <span className="text-xs text-[var(--aether-text-2)]">Ask Aether anything.</span>
            <span className="text-[10px] text-[var(--aether-text-3)]">
              Replies appear here. Tools run automatically.
            </span>
          </div>
        )}

        {history.map((turn, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <div className="self-end max-w-[85%] rounded-lg rounded-br-sm accent-fill px-2.5 py-1.5 text-[11px]">
              {turn.user}
            </div>
            <div
              className={`self-start max-w-[92%] rounded-lg rounded-bl-sm border px-2.5 py-1.5 text-[11px] leading-relaxed ${
                turn.error
                  ? 'bg-[#442726] border-[#ff99a4]/40 text-[#ffd7d9]'
                  : 'bg-[var(--aether-surface-1)] border-[var(--aether-line)] text-[var(--aether-text-1)]'
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{turn.ai}</div>
              {turn.tools_used && turn.tools_used.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {turn.tools_used.map((tool, toolIndex) => (
                    <span
                      key={`${tool.name}-${toolIndex}`}
                      className="inline-flex items-center gap-1 rounded bg-[var(--aether-fill)] px-1.5 py-0.5 text-[9px] text-[var(--aether-text-2)]"
                    >
                      <Wrench size={8} />
                      {tool.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex flex-col gap-1.5">
            <div className="self-end max-w-[85%] rounded-lg rounded-br-sm accent-fill px-2.5 py-1.5 text-[11px]">
              {pending}
            </div>
            <div className="self-start inline-flex items-center gap-1.5 rounded-lg rounded-bl-sm border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-2.5 py-1.5 text-[11px] text-[var(--aether-text-2)]">
              <Loader2 size={11} className="animate-spin text-[var(--aether-accent-text)]" />
              <span>Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((item) => (
            <div
              key={item.file_path}
              className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-[var(--aether-accent)]/35 bg-[var(--aether-accent)]/12 px-2 py-1 text-[10px] text-[var(--aether-text-2)]"
            >
              {item.mode === 'image' ? (
                <ImageIcon size={11} className="shrink-0 text-[var(--aether-accent-text)]" />
              ) : (
                <FileText size={11} className="shrink-0 text-[var(--aether-accent-text)]" />
              )}
              <span className="max-w-[210px] truncate font-medium">{item.file_name}</span>
              <span className="shrink-0 text-[9px] text-[var(--aether-accent-text)]">
                ({attachmentStatus(item)})
              </span>
              {onDetach && (
                <button
                  onClick={() => onDetach(item.file_path)}
                  className="shrink-0 rounded p-0.5 text-[var(--aether-accent-text)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
                  title="Remove attachment"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
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
            className={`flex h-full items-center justify-center rounded-lg border px-2.5 transition ${
              attachOpen
                ? 'border-[var(--aether-accent)] bg-[var(--aether-accent)]/25 text-[var(--aether-text-1)]'
                : 'border-[var(--aether-line)] bg-[var(--aether-surface-1)] text-[var(--aether-text-2)] hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]'
            }`}
          >
            <Paperclip size={14} />
          </button>
          {attachOpen ? (
            <div className="absolute bottom-full left-0 z-30 mb-1 w-60 overflow-hidden rounded-lg border border-[var(--aether-line-strong)] bg-[var(--aether-surface-2)] shadow-2xl backdrop-blur-xl">
              {notePickerOpen ? (
                <>
                  <div className="flex items-center gap-1.5 border-b border-[var(--aether-line)] px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => setNotePickerOpen(false)}
                      className="rounded p-0.5 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
                      title="Back"
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <span className="text-[10px] font-medium text-[var(--aether-text-2)]">Attach a note</span>
                  </div>
                  <div className="max-h-44 overflow-y-auto p-1">
                    {notes.items.length === 0 ? (
                      <p className="px-2 py-3 text-center text-[10px] text-[var(--aether-text-3)]">
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
                          <StickyNote size={12} className="shrink-0 text-[var(--aether-accent-text)]" />
                          <span className="min-w-0 flex-1 truncate">{note.title}</span>
                          {note.pinned ? (
                            <Pin size={10} className="shrink-0 text-[var(--aether-accent-text)]" />
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
                    <ChevronRight size={11} className="ml-auto shrink-0 text-[var(--aether-text-3)]" />
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && handleSend()}
          placeholder={
            attachments.length > 0
              ? 'Ask a question about the attached file...'
              : 'Ask Aether or trigger a tool...'
          }
          className="flex-1 rounded-lg border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-3 py-2 text-xs text-[var(--aether-text-1)] placeholder-[#8b8b8b] outline-none focus:border-[var(--aether-accent)]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="accent-fill flex items-center justify-center rounded-lg px-3 py-2 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={14} />
        </button>
      </div>

      <div className="relative flex items-center justify-center text-[10px] text-[var(--aether-text-3)]">
        <div>
          <kbd className="rounded bg-[var(--aether-fill-2)] px-1.5 py-0.5">Ctrl+Win</kbd> Dictation ·{' '}
          <kbd className="rounded bg-[var(--aether-fill-2)] px-1.5 py-0.5">Alt+Space</kbd> Voice
        </div>

        {onOpenSessions ? (
          <button
            type="button"
            onClick={onOpenSessions}
            className="absolute left-0 inline-flex items-center gap-1.5 rounded-full border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-0.5 text-[9px] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
            title="Open session history"
          >
            <History size={9} />
            Sessions
          </button>
        ) : null}

        {model.status?.local && (
          <button
            type="button"
            onClick={model.status.loaded ? model.onRelease : model.onLoad}
            disabled={model.status.starting || pending !== null}
            title={
              model.status.loaded
                ? 'Stop llama-server and free the model from VRAM'
                : 'Preload the local model into VRAM'
            }
            className="absolute right-0 inline-flex items-center gap-1.5 rounded-full border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-0.5 text-[9px] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)] disabled:cursor-wait disabled:opacity-60"
          >
            {model.status.starting ? (
              <Loader2 size={9} className="animate-spin text-[var(--aether-accent-text)]" />
            ) : (
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  model.status.loaded ? 'bg-[#6ccb5f]' : 'bg-[#8b8b8b]'
                }`}
              />
            )}
            {model.status.starting
              ? 'Loading model…'
              : model.status.loaded
                ? 'Release VRAM'
                : 'Load model'}
          </button>
        )}
      </div>
    </div>
  );
};
