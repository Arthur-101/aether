import React, { useEffect, useMemo, useState } from 'react';
import {
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Plus,
  Search,
  StickyNote,
  Trash2,
} from 'lucide-react';
import type { NoteMeta } from '../../types/notes';
import type { TimeFormat } from '../../types/ipc';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { formatClockTime } from './timeFormat';

interface NotesSidebarProps {
  notes: NoteMeta[];
  activeId: string;
  directory: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onTogglePin: (note: NoteMeta) => void;
  onAttach: (note: NoteMeta) => void;
  onDelete: (note: NoteMeta) => void;
}

function formatNoteDate(value: string, timeFormat: TimeFormat): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return formatClockTime(date, timeFormat, false);
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const MENU_ITEM =
  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10.5px] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';

export const NotesSidebar: React.FC<NotesSidebarProps> = ({
  notes,
  activeId,
  directory,
  collapsed,
  onToggleCollapsed,
  onCreate,
  onSelect,
  onTogglePin,
  onAttach,
  onDelete,
}) => {
  const timeFormat = useTimeFormat();
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter((note) => note.title.toLowerCase().includes(needle));
  }, [notes, query]);
  const pinned = notes.filter((note) => note.pinned).length;

  const closeMenu = () => {
    setMenuId(null);
    setDeleteArmedId(null);
  };

  useEffect(() => {
    if (!menuId) return;
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-note-menu]')) return;
      setMenuId(null);
      setDeleteArmedId(null);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuId(null);
      setDeleteArmedId(null);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuId]);

  if (collapsed) {
    return (
      <aside className="aether-panel flex min-h-0 min-w-0 flex-col items-center gap-2 overflow-hidden rounded-2xl border border-[var(--aether-line-soft)] py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="Expand notes list"
          aria-label="Expand notes list"
          aria-expanded="false"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--aether-line)] text-[var(--aether-text-2)] transition hover:border-[var(--aether-line-strong)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
        >
          <PanelLeftOpen size={13} />
        </button>
        <button
          type="button"
          onClick={onCreate}
          title="New note"
          aria-label="New note"
          className="accent-fill flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition hover:brightness-105"
        >
          <Plus size={13} />
        </button>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-[var(--aether-text-3)]">
          <StickyNote size={14} />
          <span
            className="text-[8.5px] font-semibold uppercase tracking-[0.2em]"
            style={{ writingMode: 'vertical-rl' }}
          >
            Notes
          </span>
          <span className="rounded-full bg-[var(--aether-fill)] px-1.5 py-0.5 text-[8.5px] font-medium text-[var(--aether-text-2)]">
            {notes.length}
          </span>
        </div>
        {pinned > 0 ? (
          <Pin size={11} className="shrink-0 text-[var(--aether-accent-text)]" />
        ) : null}
      </aside>
    );
  }

  return (
    <aside className="aether-panel flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--aether-line-soft)]">
      <header className="flex shrink-0 items-start justify-between gap-2 px-3.5 pb-2.5 pt-3.5">
        <div className="min-w-0">
          <h2 className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--aether-text-3)]">
            Notes
          </h2>
          <p className="mt-0.5 text-[10px] text-[var(--aether-text-2)]">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            {pinned > 0 ? ` · ${pinned} pinned` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleCollapsed}
            title="Collapse notes list"
            aria-label="Collapse notes list"
            aria-expanded="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--aether-line)] text-[var(--aether-text-2)] transition hover:border-[var(--aether-line-strong)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
          >
            <PanelLeftClose size={13} />
          </button>
          <button
            type="button"
            onClick={onCreate}
            title="New note"
            aria-label="New note"
            className="accent-fill flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition hover:brightness-105"
          >
            <Plus size={14} />
          </button>
        </div>
      </header>

      <div className="mx-3 mb-2 flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-1.5">
        <Search size={11} className="shrink-0 text-[var(--aether-text-3)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes"
          className="min-w-0 flex-1 bg-transparent text-[10.5px] text-[var(--aether-text-1)] outline-none placeholder:text-[var(--aether-text-3)]"
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

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-6 text-center">
            <StickyNote size={18} className="text-[var(--aether-text-3)]" />
            <p className="text-[10px] text-[var(--aether-text-3)]">
              {notes.length === 0 ? 'No notes yet' : 'No notes match that search'}
            </p>
            {notes.length === 0 ? (
              <button
                type="button"
                onClick={onCreate}
                className="accent-fill mt-0.5 flex items-center gap-1 rounded-lg px-2 py-1 text-[9.5px] font-medium transition"
              >
                <Plus size={10} />
                New note
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map((note) => {
              const active = note.id === activeId;
              const menuOpen = menuId === note.id;
              return (
                <div
                  key={note.id}
                  data-note-menu
                  data-aether-escape-guard={menuOpen ? '' : undefined}
                  className={`group relative flex w-full items-start gap-1 rounded-lg border px-1.5 py-1.5 transition ${
                    active
                      ? 'border-[var(--aether-accent)]/35 bg-[var(--aether-accent)]/10'
                      : 'border-transparent hover:border-[var(--aether-line)] hover:bg-[var(--aether-fill)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      onSelect(note.id);
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-0.5 py-0.5 text-left"
                  >
                    <span
                      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${
                        active
                          ? 'bg-[var(--aether-accent)]/18 text-[var(--aether-accent-text)]'
                          : 'bg-[var(--aether-fill)] text-[var(--aether-text-3)]'
                      }`}
                    >
                      <StickyNote size={11} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span
                          className={`min-w-0 flex-1 truncate text-[10.5px] ${
                            active
                              ? 'font-semibold text-[var(--aether-text-1)]'
                              : 'font-medium text-[var(--aether-text-1)]'
                          }`}
                        >
                          {note.title || 'Untitled note'}
                        </span>
                        {note.pinned ? (
                          <Pin
                            size={9}
                            className="shrink-0 text-[var(--aether-accent-text)]"
                          />
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[8.5px] text-[var(--aether-text-3)]">
                        <span>{formatNoteDate(note.updated, timeFormat)}</span>
                        {active ? (
                          <span className="text-[var(--aether-accent-text)]">· Open</span>
                        ) : null}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (menuOpen) {
                        closeMenu();
                        return;
                      }
                      setDeleteArmedId(null);
                      setMenuId(note.id);
                    }}
                    title="Note options"
                    aria-label={`Note options for ${note.title || 'Untitled note'}`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition ${
                      menuOpen
                        ? 'bg-[var(--aether-fill-2)] text-[var(--aether-text-1)]'
                        : 'text-[var(--aether-text-3)] hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]'
                    }`}
                  >
                    <MoreHorizontal size={13} />
                  </button>

                  {menuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-1 top-9 z-30 w-44 rounded-xl border border-[var(--aether-line-strong)] bg-[var(--aether-surface-2)] p-1 shadow-2xl"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onTogglePin(note);
                          closeMenu();
                        }}
                        className={MENU_ITEM}
                      >
                        {note.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                        {note.pinned ? 'Unpin note' : 'Pin note'}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onAttach(note);
                          closeMenu();
                        }}
                        className={MENU_ITEM}
                      >
                        <MessageSquarePlus size={12} />
                        Attach to chat
                      </button>
                      <div className="my-1 h-px bg-[var(--aether-fill-2)]" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          if (deleteArmedId === note.id) {
                            onDelete(note);
                            closeMenu();
                            return;
                          }
                          setDeleteArmedId(note.id);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10.5px] text-[#ff99a4] transition hover:bg-[#ff99a4]/10"
                      >
                        <Trash2 size={12} />
                        {deleteArmedId === note.id ? 'Click again to delete' : 'Delete note'}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer
        title={directory || 'Markdown vault'}
        className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--aether-line-soft)] px-3 py-2 text-[8.5px] text-[var(--aether-text-3)]"
      >
        <span className="truncate">{directory ? 'Markdown vault' : 'Local vault'}</span>
        <span className="shrink-0">Pinned first</span>
      </footer>
    </aside>
  );
};
