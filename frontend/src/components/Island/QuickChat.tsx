import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Wrench, FileText, X, Image as ImageIcon } from 'lucide-react';
import type { AttachmentItem, ChatTurn } from '../../types/ipc';

interface QuickChatProps {
  history: ChatTurn[];
  pending: string | null;
  attachments?: AttachmentItem[];
  focusToken?: number;
  onSend: (message: string) => void;
  onDetach?: (filePath: string) => void;
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
  onSend,
  onDetach,
}) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, pending]);

  useEffect(() => {
    if (!focusToken) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [focusToken]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input);
    setInput('');
  };

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div
        ref={scrollRef}
        className="h-[220px] overflow-y-auto flex flex-col gap-2 pr-1"
      >
        {history.length === 0 && !pending && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-1">
            <span className="text-xs text-[#c7c7c7]">Ask Aether anything.</span>
            <span className="text-[10px] text-[#8b8b8b]">
              Replies appear here. Tools run automatically.
            </span>
          </div>
        )}

        {history.map((turn, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <div className="self-end max-w-[85%] rounded-lg rounded-br-sm bg-[#0067c0] px-2.5 py-1.5 text-[11px] text-white">
              {turn.user}
            </div>
            <div
              className={`self-start max-w-[92%] rounded-lg rounded-bl-sm border px-2.5 py-1.5 text-[11px] leading-relaxed ${
                turn.error
                  ? 'bg-[#442726] border-[#ff99a4]/40 text-[#ffd7d9]'
                  : 'bg-[#2b2b2b] border-white/10 text-[#f3f3f3]'
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{turn.ai}</div>
              {turn.tools_used && turn.tools_used.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {turn.tools_used.map((tool, toolIndex) => (
                    <span
                      key={`${tool.name}-${toolIndex}`}
                      className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-[#c7c7c7]"
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
            <div className="self-end max-w-[85%] rounded-lg rounded-br-sm bg-[#0067c0] px-2.5 py-1.5 text-[11px] text-white">
              {pending}
            </div>
            <div className="self-start inline-flex items-center gap-1.5 rounded-lg rounded-bl-sm border border-white/10 bg-[#2b2b2b] px-2.5 py-1.5 text-[11px] text-[#c7c7c7]">
              <Loader2 size={11} className="animate-spin text-[#60cdff]" />
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
              className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-[#0067c0]/35 bg-[#0067c0]/12 px-2 py-1 text-[10px] text-[#d6ecff]"
            >
              {item.mode === 'image' ? (
                <ImageIcon size={11} className="shrink-0 text-[#60cdff]" />
              ) : (
                <FileText size={11} className="shrink-0 text-[#60cdff]" />
              )}
              <span className="max-w-[210px] truncate font-medium">{item.file_name}</span>
              <span className="shrink-0 text-[9px] text-[#9dd5ff]">
                ({attachmentStatus(item)})
              </span>
              {onDetach && (
                <button
                  onClick={() => onDetach(item.file_path)}
                  className="shrink-0 rounded p-0.5 text-[#9dd5ff] transition hover:bg-white/10 hover:text-white"
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
          className="flex-1 rounded-lg border border-white/10 bg-[#2b2b2b] px-3 py-2 text-xs text-white placeholder-[#8b8b8b] outline-none focus:border-[#0067c0]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="flex items-center justify-center rounded-lg bg-[#0067c0] px-3 py-2 text-white transition hover:bg-[#1976c9] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={14} />
        </button>
      </div>

      <div className="text-center text-[10px] text-[#8b8b8b]">
        <kbd className="rounded bg-white/10 px-1.5 py-0.5">Ctrl+Win</kbd> Dictation ·{' '}
        <kbd className="rounded bg-white/10 px-1.5 py-0.5">Alt+Space</kbd> Voice
      </div>
    </div>
  );
};
