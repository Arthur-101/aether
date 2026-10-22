"""
Windows audio output device discovery and switching.

Enumeration rides on pycaw, which already walks the Core Audio endpoint
collection.  Switching is the hard part: the public ``IMMDeviceEnumerator``
has no setter, so the default endpoint is changed through the undocumented
``AudioPolicyConfig`` COM service.

On current Windows builds that interface's ``SetDefaultEndpoint`` takes the
endpoint **id string** (``{0.0.0.00000000}.{guid}``) rather than an
``IAudioEndpoint`` pointer, and it lives at vtable slot 13.  Passing an
interface pointer there fails with ``E_INVALIDARG``.

COM is apartment bound, so the service client is cached per worker thread,
mirroring the master-volume endpoint cache in ``system_controls``.
"""

from __future__ import annotations

import ctypes
import logging
import threading
import uuid
from ctypes import HRESULT, POINTER, byref, c_int, c_uint32, c_void_p, c_wchar_p
from typing import Any, Dict, List, Optional

logger = logging.getLogger("aether.audio")

# pycaw warns for every endpoint that does not expose a given property. The
# device list is polled regularly, so keep the daemon log readable.
logging.getLogger("pycaw.utils").setLevel(logging.ERROR)

# CLSID_AudioPolicyConfigClient / IID_IPolicyConfig.
_POLICY_CLSID = "{870af99c-171d-4f9e-af0d-e63df40c2bc9}"
_POLICY_IID = "{f8679f50-850a-41cf-9c72-430f290290c8}"

# SetDefaultEndpoint sits behind ten format/property methods, so it is the
# eleventh method of the interface: three IUnknown slots plus ten.
_SET_DEFAULT_SLOT = 13

# ERole: console apps and multimedia apps each track their own default.
_ROLE_CONSOLE = 0
_ROLE_MULTIMEDIA = 1

# DEVICE_STATE_ACTIVE / DEVICE_STATE_UNPLUGGED
_STATE_ACTIVE = 1
_STATE_UNPLUGGED = 8

# EDataFlow.eRender
_FLOW_RENDER = 0

# Property store keys, as pycaw formats them.
_KEY_DEVICE_DESC = "{026E516E-B814-414B-83CD-856D6FEF4822} 2"

_local = threading.local()


def _make_guid(text: str) -> POINTER(c_void_p):
    """Builds a GUID pointer in the in-memory layout COM expects."""
    raw = uuid.UUID(text).bytes_le
    buffer = (ctypes.c_byte * 16)()
    for index in range(16):
        buffer[index] = raw[index]
    return ctypes.cast(buffer, POINTER(c_void_p))


def _policy_client() -> Optional[c_void_p]:
    """Returns the AudioPolicyConfig service client for this thread."""
    client = getattr(_local, "policy", None)
    if client is not None and client.value:
        return client
    try:
        ole32 = ctypes.OleDLL("ole32")
        ole32.CoInitializeEx(None, 0x2)  # COINIT_APARTMENTTHREADED
        ole32.CoCreateInstance.argtypes = [
            POINTER(c_void_p),
            c_void_p,
            c_uint32,
            POINTER(c_void_p),
            POINTER(c_void_p),
        ]
        ole32.CoCreateInstance.restype = HRESULT
        client = c_void_p()
        hr = ole32.CoCreateInstance(
            _make_guid(_POLICY_CLSID),
            None,
            1 | 4 | 16,  # CLSCTX_INPROC_SERVER | CLSCTX_LOCAL_SERVER | CLSCTX_FROM_HKEY
            _make_guid(_POLICY_IID),
            byref(client),
        )
        if hr != 0 or not client.value:
            logger.warning("AudioPolicyConfig unavailable: hr=0x%08x", hr & 0xFFFFFFFF)
            return None
    except Exception as exc:
        logger.warning("AudioPolicyConfig client failed: %s", exc)
        return None
    _local.policy = client
    return client


def _reset_policy_client() -> None:
    _local.policy = None


def _set_default_endpoint(device_id: str, role: int) -> bool:
    """Points one role's default endpoint at the device with this id."""
    client = _policy_client()
    if client is None:
        return False
    try:
        vtable = ctypes.cast(client, POINTER(POINTER(c_void_p))).contents
        setter = ctypes.WINFUNCTYPE(
            HRESULT, c_void_p, c_wchar_p, c_int, c_uint32
        )(vtable[_SET_DEFAULT_SLOT])
        hr = setter(client, device_id, role, 0)
        if (hr & 0xFFFFFFFF) == 0:
            return True
        logger.warning(
            "SetDefaultEndpoint failed for %s: hr=0x%08x", device_id, hr & 0xFFFFFFFF
        )
    except Exception as exc:
        logger.warning("SetDefaultEndpoint raised: %s", exc)
        _reset_policy_client()
    return False


def _render_endpoints() -> List[Dict[str, Any]]:
    """Returns every render endpoint Windows knows about."""
    try:
        from pycaw.api.mmdeviceapi import IMMEndpoint
        from pycaw.pycaw import AudioUtilities
    except ImportError:  # pragma: no cover - non-Windows environments
        return []

    rows: List[Dict[str, Any]] = []
    try:
        devices = AudioUtilities.GetAllDevices()
    except Exception as exc:
        logger.warning("Audio endpoint enumeration failed: %s", exc)
        return rows

    for device in devices:
        try:
            flow = device._dev.QueryInterface(IMMEndpoint).GetDataFlow()
            state = device._dev.GetState()
        except Exception:
            continue
        if flow != _FLOW_RENDER:
            continue
        state = int(state or 0)
        if state not in (_STATE_ACTIVE, _STATE_UNPLUGGED):
            # Not-present and disabled endpoints are ghosts the user cannot pick.
            continue
        try:
            device_id = device._dev.GetId()
        except Exception:
            continue
        rows.append(
            {
                "id": device_id,
                "name": device.FriendlyName or device_id,
                "description": _description(device),
                "active": state == _STATE_ACTIVE,
            }
        )
    return rows


def _description(device: Any) -> str:
    """Reads the friendly device description, when Windows exposes one."""
    try:
        properties = device.properties
    except Exception:
        return ""
    value = properties.get(_KEY_DEVICE_DESC)
    return str(value) if value else ""


def _active_device_id() -> str:
    """Returns the id of the endpoint Windows is currently playing through."""
    try:
        from pycaw.pycaw import AudioUtilities

        return AudioUtilities.GetSpeakers()._dev.GetId()
    except Exception:
        return ""


def list_output_devices() -> List[Dict[str, Any]]:
    """Lists render endpoints, flagging the one that is active right now.

    Windows happily exposes several endpoints under the same friendly name
    (virtual mixer devices, duplicated headphone jacks), so the list is
    collapsed by name and the live device is kept.
    """
    active = _active_device_id()
    devices = _render_endpoints()
    unique: List[Dict[str, Any]] = []
    seen: Dict[str, Dict[str, Any]] = {}
    for device in devices:
        device["active"] = bool(active) and device["id"] == active
        key = device["name"].casefold()
        existing = seen.get(key)
        if existing is None:
            seen[key] = device
            unique.append(device)
        elif device["active"] and not existing["active"]:
            # The live device wins the slot over its inactive twin.
            unique[unique.index(existing)] = device
            seen[key] = device
    return unique


def set_default_output_device(device_id: str) -> bool:
    """Routes system audio to the endpoint with this id."""
    target = (device_id or "").strip()
    if not target:
        return False
    console = _set_default_endpoint(target, _ROLE_CONSOLE)
    multimedia = _set_default_endpoint(target, _ROLE_MULTIMEDIA)
    return console or multimedia


def active_output_device_name() -> str:
    """Returns the display name of the endpoint currently in use."""
    try:
        from pycaw.pycaw import AudioUtilities

        return AudioUtilities.GetSpeakers().FriendlyName or ""
    except Exception:
        return ""


__all__ = [
    "active_output_device_name",
    "list_output_devices",
    "set_default_output_device",
]
