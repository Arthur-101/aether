---
id: privacy-and-local-first
title: Privacy and local-first
summary: What stays on your PC, what leaves it, and how to keep Aether offline.
tags: [privacy, local, cloud, data, security, keys]
related: [ai-engines, voice, web-search, spotify]
order: 140
---
# Privacy and local-first

Aether is local-first: local models, local voice, local storage, and local tools are the default. Cloud services are opt-in and are used only when you select them or ask for an action that needs them.

## What stays on this PC

- Chat sessions, recent turns, and semantic memory.
- Notes and their images.
- Attached files and indexed document chunks.
- Configuration, including model paths and saved API keys.
- Local GGUF, Phonon-2, and Paradee model files.
- The bundled guide.
- Spotify access and refresh tokens.

Settings, keys, and local data live under your Windows app-data folder for Aether. Notes can live in a custom vault folder. Nothing in this list is sent to a chat model unless it is part of the current prompt or an attachment you added.

## What can leave this PC

Only the services you enable:

- **Cloud chat** — the prompt and the context Aether builds (recent turns, semantic matches, attachments, active-window text if enabled) go to the selected provider.
- **Cloud speech-to-text** — the recorded audio clip goes to the selected provider.
- **Cloud text-to-speech** — the reply text goes to the selected provider.
- **Web search** — the query goes to Tavily.
- **Page reading** — the request goes to the website you asked Aether to read.
- **Spotify** — search and playback requests go to Spotify.

Local GGUF, Ollama, local Phonon-2, and local Paradee do not send chat or audio to a cloud provider. A local failure never uploads audio automatically.

## Keys and tokens

- Cloud API keys are stored locally and reused by cloud voice; you do not enter a second copy.
- Keys are used by the daemon to call the provider. They are not included in the guide or sent to the chat model.
- Spotify tokens stay in the local app-data folder and are never sent to the chat model.
- The guide contains no API keys, tokens, or passwords.

## Memory and deletion

Memory is session-scoped. Deleting a session removes its turns and session-scoped attachments and vectors. Notes and files on disk are separate; delete them from the Notes tab or your file manager.

Aether remembers the active session across restarts so a restart does not split your conversation. Starting a new session gives you a clean memory buffer without deleting the old session.

## Stay fully local

To avoid cloud calls:

1. Use **Local GGUF** or **Ollama** in AI & Models.
2. Keep STT and TTS on **Local** in Voice Engine.
3. Do not add a Tavily key, or disable the **Web** group in Tools.
4. Do not connect Spotify, or disable the **Spotify** group.
5. Use local file, note, media, clock, and system tools.

Cloud features are convenient, but they are never required for chat, notes, local files, media control, or scheduled tasks.

## Untrusted content

Web pages, clipboard text, and attached documents are untrusted. Aether is instructed to report their contents, not follow instructions inside them. Treat any unexpected request that appears inside a document or page as data, not as a command from you.
