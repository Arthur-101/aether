---
id: chat-and-memory
title: Chat and memory
summary: Sessions, attachments, streaming replies, and how Aether remembers context.
tags: [chat, memory, sessions, attachments, streaming]
related: [ai-engines, interface, documents-and-files, privacy-and-local-first]
order: 50
---
# Chat and memory

## Sessions

Every conversation belongs to a session. Sessions keep their own recent turns, semantic memory, and attachments.

- Click the session title in Quick Chat to search, switch, create, or delete sessions.
- **New session** starts with an empty memory buffer.
- Switching back to a session restores its history and context.
- Aether remembers the active session across daemon restarts, so a restart does not silently split your conversation into a new session.
- In Settings → **Storage & Files**, **Auto-save timeout** controls when an inactive session rolls over to a new memory buffer.

Deleting a session removes its turns and session-scoped attachments and vectors. Notes and files on disk are not deleted.

## Memory

Aether does not send the full chat history to the model. It builds a bounded context from two sources:

- **Recent prompt turns** — the last few user/assistant exchanges.
- **Semantic matches** — older turns in the same session that are similar to the current question.

Defaults:

- Local GGUF and Ollama: **2 recent turns + 3 semantic matches**.
- Cloud: **8 recent turns + 8 semantic matches**.

Change these under Settings → AI & Models → **Memory depth**, and use **Reset** to restore the current backend’s defaults. Counts are typed and clamped to safe ranges.

Memory is session-scoped. Aether does not merge one session’s memories into another. If you want a clean answer with no old context, start a new session.

Bad turns are skipped: empty replies, canned fallback messages, reasoning-only replies, and turns where every tool call failed are not written into memory.

## Attachments

Attach a file with the paperclip, by dropping it on the overlay, by choosing **Ask AI** in the radial wheel, or by attaching a note from the Notes tab.

Supported chat attachments:

- Documents: PDF, TXT, MD, DOCX, PY, JS, JSON, CSV.
- Images: PNG, JPG, JPEG, WEBP.

How a document is handled depends on size:

- Small documents (about 1,500 tokens or less) are inlined into the prompt.
- Larger documents are split into chunks and indexed for this session. Aether retrieves the relevant chunks when you ask about the file.
- Images are sent to the model as image input. Use a vision-capable model for image questions.

Attachments belong to the session. Removing an attachment or deleting the session removes its indexed chunks. Chat history shows attachment labels rather than dumping the file contents into every bubble.

## Replies and streaming

- Foreground Quick Chat replies stream the final answer token by token. The draft bubble becomes the answer as it arrives.
- Tool rounds show tool progress instead of partial prose. If the model decides to call a tool, the draft resets before the tool run.
- Background and scheduled turns do not stream into the chat; their result is saved to the session and appears in history.
- Assistant replies render Markdown. Errors are plain text and do not pretend a tool succeeded.

## Practical tips

- Ask one clear request at a time for tool-heavy work.
- If a local model gives short or truncated answers, lower memory depth or raise its context length.
- If an answer uses the wrong file, check which attachments are still in the session.
- If a tool is missing, confirm its group is enabled in Settings → Tools.
