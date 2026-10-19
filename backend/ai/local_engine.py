"""
Aether Local GGUF Engine
Manages the lifecycle of bin/llama-server.exe and performs OpenAI-compatible
chat completions against the local Ternary-Bonsai model.
"""

import atexit
import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..config_manager import config_manager, find_model_file, get_models_dir
from ..mcp_tools.media_tools import get_binary_path
from .errors import ModelNotConfiguredError

SERVER_PORT = 8089
SERVER_HOST = "127.0.0.1"


class LocalGGUFEngine:
    """Owns the llama-server subprocess and talks to its HTTP API."""

    def __init__(self, port: int = SERVER_PORT):
        self.port = port
        self.base_url = f"http://{SERVER_HOST}:{self.port}"
        self.process: Optional[subprocess.Popen] = None
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
        if self.is_healthy():
            return True

        resolved = model_path or self.resolve_model_path()
        if not resolved or not Path(resolved).exists():
            raise ModelNotConfiguredError(
                "Local GGUF model not found. Open Settings (⚙️) and browse for a "
                ".gguf file, or switch to Ollama / Cloud API."
            )

        server_bin = get_binary_path("llama-server")
        if not Path(server_bin).exists():
            raise ModelNotConfiguredError(
                f"llama-server binary not found at {server_bin}. "
                "Place llama-server.exe in Aether's bin/ directory."
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

    def stop_server(self) -> None:
        """Terminates llama-server cleanly to release VRAM."""
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

    def complete(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
        top_p: float = 0.80,
        presence_penalty: float = 1.5,
        thinking_mode: bool = False,
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
