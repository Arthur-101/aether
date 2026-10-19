import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Plus,
  X,
  Clock,
  Trash2,
  Paperclip,
  Database,
} from 'lucide-react';
import type { AttachmentItem, SessionItem } from '../../types/ipc';

interface SessionDrawerProps {
  isOpen: boolean;
  sessions: SessionItem[];
  activeSessionId: string;
  attachments: AttachmentItem[];
  vectorReady: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onClose: () => void;
}

export const SessionDrawer: React.FC<SessionDrawerProps> = ({
  isOpen,
  sessions,
  activeSessionId,
  attachments,
  vectorReady,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onClose,
}) => {
  const ragFiles = attachments.filter(
    (item) => item.mode === 'inline' || item.mode === 'rag_vector'
  ).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            data-aether-interactive
            className="aether-interactive fixed inset-0 z-40 bg-black/35 backdrop-blur-xs"
          />

          <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            data-aether-interactive
            className="aether-interactive fixed bottom-3 left-3 top-3 z-50 flex w-[300px] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#202020]/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-white/60" />
                <h2 className="text-sm font-semibold text-white">Sessions</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onNewSession}
                  className="flex items-center gap-1 rounded-md bg-[#0067C0] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#0078D4]"
                >
                  <Plus size={13} />
                  <span>New</span>
                </button>
                <button
                  onClick={onClose}
                  className="rounded-md p-1.5 text-[#8b8b8b] transition hover:bg-white/5 hover:text-white"
                  title="Close sessions"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[#8b8b8b]">
                Recent Chats
              </div>

              {sessions.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-[#8b8b8b]">
                  No sessions yet. Start a conversation to create one.
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {sessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    return (
                      <div
                        key={session.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectSession(session.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') onSelectSession(session.id);
                        }}
                        className={`group relative flex cursor-pointer flex-col gap-1 rounded-md border-l-2 px-3 py-2.5 text-left transition ${
                          isActive
                            ? 'border-[#0067C0] bg-[#2D2D2D]'
                            : 'border-transparent hover:bg-[#2A2A2A]'
                        }`}
                      >
                        <span
                          className={`truncate pr-6 text-xs ${
                            isActive
                              ? 'font-semibold text-white'
                              : 'font-medium text-[#d6d6d6]'
                          }`}
                        >
                          {session.title || 'Untitled Session'}
                        </span>
                        <div className="flex items-center gap-2 font-mono text-[10px] text-[#8b8b8b]">
                          <span className="flex items-center gap-1">
                            <Clock size={9} />
                            {session.updated_at
                              ? new Date(session.updated_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Now'}
                          </span>
                          {session.turn_count !== undefined && (
                            <span>· {session.turn_count} turns</span>
                          )}
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                          className="absolute right-1.5 top-1.5 rounded p-1 text-[#8b8b8b] opacity-0 transition hover:bg-[#ff99a4]/10 hover:text-[#ff99a4] group-hover:opacity-100"
                          title="Delete session"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-[10px] text-[#8b8b8b]">
              <span className="flex min-w-0 items-center gap-1">
                <Paperclip size={10} className="shrink-0" />
                <span className="truncate">
                  {ragFiles > 0 ? `${ragFiles} RAG file${ragFiles === 1 ? '' : 's'}` : 'No active files'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    vectorReady ? 'bg-[#6ccb5f]' : 'bg-[#ff99a4]'
                  }`}
                />
                <Database size={10} />
                <span>Vector DB {vectorReady ? 'Ready' : 'Offline'}</span>
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
