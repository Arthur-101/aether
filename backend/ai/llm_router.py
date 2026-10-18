"""
Aether LLM Engine — Dedicated Ternary-Bonsai-2-9B Runner
Manages local llama-server.exe subprocess on port 8089, chat completions,
deterministic tool calling loops, and smart dictation cleaning.
"""

import atexit
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional
from ..config_manager import config_manager
from ..mcp_tools.media_tools import get_binary_path
from ..mcp_tools.server import execute_tool, get_openai_tool_schemas
from .prompts import DICTATION_SYSTEM_PROMPT

SERVER_PORT = 8089
SERVER_HOST = "127.0.0.1"


class LlamaServerManager:
    """Manages the lifecycle of the local llama-server.exe process."""

    def __init__(self, port: int = SERVER_PORT):
        self.port = port
        self.base_url = f"http://{SERVER_HOST}:{self.port}"
        self.process: Optional[subprocess.Popen] = None
        atexit.register(self.stop_server)

    def is_healthy(self) -> bool:
        """Checks if llama-server is responding to health requests."""
        try:
            req = urllib.request.Request(f"{self.base_url}/health", method="GET")
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                return resp.status == 200
        except Exception:
            return False

    def start_server(self, model_path: Optional[str] = None, context_length: int = 8192, gpu_layers: int = -1) -> bool:
        """Spawns bin/llama-server.exe as a managed background subprocess."""
        if self.is_healthy():
            return True

        # Resolve model path
        if not model_path:
            model_path = config_manager.get("ai_provider", "gguf_model_path", "")
        if not model_path or not Path(model_path).exists():
            default_p = Path("E:/Codes/Models/Ternary-Bonsai-2-9B-PQ2_0-MTP-Q8_0.gguf")
            if default_p.exists():
                model_path = str(default_p)
            else:
                raise FileNotFoundError(f"Ternary-Bonsai GGUF model not found: {model_path}")

        server_bin = get_binary_path("llama-server")
        if not Path(server_bin).exists():
            raise FileNotFoundError(f"llama-server binary not found: {server_bin}")

        cmd = [
            server_bin,
            "-m", str(model_path),
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
            creationflags=no_win
        )

        # Poll health for up to 20 seconds
        start_time = time.time()
        while time.time() - start_time < 20.0:
            if self.is_healthy():
                return True
            time.sleep(0.5)

        return False

    def stop_server(self) -> None:
        """Terminates the local llama-server subprocess cleanly to release VRAM."""
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

    def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> Dict[str, Any]:
        """
        Executes chat completion with deterministic tool execution loop.
        """
        self.start_server()

        payload: Dict[str, Any] = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if tools:
            payload["tools"] = tools

        req = urllib.request.Request(
            f"{self.base_url}/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=60.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        choice = data["choices"][0]["message"]
        executed_tools = []

        # Check for tool calls
        tool_calls = choice.get("tool_calls", [])
        if tool_calls:
            for tc in tool_calls:
                fn_name = tc["function"]["name"]
                fn_args = json.loads(tc["function"]["arguments"])
                tool_output = execute_tool(fn_name, fn_args)
                executed_tools.append({"name": fn_name, "args": fn_args, "output": tool_output})

                # Append tool call and result to conversation
                messages.append(choice)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id", "call_0"),
                    "content": tool_output
                })

            # Call LLM again to synthesize tool output into final response
            return self.chat_completion(messages, tools=None, max_tokens=max_tokens)

        # Primary response is in content; fallback to reasoning_content if content is empty
        final_content = choice.get("content") or ""
        if not final_content and choice.get("reasoning_content"):
            final_content = choice.get("reasoning_content", "").strip()

        return {
            "content": final_content.strip(),
            "reasoning": choice.get("reasoning_content", ""),
            "tool_calls_executed": executed_tools
        }

    def clean_dictation(self, raw_text: str) -> str:
        """Cleans stutters, filler words, and repetitions using Ternary-Bonsai."""
        if not raw_text.strip():
            return ""

        messages = [
            {"role": "system", "content": DICTATION_SYSTEM_PROMPT},
            {"role": "user", "content": raw_text}
        ]
        result = self.chat_completion(messages, tools=None, max_tokens=768, temperature=0.1)
        return result.get("content", "").strip()


# Global singleton instance
llm_router = LlamaServerManager()
