import React, { useMemo, useState } from 'react';
import { Pin, Search, StickyNote } from 'lucide-react';
import type { NoteMeta } from '../../types/notes';

interface NoteListPopoverProps {
  notes: NoteMeta[];
  activeId: string;
  onSelect: (id: string) => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const NoteListPopover: React.FC<NoteListPopoverProps> = ({
  notes,
  activeId,
  onSelect,
}) => {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter((note) => note.title.toLowerCase().includes(needle));
  }, [notes, query]);

  return (
    <div className="absolute left-0 right-0 top-9 z-30 overflow-hidden rounded-lg border border-[var(--aether-line-strong)] bg-[var(--aether-surface-2)] shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-1.5 border-b border-[var(--aether-line)] px-2 py-1.5">
        <Search size={12} className="shrink-0 text-[var(--aether-text-3)]" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes"
          className="w-full bg-transparent text-[11px] text-[var(--aether-text-1)] outline-none placeholder:text-[var(--aether-text-3)]"
        />
      </div>
      <div className="max-h-[210px] overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-[10px] text-[var(--aether-text-3)]">
            {notes.length === 0 ? 'No notes yet' : 'No matches'}
          </p>
        ) : (
          filtered.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => onSelect(note.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                note.id === activeId
                  ? 'bg-[var(--aether-fill-3)] text-[var(--aether-text-1)]'
                  : 'text-[var(--aether-text-2)] hover:bg-[var(--aether-fill-2)]'
              }`}
            >
              <StickyNote
                size={12}
                className={note.id === activeId ? 'shrink-0 text-[var(--aether-accent-text)]' : 'shrink-0 text-[var(--aether-text-3)]'}
              />
              <span className="min-w-0 flex-1 truncate text-[11px]">{note.title}</span>
              {note.pinned ? <Pin size={10} className="shrink-0 text-[var(--aether-accent-text)]" /> : null}
              <span className="shrink-0 text-[9px] text-[var(--aether-text-3)]">
                {formatDate(note.updated)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
