---
id: ai-engines
title: AI engines and models
summary: Choose Local GGUF, Ollama, or Cloud API; set context and memory depth.
tags: [ai, models, local, ollama, cloud, memory, context]
related: [chat-and-memory, privacy-and-local-first, troubleshooting]
order: 30
---
# AI engines and models

Open Settings → **AI & Models**. The **Inference backend** selector has three modes.

## Local GGUF

Local GGUF runs a model file on this machine through the bundled local runtime. It is private and works offline.

- Browse to a `.gguf` file. The file is not copied; Aether remembers its path.
- **Context length** controls how much text the model can hold. It applies only to Local GGUF and Ollama.
- Default memory depth is **2 recent prompt turns + 3 semantic matches**. Lower it if replies get truncated or the model slows down.

A larger context uses more memory. If the model fails to load, try a smaller context length or a smaller quantization.

## Ollama

Ollama runs models managed by the Ollama service.

1. Install Ollama and start it.
2. Pull a model in a terminal, for example `ollama pull qwen2.5:7b`.
3. In Settings, enter the base URL (default `http://127.0.0.1:11434`) and the model name.
4. Set the context length if the model’s default is too small.

Aether does not download Ollama models for you. If the model name is wrong, the reply fails with a configuration error; check `ollama list`.

## Cloud API

Cloud mode sends the conversation to the selected provider. It uses that provider’s context window, so the local **Context length** setting is not applied.

Choose a provider, then enter the model ID and API key:

- **Google Gemini** — for example `gemini-2.5-flash`.
- **Groq** — for example `llama-3.3-70b-versatile`.
- **OpenAI** — for example `gpt-4o-mini`.
- **Mistral** — for example `mistral-small-latest`.
- **OpenRouter** — paste the model ID exactly as OpenRouter copies it; the `openrouter/` prefix is added automatically.

Cloud defaults are **8 recent prompt turns + 8 semantic matches**. Keys are stored locally and are reused by cloud voice when you select the same provider there.

If a cloud request fails, check the key, the model ID, the provider’s quota, and the network connection. OpenRouter keys with a `$0` spending cap can reject audio even when chat works.

## Thinking mode

The **Thinking / Normal** toggle in Quick Chat maps to each provider’s reasoning control. Thinking mode gives the model more room to reason and is slower. Some models enforce a minimum amount of reasoning, so Normal can still reason briefly.

## Memory depth

Open the collapsed **Memory depth** control under the model settings. It has two typed inputs:

- **Prompt turns** — recent user/assistant exchanges included in the prompt.
- **Semantic matches** — older turns retrieved by similarity from this session.

Defaults are 2 + 3 for Local GGUF/Ollama and 8 + 8 for Cloud. **Reset** restores the defaults for the current backend. Counts are clamped to safe ranges; large local memory can crowd the context.

Memory is session-scoped. A new session starts empty; switching back to an old session restores its own memory. See [Chat and memory](chat-and-memory.md).
