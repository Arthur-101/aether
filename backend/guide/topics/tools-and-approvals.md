---
id: tools-and-approvals
title: Tools and approvals
summary: Tool groups, the Lean loadout, per-tool switches, and which actions ask first.
tags: [tools, approvals, loadout, permissions, safety]
related: [system-controls, notes, clipboard, spotify, clock-and-tasks]
order: 60
---
# Tools and approvals

Aether’s tools are deterministic actions: the model chooses a tool, and the local daemon runs it. Tools are grouped so you can control what the model can see and call.

Open Settings → **Tools**.

## Tool groups

Every group starts enabled:

- **Notes** — create, read, search, pin, edit, delete notes, and read this guide.
- **Clipboard** — read the Windows clipboard and write text to it.
- **Media** — play, pause, skip, and inspect the active media session.
- **System** — system stats, volume, mute, brightness, Wi-Fi, and Bluetooth.
- **Spotify** — search, queue, and control Spotify playback.
- **Web** — Tavily web search and direct page reading.
- **Clock & Tasks** — timers, alarms, reminders, and recurring routines.
- **Documents** — PDF conversion and questions about attached documents.
- **Image & File Tools** — convert, compress, crop, and strip metadata from files.

Turning a group off removes its tool schemas from the model request and rejects direct calls to those tools. Expand a group to disable individual tools without losing the rest. **Reset** re-enables every individually disabled tool.

## Lean loadout

**Lean loadout** keeps only Notes, Media, Web, and Clock & Tasks. It is useful for small local models because every enabled tool schema is sent on every model call. Turn Lean off to enable every group again.

The prompt-budget bar shows how many tools and roughly how many tokens are active. Changes apply to the next message after **Save & Apply**.

## Approvals

Most tools run immediately. A few actions pause the turn and ask for explicit approval because they can interrupt your session or change connectivity:

- **Mute / unmute** the system output.
- **Turn Wi-Fi on or off.**
- **Turn Bluetooth on or off.**
- **Replace or delete a note** (destructive note actions).

Volume and brightness changes do **not** ask for approval. They run immediately because they are easy to reverse.

When an approval prompt appears:

- **Approve** runs the tool once and continues the same turn.
- **Decline** skips the tool and lets the model finish without it.
- The approval is tied to the active session and expires after one decision.

The model is told never to claim a change succeeded unless the tool returned a success message. If Windows blocks a radio change, the tool reports that Windows did not allow it; use Quick Settings instead.

## Tool visibility

The compact run list under a reply shows which tools ran, their arguments where useful, and whether they succeeded. Failed tools are marked failed. A tool error does not crash the turn; the model receives the error text and can explain it or try a different approach.

If a tool you expect is missing, check the group and per-tool switches first, then confirm the loadout was saved.
