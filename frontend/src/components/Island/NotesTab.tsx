import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Palette,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
} from 'lucide-react';

import type { NotesApi } from '../../types/notes';
import { NoteEditor } from './NoteEditor';
import { NoteListPopover } from './NoteListPopover';
import { DEFAULT_NOTE_THEME, NOTE_THEMES } from './noteThemes';

interface NotesTabProps {
  notes: NotesApi;
}

interface Draft {
  id: string;
  title: string;
  content: string;
  theme: string;
  pinned: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

const ICON_BUTTON =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-[#d7d7d7] transition hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-40';

export const NotesTab: React.FC<NotesTabProps> = ({ notes }) => {
  const apiRef = useRef(notes);
  apiRef.current = notes;

  const current = notes.current;
  const currentId = current?.id ?? '';
  const fallbackTheme = notes.defaultTheme || DEFAULT_NOTE_THEME;

  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState(fallbackTheme);
  const [listOpen, setListOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const draftRef = useRef<Draft>({
    id: '',
    title: '',
    content: '',
    theme: fallbackTheme,
    pinned: false,
  });
  const lastSavedRef = useRef('');
  const saveTimerRef = useRef<number | null>(null);
  const statusTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const flush = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const draft = draftRef.current;
    if (!draft.id) return;
    const payload = {
      note_id: draft.id,
      title: draft.title,
      content: draft.content,
      theme: draft.theme,
      pinned: draft.pinned,
    };
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) return;
    lastSavedRef.current = serialized;
    apiRef.current.onSave(payload);
    if (mountedRef.current) {
      setStatus('saving');
      if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
      statusTimerRef.current = window.setTimeout(() => setStatus('saved'), 550);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      flush();
    }, 700);
  }, [flush]);

  // Load the first note when the vault has notes but nothing is selected.
  useEffect(() => {
    apiRef.current.onList();
  }, []);

  useEffect(() => {
    if (currentId || notes.items.length === 0) return;
    apiRef.current.onRead(notes.items[0].id);
  }, [currentId, notes.items]);

  // Keep the editor draft in sync when the selected note changes.
  useEffect(() => {
    const note = apiRef.current.current;
    if (!note) {
      draftRef.current = {
        id: '',
        title: '',
        content: '',
        theme: apiRef.current.defaultTheme || DEFAULT_NOTE_THEME,
        pinned: false,
      };
      lastSavedRef.current = '';
      setTitle('');
      setTheme(apiRef.current.defaultTheme || DEFAULT_NOTE_THEME);
      setStatus('idle');
      return;
    }
    const noteTheme = note.theme || apiRef.current.defaultTheme || DEFAULT_NOTE_THEME;
    draftRef.current = {
      id: note.id,
      title: note.title,
      content: note.content,
      theme: noteTheme,
      pinned: note.pinned,
    };
    lastSavedRef.current = JSON.stringify({
      note_id: note.id,
      title: note.title,
      content: note.content,
      theme: noteTheme,
      pinned: note.pinned,
    });
    setTitle(note.title);
    setTheme(noteTheme);
    setStatus('idle');
    setDeleteArmed(false);
  }, [currentId]);

  // Persist on window blur and when the Notes tab unmounts.
  useEffect(() => {
    mountedRef.current = true;
    const handleBlur = () => flush();
    window.addEventListener('blur', handleBlur);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('blur', handleBlur);
      flush();
    };
  }, [flush]);

  // Close popovers on outside click or Escape.
  useEffect(() => {
    if (!listOpen && !menuOpen && !themeOpen) return;
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.notes-menu-area')) return;
      setListOpen(false);
      setMenuOpen(false);
      setThemeOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setListOpen(false);
      setMenuOpen(false);
      setThemeOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [listOpen, menuOpen, themeOpen]);

  const handleTitle = (value: string) => {
    setTitle(value);
    draftRef.current.title = value;
    scheduleSave();
  };

  const handleContent = useCallback(
    (markdown: string) => {
      draftRef.current.content = markdown;
      scheduleSave();
    },
    [scheduleSave]
  );

  const handleTheme = (nextTheme: string) => {
    setTheme(nextTheme);
    draftRef.current.theme = nextTheme;
    setThemeOpen(false);
    flush();
  };

  const createNote = () => {
    flush();
    setListOpen(false);
    setMenuOpen(false);
    setThemeOpen(false);
    apiRef.current.onSave({
      title: 'Untitled note',
      content: '',
      theme: apiRef.current.defaultTheme || DEFAULT_NOTE_THEME,
    });
  };

  const openNote = (id: string) => {
    setListOpen(false);
    if (id === draftRef.current.id) return;
    flush();
    apiRef.current.onRead(id);
  };

  const togglePin = () => {
    const draft = draftRef.current;
    if (!draft.id) return;
    draft.pinned = !draft.pinned;
    lastSavedRef.current = '';
    flush();
    setMenuOpen(false);
  };

  const attachCurrent = () => {
    const id = draftRef.current.id;
    if (!id) return;
    flush();
    apiRef.current.onAttach(id);
    setMenuOpen(false);
  };

  const deleteCurrent = () => {
    const id = draftRef.current.id;
    if (!id) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      window.setTimeout(() => setDeleteArmed(false), 3000);
      return;
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    lastSavedRef.current = '';
    draftRef.current = { id: '', title: '', content: '', theme: fallbackTheme, pinned: false };
    apiRef.current.onDelete(id);
    setDeleteArmed(false);
    setMenuOpen(false);
  };

  const hasNotes = notes.items.length > 0;

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="notes-menu-area relative flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setMenuOpen(false);
            setThemeOpen(false);
            setListOpen((open) => !open);
          }}
          disabled={!current && !hasNotes}
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-[#f3f3f3] transition hover:bg-white/10 disabled:cursor-default disabled:opacity-50"
        >
          <StickyNote size={12} className="shrink-0 text-[#8b8b8b]" />
          <span className="truncate">{current ? title || 'Untitled note' : 'Notes'}</span>
          <ChevronDown size={12} className="ml-auto shrink-0 text-[#8b8b8b]" />
        </button>
        <button type="button" onClick={createNote} title="New note" className={ICON_BUTTON}>
          <Plus size={14} />
        </button>
        <button
          type="button"
          title="Note theme"
          disabled={!current}
          onClick={() => {
            setListOpen(false);
            setMenuOpen(false);
            setThemeOpen((open) => !open);
          }}
          className={ICON_BUTTON}
        >
          <Palette size={14} />
        </button>
        <div className="relative">
          <button
            type="button"
            title="Note actions"
            disabled={!current}
            onClick={() => {
              setListOpen(false);
              setThemeOpen(false);
              setDeleteArmed(false);
              setMenuOpen((open) => !open);
            }}
            className={ICON_BUTTON}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && current ? (
            <div className="absolute right-0 top-9 z-30 w-44 rounded-lg border border-white/15 bg-[#232323]/98 p-1 shadow-2xl backdrop-blur-xl">
              <button
                type="button"
                onClick={togglePin}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-[#d7d7d7] transition hover:bg-white/10 hover:text-white"
              >
                {draftRef.current.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                {draftRef.current.pinned ? 'Unpin note' : 'Pin note'}
              </button>
              <button
                type="button"
                onClick={attachCurrent}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-[#d7d7d7] transition hover:bg-white/10 hover:text-white"
              >
                <MessageSquarePlus size={12} />
                Attach to chat
              </button>
              <div className="my-1 h-px bg-white/10" />
              <button
                type="button"
                onClick={deleteCurrent}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-[#ff99a4] transition hover:bg-[#ff99a4]/10"
              >
                <Trash2 size={12} />
                {deleteArmed ? 'Click again to delete' : 'Delete note'}
              </button>
            </div>
          ) : null}
        </div>
        {listOpen ? (
          <NoteListPopover
            notes={notes.items}
            activeId={draftRef.current.id}
            onSelect={openNote}
          />
        ) : null}
        {themeOpen && current ? (
          <div className="absolute right-0 top-9 z-30 w-44 rounded-lg border border-white/15 bg-[#232323]/98 p-1 shadow-2xl backdrop-blur-xl">
            <p className="px-2 py-1 text-[9px] uppercase tracking-wider text-[#8b8b8b]">
              Note theme
            </p>
            {NOTE_THEMES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleTheme(option.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition ${
                  option.id === theme
                    ? 'bg-white/15 text-white'
                    : 'text-[#d7d7d7] hover:bg-white/10'
                }`}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-black/25"
                  style={{ backgroundColor: option.swatch }}
                />
                <span className="truncate">{option.label}</span>
                {option.id === theme ? (
                  <Check size={11} className="ml-auto shrink-0 text-[#60cdff]" />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {current ? (
        <div
          className="note-surface overflow-hidden rounded-lg border"
          data-note-theme={theme}
        >
          <input
            value={title}
            onChange={(event) => handleTitle(event.target.value)}
            placeholder="Note title"
            spellCheck={false}
            className="note-title-input w-full bg-transparent px-3 pt-2.5 pb-1 text-[13px] font-semibold outline-none"
          />
          <NoteEditor
            key={current.id}
            content={current.content}
            onChange={handleContent}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
          {hasNotes ? (
            <>
              <Loader2 size={16} className="animate-spin text-[#8b8b8b]" />
              <p className="text-[10px] text-[#8b8b8b]">Opening note…</p>
            </>
          ) : (
            <>
              <StickyNote size={20} className="text-[#6f6f6f]" />
              <p className="text-[11px] text-[#c7c7c7]">No notes yet</p>
              <p className="text-[10px] text-[#8b8b8b]">
                Notes are plain Markdown files in your vault.
              </p>
              <button
                type="button"
                onClick={createNote}
                className="mt-1 flex items-center gap-1.5 rounded-md bg-[#0067C0] px-2.5 py-1 text-[10px] font-medium text-white transition hover:bg-[#0078D4]"
              >
                <Plus size={11} />
                New note
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-between px-0.5 text-[9px] text-[#8b8b8b]">
        <span className="flex items-center gap-1">
          {status === 'saving' ? (
            <>
              <Loader2 size={9} className="animate-spin" />
              Saving…
            </>
          ) : status === 'saved' ? (
            <>
              <Check size={9} />
              Saved
            </>
          ) : null}
        </span>
        <span>
          {notes.items.length} {notes.items.length === 1 ? 'note' : 'notes'}
        </span>
      </div>
    </div>
  );
};
