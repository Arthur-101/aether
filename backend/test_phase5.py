"""
Aether Phase 5 Test Suite — FastAPI WebSocket Bridge & Daemon
Verifies: WebSocket handshake, JSON event broadcasting, event routing,
telemetry loop, health endpoint, and IPC message round-trips.
"""

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

# Setup import path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient


class TestHealthEndpoint(unittest.TestCase):
    """Tests the /health readiness probe."""

    def setUp(self):
        # Patch heavy subsystems that would fail in test env
        self._patches = [
            patch("backend.os_hooks.hotkeys.hotkey_manager"),
            patch("backend.mcp_tools.clock_scheduler.register_wake_callback"),
            patch("backend.os_hooks.system_controls.get_system_telemetry",
                  return_value={"cpu_percent": 10.0, "ram_percent": 45.0}),
        ]
        for p in self._patches:
            p.start()

        from backend.main import app
        self.client = TestClient(app)

    def tearDown(self):
        for p in self._patches:
            p.stop()

    def test_health_returns_ok(self):
        """Health endpoint should return status ok with client count."""
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("clients", data)
        self.assertIn("thinking_mode", data)
        print(f"  ✓ /health → {data}")


class TestWebSocketHandshake(unittest.TestCase):
    """Tests WebSocket connect/disconnect and initial state push."""

    def setUp(self):
        self._patches = [
            patch("backend.os_hooks.hotkeys.hotkey_manager"),
            patch("backend.mcp_tools.clock_scheduler.register_wake_callback"),
            patch("backend.os_hooks.system_controls.get_system_telemetry",
                  return_value={"cpu_percent": 5.0, "ram_percent": 30.0}),
        ]
        for p in self._patches:
            p.start()

        from backend.main import app
        self.client = TestClient(app)

    def tearDown(self):
        for p in self._patches:
            p.stop()

    def test_ws_connect_receives_initial_state(self):
        """On connect, client should receive THINKING_MODE_CHANGED event."""
        with self.client.websocket_connect("/ws") as ws:
            raw = ws.receive_text()
            event = json.loads(raw)
            self.assertEqual(event["type"], "THINKING_MODE_CHANGED")
            self.assertIn("enabled", event["payload"])
            print(f"  ✓ WS initial state: {event}")

    def test_ws_invalid_json(self):
        """Sending invalid JSON should return ERROR event."""
        with self.client.websocket_connect("/ws") as ws:
            _ = ws.receive_text()  # consume initial state
            ws.send_text("not-json{{{")
            raw = ws.receive_text()
            event = json.loads(raw)
            self.assertEqual(event["type"], "ERROR")
            self.assertIn("Invalid JSON", event["payload"]["message"])
            print(f"  ✓ Invalid JSON handled: {event}")


class TestEventRouting(unittest.TestCase):
    """Tests the event router dispatching for key event types."""

    def setUp(self):
        self._patches = [
            patch("backend.os_hooks.hotkeys.hotkey_manager"),
            patch("backend.mcp_tools.clock_scheduler.register_wake_callback"),
            patch("backend.os_hooks.system_controls.get_system_telemetry",
                  return_value={"cpu_percent": 8.0, "ram_percent": 40.0}),
        ]
        for p in self._patches:
            p.start()

        # Ensure DB tables exist for session queries
        from backend.db.database import init_db
        init_db()

        from backend.main import app
        self.client = TestClient(app)

    def tearDown(self):
        for p in self._patches:
            p.stop()

    def test_toggle_thinking_mode(self):
        """TOGGLE_THINKING_MODE should update config and broadcast confirmation."""
        with self.client.websocket_connect("/ws") as ws:
            _ = ws.receive_text()  # initial state
            ws.send_text(json.dumps({
                "type": "TOGGLE_THINKING_MODE",
                "payload": {"enabled": True}
            }))
            raw = ws.receive_text()
            event = json.loads(raw)
            self.assertEqual(event["type"], "THINKING_MODE_CHANGED")
            self.assertTrue(event["payload"]["enabled"])
            print(f"  ✓ Thinking mode toggled: {event}")

            # Reset to Normal mode (default)
            ws.send_text(json.dumps({
                "type": "TOGGLE_THINKING_MODE",
                "payload": {"enabled": False}
            }))
            raw = ws.receive_text()
            event = json.loads(raw)
            self.assertFalse(event["payload"]["enabled"])
            print(f"  ✓ Normal mode restored: {event}")

    def test_list_sessions(self):
        """LIST_SESSIONS should return SESSION_LIST with sessions array."""
        with self.client.websocket_connect("/ws") as ws:
            _ = ws.receive_text()  # initial state
            ws.send_text(json.dumps({
                "type": "LIST_SESSIONS",
                "payload": {}
            }))
            raw = ws.receive_text()
            event = json.loads(raw)
            self.assertEqual(event["type"], "SESSION_LIST")
            self.assertIn("sessions", event["payload"])
            self.assertIsInstance(event["payload"]["sessions"], list)
            print(f"  ✓ Session list received: {len(event['payload']['sessions'])} sessions")

    def test_get_config(self):
        """GET_CONFIG should return CONFIG_STATE with full config."""
        with self.client.websocket_connect("/ws") as ws:
            _ = ws.receive_text()  # initial state
            ws.send_text(json.dumps({
                "type": "GET_CONFIG",
                "payload": {}
            }))
            raw = ws.receive_text()
            event = json.loads(raw)
            self.assertEqual(event["type"], "CONFIG_STATE")
            self.assertIn("ai_provider", event["payload"])
            self.assertIn("voice", event["payload"])
            print(f"  ✓ Config state received: {list(event['payload'].keys())}")

    def test_unknown_event(self):
        """Unknown event types should be silently logged (no crash)."""
        with self.client.websocket_connect("/ws") as ws:
            _ = ws.receive_text()  # initial state
            ws.send_text(json.dumps({
                "type": "NONEXISTENT_EVENT",
                "payload": {"foo": "bar"}
            }))
            # Should not crash; no response expected for unknown events
            print("  ✓ Unknown event handled gracefully (no crash)")


class TestConnectionManager(unittest.TestCase):
    """Tests the WebSocket connection manager directly."""

    def test_broadcast_envelope_format(self):
        """Broadcast should produce correct JSON envelope structure."""
        import asyncio
        from backend.ws_manager import ConnectionManager

        mgr = ConnectionManager()

        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_text = AsyncMock()

        async def run():
            await mgr.connect(mock_ws)
            self.assertEqual(mgr.client_count, 1)

            await mgr.broadcast("TEST_EVENT", {"key": "value"})
            mock_ws.send_text.assert_called_once()

            sent = mock_ws.send_text.call_args[0][0]
            envelope = json.loads(sent)
            self.assertEqual(envelope["type"], "TEST_EVENT")
            self.assertEqual(envelope["payload"]["key"], "value")

            await mgr.disconnect(mock_ws)
            self.assertEqual(mgr.client_count, 0)

        asyncio.run(run())
        print("  ✓ ConnectionManager broadcast envelope valid")

    def test_stale_connection_cleanup(self):
        """Broadcasting to a dead connection should remove it."""
        import asyncio
        from backend.ws_manager import ConnectionManager

        mgr = ConnectionManager()

        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_text = AsyncMock(side_effect=Exception("Connection closed"))

        async def run():
            await mgr.connect(mock_ws)
            self.assertEqual(mgr.client_count, 1)

            await mgr.broadcast("PING", {})
            self.assertEqual(mgr.client_count, 0)

        asyncio.run(run())
        print("  ✓ Stale connection auto-cleaned")


class TestWheelAction(unittest.TestCase):
    """Tests WHEEL_ACTION event dispatching."""

    def setUp(self):
        self._patches = [
            patch("backend.os_hooks.hotkeys.hotkey_manager"),
            patch("backend.mcp_tools.clock_scheduler.register_wake_callback"),
            patch("backend.os_hooks.system_controls.get_system_telemetry",
                  return_value={"cpu_percent": 5.0, "ram_percent": 30.0}),
            patch("backend.mcp_tools.server.execute_tool",
                  return_value="Converted test.png to test.jpg"),
        ]
        for p in self._patches:
            p.start()

        from backend.main import app
        self.client = TestClient(app)

    def tearDown(self):
        for p in self._patches:
            p.stop()

    def test_wheel_convert_action(self):
        """WHEEL_ACTION CONVERT should dispatch and return WHEEL_RESULT."""
        with self.client.websocket_connect("/ws") as ws:
            _ = ws.receive_text()  # initial state
            ws.send_text(json.dumps({
                "type": "WHEEL_ACTION",
                "payload": {
                    "action": "CONVERT",
                    "file_path": "C:/test/image.png",
                    "target": "jpg"
                }
            }))
            raw = ws.receive_text()
            event = json.loads(raw)
            self.assertEqual(event["type"], "WHEEL_RESULT")
            self.assertEqual(event["payload"]["action"], "CONVERT")
            print(f"  ✓ Wheel CONVERT result: {event['payload']['result']}")

    def test_wheel_unknown_action(self):
        """Unknown WHEEL_ACTION should return error in WHEEL_RESULT."""
        with self.client.websocket_connect("/ws") as ws:
            _ = ws.receive_text()
            ws.send_text(json.dumps({
                "type": "WHEEL_ACTION",
                "payload": {
                    "action": "EXPLODE",
                    "file_path": "C:/test/file.txt",
                    "target": ""
                }
            }))
            raw = ws.receive_text()
            event = json.loads(raw)
            self.assertEqual(event["type"], "WHEEL_RESULT")
            self.assertIn("error", event["payload"])
            print(f"  ✓ Unknown wheel action handled: {event['payload']['error']}")


if __name__ == "__main__":
    print("=" * 60)
    print("  Aether Phase 5 — FastAPI WebSocket Bridge Tests")
    print("=" * 60)
    unittest.main(verbosity=2)
