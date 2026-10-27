"""Tests for Spotify PKCE, token storage, and refresh behavior."""

import json
import time

import pytest

from backend.os_hooks import spotify_auth


class FakeConfig:
    def __init__(self, client_id: str = "test-client") -> None:
        self.client_id = client_id

    def get(self, section, key=None, default=None):
        if section == "spotify" and key == "client_id":
            return self.client_id
        return default


@pytest.fixture
def auth_env(tmp_path, monkeypatch):
    monkeypatch.setattr(spotify_auth, "get_app_dir", lambda: tmp_path)
    monkeypatch.setattr(spotify_auth, "_cached_token", None)
    monkeypatch.setattr(spotify_auth, "_pending", False)
    monkeypatch.setattr(spotify_auth, "config_manager", FakeConfig())
    spotify_auth._cancel.clear()
    yield tmp_path
    spotify_auth._cancel.clear()


def _tokens(path, **overrides):
    data = {
        "refresh_token": "refresh",
        "access_token": "access",
        "expires_at": time.time() + 3600,
        "scope": "test",
        "display_name": "Saurav",
    }
    data.update(overrides)
    path.write_text(json.dumps(data), encoding="utf-8")


def test_code_challenge_matches_rfc7636():
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    assert (
        spotify_auth._code_challenge(verifier)
        == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    )


def test_redirect_uri_uses_the_registered_fixed_port():
    assert spotify_auth._redirect_uri() == "http://127.0.0.1:8888/callback"


def test_authorize_url_contains_pkce_and_loopback_redirect():
    url = spotify_auth._authorize_url(
        "client", "http://127.0.0.1:1234/callback", "state", "challenge"
    )
    assert "code_challenge_method=S256" in url
    assert "code_challenge=challenge" in url
    assert "redirect_uri=http%3A%2F%2F127.0.0.1%3A1234%2Fcallback" in url
    assert "scope=user-read-playback-state" in url


def test_callback_result_accepts_code_and_rejects_bad_state():
    assert spotify_auth._callback_result("/callback?code=abc&state=s", "s") == {
        "code": "abc"
    }
    assert spotify_auth._callback_result("/callback?code=abc&state=bad", "s") == {
        "error": "state_mismatch"
    }
    assert spotify_auth._callback_result(
        "/callback?error=access_denied&state=s", "s"
    ) == {"error": "access_denied"}
    assert spotify_auth._callback_result("/favicon.ico", "s") == {}
    assert spotify_auth._callback_result("/callback?state=s", "s") == {
        "error": "missing_code"
    }


def test_status_reports_connected_account(auth_env):
    _tokens(auth_env / spotify_auth.TOKEN_FILE_NAME)
    status = spotify_auth.get_status()
    assert status["connected"] is True
    assert status["display_name"] == "Saurav"
    assert status["client_id_set"] is True
    assert status["pending"] is False


def test_valid_access_token_is_reused(auth_env):
    _tokens(auth_env / spotify_auth.TOKEN_FILE_NAME)
    assert spotify_auth.get_access_token() == "access"


def test_expired_token_refreshes_and_keeps_rotated_token(auth_env, monkeypatch):
    _tokens(auth_env / spotify_auth.TOKEN_FILE_NAME, access_token="old", expires_at=0)
    calls = []

    def fake_token(data):
        calls.append(data)
        return {
            "access_token": "new",
            "expires_in": 3600,
            "refresh_token": "rotated",
            "scope": "test",
        }

    monkeypatch.setattr(spotify_auth, "_token_request", fake_token)
    assert spotify_auth.get_access_token() == "new"
    saved = json.loads(
        (auth_env / spotify_auth.TOKEN_FILE_NAME).read_text(encoding="utf-8")
    )
    assert saved["refresh_token"] == "rotated"
    assert calls[0]["grant_type"] == "refresh_token"
    assert calls[0]["client_id"] == "test-client"


def test_invalid_grant_clears_the_session(auth_env, monkeypatch):
    _tokens(auth_env / spotify_auth.TOKEN_FILE_NAME, access_token="old", expires_at=0)

    def fake_token(_data):
        raise spotify_auth.SpotifyAuthError("Refresh token revoked", "invalid_grant")

    monkeypatch.setattr(spotify_auth, "_token_request", fake_token)
    with pytest.raises(spotify_auth.SpotifyAuthError, match="expired"):
        spotify_auth.get_access_token()
    assert not (auth_env / spotify_auth.TOKEN_FILE_NAME).exists()


def test_missing_session_explains_how_to_connect(auth_env):
    with pytest.raises(spotify_auth.SpotifyAuthError, match="not connected"):
        spotify_auth.get_access_token()


def test_disconnect_removes_tokens_and_cancels_pending(auth_env):
    _tokens(auth_env / spotify_auth.TOKEN_FILE_NAME)
    spotify_auth.disconnect()
    assert not (auth_env / spotify_auth.TOKEN_FILE_NAME).exists()
    assert spotify_auth.get_status()["connected"] is False
    assert spotify_auth._cancel.is_set() is True


def test_connect_times_out_when_callback_never_arrives(auth_env, monkeypatch):
    monkeypatch.setattr(spotify_auth, "AUTH_TIMEOUT", 0.05)
    monkeypatch.setattr(spotify_auth, "AUTH_PORT", 0)
    monkeypatch.setattr(spotify_auth.webbrowser, "open", lambda _url: True)
    with pytest.raises(spotify_auth.SpotifyAuthError, match="timed out"):
        spotify_auth.connect("client")
    assert spotify_auth.is_pending() is False


def test_connect_requires_a_client_id(auth_env, monkeypatch):
    monkeypatch.setattr(spotify_auth, "config_manager", FakeConfig(""))
    with pytest.raises(spotify_auth.SpotifyAuthError, match="Client ID"):
        spotify_auth.connect()
