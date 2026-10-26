# Aether

> Ultra-low-latency, local-first Windows AI Desktop Assistant & File Utility Overlay.

Aether combines a voice-driven Windows desktop assistant with a zero-friction `Drag + Shift` radial file converter and a top-anchored "Desktop Island" overlay.

---

## Architecture Highlights

* **Frontend:** Tauri v2 (Rust backend + React 18 + TypeScript + Tailwind CSS + Framer Motion) always-on-top transparent overlay (< 40MB RAM).
* **Backend:** Python 3.11+ async daemon (FastAPI + WebSockets + FastMCP).
* **Local LLM:** Exclusively powered by `Ternary-Bonsai-2-9B` GGUF via `llama-cpp-python` with `q8_0` KV cache (total VRAM < 4.5 GB).
* **Memory & Context Pipeline:** 1-Turn raw buffer (`last_turn_prompt` + `last_turn_reply`) + session-scoped episodic vector search via `sqlite-vec` & CPU `fastembed` (`bge-small-en-v1.5`, 384 dims, 0 VRAM).
* **Voice Stack:** Local `Phonon-2` STT + 24kHz `Paradee` TTS.
* **Deterministic Tooling:** Typed FastMCP tools for image/document conversions, metadata stripping (`piexif`), and APScheduler reverse-trigger loops.
* **Zero Hardcoded Paths:** Dynamically resolves `%APPDATA%/Aether` and user-configurable paths via `config_manager.py`.

---

## Directory Structure

```text
aether/
├── bin/                          # Portable binaries (ffmpeg.exe, llama-server.exe)
├── backend/
│   ├── config_manager.py         # Portable config manager (%APPDATA%/Aether/config.json)
│   ├── requirements.txt          # Python dependencies
│   ├── test_phase1.py            # Phase 1 verification test
│   ├── db/
│   │   ├── database.py           # SQLite + sqlite-vec setup & tables
│   │   └── sessions.py           # 1-turn buffer & session-scoped vector memory
│   ├── ai/
│   │   ├── embedder.py           # CPU fastembed (bge-small-en-v1.5)
│   │   ├── llm_router.py         # Ternary-Bonsai-2-9B local runner
│   │   ├── stt_engine.py         # Phonon-2 STT engine
│   │   └── tts_engine.py         # Paradee TTS engine
│   ├── mcp_tools/                # FastMCP deterministic tools & APScheduler
│   └── os_hooks/                 # Windows OS hooks (pynput, win32com, pywinauto, winsdk)
└── frontend/                     # Tauri v2 + React overlays (DesktopIsland, RadialWheel, Drawer)
```

---

## Setup & Verification

```bash
# 1. Install backend dependencies (Python 3.12 recommended)
cd backend
pip install -r requirements.txt

# 2. Install the isolated Phonon-2 speech-to-text runtime
cd ..
powershell -ExecutionPolicy Bypass -File setup_stt.ps1

# 3. Run the full backend suite
py -3.12 -m pytest backend -q

# 4. Build the production overlay and installers
cd frontend
npm run tauri build
```

The build writes `Aether_0.1.0_x64_en-US.msi` and
`Aether_0.1.0_x64-setup.exe` under `frontend/src-tauri/target/release/bundle/`.
The installers package the overlay; the Python daemon and isolated STT runtime
remain external (see `PACKAGING_AND_CONFIG.md`).

Phonon-2 runs in `bin/stt-runtime` so Torch and Transformers never load in the
backend process. Without that runtime, dictation stays disabled and logs one
actionable warning; the rest of Aether is unaffected. Point Settings → Voice →
STT Model at a directory containing `model.fermion` and `config.json`.

Existing configs are upgraded in place with any newly added defaults. An
unreadable `config.json` is preserved as `config.corrupt-<timestamp>.json`
before Aether restores safe defaults.
