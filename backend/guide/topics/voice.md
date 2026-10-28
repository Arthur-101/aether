---
id: voice
title: Voice
summary: Local Phonon-2 and Paradee, cloud STT/TTS, hold-to-talk, and fallback.
tags: [voice, stt, tts, phonon, paradee, microphone, speech]
related: [ai-engines, interface, privacy-and-local-first, troubleshooting]
order: 40
---
# Voice

Voice is local-first. Speech-to-text (STT) and text-to-speech (TTS) are independent, so you can use local listening with a cloud voice, or cloud listening with the local voice.

Open Settings → **Voice Engine**.

## Speech to text

### Local Phonon-2

Local STT runs offline on this machine.

1. Run `setup_stt.ps1` once. It creates the isolated speech runtime beside Aether. This keeps large speech dependencies out of the main backend.
2. In Voice Engine, keep the provider on **Local**.
3. Browse to the Phonon-2 model folder.
4. Hold the **Voice Assistant** or **Smart Dictation** shortcut and speak.

If dictation is unavailable, the runtime or model folder is missing. Re-run `setup_stt.ps1` and select the model folder again. Local STT never uploads recorded audio.

### Cloud STT

Choose a cloud provider in the STT provider list. Cloud STT uses the key already saved for that provider in AI & Models; you do not need a second key. The model field accepts the provider’s model ID or a custom ID.

The recorded clip is sent to the provider for transcription. If the cloud call fails and a local model is installed, Aether falls back to local STT and logs a warning. A local failure never escalates to the cloud automatically.

## Text to speech

### Local Paradee

Local TTS renders spoken replies on this machine.

- Browse to the Paradee `paradee.onnx` file.
- The local voice is **Heart · US English** (`af_heart`). Paradee 8M is a single-voice model; additional local voices are not included.
- The speed slider applies locally.

### Cloud TTS

Choose a cloud provider, then set the model and voice. Cloud TTS reuses the provider key from AI & Models. The model and voice fields accept custom IDs.

The reply text is sent to the provider. If the cloud call fails and the local Paradee model is installed, Aether falls back to local speech. Long replies are split at sentence boundaries where a provider has a per-request limit.

## Hold-to-talk and dictation

- **Voice Assistant (Alt + Space)** — hold, speak a request, release. Aether transcribes, answers, and can speak the reply.
- **Smart Dictation (Ctrl + Win)** — hold, speak, release. The transcript is cleaned and typed into the focused text field instead of being sent to chat.
- **Region to Ask (Ctrl + Shift)** — select part of the screen and ask about it. See [The interface](interface.md).

The default shortcuts can be changed in Settings → Hotkeys. If Open and Voice share a binding, tap to open and hold to talk.

## Devices and playback

Settings → Voice Engine → **Playback** selects the output device and volume for spoken replies. The microphone can be chosen where the voice pipeline exposes input devices. If no audio plays, check the Windows output device, the Aether volume, and whether the selected cloud provider returned audio.

For cloud voice failures, check the provider key, quota, and model ID. OpenRouter audio can return HTTP 403 when the key’s spending cap is exhausted even though chat still works.
