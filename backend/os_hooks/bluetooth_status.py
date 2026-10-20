"""
WinRT Bluetooth device inventory and connection status.

Uses the Windows Association Endpoint selector so paired devices are returned
even when they are not currently connected.
"""

import asyncio
from typing import Any, Dict, List


def list_paired_bluetooth() -> List[Dict[str, Any]]:
    """Returns paired Bluetooth devices with their live connection status."""
    try:
        from winsdk.windows.devices.bluetooth import (
            BluetoothConnectionStatus,
            BluetoothDevice,
        )
        from winsdk.windows.devices.enumeration import DeviceInformation

        async def _read() -> List[Dict[str, Any]]:
            selector = BluetoothDevice.get_device_selector()
            infos = await DeviceInformation.find_all_async(selector, [])
            devices: List[Dict[str, Any]] = []
            for info in infos:
                name = (info.name or "").strip()
                if not name:
                    continue
                connected = False
                try:
                    device = await BluetoothDevice.from_id_async(info.id)
                    connected = bool(
                        device
                        and device.connection_status
                        == BluetoothConnectionStatus.CONNECTED
                    )
                except Exception:
                    pass
                devices.append(
                    {
                        "name": name,
                        "status": "Connected" if connected else "Paired",
                        "connected": connected,
                        "instance_id": info.id,
                    }
                )
            devices.sort(key=lambda item: (not item["connected"], item["name"].lower()))
            return devices

        return asyncio.run(_read())
    except Exception:
        return []


def connected_bluetooth_name() -> str:
    """Returns the friendly name of the connected Bluetooth device, if any."""
    for device in list_paired_bluetooth():
        if device["connected"]:
            return str(device["name"])
    return ""
