---
id: troubleshooting
title: Troubleshooting
summary: Fix startup, model, voice, web, Spotify, tool, clipboard, and guide problems.
tags: [troubleshooting, errors, startup, voice, models, tools]
related: [getting-started, ai-engines, voice, web-search, spotify]
order: 150
---
# Troubleshooting

## The overlay says it is waiting for the daemon

The overlay and the daemon are separate processes.

1. Make sure the daemon terminal is running. If not, run `start_backend.bat`.
2. If the daemon crashed, read the last lines in its terminal for the error.
3. Run `stop_aether.bat`, then `start_aether.bat` to restart both parts.
4. If a port is already in use, another Aether instance may still be running. Stop it before starting again.

The daemon must stay open while you use Aether. Closing its terminal stops chat, voice, and scheduled tasks.

## The local model will not load

- Confirm the `.gguf` path still exists. Moving or renaming the file breaks the setting.
- Try a smaller context length.
- Try a smaller quantization if the model does not fit in memory.
- Close other GPU-heavy applications.
- Check the daemon terminal for the model loader’s error.

## Ollama replies fail

- Confirm Ollama is running.
- Confirm the base URL matches the service, usually `http://127.0.0.1:11434`.
- Run `ollama list` and use the exact model name.
- Pull the model if it is missing.

## Cloud chat fails

- Re-paste the API key; extra spaces are a common cause.
- Check the model ID. Provider model names change.
- For OpenRouter, paste the ID exactly as copied; the `openrouter/` prefix is added automatically.
- Check the provider’s quota and billing. A key with a `$0` cap can reject requests even when it is valid.
- Check the network connection and any proxy or firewall.
- Try a different provider to isolate the problem.

## Voice does not work

**Local STT**

- Run `setup_stt.ps1` once.
- Select the Phonon-2 model folder in Voice Engine.
- Confirm the microphone is connected and allowed in Windows privacy settings.

**Local TTS**

- Select the Paradee `paradee.onnx` file.
- Confirm the output device in Playback is the one you expect.
- Paradee has one local voice (`af_heart`); choosing another local voice is not possible.

**Cloud voice**

- Save the provider key in AI & Models first.
- Check the STT/TTS model and voice IDs.
- OpenRouter audio can return HTTP 403 when the key’s spending cap is reached.
- If the cloud call fails, Aether falls back to an installed local model.

## Web search does not work

- Add a Tavily key in AI & Models and save.
- Check for extra spaces in the key.
- HTTP 429 means a quota or rate limit; wait or check your plan.
- `fetch_url` does not need a key, but login-only or JavaScript-only pages may fail.

## Spotify does not connect or play

- Confirm the redirect URI is exactly `http://127.0.0.1:8888/callback`.
- Confirm the Client ID belongs to the same Spotify app.
- Playback control needs Spotify Premium.
- Open Spotify and start a track once so an active device exists.
- Use **Refresh** in Integrations, then reconnect if needed.
- Disconnect and reconnect after changing the Client ID.

## A tool is missing or refuses to run

- Open Settings → Tools and confirm the group is enabled.
- Expand the group and confirm the individual tool is on.
- Save & Apply; the loadout changes on the next message.
- If the action needs approval, approve it in the prompt.
- If the tool returns an error, read the error text; it usually names the missing file, key, or permission.

## Clipboard problems

- If Aether says the clipboard contains an image, it is not text. Copy text first if you want a text answer.
- Aether reads the clipboard once per request; asking “try again” should not write anything.
- Writing replaces the clipboard. If you need the old contents, save them first.

## Attachments do not answer correctly

- Confirm the file type is supported: PDF, TXT, MD, DOCX, PY, JS, JSON, CSV, PNG, JPG, JPEG, WEBP.
- For images, use a vision-capable model.
- For large documents, ask a specific question so the right chunks are retrieved.
- Remove stale attachments from the session if the answer references the wrong file.

## Scheduled tasks do not run

- The daemon must be running at the scheduled time.
- Check the task in the Clock tab; it may be paused or completed.
- Confirm the time is local and in the future.
- Ask Aether to list tasks so it uses the real task ID before editing.

## The Guide tab is unavailable

The guide ships with Aether. If it is missing, the installation is incomplete; reinstall or update Aether. The assistant can still answer general questions, but it should not guess at setup steps when the guide cannot be read.
