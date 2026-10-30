---
id: getting-started
title: Getting started
summary: Start Aether, open the island, choose an engine, and finish first-run setup.
tags: [setup, first-run, start]
related: [interface, ai-engines, voice, troubleshooting]
order: 10
---
# Getting started

## Start Aether

Aether has two parts: a local daemon that does the work and a desktop overlay that you see. Start both together.

- **Source checkout:** run `start_aether.bat`. It opens the daemon and the overlay in separate terminal windows.
- **Daemon only:** run `start_backend.bat`.
- **Overlay only:** run `start_frontend.bat` after the daemon is already running.
- **Packaged build:** launch Aether from the Start menu or its desktop shortcut.

The first launch can take a few seconds while the daemon opens the database and starts the local services. Leave both terminal windows open while you use Aether. Closing the daemon window stops chat, voice, and scheduled tasks.

To stop everything from a source checkout, run `stop_aether.bat`. The island header also has a **Kill Aether** control in development builds.

## Open the island

Press **Ctrl + Space** (default) or click the top pill. The island expands to the last tab you used. Press **Esc** or click outside it to collapse.

## First-run checklist

1. **Choose an engine.** Open Settings → **AI & Models** and pick one of the three modes:
   - **Local GGUF** for a private offline model. Browse to a `.gguf` file.
   - **Ollama** for a model already managed by Ollama. Enter the base URL and model name.
   - **Cloud API** for Gemini, Groq, OpenAI, Mistral, or OpenRouter. Choose a provider, type the model ID, and paste its API key.
2. **Choose a voice path.** Open Settings → **Voice Engine**. Local Phonon-2 speech-to-text needs the one-time `setup_stt.ps1` runtime and a model folder. Local text-to-speech needs a local `.onnx` model file; its voices are read from the model's folder. Cloud voice is optional and reuses the key you saved in AI & Models.
3. **Set up optional tools.** Add a Tavily key in AI & Models for web search, and a Spotify Client ID in Integrations for music control. Both are optional.
4. **Review the tool loadout.** Settings → **Tools** starts with every group enabled. If you use a small local model, try the **Lean loadout** to keep only notes, media, web, and clock tools.
5. **Say hello.** Ask “What can you do?”, “Set the volume to 30”, “Remind me at 6 pm to stretch”, or “Search the web for today’s Windows news”.

## Where things live

- **Settings** is the gear in the island header.
- **Guide** is the last Settings tab and contains this documentation.
- **Chat history** is under the session title in Quick Chat.
- **Notes** are in the Notes tab and in your notes vault folder.
- **Keys and preferences** stay in your Windows app-data folder for Aether.

If the overlay says it is waiting for the daemon, see [Troubleshooting](troubleshooting.md).
