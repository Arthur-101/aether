"""
Aether WebSocket Connection Manager
Thread-safe broadcast hub for all connected Tauri/browser clients.
Tracks active WebSocket connections and provides typed JSON event broadcasting.
"""

import asyncio
import json
import logging
from typing import Any, Dict, List, Set

from fastapi import WebSocket

logger = logging.getLogger("aether.ws")


class ConnectionManager:
    """Manages WebSocket lifecycle: connect, disconnect, broadcast."""

    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        """Accepts and registers a new WebSocket client."""
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)
        logger.info("WS client connected. Total: %d", len(self._connections))

    async def disconnect(self, ws: WebSocket) -> None:
        """Removes a disconnected WebSocket client."""
        async with self._lock:
            self._connections.discard(ws)
        logger.info("WS client disconnected. Total: %d", len(self._connections))

    async def broadcast(self, event_type: str, payload: Dict[str, Any]) -> None:
        """Sends a JSON event envelope to ALL connected clients."""
        envelope = json.dumps({"type": event_type, "payload": payload})
        stale: List[WebSocket] = []
        async with self._lock:
            targets = list(self._connections)

        for ws in targets:
            try:
                await ws.send_text(envelope)
            except Exception:
                stale.append(ws)

        if stale:
            async with self._lock:
                for ws in stale:
                    self._connections.discard(ws)

    async def send_to(self, ws: WebSocket, event_type: str, payload: Dict[str, Any]) -> None:
        """Sends a JSON event to a single client."""
        envelope = json.dumps({"type": event_type, "payload": payload})
        try:
            await ws.send_text(envelope)
        except Exception:
            await self.disconnect(ws)

    @property
    def client_count(self) -> int:
        return len(self._connections)


# Global singleton
ws_manager = ConnectionManager()
