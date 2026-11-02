"""
Aether Local GGUF Engine
Manages the lifecycle of bin/llama-server.exe and performs OpenAI-compatible
chat completions against the local Ternary-Bonsai model.
"""

import atexit
import json
import logging
import subprocess
import threading
import time
import urllib.error
import urllib.request

import psutil
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from ..config_manager import config_manager, find_model_file, get_models_dir
from ..mcp_tools.media_tools import get_binary_path
from .errors import EngineNotInstalledError, ModelNotConfiguredError
from .stream_accumulator import StreamAccumulator

logger = logging.getLogger(__name__)

SERVER_PORT = 8089
SERVER_HOST = "127.0.0.1"

# Engine packs, in the order tried when the configured one is unavailable.
# CPU is deliberately absent: a 9B model on the host CPU starves the desktop,
# so when no GPU backend is installed the local model is simply left off.
ENGINE_BACKENDS = ("vulkan", "cuda")


def engine_component_ids(backend: str = "") -> tuple:
    """Orders engine pack IDs, preferring the configured backend.

    The configured backend always leads and the other acts as a fallback. There
    is no CPU engine: an unusable GPU leaves local inference off rather than
    putting the model on the host CPU.
    """
    preferred = backend.strip().lower()
    ordered = [name for name in ENGINE_BACKENDS if name == preferred]
    ordered.extend(name for name in ENGINE_BACKENDS if name != preferred)
    return tuple(f"engine-{name}" for name in ordered)


class LocalGGUFEngine:
    """Owns the llama-server subprocess and talks to its HTTP API."""

    def __init__(self, port: int = SERVER_PORT):
        self.port = port
        self.base_url = f"http://{SERVER_HOST}:{self.port}"
        self.process: Optional[subprocess.Popen] = None
        self._lifecycle_lock = threading.Lock()
        atexit.register(self.stop_server)

    def resolve_model_path(self) -> str:
        configured = config_manager.get("ai_provider", "gguf_model_path", "") or ""
        if configured and Path(configured).exists():
            return configured
        discovered = find_model_file(
            ["*Ternary*Bonsai*.gguf", "*.gguf"], get_models_dir()
        )
        return discovered

    def is_healthy(self) -> bool:
        try:
            req = urllib.request.Request(f"{self.base_url}/health", method="GET")
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                return resp.status == 200
        except Exception:
            return False

    def start_server(self, model_path: Optional[str] = None) -> bool:
        """Spawns bin/llama-server.exe as a managed background subprocess."""
        with self._lifecycle_lock:
            return self._start_locked(model_path)

    def _start_locked(self, model_path: Optional[str] = None) -> bool:
        if self.is_healthy():
            return True

        resolved = model_path or self.resolve_model_path()
        if not resolved or not Path(resolved).exists():
            raise ModelNotConfiguredError(
                "Local GGUF model not found. Open Settings (⚙️) and browse for a "
                ".gguf file, or switch to Ollama / Cloud API."
            )

        engine_backend = str(
            config_manager.get("ai_provider", "engine_backend", "vulkan") or "vulkan"
        )
        engine_version = str(
            config_manager.get("ai_provider", "engine_version", "") or ""
        )
        server_bin = get_binary_path(
            "llama-server",
            engine_component_ids(engine_backend),
            engine_version,
        )
        if not Path(server_bin).exists():
            raise EngineNotInstalledError(
                f"No local engine is installed for the {engine_backend} backend. "
                "Install an engine pack in Settings → Components, or place "
                "llama-server.exe in Aether's bin/ directory."
            )
        logger.info(
            "aether.local_engine using %s (backend=%s, version=%s)",
            server_bin,
            engine_backend,
            engine_version or "latest",
        )

        context_length = int(config_manager.get("ai_provider", "context_length", 8192))
        gpu_layers = int(config_manager.get("ai_provider", "gpu_layers", -1))
        cmd = [
            server_bin,
            "-m", str(resolved),
            "-c", str(context_length),
            "-ngl", str(gpu_layers),
            "--port", str(self.port),
            "--host", SERVER_HOST,
        ]

        no_win = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=no_win,
        )

        start_time = time.time()
        while time.time() - start_time < 30.0:
            if self.is_healthy():
                return True
            time.sleep(0.5)
        return False

    def _kill_port_listener(self) -> None:
        """Terminates a leftover llama-server still listening on our port."""
        try:
            for conn in psutil.net_connections(kind="inet"):
                if not conn.laddr or conn.laddr.port != self.port:
                    continue
                if conn.status != psutil.CONN_LISTEN or not conn.pid:
                    continue
                proc = psutil.Process(conn.pid)
                if "llama-server" not in proc.name().lower():
                    continue
                proc.terminate()
                try:
                    proc.wait(timeout=2.0)
                except psutil.TimeoutExpired:
                    proc.kill()
        except Exception:
            pass

    def stop_server(self) -> None:
        """Terminates llama-server cleanly to release VRAM."""
        with self._lifecycle_lock:
            self._stop_locked()

    def _stop_locked(self) -> None:
        if self.process is not None:
            try:
                self.process.terminate()
                self.process.wait(timeout=2.0)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            finally:
                self.process = None
        # A previous backend process may have left llama-server orphaned.
        if self.is_healthy():
            self._kill_port_listener()

    def complete(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
        top_p: float = 0.80,
        presence_penalty: float = 1.5,
        thinking_mode: bool = False,
        on_token: Optional[Callable[[str], None]] = None,
    ) -> Dict[str, Any]:
        """Calls the local llama-server and returns the raw assistant message."""
        if not self.start_server():
            raise ModelNotConfiguredError(
                "The local model failed to start. Verify the GGUF path and that "
                "llama-server.exe is present in bin/."
            )

        payload: Dict[str, Any] = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "presence_penalty": presence_penalty,
            "chat_template_kwargs": {"enable_thinking": thinking_mode},
        }
        if tools:
            payload["tools"] = tools
        if on_token is not None:
            payload["stream"] = True
            return self._stream_completion(payload, on_token)

        req = urllib.request.Request(
            f"{self.base_url}/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:800]
            raise ModelNotConfiguredError(
                f"Local llama-server error (HTTP {exc.code}): {detail}. "
                "Open Settings to verify the model."
            ) from exc
        except Exception as exc:
            raise ModelNotConfiguredError(
                f"Local llama-server error: {exc}. Open Settings to verify the model."
            ) from exc

        choice = data["choices"][0]["message"]
        return {
            "content": (choice.get("content") or "").strip(),
            "reasoning": (choice.get("reasoning_content") or "").strip(),
            "tool_calls": choice.get("tool_calls") or [],
            "message": choice,
        }

    def _stream_completion(
        self,
        payload: Dict[str, Any],
        on_token: Callable[[str], None],
    ) -> Dict[str, Any]:
        """Reads llama-server's OpenAI-compatible SSE stream."""
        accumulator = StreamAccumulator()
        req = urllib.request.Request(
            f"{self.base_url}/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120.0) as resp:
                for raw_line in resp:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue
                    if line.startswith("data:"):
                        line = line[5:].strip()
                    if line == "[DONE]":
                        break
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    fragments: List[Dict[str, Any]] = []
                    for call in delta.get("tool_calls") or []:
                        fn = call.get("function") or {}
                        fragments.append({
                            "index": call.get("index", 0),
                            "id": call.get("id"),
                            "name": fn.get("name"),
                            "arguments": fn.get("arguments"),
                        })
                    text = accumulator.feed(
                        content=delta.get("content"),
                        reasoning=(
                            delta.get("reasoning_content")
                            or delta.get("reasoning")
                        ),
                        tool_calls=fragments,
                    )
                    if text:
                        on_token(text)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:800]
            raise ModelNotConfiguredError(
                f"Local llama-server error (HTTP {exc.code}): {detail}. "
                "Open Settings to verify the model."
            ) from exc
        except Exception as exc:
            raise ModelNotConfiguredError(
                f"Local llama-server stream error: {exc}. "
                "Open Settings to verify the model."
            ) from exc

        return {
            "content": accumulator.content.strip(),
            "reasoning": accumulator.reasoning.strip(),
            "tool_calls": accumulator.tool_calls(),
            "message": None,
        }
