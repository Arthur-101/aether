---
id: clipboard
title: Clipboard
summary: Read the Windows clipboard, copy text, and handle images safely.
tags: [clipboard, copy, paste, windows]
related: [tools-and-approvals, privacy-and-local-first]
order: 80
---
# Clipboard

Aether uses the real Windows clipboard. The **Clipboard** tool group has two tools:

- `read_clipboard` — read what is currently on the clipboard.
- `write_clipboard` — replace the clipboard with text you explicitly ask Aether to copy.

Both are in Settings → **Tools** → **Clipboard**. The group is enabled by default.

## Reading

Ask “What’s on my clipboard?” or “Read my clipboard and summarize it.”

- Aether reads once per request. It does not repeat the same read to double-check, because that can exhaust the tool budget and produce a loop.
- If the clipboard contains an image rather than text, Aether reports that it is an image. It does not pretend the clipboard is empty and does not overwrite the image.
- Clipboard text is treated as untrusted data. Aether can report or summarize it, but it will not follow instructions found inside it.

## Writing

Ask “Copy this to my clipboard: …” or “Put the following text on my clipboard.”

- Writing **replaces** the current clipboard contents.
- Aether writes only when you explicitly ask it to copy specific text.
- It never writes its own reply, a placeholder, a retry message, or a guess to the clipboard.
- If a write fails, the tool reports the failure instead of claiming success.

## Privacy

The clipboard can contain passwords, tokens, personal messages, or other sensitive data. Read it only when you need it, and avoid repeating sensitive contents in unrelated replies. Clipboard reads stay on this machine; the text is sent to the model only as part of the turn that requested it.

If you ask Aether to “try again” after a clipboard read, it should not write anything to the clipboard. Ask a new, explicit question if you need a different result.
