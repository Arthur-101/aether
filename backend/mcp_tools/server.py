"""
Aether FastMCP Server & Tool Registry
Exposes deterministic media, document RAG, and clock scheduling tools to the LLM.
Translates FastMCP tool definitions into OpenAI/GGUF function schemas.
"""

import json
from typing import Any, Callable, Dict, Iterable, List, Optional
from fastmcp import FastMCP
from ..tool_groups import (
    LEAN_ENABLED_TOOL_GROUPS,
    TOOL_GROUP_HINTS,
    TOOL_GROUP_IDS,
    TOOL_GROUP_LABELS,
    normalize_disabled_tools,
    normalize_enabled_tool_groups,
)
from .tool_permissions import tool_permission
from .media_tools import (
    add_background,
    compress_media,
    convert_image_format,
    crop_image,
    strip_image_metadata,
)
from .doc_tools import convert_document, search_dropped_file
from .note_tools import (
    append_to_note,
    create_note,
    delete_note,
    get_note_tool_schemas,
    list_notes,
    read_note,
    search_notes,
    set_note_pinned,
    update_note,
)
from .clock_tools import (
    cancel_task_tool,
    complete_task_tool,
    list_tasks_tool,
    pause_task_tool,
    resume_task_tool,
    schedule_alarm,
    update_task_tool,
)
from .media_control_tools import (
    get_media_control_tool_schemas,
    media_next,
    media_pause,
    media_play,
    media_previous,
    media_toggle,
    now_playing,
)
from .clock_scheduler import (
    schedule_custom_task,
    schedule_one_time_task,
    schedule_recurring_routine,
)
from .clock_tool_schemas import get_clock_tool_schemas
from .web_tools import fetch_url, get_web_tool_schemas, web_search
from .spotify_tools import (
    get_spotify_tool_schemas,
    spotify_like,
    spotify_liked_songs,
    spotify_list_devices,
    spotify_play,
    spotify_queue,
    spotify_search,
    spotify_set_repeat,
    spotify_set_shuffle,
    spotify_set_volume,
    spotify_transfer,
)

# FastMCP Server Instance
mcp = FastMCP("AetherTools")

# Register FastMCP tools
mcp.tool()(convert_image_format)
mcp.tool()(compress_media)
mcp.tool()(strip_image_metadata)
mcp.tool()(convert_document)
mcp.tool()(search_dropped_file)
mcp.tool()(list_notes)
mcp.tool()(search_notes)
mcp.tool()(read_note)
mcp.tool()(create_note)
mcp.tool()(append_to_note)
mcp.tool()(set_note_pinned)
mcp.tool()(update_note)
mcp.tool()(delete_note)
mcp.tool()(media_play)
mcp.tool()(media_pause)
mcp.tool()(media_toggle)
mcp.tool()(media_next)
mcp.tool()(media_previous)
mcp.tool()(now_playing)
mcp.tool()(web_search)
mcp.tool()(fetch_url)
mcp.tool()(spotify_search)
mcp.tool()(spotify_play)
mcp.tool()(spotify_queue)
mcp.tool()(spotify_set_shuffle)
mcp.tool()(spotify_set_repeat)
mcp.tool()(spotify_set_volume)
mcp.tool()(spotify_list_devices)
mcp.tool()(spotify_transfer)
mcp.tool()(spotify_like)
mcp.tool()(spotify_liked_songs)
mcp.tool()(schedule_one_time_task)
mcp.tool()(schedule_recurring_routine)
mcp.tool()(schedule_custom_task)
mcp.tool()(list_tasks_tool)
mcp.tool()(update_task_tool)
mcp.tool()(cancel_task_tool)
mcp.tool()(complete_task_tool)
mcp.tool()(pause_task_tool)
mcp.tool()(resume_task_tool)
mcp.tool()(schedule_alarm)

# Tool Dispatch Table
TOOL_DISPATCH: Dict[str, Callable[..., Any]] = {
    "convert_image_format": convert_image_format,
    "compress_media": compress_media,
    "strip_image_metadata": strip_image_metadata,
    "convert_document": convert_document,
    "search_dropped_file": search_dropped_file,
    "list_notes": list_notes,
    "search_notes": search_notes,
    "read_note": read_note,
    "create_note": create_note,
    "append_to_note": append_to_note,
    "set_note_pinned": set_note_pinned,
    "update_note": update_note,
    "delete_note": delete_note,
    "media_play": media_play,
    "media_pause": media_pause,
    "media_toggle": media_toggle,
    "media_next": media_next,
    "media_previous": media_previous,
    "now_playing": now_playing,
    "web_search": web_search,
    "fetch_url": fetch_url,
    "spotify_search": spotify_search,
    "spotify_play": spotify_play,
    "spotify_queue": spotify_queue,
    "spotify_set_shuffle": spotify_set_shuffle,
    "spotify_set_repeat": spotify_set_repeat,
    "spotify_set_volume": spotify_set_volume,
    "spotify_list_devices": spotify_list_devices,
    "spotify_transfer": spotify_transfer,
    "spotify_like": spotify_like,
    "spotify_liked_songs": spotify_liked_songs,
    "schedule_one_time_task": schedule_one_time_task,
    "schedule_recurring_routine": schedule_recurring_routine,
    "schedule_custom_task": schedule_custom_task,
    "list_scheduled_tasks": list_tasks_tool,
    "update_scheduled_task": update_task_tool,
    "cancel_scheduled_task": cancel_task_tool,
    "complete_scheduled_task": complete_task_tool,
    "pause_scheduled_task": pause_task_tool,
    "resume_scheduled_task": resume_task_tool,
    "schedule_alarm": schedule_alarm,
    "crop_image": crop_image,
    "add_background": add_background,
}

# Tools that must receive the active session id even if the model omits it.
SESSION_SCOPED_TOOLS = {
    "search_dropped_file",
    "schedule_one_time_task",
    "schedule_recurring_routine",
    "schedule_custom_task",
}


def filter_tool_schemas(
    schemas: Iterable[Dict[str, Any]],
    enabled_groups: Optional[Iterable[str]] = None,
    disabled_tools: Optional[Iterable[str]] = None,
) -> List[Dict[str, Any]]:
    """Keeps schemas whose group is enabled and whose tool is not excepted.

    Unknown groups fail open: a newly registered tool is visible until it is
    assigned to a loadout group, so it can never silently vanish.
    """
    enabled = set(normalize_enabled_tool_groups(enabled_groups))
    blocked = set(normalize_disabled_tools(disabled_tools))
    selected: List[Dict[str, Any]] = []
    for schema in schemas:
        name = str((schema.get("function") or {}).get("name") or "")
        if name in blocked:
            continue
        group = tool_permission(name).group
        if group in TOOL_GROUP_IDS and group not in enabled:
            continue
        selected.append(schema)
    return selected


def get_openai_tool_schemas(
    enabled_groups: Optional[Iterable[str]] = None,
    disabled_tools: Optional[Iterable[str]] = None,
) -> List[Dict[str, Any]]:
    """Returns OpenAI/GGUF function calling schemas for the local LLM."""
    schemas = [
        {
            "type": "function",
            "function": {
                "name": "convert_image_format",
                "description": "Convert an image to png, jpg, webp, heic, tiff, avif, bmp, or pdf.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_path": {"type": "string", "description": "Absolute path to source image."},
                        "target_format": {"type": "string", "description": "Target extension: png, jpg, webp, etc."}
                    },
                    "required": ["file_path", "target_format"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "compress_media",
                "description": "Compress an image, video, or PDF file to reduce disk size.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_path": {"type": "string", "description": "Absolute path to media file."},
                        "target_mb": {"type": "number", "description": "Target size in MB (default 5.0)."}
                    },
                    "required": ["file_path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "strip_image_metadata",
                "description": "Remove EXIF, GPS, and camera metadata from an image.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_path": {"type": "string", "description": "Absolute path to image."}
                    },
                    "required": ["file_path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "convert_document",
                "description": "Convert PDF to docx, jpg, png, or txt.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_path": {"type": "string", "description": "Absolute path to document."},
                        "target_format": {"type": "string", "description": "Target format: docx, jpg, png, txt."}
                    },
                    "required": ["file_path", "target_format"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search_dropped_file",
                "description": "Semantic search inside large PDF/DOCX files dropped in current session.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": {"type": "string", "description": "Current active session ID."},
                        "query": {"type": "string", "description": "Search question or keywords."},
                        "file_name": {"type": "string", "description": "Optional file name filter."}
                    },
                    "required": ["session_id", "query"]
                }
            }
        },
    ] + get_note_tool_schemas() + get_media_control_tool_schemas() + get_web_tool_schemas() + get_spotify_tool_schemas() + get_clock_tool_schemas()
    return filter_tool_schemas(schemas, enabled_groups, disabled_tools)


def execute_tool(
    name: str,
    arguments: Dict[str, Any],
    enabled_groups: Optional[Iterable[str]] = None,
    disabled_tools: Optional[Iterable[str]] = None,
) -> str:
    """Dispatches tool execution deterministically.

    The loadout is a second gate behind schema filtering: a model can invent a
    tool name or reuse one from earlier in the conversation, so disabled tools
    must be rejected here as well.
    """
    if name in set(normalize_disabled_tools(disabled_tools)):
        return f"Error: Tool '{name}' is disabled in Settings -> Tools."
    if enabled_groups is not None:
        group = tool_permission(name).group
        if group in TOOL_GROUP_IDS and group not in set(
            normalize_enabled_tool_groups(enabled_groups)
        ):
            return f"Error: Tool '{name}' is disabled in Settings -> Tools."
    fn = TOOL_DISPATCH.get(name)
    if not fn:
        return f"Error: Tool '{name}' not found."
    try:
        result = fn(**arguments)
        return str(result)
    except Exception as e:
        return f"Error executing tool '{name}': {str(e)}"


def tool_group_summary(
    enabled_groups: Optional[Iterable[str]] = None,
    disabled_tools: Optional[Iterable[str]] = None,
) -> Dict[str, Any]:
    """Returns per-group tool counts, token costs, and the current selection."""
    enabled = set(normalize_enabled_tool_groups(enabled_groups))
    blocked = set(normalize_disabled_tools(disabled_tools))
    schemas = get_openai_tool_schemas()

    groups: List[Dict[str, Any]] = []
    total_tools = 0
    total_tokens = 0
    enabled_tools = 0
    enabled_tokens = 0
    for group_id in TOOL_GROUP_IDS:
        entries: List[Dict[str, Any]] = []
        group_tokens = 0
        group_enabled_tools = 0
        for schema in schemas:
            function = schema.get("function") or {}
            name = str(function.get("name") or "")
            if tool_permission(name).group != group_id:
                continue
            tokens = max(1, len(json.dumps(schema)) // 4)
            is_enabled = group_id in enabled and name not in blocked
            entries.append({
                "name": name,
                "risk": tool_permission(name).risk,
                "tokens": tokens,
                "enabled": is_enabled,
            })
            group_tokens += tokens
            if is_enabled:
                group_enabled_tools += 1
        groups.append({
            "id": group_id,
            "label": TOOL_GROUP_LABELS[group_id],
            "hint": TOOL_GROUP_HINTS[group_id],
            "tokens": group_tokens,
            "enabled": group_id in enabled,
            "tools": entries,
        })
        total_tools += len(entries)
        total_tokens += group_tokens
        enabled_tools += group_enabled_tools
        enabled_tokens += sum(
            entry["tokens"] for entry in entries if entry["enabled"]
        )

    return {
        "groups": groups,
        "total_tools": total_tools,
        "total_tokens": total_tokens,
        "enabled_tools": enabled_tools,
        "enabled_tokens": enabled_tokens,
        "lean_groups": list(LEAN_ENABLED_TOOL_GROUPS),
    }
