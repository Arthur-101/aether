---
id: system-controls
title: System controls
summary: Check system stats, change volume, brightness, Wi-Fi, and Bluetooth, and launch or focus apps.
tags: [system, volume, brightness, wifi, bluetooth, stats, apps, launch, focus, approvals]
related: [tools-and-approvals, troubleshooting]
order: 110
---
# System controls

The **System** tool group reads system status and changes a few Windows settings. It is enabled by default.

## Status

Ask “How is my system doing?” or “What’s my battery level?” The assistant calls `get_system_stats` and reports the values it received:

- CPU, memory, and disk usage.
- GPU usage, VRAM, and temperature when available.
- Battery and charging state.
- Volume and mute state.
- Brightness.
- Wi-Fi and Bluetooth state, including the current network or device when Windows exposes it.
- Airplane mode, mobile hotspot, uptime, and dark mode.

The Stats tab shows the same live telemetry with a network speed test.

## Volume and brightness

These changes run immediately; they do not ask for approval.

- “Set the volume to 30.”
- “Turn the volume up to 80.”
- “Set brightness to 60.”

Volume is a percentage from 0 to 100. Brightness depends on the display and its driver. External monitors that do not expose brightness control may reject the change; Aether reports the actual value or the failure.

## Mute, Wi-Fi, and Bluetooth

These actions ask for approval before they run because they can interrupt audio or connectivity:

- “Mute the system.”
- “Turn Wi-Fi off.”
- “Turn Bluetooth on.”

Approve or decline the prompt. If Windows blocks a radio change, Aether says Windows did not allow it; use the Windows Quick Settings panel instead. Some adapters require a driver or OEM utility and cannot be switched through the standard API.

## Launching and focusing apps

Aether can open or switch to apps that are already in your taskbar deck: Windows-pinned apps, custom taskbar apps, and apps that are currently open. The first three launches in a rolling minute run immediately — the taskbar deck is the safety boundary. The fourth launch pauses for approval so a model loop cannot keep opening windows.

- “Open Spotify.”
- “Switch to VS Code.”
- “Bring the invoice window forward.”

The assistant matches the app name shown on the taskbar, including common short forms such as “VS Code” for Visual Studio Code. A path is accepted only when it points at an app already in the deck; arbitrary paths are rejected. If an app is pinned but not running, ask Aether to open it rather than focus it.

To add an app, pin it in Windows or open Settings → **Appearance** → **Taskbar dock** and add it there. Aether never launches an executable that is not in that list.

## Examples

- “Is my Wi-Fi on?”
- “What’s my GPU temperature?”
- “Lower the volume to 15.”
- “Dim the screen to 40%.”
- “Open Spotify.”
- “Switch to Visual Studio Code.”
- “How much RAM is Aether using?” — the Stats tab shows system-wide memory; process-level details are not a separate tool.

## If a control is missing

Check Settings → **Tools** → **System**. The group must be enabled, and the individual tool must not be switched off. Volume and brightness are writes; mute, Wi-Fi, and Bluetooth are system actions that always pause for approval. App launch and window focus only work with taskbar apps; the fourth launch within a minute asks for approval.
