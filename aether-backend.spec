# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the frozen Aether daemon sidecar.

Build with ``build_sidecar.ps1`` (or ``py -3.12 -m PyInstaller aether-backend.spec``).
Output: ``dist/aether-backend/aether-backend.exe`` plus ``_internal/``. The
Tauri bundle copies that folder to ``<install dir>/aether-backend`` and the
overlay spawns it at launch.

Torch is excluded on purpose: the isolated STT runtime owns it, so the sidecar
stays small and the daemon never imports it.
"""

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, copy_metadata

# FastAPI/uvicorn/LiteLLM produce deep import chains; the default limit of
# 1000 trips during Analysis on some machines.
sys.setrecursionlimit(sys.getrecursionlimit() * 5)

root = Path(SPECPATH)

datas = [
    (str(root / "backend" / "guide"), "guide"),
    (str(root / "components_manifest.json"), "."),
]
datas += collect_data_files("sqlite_vec")
# LiteLLM reads its bundled data through importlib.resources.files("litellm")
# and __file__-relative joins: the model cost map
# (model_prices_and_context_window_backup.json) at the package root, but also
# nested files such as containers/endpoints.json, llms/openai_like/providers.json
# and the complexity-router presets. PyInstaller freezes the modules into the
# PYZ, so those files never ship unless collected here. The include patterns are
# matched against the path relative to the package, so a bare "*.json" only ever
# matched the top-level files; "**/*.json" covers the nested ones too.
datas += collect_data_files("litellm", includes=["**/*.json"])
# default_encoding.py points TIKTOKEN_CACHE_DIR at
# litellm/litellm_core_utils/tokenizers, so tiktoken appears to have a warm
# cache. Collect the BPE blobs and the Anthropic tokenizer JSON or tiktoken
# tries to download its encodings on first use (slow, and fails offline).
datas += collect_data_files("litellm", subdir="litellm_core_utils/tokenizers")
# FastMCP (and the MCP SDK) call importlib.metadata.version() at import time;
# without the dist-info directory the frozen daemon dies before it starts.
datas += copy_metadata("fastmcp")
datas += copy_metadata("mcp")

a = Analysis(
    [str(root / "run_backend.py")],
    pathex=[str(root)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
        "websockets",
        # tiktoken discovers its encodings (cl100k_base, o200k_base, ...) at
        # runtime by iterating the tiktoken_ext namespace package; the plugin
        # module is only ever imported dynamically, so PyInstaller never sees
        # it. Without it every cloud request that tokenizes dies with
        # "Unknown encoding cl100k_base. Plugins found: []". LiteLLM points
        # TIKTOKEN_CACHE_DIR at the tokenizer blobs collected below, so the
        # encodings load from disk instead of the network.
        "tiktoken_ext.openai_public",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # The STT runtime and local TTS are ONNX-based; the main daemon never
        # imports torch, and the isolated STT runtime owns it.
        "torch",
        "torchvision",
        "torchaudio",
        "llama_cpp",
        "pyaudiowpatch",
        "tkinter",
        "matplotlib",
        # litellm's optional Petals handler imports transformers inside a
        # function; this removes the whole datasets/accelerate/faiss chain.
        "transformers",
        "datasets",
        "accelerate",
        "faiss",
        # Pulled in by the optional transformers/audio stack.
        "librosa",
        "numba",
        "llvmlite",
        "scipy",
        "sklearn",
        "nltk",
        "pyarrow",
        # Hook-only or dev dependencies that the daemon never imports.
        "django",
        "pygame",
        "babel",
        "IPython",
        "jedi",
        "pytest",
        "_pytest",
        "gunicorn",
        "watchfiles",
        "psycopg2",
        "psycopg2_binary",
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="aether-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="aether-backend",
)
