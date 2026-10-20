"""
Aether FastMCP Server & Tool Registry
Exposes deterministic media, document RAG, and clock scheduling tools to the LLM.
Translates FastMCP tool definitions into OpenAI/GGUF function schemas.
"""

from typing import Any, Callable, Dict, List
from fastmcp import FastMCP
from .media_tools import (
    add_background,
    compress_media,
    convert_image_format,
    crop_image,
    remove_image_background,
    strip_image_metadata,
)
from .doc_tools import convert_document, search_dropped_file
from .clock_scheduler import (
    schedule_custom_task,
    schedule_one_time_task,
    schedule_recurring_routine,
)

# FastMCP Server Instance
mcp = FastMCP("AetherTools")

# Register FastMCP tools
mcp.tool()(convert_image_format)
mcp.tool()(compress_media)
mcp.tool()(strip_image_metadata)
mcp.tool()(remove_image_background)
mcp.tool()(convert_document)
mcp.tool()(search_dropped_file)
mcp.tool()(schedule_one_time_task)
mcp.tool()(schedule_recurring_routine)
mcp.tool()(schedule_custom_task)

# Tool Dispatch Table
TOOL_DISPATCH: Dict[str, Callable[..., Any]] = {
    "convert_image_format": convert_image_format,
    "compress_media": compress_media,
    "strip_image_metadata": strip_image_metadata,
    "remove_image_background": remove_image_background,
    "convert_document": convert_document,
    "search_dropped_file": search_dropped_file,
    "schedule_one_time_task": schedule_one_time_task,
    "schedule_recurring_routine": schedule_recurring_routine,
    "schedule_custom_task": schedule_custom_task,
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


def get_openai_tool_schemas() -> List[Dict[str, Any]]:
    """Returns OpenAI/GGUF function calling schemas for the local LLM."""
    return [
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
                "name": "remove_image_background",
                "description": "Remove background from an image and save as transparent PNG.",
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
        {
            "type": "function",
            "function": {
                "name": "schedule_one_time_task",
                "description": "Schedule a future task for the AI at an exact date/time.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": {"type": "string", "description": "Current session ID."},
                        "run_at_iso": {"type": "string", "description": "ISO 8601 string, e.g. 2026-10-19T09:00:00."},
                        "task_prompt": {"type": "string", "description": "Task instruction to execute."}
                    },
                    "required": ["session_id", "run_at_iso", "task_prompt"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "schedule_recurring_routine",
                "description": "Schedule a daily recurring routine at specific hour and minute.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": {"type": "string", "description": "Current session ID."},
                        "hour": {"type": "integer", "description": "Hour in 24h format (0-23)."},
                        "minute": {"type": "integer", "description": "Minute (0-59)."},
                        "routine_prompt": {"type": "string", "description": "Routine instruction to execute."}
                    },
                    "required": ["session_id", "hour", "minute", "routine_prompt"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "schedule_custom_task",
                "description": "Schedule a daily task that stops after an exact end date/time.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": {"type": "string", "description": "Current session ID."},
                        "start_at_iso": {"type": "string", "description": "First run ISO 8601 date/time."},
                        "end_at_iso": {"type": "string", "description": "Last boundary ISO 8601 date/time."},
                        "task_prompt": {"type": "string", "description": "Task instruction to execute."}
                    },
                    "required": ["session_id", "start_at_iso", "end_at_iso", "task_prompt"]
                }
            }
        }
    ]


def execute_tool(name: str, arguments: Dict[str, Any]) -> str:
    """Dispatches tool execution deterministically."""
    fn = TOOL_DISPATCH.get(name)
    if not fn:
        return f"Error: Tool '{name}' not found."
    try:
        result = fn(**arguments)
        return str(result)
    except Exception as e:
        return f"Error executing tool '{name}': {str(e)}"
