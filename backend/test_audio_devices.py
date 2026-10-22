"""Focused tests for the audio output device and display helpers."""

import sys
from pathlib import Path

import pytest

from backend.os_hooks import audio_devices
from backend.os_hooks.audio_devices import (
    list_output_devices,
    set_default_output_device,
)
from backend.os_hooks.display_info import get_display_info


def test_output_device_list_is_shaped_for_the_panel():
    """Every row carries what the Audio panel renders."""
    devices = list_output_devices()
    assert isinstance(devices, list)
    for device in devices:
        assert set(device) == {"id", "name", "description", "active"}
        assert device["id"]
        assert device["name"]
        assert isinstance(device["active"], bool)


def test_only_one_device_is_marked_active():
    devices = list_output_devices()
    active = [device for device in devices if device["active"]]
    assert len(active) <= 1


def test_duplicate_device_names_collapse_to_one_row():
    """Windows exposes several endpoints under one friendly name."""
    devices = list_output_devices()
    names = [device["name"].casefold() for device in devices]
    assert len(names) == len(set(names))


def test_setting_an_unknown_device_is_refused():
    assert set_default_output_device("") is False
    assert set_default_output_device("not-a-real-endpoint") is False


def test_display_info_reports_resolution_and_refresh():
    info = get_display_info()
    assert isinstance(info, dict)
    if not info:
        pytest.skip("display enumeration unavailable in this environment")
    assert info["width"] > 0
    assert info["height"] > 0
    assert info["refresh_hz"] >= 0
    if "width_mm" in info:
        assert info["width_mm"] > 0
        assert info["height_mm"] > 0


def test_policy_client_slot_points_at_the_device_id_setter():
    """The setter takes the endpoint id string, not an interface pointer.

    Passing an interface pointer there is accepted by the compiler and
    rejected by Windows with ``E_INVALIDARG``, so the slot is pinned.
    """
    assert audio_devices._SET_DEFAULT_SLOT == 13
    assert audio_devices._POLICY_CLSID.startswith("{870af99c")
    assert audio_devices._POLICY_IID.startswith("{f8679f50")
