---
id: documents-and-files
title: Documents and files
summary: Attach documents, use the radial wheel, and find, create, move, or organize files.
tags: [documents, files, pdf, images, attachments, conversion, compression, find, organize, filesystem]
related: [interface, chat-and-memory, notes, tools-and-approvals]
order: 130
---
# Documents and files

Aether works with files in two ways: attach them to chat for questions, or run a deterministic file action from the radial wheel or a chat request.

## Attach a document or image to chat

Use the paperclip in Quick Chat, drop a file on the overlay, choose **Ask AI** in the radial wheel, or attach a note from the Notes tab.

Supported attachments:

- PDF, TXT, MD, DOCX, PY, JS, JSON, CSV.
- PNG, JPG, JPEG, WEBP.

Small documents are inlined into the prompt. Larger documents are chunked and indexed for the session, and Aether retrieves relevant chunks when you ask about them. Images are sent as image input, so use a model that accepts images for visual questions.

Examples:

- “Summarize this PDF.”
- “What are the action items in this meeting note?”
- “Find the section about refunds in the attached contract.”
- “What does this screenshot show?”

Attachments stay with the session. Remove one from the composer or delete the session to drop its indexed content.

## The radial wheel

Hold **Shift** (or your configured modifier) while dragging a file. Move to a slice and release.

Image slices:

- **Convert** to WebP, PNG, JPG, PDF, HEIC, or AVIF.
- **Compress** to reduce file size.
- **Crop** opens an editor with a live image preview, draggable crop handles, and aspect-ratio presets.
- **Add Background** opens an editor with a live padding preview plus solid, two-color, and three-color backgrounds.
- **Strip Metadata** removes EXIF, GPS, and camera metadata.
- **Ask AI** attaches the image to chat when supported.

PDF slices:

- **Convert** to JPG, PNG, or TXT.
- **Compress** reduces size.
- **Strip Metadata** where the format supports it.

Video slices:

- **Convert** to MP3, GIF, or WebM.
- **Compress** reduces size.

Release in the center to cancel.

## Convert by asking

You can also ask in chat:

- “Convert this image to PNG.”
- “Compress this video to about 20 MB.”
- “Turn the first page of this PDF into a JPG.”
- “Remove the location metadata from this photo.”

The assistant calls the matching file tool. If the file path is missing or the format is unsupported, the tool returns an error and the assistant explains it.

## Find, create, move, and organize files

The **File System** tool group works only inside folders you allow. Desktop, Downloads, and Documents are included by default; add more under Settings → **Tools** → **File System roots**. A root grants its whole subtree, including folders created later. Your profile root, AppData, Windows, Program Files, ProgramData, and drive roots are always rejected, and a path outside the allowed roots is an error the assistant cannot approve away.

Available actions:

- **Find** files by name or pattern across the allowed roots.
- **Create a file** — new text, data, or source files only; never overwrites, and the parent folder must already exist.
- **Create a folder** — never overwrites an existing folder.
- **Move** or **rename** a file.
- **Organize** one folder by type into subfolders.

Examples:

- “Find the invoice PDF.”
- “Create `todo.md` on my Desktop.”
- “Move report.pdf into Archive.”
- “Rename draft.txt to final.txt.”
- “Sort my Downloads by type.”

Move, rename, and organize show the exact plan before anything happens. Approving runs that plan; if a file changed since the preview, it is skipped and reported. There is no delete action, folders are never moved, and an existing file is never overwritten. `organize_folder` only sorts the files directly inside the chosen folder and leaves existing subfolders alone; name collisions get a numbered name shown in the preview.

`create_file` accepts text, data, and common source files, capped at 64 KB, written as UTF-8 with normal line endings. Executable and script formats are refused, including `.bat`, `.cmd`, `.ps1`, `.vbs`, `.exe`, `.dll`, and `.msi`. Creating code such as `.py` or `.js` asks for approval because it can run later; creating a markdown or text file does not.

## Output folder

Converted files are saved according to Settings → **Storage & Files** → **Output folder**:

- **Same as source** — beside the original file.
- **Desktop** — your Windows Desktop.
- **Custom folder** — a folder you choose.

If the chosen folder is unavailable, Aether falls back to the source file’s folder. Converted filenames keep the original stem and use the new extension; existing files may be replaced, so check the result path in the tool message.

## Limits

- PDF conversion is PDF-to-other-formats, not arbitrary document-to-PDF.
- Image conversion depends on the installed image libraries and the target format’s codec.
- Very large videos can take a long time; the tool reports progress or an error rather than freezing the chat.
- Password-protected PDFs and damaged files may fail. Unlock or repair them first.
