---
id: documents-and-files
title: Documents and files
summary: Attach documents, use the radial wheel, and convert or compress files.
tags: [documents, files, pdf, images, attachments, conversion, compression]
related: [interface, chat-and-memory, notes]
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
- **Crop** opens a crop editor.
- **Add Background** opens a padding, corner, shadow, and color editor.
- **Strip Metadata** removes EXIF, GPS, and camera metadata.
- **Ask AI** attaches the image to chat when supported.

PDF slices:

- **Convert** to DOCX, JPG, PNG, or TXT.
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
