---
id: architecture
title: How Aether works
summary: A high-level view of the overlay, daemon, model flow, tools, voice, and guide.
tags: [architecture, overview, flow, design]
related: [getting-started, ai-engines, tools-and-approvals, privacy-and-local-first]
order: 160
---
# How Aether works

This page is a high-level map for users. It avoids implementation details so it stays useful across updates.

## Three layers

1. **Desktop overlay** — the island, Quick Chat, Notes, Clock, Settings, the radial wheel, and Region to Ask. It is the interface you see and control.
2. **Local daemon** — the part that runs on your PC. It stores sessions and notes, builds model context, runs tools, manages voice, and fires scheduled tasks.
3. **Optional providers** — a cloud chat model, cloud speech, Tavily, or Spotify. They are used only when selected or requested.

The overlay and daemon talk over a local connection on your machine. The daemon can keep working when the island is collapsed.

## A chat turn

1. You type or speak a request.
2. The daemon adds the system instructions, current time, relevant session memory, attachments, and any active-window context.
3. The selected engine produces a reply or asks to call a tool.
4. If a tool is needed, the daemon runs it, returns the result to the model, and repeats within a bounded number of rounds.
5. Guarded actions pause for approval before running.
6. The final answer is saved to the session and shown in chat. If voice output is on, it is spoken.
7. Foreground Quick Chat replies stream the final answer as it is generated; tool rounds show progress instead of partial prose.

## Memory

Memory is session-scoped. Each turn stores the user prompt and assistant reply, and the daemon retrieves a bounded mix of recent turns and semantically similar older turns. The depth is user-configurable per backend category. The active session is persisted, so restarting the daemon does not silently start a new conversation.

## Tools

Tools are deterministic functions grouped by area: notes, clipboard, media, system, Spotify, web, clock, documents, and files. The enabled loadout decides which tool schemas the model sees; the daemon also rejects calls to disabled tools. This keeps small models focused and prevents a stale tool name from bypassing Settings.

## Voice

Voice is a pipeline: microphone → speech-to-text → assistant → tools/model → text-to-speech → speakers. STT and TTS providers are independent. Local models are the default; cloud providers are opt-in and reuse the chat provider keys. Cloud failures can fall back to installed local models; local failures never upload audio automatically.

## Scheduling

The daemon owns alarms and scheduled tasks. When a task is due, it runs a background turn with the same memory, attachment, and tool behavior as a foreground turn. Background turns do not stream into the open chat.

## The guide

The guide is a set of Markdown files bundled with Aether: one index and one file per topic. The assistant reads the index first, then requests a single topic by id. Settings → **Guide** renders the same files. This keeps the built-in manual and the assistant’s answers in sync, and it avoids loading the entire manual into every prompt.

## Local-first boundaries

Local chat, local voice, notes, files, media, system controls, and scheduling work without a cloud account. Cloud chat, cloud voice, web search, and Spotify are explicit additions. See [Privacy and local-first](privacy-and-local-first.md) for the exact data flow.
