import React, { useCallback, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Loader2 } from 'lucide-react';

import { noteAssetUrl, uploadNoteImage } from '../../lib/notesApi';
import { NoteToolbar } from './NoteToolbar';
import './notes.css';

/**
 * Images are stored as vault-relative paths (`assets/…`) inside the Markdown,
 * but rendered through the local FastAPI asset route.
 */
const NoteImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const raw = typeof HTMLAttributes.src === 'string' ? HTMLAttributes.src : '';
    const resolved =
      raw && !/^(https?:|data:|blob:)/i.test(raw) ? noteAssetUrl(raw) : raw;
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { src: resolved }),
    ];
  },
}).configure({ inline: false, allowBase64: false });

interface NoteEditorProps {
  content: string;
  onChange: (markdown: string) => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ content, onChange }) => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const insertImages = useCallback(async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;
    setUploading(true);
    try {
      for (const file of images) {
        const path = await uploadNoteImage(file);
        editorRef.current
          ?.chain()
          .focus()
          .setImage({ src: path, alt: file.name })
          .run();
      }
    } catch (err) {
      console.error('Note image upload failed:', err);
    } finally {
      setUploading(false);
    }
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      NoteImage,
      Placeholder.configure({ placeholder: 'Write something…' }),
      Markdown,
    ],
    content,
    contentType: 'markdown',
    editorProps: {
      attributes: { class: 'note-prose' },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.some((file) => file.type.startsWith('image/'))) return false;
        event.preventDefault();
        void insertImages(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.some((file) => file.type.startsWith('image/'))) return false;
        event.preventDefault();
        void insertImages(files);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(current.getMarkdown());
    },
  });

  editorRef.current = editor;

  return (
    <div className="note-editor">
      {editor ? (
        <NoteToolbar
          editor={editor}
          uploading={uploading}
          onPickImage={() => fileInputRef.current?.click()}
        />
      ) : null}
      <div className="note-body-scroll">
        <EditorContent editor={editor} />
        {uploading ? (
          <div className="note-upload-hint">
            <Loader2 size={11} className="animate-spin" />
            Adding image…
          </div>
        ) : null}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) void insertImages(files);
        }}
      />
    </div>
  );
};
