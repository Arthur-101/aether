---
id: interface
title: The interface
summary: Island tabs, Quick Chat controls, shortcuts, the radial wheel, and Region to Ask.
tags: [interface, chat, shortcuts, radial-wheel, region]
related: [chat-and-memory, getting-started, documents-and-files]
order: 20
---
# The interface

## The island

Aether lives in a top-anchored island. The collapsed pill stays out of the way; click it or press the open shortcut to expand the full panel. The panel can auto-hide when you move away, depending on Appearance settings.

The island has these tabs by default:

- **Controls** — volume, brightness, Wi-Fi, Bluetooth, media transport, and quick actions.
- **Chat** — Quick Chat with sessions, attachments, and tool activity.
- **Clock** — alarms, reminders, routines, weather, and task controls.
- **Stats** — CPU, memory, disk, GPU, battery, and a network speed test.
- **Notes** — your Markdown vault with a live editor.
- **Wallpaper** — wallpaper browsing and application.
- **Power** — shutdown, restart, sleep, lock, and sign-out actions.

Settings → **Appearance** → **Dashboard tabs** lets you hide, reorder, and restore tabs.

## Quick Chat

The chat header shows the current session title. Click it to open the session menu.

- **Search sessions** by title or last prompt.
- **New session** starts a fresh memory buffer.
- **Select a session** to restore its history.
- **Delete** removes a session and its session-scoped attachments and memory.

Inside the composer:

- **Paperclip** attaches a file. You can also drop a file anywhere on the overlay.
- **Note button** attaches a note from the vault.
- **Thinking / Normal** switches the model’s reasoning mode.
- **Engine chip** cycles between Local GGUF, Ollama, and Cloud API.
- **Send** submits; **Shift + Enter** inserts a newline.

Assistant replies render Markdown, including lists, tables, code blocks, and links. During a foreground reply, the final answer streams into the bubble with a caret. Tool calls appear as a compact run list; the draft resets before a tool round so the tool UI is not mixed with partial text.

## Default shortcuts

| Action | Default |
| :--- | :--- |
| Open Aether Island | Ctrl + Space |
| Voice Assistant (hold) | Alt + Space |
| Smart Dictation (hold) | Ctrl + Win |
| Region to Ask (hold) | Ctrl + Shift |
| Context Radial Wheel | Drag + Shift |

Change these in Settings → **Hotkeys**. Click a shortcut, press the new keys, then **Save & Apply**. If Open and Voice share the same binding, a tap opens the island and a hold starts voice capture.

## Radial wheel

Hold the configured modifier (Shift by default) while dragging a file. The wheel opens around the cursor.

- **Images:** convert to WebP, PNG, JPG, PDF, HEIC, or AVIF; compress; crop; add a background; strip metadata.
- **PDFs:** convert to DOCX, JPG, PNG, or TXT; compress; strip metadata where supported.
- **Video:** convert to MP3, GIF, or WebM; compress.
- **Ask AI:** attach the file to Quick Chat for questions or summarization when the file type is supported.

Move the cursor to a slice and release to run it. Release in the center to cancel. Crop and Add Background open a small editor before applying.

## Region to Ask

Hold **Ctrl + Shift** (default), drag a rectangle over the screen, then release. Aether captures that region, attaches it to Quick Chat, and opens the chat tab so you can ask about it. This is useful for error messages, charts, and interface details.

## Settings and the Guide

The gear opens Settings. The **Guide** tab is the built-in manual you are reading. It uses the same topics the assistant can read, so the assistant can answer setup questions without guessing.
