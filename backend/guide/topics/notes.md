---
id: notes
title: Notes
summary: The Markdown vault, editor, pinning, search, attachments, and note tools.
tags: [notes, markdown, vault, editor, attach]
related: [chat-and-memory, tools-and-approvals, documents-and-files]
order: 70
---
# Notes

Aether includes a plain-Markdown notes vault. Notes are ordinary files, so you can open, back up, or edit them with any Markdown editor.

## The Notes tab

Open the island’s **Notes** tab. The left sidebar lists notes; the right side is a live editor.

- **New note** creates an untitled note.
- **Search** filters notes by title and body.
- **Pin** keeps important notes at the top.
- **Attach** adds the note to the current chat session so you can ask about it.
- **Delete** removes the note file. Deletion is immediate in the Notes tab.
- **Theme** changes the note’s visual theme.
- **Images** can be pasted or dropped into the editor. They are stored in an `assets` folder beside the vault and referenced from the Markdown.

Notes save automatically as you type. The vault folder is shown in Settings → **Storage & Files** → **Notes vault**; **Open notes folder** opens it in Explorer.

## Custom vault location

By default, notes live in the Aether app-data folder. Choose a custom folder in Settings → Storage & Files. The setting accepts a normal Windows path; blank restores the default. Changing the folder does not move existing notes.

## Note tools

When the **Notes** group is enabled, the assistant can:

- `list_notes` — list note titles.
- `search_notes` — search titles and bodies.
- `read_note` — read a note by id or title.
- `create_note` — create a new note.
- `append_to_note` — add text to an existing note.
- `set_note_pinned` — pin or unpin a note.
- `update_note` — replace a note body (asks for approval).
- `delete_note` — delete a note (asks for approval).

Examples:

- “Create a note called Grocery list with milk, eggs, and coffee.”
- “Append ‘call the dentist’ to my Errands note.”
- “Search my notes for the Wi-Fi password.”
- “Read my Meeting notes and summarize the action items.”

The assistant can also read this guide through the same Notes group, so setup questions do not depend on web access.

## Formatting

The editor supports headings, bold and italic text, lists, task lists, links, code, quotes, and images. Because notes are Markdown, formatting stays readable outside Aether.

## Backups

Copy the vault folder to back up every note and image. If you use a custom vault inside OneDrive or another synced folder, Aether edits the files in place; conflicts are handled by the sync service, not by Aether.
