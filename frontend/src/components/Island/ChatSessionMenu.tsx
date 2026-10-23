import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Database,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { SessionItem, TimeFormat } from '../../types/ipc';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { parseBackendTimestamp } from './backendTime';
import { formatClockTime } from './timeFormat';

interface ChatSessionMenuProps {
  sessions: SessionItem[];
  activeSessionId: string;
  activeSessionTitle: string;
  attachmentCount: number;
  vectorReady: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRefreshSessions: () => void;
}

function formatSessionTime(value: string | undefined, timeFormat: TimeFormat): string {
  const date = parseBackendTimestamp(value);
  if (!date) return 'Now';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return formatClockTime(date, timeFormat);
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function turnLabel(turns?: number): string {
  if (turns === undefined) return '';
  return `${turns} ${turns === 1 ? 'turn' : 'turns'}`;
}

/**
 * Quick Chat's session chrome.
 *
 * The old global drawer exposed session history from the header. This keeps
 * the same data and actions, but nests them under the current session title so
 * switching, searching, creating, and deleting all happen where the chat is.
 */
export const ChatSessionMenu: React.FC<ChatSessionMenuProps> = ({
  sessions,
  activeSessionId,
  activeSessionTitle,
  attachmentCount,
  vectorReady,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRefreshSessions,
}) => {
  const timeFormat = useTimeFormat();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const deleteTarget = deleteSessionId
    ? sessions.find((session) => session.id === deleteSessionId)
    : undefined;
  const title = activeSessionTitle || activeSession?.title || 'New Session';

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter((session) => {
      const haystack = `${session.title || ''} ${session.last_turn_prompt || ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, sessions]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (deleteSessionId) {
        setDeleteSessionId(null);
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, deleteSessionId]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDeleteSessionId(null);
      return;
    }
    onRefreshSessions();
    const timer = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, onRefreshSessions]);

  const select = (id: string) => {
    onSelectSession(id);
    setDeleteSessionId(null);
    setOpen(false);
  };

  const create = () => {
    onNewSession();
    // The list command is queued after NEW_SESSION, so the new row arrives
    // with the refreshed recent list instead of waiting for a later turn.
    onRefreshSessions();
    setDeleteSessionId(null);
    setOpen(false);
  };

  const remove = (id: string) => {
    onDeleteSession(id);
    setDeleteSessionId(null);
    if (id === activeSessionId) setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Switch, search, or manage chat sessions"
        className="group flex h-11 w-full min-w-0 items-center gap-2.5 rounded-xl border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2.5 text-left transition hover:border-[var(--aether-line-strong)] hover:bg-[var(--aether-fill-2)]"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--aether-accent)]/30 bg-[var(--aether-accent)]/12 text-[var(--aether-accent-text)]">
          <MessageSquare size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
            Current session
          </span>
          <span className="block truncate text-[11.5px] font-semibold text-[var(--aether-text-1)]">
            {title}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {activeSession?.turn_count !== undefined ? (
            <span className="text-[9px] tabular-nums text-[var(--aether-text-3)]">
              {turnLabel(activeSession.turn_count)}
            </span>
          ) : null}
          <ChevronDown
            size={13}
            className={`text-[var(--aether-text-3)] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Chat sessions"
          className="absolute left-0 top-full z-40 mt-2 w-[min(380px,calc(100vw-3rem))] overflow-hidden rounded-xl border border-[var(--aether-line-strong)] bg-[var(--aether-surface-2)] shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--aether-line)] px-3 py-2">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
                Sessions
              </p>
              <p className="text-[10px] text-[var(--aether-text-2)]">
                {sessions.length} {sessions.length === 1 ? 'conversation' : 'conversations'}
              </p>
            </div>
            <button
              type="button"
              onClick={create}
              className="accent-fill flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition hover:brightness-105"
            >
              <Plus size={11} />
              New session
            </button>
          </div>

          <div className="flex items-center gap-1.5 border-b border-[var(--aether-line)] px-2.5 py-2">
            <Search size={12} className="shrink-0 text-[var(--aether-text-3)]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sessions"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--aether-text-1)] outline-none placeholder:text-[var(--aether-text-3)]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded px-1 text-[9px] text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="max-h-[248px] overflow-y-auto p-1.5">
            <p className="px-2 pb-1 pt-0.5 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
              {query ? 'Matches' : 'Recent'}
            </p>
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-[10px] text-[var(--aether-text-3)]">
                {sessions.length === 0
                  ? 'No sessions yet. Start a conversation or create one.'
                  : 'No sessions match that search.'}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {filtered.map((session) => {
                  const active = session.id === activeSessionId;
                  return (
                    <div
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      aria-current={active ? 'true' : undefined}
                      onClick={() => select(session.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          select(session.id);
                        }
                      }}
                      className={`group relative flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                        active
                          ? 'border-[var(--aether-accent)]/45 bg-[var(--aether-accent)]/12'
                          : 'border-transparent hover:border-[var(--aether-line)] hover:bg-[var(--aether-fill)]'
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${
                          active
                            ? 'bg-[var(--aether-accent)]/22 text-[var(--aether-accent-text)]'
                            : 'bg-[var(--aether-fill)] text-[var(--aether-text-3)]'
                        }`}
                      >
                        {active ? <Check size={11} /> : <MessageSquare size={11} />}
                      </span>
                      <span className="min-w-0 flex-1 pr-6">
                        <span
                          className={`block truncate text-[11px] ${
                            active
                              ? 'font-semibold text-[var(--aether-text-1)]'
                              : 'font-medium text-[var(--aether-text-1)]'
                          }`}
                        >
                          {session.title || 'Untitled Session'}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-[var(--aether-text-3)]">
                          <Clock size={9} />
                          {formatSessionTime(session.updated_at, timeFormat)}
                          {session.turn_count !== undefined ? (
                            <span>· {turnLabel(session.turn_count)}</span>
                          ) : null}
                          {active ? (
                            <span className="text-[var(--aether-accent-text)]">· Active</span>
                          ) : null}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteSessionId(session.id);
                        }}
                        title="Delete session"
                        aria-label={`Delete session ${session.title || 'Untitled Session'}`}
                        aria-expanded={deleteSessionId === session.id}
                        className={`absolute right-1.5 top-1.5 rounded-md p-1 transition hover:bg-[#ff99a4]/10 hover:text-[#ff99a4] focus-visible:opacity-100 ${
                          deleteSessionId === session.id
                            ? 'bg-[#ff99a4]/10 text-[#ff99a4] opacity-100'
                            : 'text-[var(--aether-text-3)] opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {deleteTarget ? (
            <div
              role="alertdialog"
              aria-label="Confirm session deletion"
              className="border-t border-[#ff99a4]/25 bg-[#ff99a4]/[0.07] px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[#ff99a4]/12 text-[#ffb3bb]">
                  <AlertTriangle size={11} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold text-[var(--aether-text-1)]">
                    Delete this session?
                  </p>
                  <p className="mt-0.5 truncate text-[9.5px] text-[var(--aether-text-3)]">
                    “{deleteTarget.title || 'Untitled Session'}” and its messages will be removed.
                  </p>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setDeleteSessionId(null)}
                  className="flex items-center gap-1 rounded-md border border-[var(--aether-line)] px-2 py-1 text-[9.5px] font-medium text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
                >
                  <X size={10} />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => remove(deleteTarget.id)}
                  className="flex items-center gap-1 rounded-md border border-[#ff99a4]/40 bg-[#ff99a4]/15 px-2 py-1 text-[9.5px] font-semibold text-[#ffb3bb] transition hover:bg-[#ff99a4]/25"
                >
                  <Trash2 size={10} />
                  Delete session
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-[var(--aether-line)] px-3 py-2 text-[9px] text-[var(--aether-text-3)]">
            <span className="truncate">
              {attachmentCount > 0
                ? `${attachmentCount} file${attachmentCount === 1 ? '' : 's'} attached`
                : 'No active files'}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  vectorReady ? 'bg-[#6ccb5f]' : 'bg-[#ff99a4]'
                }`}
              />
              <Database size={9} />
              Vector DB {vectorReady ? 'ready' : 'offline'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
};
