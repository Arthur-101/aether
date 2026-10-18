import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Plus, X, Clock, ChevronRight } from 'lucide-react';
import type { ChatTurn, SessionItem } from '../../types/ipc';

interface SessionDrawerProps {
  isOpen: boolean;
  sessions: SessionItem[];
  activeSessionId: string;
  chatHistory: ChatTurn[];
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onClose: () => void;
}

export const SessionDrawer: React.FC<SessionDrawerProps> = ({
  isOpen,
  sessions,
  activeSessionId,
  chatHistory,
  onSelectSession,
  onNewSession,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: -340 }}
            animate={{ x: 0 }}
            exit={{ x: -340 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed top-4 left-4 bottom-4 w-[320px] z-50 glass-panel rounded-2xl flex flex-col p-4 shadow-2xl border border-white/10"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-cyan-400" />
                <h2 className="text-sm font-semibold text-white">Sessions</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onNewSession}
                  className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-medium flex items-center gap-1 hover:opacity-90 transition shadow-sm"
                >
                  <Plus size={14} />
                  <span>New</span>
                </button>
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto my-3 flex flex-col gap-1.5 pr-1">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">
                Recent Chats
              </div>

              {sessions.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No sessions recorded yet. Start talking or typing to begin!
                </div>
              ) : (
                sessions.map((s) => {
                  const isActive = s.id === activeSessionId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => onSelectSession(s.id)}
                      className={`w-full p-2.5 rounded-xl text-left transition flex flex-col gap-1 ${
                        isActive
                          ? 'bg-slate-800/90 border border-cyan-500/50 shadow-md'
                          : 'bg-white/2 hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-medium truncate max-w-[220px] ${
                            isActive ? 'text-white font-semibold' : 'text-slate-300'
                          }`}
                        >
                          {s.title || 'Untitled Session'}
                        </span>
                        {isActive && <ChevronRight size={14} className="text-cyan-400" />}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {s.updated_at ? new Date(s.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                        </span>
                        {s.turn_count !== undefined && (
                          <span>• {s.turn_count} turns</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Active Session Transcript Preview */}
            <div className="h-44 border-t border-white/5 pt-2 flex flex-col">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Current Memory Buffer
              </span>
              <div className="flex-1 overflow-y-auto flex flex-col gap-2 p-2 bg-black/20 rounded-xl text-xs font-sans">
                {chatHistory.length === 0 ? (
                  <span className="text-[11px] text-slate-500 italic text-center my-auto">
                    1-Turn Buffer empty. Speak or type above.
                  </span>
                ) : (
                  chatHistory.map((turn, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="text-[11px] text-cyan-300 bg-cyan-950/40 p-1.5 rounded-lg border border-cyan-900/30">
                        <span className="font-semibold text-cyan-400 mr-1">You:</span>
                        {turn.user}
                      </div>
                      <div className="text-[11px] text-slate-200 bg-slate-900/40 p-1.5 rounded-lg border border-white/5">
                        <span className="font-semibold text-indigo-400 mr-1">Aether:</span>
                        {turn.ai}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
