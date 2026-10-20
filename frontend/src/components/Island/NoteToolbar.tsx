import React from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';

interface NoteToolbarProps {
  editor: Editor;
  uploading: boolean;
  onPickImage: () => void;
}

const ToolButton: React.FC<{
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, active, disabled, onClick, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    data-active={active ? 'true' : undefined}
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className="note-tool-btn flex h-6 w-6 items-center justify-center rounded transition disabled:cursor-default disabled:opacity-35"
  >
    {children}
  </button>
);

const Divider: React.FC = () => (
  <span className="note-tool-divider mx-0.5 h-3.5 w-px" />
);

export const NoteToolbar: React.FC<NoteToolbarProps> = ({
  editor,
  uploading,
  onPickImage,
}) => {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      strike: current.isActive('strike'),
      code: current.isActive('code'),
      h1: current.isActive('heading', { level: 1 }),
      h2: current.isActive('heading', { level: 2 }),
      bullet: current.isActive('bulletList'),
      ordered: current.isActive('orderedList'),
      task: current.isActive('taskList'),
      codeBlock: current.isActive('codeBlock'),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  return (
    <div className="note-toolbar flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
      <ToolButton
        label="Bold"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={12} />
      </ToolButton>
      <ToolButton
        label="Italic"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={12} />
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={12} />
      </ToolButton>
      <ToolButton
        label="Inline code"
        active={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={12} />
      </ToolButton>
      <Divider />
      <ToolButton
        label="Heading 1"
        active={state.h1}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 size={12} />
      </ToolButton>
      <ToolButton
        label="Heading 2"
        active={state.h2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={12} />
      </ToolButton>
      <Divider />
      <ToolButton
        label="Bullet list"
        active={state.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={12} />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        active={state.ordered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={12} />
      </ToolButton>
      <ToolButton
        label="Checklist"
        active={state.task}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListChecks size={12} />
      </ToolButton>
      <ToolButton
        label="Code block"
        active={state.codeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 size={12} />
      </ToolButton>
      <Divider />
      <ToolButton label="Insert image" disabled={uploading} onClick={onPickImage}>
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
      </ToolButton>
      <span className="ml-auto flex items-center gap-0.5">
        <ToolButton
          label="Undo"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={12} />
        </ToolButton>
        <ToolButton
          label="Redo"
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={12} />
        </ToolButton>
      </span>
    </div>
  );
};
