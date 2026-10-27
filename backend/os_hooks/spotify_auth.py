"""Spotify Authorization Code + PKCE, token storage, and refresh.

Desktop apps cannot keep a client secret, so this module never asks for one. The
authorization code is captured on a temporary 127.0.0.1 loopback server and the
refresh token is stored under %APPDATA%/Aether (Rule 1).
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import secrets
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

from ..config_manager import config_manager, get_app_dir

logger = logging.getLogger("aether.spotify")

AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1"
SCOPES = (
    "user-read-playback-state "
    "user-modify-playback-state "
    "user-read-currently-playing "
    "user-library-read "
    "user-library-modify "
    "user-read-private "
    "playlist-read-private"
)
AUTH_TIMEOUT = 180.0
AUTH_PORT = 8888
REDIRECT_PATH = "/callback"
TOKEN_FILE_NAME = "spotify_auth.json"
REFRESH_MARGIN = 60
USER_AGENT = "Aether/0.2 (local assistant; Spotify integration)"


class SpotifyAuthError(RuntimeError):
    """User-facing Spotify authorization or token refresh failure."""

    def __init__(self, message: str, code: str = "") -> None:
        super().__init__(message)
        self.code = code


_state_lock = threading.Lock()
_refresh_lock = threading.Lock()
_flow_lock = threading.Lock()
_pending = False
_cancel = threading.Event()
_cached_token: Optional[Dict[str, Any]] = None


def _token_path() -> Path:
    return get_app_dir() / TOKEN_FILE_NAME


def _load_tokens() -> Dict[str, Any]:
    global _cached_token
    with _state_lock:
        if _cached_token is not None:
            return _cached_token
        try:
            data = json.loads(_token_path().read_text(encoding="utf-8"))
            _cached_token = data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            _cached_token = {}
        return _cached_token


def _save_tokens(tokens: Dict[str, Any]) -> None:
    global _cached_token
    with _state_lock:
        path = _token_path()
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(tokens, indent=2), encoding="utf-8")
        os.replace(temp, path)
        _cached_token = dict(tokens)


def _clear_tokens() -> None:
    global _cached_token
    with _state_lock:
        _cached_token = {}
        try:
            _token_path().unlink()
        except FileNotFoundError:
            pass
        except OSError as exc:
            logger.warning("Could not remove the Spotify token file: %s", exc)


def forget_session() -> None:
    """Drops the stored session after Spotify rejects it."""
    _clear_tokens()


def _set_pending(value: bool) -> None:
    global _pending
    with _state_lock:
        _pending = value


def is_pending() -> bool:
    with _state_lock:
        return _pending


def get_status(message: str = "") -> Dict[str, Any]:
    """Returns the connection state consumed by Settings."""
    tokens = _load_tokens()
    return {
        "connected": bool(tokens.get("refresh_token")),
        "pending": is_pending(),
        "display_name": str(tokens.get("display_name") or ""),
        "client_id_set": bool(
            str(config_manager.get("spotify", "client_id", "") or "").strip()
        ),
        "message": message,
    }


def _client_id(value: Optional[str] = None) -> str:
    client_id = str(
        value if value is not None else config_manager.get("spotify", "client_id", "")
        or ""
    ).strip()
    if not client_id:
        raise SpotifyAuthError(
            "Add your Spotify Client ID in Settings → Integrations."
        )
    return client_id


def _code_verifier() -> str:
    return secrets.token_urlsafe(64)


def _code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _redirect_uri(port: int = AUTH_PORT) -> str:
    return f"http://127.0.0.1:{port}{REDIRECT_PATH}"


def _authorize_url(
    client_id: str, redirect_uri: str, state: str, challenge: str
) -> str:
    return AUTHORIZE_URL + "?" + urlencode(
        {
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "scope": SCOPES,
            "state": state,
            "code_challenge_method": "S256",
            "code_challenge": challenge,
        }
    )


def _callback_result(path: str, expected_state: str) -> Dict[str, str]:
    """Parses a loopback callback path without trusting query contents."""
    parsed = urlparse(path)
    if parsed.path != "/callback":
        return {}
    params = parse_qs(parsed.query)
    if params.get("state", [""])[0] != expected_state:
        return {"error": "state_mismatch"}
    if params.get("error"):
        return {"error": params["error"][0]}
    code = params.get("code", [""])[0]
    return {"code": code} if code else {"error": "missing_code"}


def _token_request(data: Dict[str, str]) -> Dict[str, Any]:
    body = urlencode(data).encode("utf-8")
    request = Request(
        TOKEN_URL,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=15.0) as response:
            raw = response.read(64 * 1024)
    except HTTPError as exc:
        code = ""
        detail = ""
        try:
            payload = json.loads(exc.read().decode("utf-8"))
            if isinstance(payload, dict):
                code = str(payload.get("error") or "")
                detail = str(
                    payload.get("error_description")
                    or payload.get("error")
                    or ""
                )
        except (OSError, ValueError):
            pass
        raise SpotifyAuthError(
            detail or f"Spotify token request failed (HTTP {exc.code}).", code
        ) from exc
    except (URLError, TimeoutError) as exc:
        raise SpotifyAuthError(f"Could not reach Spotify: {exc}") from exc
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SpotifyAuthError("Spotify returned an unreadable token response.") from exc
    if not isinstance(payload, dict) or not payload.get("access_token"):
        raise SpotifyAuthError("Spotify did not return an access token.")
    return payload


def get_access_token(force_refresh: bool = False) -> str:
    """Returns a valid access token, refreshing it shortly before expiry."""
    tokens = dict(_load_tokens())
    access = str(tokens.get("access_token") or "")
    expires_at = float(tokens.get("expires_at") or 0)
    if not force_refresh and access and expires_at > time.time() + REFRESH_MARGIN:
        return access

    with _refresh_lock:
        tokens = dict(_load_tokens())
        access = str(tokens.get("access_token") or "")
        expires_at = float(tokens.get("expires_at") or 0)
        if not force_refresh and access and expires_at > time.time() + REFRESH_MARGIN:
            return access
        refresh_token = str(tokens.get("refresh_token") or "")
        if not refresh_token:
            raise SpotifyAuthError(
                "Spotify is not connected. Connect it in Settings → Integrations."
            )
        try:
            payload = _token_request(
                {
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": _client_id(),
                }
            )
        except SpotifyAuthError as exc:
            if exc.code == "invalid_grant":
                _clear_tokens()
                raise SpotifyAuthError(
                    "Spotify session expired. Reconnect in Settings → Integrations."
                ) from exc
            raise
        tokens.update(
            {
                "access_token": payload["access_token"],
                "expires_at": time.time() + int(payload.get("expires_in") or 3600),
                "scope": str(payload.get("scope") or tokens.get("scope") or ""),
            }
        )
        if payload.get("refresh_token"):
            tokens["refresh_token"] = payload["refresh_token"]
        _save_tokens(tokens)
        return str(tokens["access_token"])


def _display_name(access_token: str) -> str:
    request = Request(
        API_BASE + "/me",
        headers={
            "Authorization": f"Bearer {access_token}",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urlopen(request, timeout=10.0) as response:
            payload = json.loads(response.read(64 * 1024).decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError):
        return ""
    if not isinstance(payload, dict):
        return ""
    return str(payload.get("display_name") or payload.get("id") or "")


def _run_flow(client_id: str) -> None:
    verifier = _code_verifier()
    challenge = _code_challenge(verifier)
    state = secrets.token_urlsafe(24)
    result: Dict[str, str] = {}
    done = threading.Event()

    class CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = _callback_result(self.path, state)
            if not parsed:
                self._respond(404, "Not found.")
                return
            result.update(parsed)
            if "error" in result:
                self._respond(400, "Spotify sign-in failed. Return to Aether and try again.")
            else:
                self._respond(200, "Aether is connected to Spotify. You can close this tab.")
            done.set()

        def _respond(self, status: int, message: str) -> None:
            body = (
                "<!doctype html><html><body style='font-family:sans-serif;"
                "padding:2rem;background:#101014;color:#eee'>"
                f"<h2>Aether</h2><p>{message}</p></body></html>"
            ).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args: Any) -> None:
            return

    try:
        server = HTTPServer(("127.0.0.1", AUTH_PORT), CallbackHandler)
    except OSError as exc:
        raise SpotifyAuthError(
            f"Could not start the Spotify callback server on port {AUTH_PORT}. "
            "Close the app using that port and try again."
        ) from exc
    redirect_uri = _redirect_uri(server.server_port)
    url = _authorize_url(client_id, redirect_uri, state, challenge)
    try:
        if not webbrowser.open(url):
            raise SpotifyAuthError(
                "Could not open your browser. Check your default browser and try again."
            )
        deadline = time.monotonic() + AUTH_TIMEOUT
        while not done.is_set():
            if _cancel.is_set():
                raise SpotifyAuthError("Spotify sign-in was cancelled.", "cancelled")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise SpotifyAuthError(
                    f"Spotify sign-in timed out. Make sure {redirect_uri} "
                    "is listed in your Spotify app's Redirect URIs, then try again."
                )
            server.timeout = min(1.0, remaining)
            server.handle_request()
    finally:
        server.server_close()

    if _cancel.is_set():
        raise SpotifyAuthError("Spotify sign-in was cancelled.", "cancelled")
    if result.get("error") == "access_denied":
        raise SpotifyAuthError("Spotify sign-in was declined.")
    if result.get("error") == "state_mismatch":
        raise SpotifyAuthError("Spotify sign-in failed a security check. Try again.")
    if result.get("error"):
        raise SpotifyAuthError("Spotify sign-in failed. Try again.")
    code = result.get("code")
    if not code:
        raise SpotifyAuthError("Spotify did not return an authorization code.")

    payload = _token_request(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "code_verifier": verifier,
        }
    )
    refresh_token = str(payload.get("refresh_token") or "")
    if not refresh_token:
        raise SpotifyAuthError(
            "Spotify did not return a refresh token. Try connecting again."
        )
    _save_tokens(
        {
            "refresh_token": refresh_token,
            "access_token": payload["access_token"],
            "expires_at": time.time() + int(payload.get("expires_in") or 3600),
            "scope": str(payload.get("scope") or ""),
            "display_name": _display_name(str(payload["access_token"])),
        }
    )


def connect(client_id: Optional[str] = None) -> Dict[str, Any]:
    """Runs the blocking PKCE flow and returns the new status."""
    resolved = _client_id(client_id)
    if not _flow_lock.acquire(blocking=False):
        raise SpotifyAuthError("A Spotify sign-in is already in progress.")
    try:
        _cancel.clear()
        _set_pending(True)
        try:
            _run_flow(resolved)
        finally:
            _set_pending(False)
        return get_status()
    finally:
        _flow_lock.release()


def disconnect() -> Dict[str, Any]:
    """Clears the stored session and cancels a pending sign-in."""
    _cancel.set()
    _clear_tokens()
    return get_status()
