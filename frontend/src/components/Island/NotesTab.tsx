import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Palette, Pin, Plus, StickyNote } from 'lucide-react';

import type { NoteMeta, NotesApi } from '../../types/notes';
import { NoteEditor } from './NoteEditor';
import { NotesSidebar } from './NotesSidebar';
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
  'note-action-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition disabled:cursor-default disabled:opacity-40';

export const NotesTab: React.FC<NotesTabProps> = ({ notes }) => {
  const apiRef = useRef(notes);
  apiRef.current = notes;

  const current = notes.current;
  const currentId = current?.id ?? '';
  const fallbackTheme = notes.defaultTheme || DEFAULT_NOTE_THEME;

  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState(fallbackTheme);
  const [themeOpen, setThemeOpen] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [awaitingContent, setAwaitingContent] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const draftRef = useRef<Draft>({
    id: '',
    title: '',
    content: '',
    theme: fallbackTheme,
    pinned: false,
  });
  const lastSavedRef = useRef('');
  const readSeqRef = useRef(0);
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

  // Load the list, then refresh the active note from disk. The cached body can
  // be stale after a tab switch because NOTE_SAVED only merges metadata.
  useEffect(() => {
    apiRef.current.onList();
    const note = apiRef.current.current;
    if (!note) return;
    readSeqRef.current = apiRef.current.contentSeq;
    setAwaitingContent(true);
    apiRef.current.onRead(note.id);
  }, []);

  useEffect(() => {
    if (currentId || notes.items.length === 0) return;
    apiRef.current.onRead(notes.items[0].id);
  }, [currentId, notes.items]);

  // Keep the editor draft in sync when the selected note (or its full body) changes.
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
  }, [currentId, notes.contentSeq]);

  // Wait for the fresh body before mounting TipTap, so it never initialises
  // from a stale cached body. Fall back after a short delay if the read is lost.
  useEffect(() => {
    if (!currentId) {
      setAwaitingContent(false);
      return;
    }
    if (awaitingContent && notes.contentSeq !== readSeqRef.current) {
      setAwaitingContent(false);
    }
  }, [awaitingContent, currentId, notes.contentSeq]);

  useEffect(() => {
    if (!awaitingContent) return;
    const timer = window.setTimeout(() => setAwaitingContent(false), 2500);
    return () => window.clearTimeout(timer);
  }, [awaitingContent]);

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

  // Close the theme picker on outside click or Escape.
  useEffect(() => {
    if (!themeOpen) return;
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.notes-menu-area')) return;
      setThemeOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setThemeOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [themeOpen]);

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
    setThemeOpen(false);
    apiRef.current.onSave({
      title: 'Untitled note',
      content: '',
      theme: apiRef.current.defaultTheme || DEFAULT_NOTE_THEME,
    });
  };

  const openNote = (id: string) => {
    if (id === draftRef.current.id) return;
    flush();
    setThemeOpen(false);
    apiRef.current.onRead(id);
  };

  const toggleNotePin = (note: NoteMeta) => {
    if (note.id === draftRef.current.id) {
      const draft = draftRef.current;
      draft.pinned = !draft.pinned;
      lastSavedRef.current = '';
      flush();
      return;
    }
    apiRef.current.onSetPinned(note.id, !note.pinned);
  };

  const attachNote = (note: NoteMeta) => {
    if (note.id === draftRef.current.id) flush();
    apiRef.current.onAttach(note.id);
  };

  const deleteNote = (note: NoteMeta) => {
    if (note.id === draftRef.current.id) {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      lastSavedRef.current = '';
      draftRef.current = { id: '', title: '', content: '', theme: fallbackTheme, pinned: false };
    }
    apiRef.current.onDelete(note.id);
  };

  const hasNotes = notes.items.length > 0;

  return (
    <div
      className="grid gap-3"
      style={{
        height: 430,
        gridTemplateColumns: sidebarCollapsed ? '44px minmax(0, 1fr)' : '248px minmax(0, 1fr)',
        transition: 'grid-template-columns 200ms ease',
      }}
    >
      <NotesSidebar
        notes={notes.items}
        activeId={currentId}
        directory={notes.directory}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onCreate={createNote}
        onSelect={openNote}
        onTogglePin={toggleNotePin}
        onAttach={attachNote}
        onDelete={deleteNote}
      />

      <section className="flex min-h-0 min-w-0 flex-col">
        {current ? (
          <div
            className="note-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border"
            data-note-theme={theme}
          >
            <div
              className="notes-menu-area relative flex shrink-0 items-start gap-2 border-b px-3.5 pb-2 pt-2.5"
              data-aether-escape-guard={themeOpen ? '' : undefined}
              style={{ borderColor: 'var(--note-border)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {current.pinned ? (
                    <Pin
                      size={9}
                      className="shrink-0"
                      style={{ color: 'var(--note-accent)' }}
                    />
                  ) : null}
                  <span
                    className="text-[8.5px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--note-muted)' }}
                  >
                    Note
                  </span>
                </div>
                <input
                  value={title}
                  onChange={(event) => handleTitle(event.target.value)}
                  placeholder="Note title"
                  spellCheck={false}
                  readOnly={awaitingContent}
                  className="note-title-input w-full bg-transparent pt-0.5 text-[15px] font-semibold outline-none"
                />
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <div className="relative">
                  <button
                    type="button"
                    title="Note theme"
                    onClick={() => setThemeOpen((open) => !open)}
                    className={ICON_BUTTON}
                  >
                    <Palette size={14} />
                  </button>
                  {themeOpen ? (
                    <div className="absolute right-0 top-9 z-30 max-h-[330px] w-52 overflow-y-auto rounded-xl border border-[var(--aether-line-strong)] bg-[var(--aether-surface-2)] p-1 shadow-2xl">
                      <p className="px-2 py-1 text-[9px] uppercase tracking-wider text-[var(--aether-text-3)]">
                        Note theme
                      </p>
                      {NOTE_THEMES.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => handleTheme(option.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10.5px] transition ${
                            option.id === theme
                              ? 'bg-[var(--aether-fill-3)] text-[var(--aether-text-1)]'
                              : 'text-[var(--aether-text-2)] hover:bg-[var(--aether-fill-2)]'
                          }`}
                        >
                          <span
                            className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/25"
                            style={{
                              background: option.swatch,
                              backgroundImage: option.pattern,
                              backgroundSize: option.patternSize,
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          {option.id === theme ? (
                            <Check
                              size={11}
                              className="ml-auto shrink-0 text-[var(--aether-accent-text)]"
                            />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {awaitingContent ? (
              <div
                className="flex flex-1 flex-col items-center justify-center gap-2"
                style={{ color: 'var(--note-muted)' }}
              >
                <Loader2 size={16} className="animate-spin" />
                <p className="text-[10px]">Opening note…</p>
              </div>
            ) : (
              <NoteEditor key={current.id} content={current.content} onChange={handleContent} />
            )}

            <div
              className="flex shrink-0 items-center justify-between gap-2 border-t px-3.5 py-2 text-[9px]"
              style={{ borderColor: 'var(--note-border)', color: 'var(--note-muted)' }}
            >
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
                ) : (
                  'Autosaves as you type'
                )}
              </span>
              <span>
                {notes.items.length} {notes.items.length === 1 ? 'note' : 'notes'} · Markdown
              </span>
            </div>
          </div>
        ) : (
          <div className="aether-panel flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--aether-line)] px-4 py-8 text-center">
            {hasNotes ? (
              <>
                <Loader2 size={18} className="animate-spin text-[var(--aether-text-3)]" />
                <p className="text-[10px] text-[var(--aether-text-3)]">Opening note…</p>
              </>
            ) : (
              <>
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--aether-accent)]/25 bg-[var(--aether-accent)]/10 text-[var(--aether-accent-text)]">
                  <StickyNote size={20} />
                </span>
                <div>
                  <p className="text-[12px] font-semibold text-[var(--aether-text-1)]">
                    No notes yet
                  </p>
                  <p className="mt-0.5 text-[10px] text-[var(--aether-text-3)]">
                    Notes are plain Markdown files in your vault.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={createNote}
                  className="accent-fill mt-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition"
                >
                  <Plus size={11} />
                  New note
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
