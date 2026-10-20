/**
 * Aether Notes Types
 * Shared shapes for the Markdown vault and the Notes tab API surface.
 */

export interface NoteMeta {
  id: string;
  title: string;
  theme: string;
  created: string;
  updated: string;
  pinned: boolean;
}

export interface Note extends NoteMeta {
  content: string;
  file_name?: string;
}

export interface NoteSaveInput {
  note_id?: string;
  title: string;
  content: string;
  theme?: string;
  pinned?: boolean;
}

/** Actions + state handed to the Notes tab and the Quick Chat attach menu. */
export interface NotesApi {
  items: NoteMeta[];
  current: Note | null;
  directory: string;
  defaultTheme: string;
  onList: () => void;
  onRead: (id: string) => void;
  onSave: (input: NoteSaveInput) => void;
  onDelete: (id: string) => void;
  onAttach: (id: string) => void;
}
