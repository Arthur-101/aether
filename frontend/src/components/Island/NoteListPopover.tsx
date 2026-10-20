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
    <div className="absolute left-0 right-0 top-9 z-30 overflow-hidden rounded-lg border border-white/15 bg-[#232323]/98 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5">
        <Search size={12} className="shrink-0 text-[#8b8b8b]" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes"
          className="w-full bg-transparent text-[11px] text-white outline-none placeholder:text-[#7a7a7a]"
        />
      </div>
      <div className="max-h-[210px] overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-[10px] text-[#8b8b8b]">
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
                  ? 'bg-white/15 text-white'
                  : 'text-[#d7d7d7] hover:bg-white/10'
              }`}
            >
              <StickyNote
                size={12}
                className={note.id === activeId ? 'shrink-0 text-[#60cdff]' : 'shrink-0 text-[#8b8b8b]'}
              />
              <span className="min-w-0 flex-1 truncate text-[11px]">{note.title}</span>
              {note.pinned ? <Pin size={10} className="shrink-0 text-[#60cdff]" /> : null}
              <span className="shrink-0 text-[9px] text-[#8b8b8b]">
                {formatDate(note.updated)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
