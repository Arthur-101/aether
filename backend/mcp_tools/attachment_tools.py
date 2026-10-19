"""
Aether ASK Attachment Pipeline
Extracts text from documents, splits large files into 400-token chunks with
50-token overlap, embeds them for sqlite-vec, and tags images for VLM prompts.
"""

from pathlib import Path
from typing import Any, Dict, List

from ..db.attachments import list_attachments, remove_attachment, upsert_attachment
from ..db.database import get_db
from ..ai.embedder import embed_text

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
TEXT_EXTENSIONS = {".pdf", ".txt", ".md", ".docx", ".py", ".js", ".json", ".csv"}
ASK_EXTENSIONS = IMAGE_EXTENSIONS | TEXT_EXTENSIONS

CHUNK_CHARS = 1600  # ~400 tokens at 4 chars/token
OVERLAP_CHARS = 200  # ~50 tokens


def is_ask_eligible(file_path: str) -> bool:
    return Path(file_path).suffix.lower() in ASK_EXTENSIONS


def _extract_text(path: Path) -> str:
    """Reads PDF/DOCX/text files into plain text."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        import pymupdf4llm

        return pymupdf4llm.to_markdown(str(path))
    if suffix == ".docx":
        try:
            from docx import Document

            return "\n".join(paragraph.text for paragraph in Document(str(path)).paragraphs)
        except ImportError:
            from markitdown import MarkItDown

            return MarkItDown().convert(str(path)).text_content
    return path.read_text(encoding="utf-8", errors="replace")


def _chunk_text(text: str) -> List[str]:
    """Splits text into 400-token windows with a 50-token overlap."""
    chunks: List[str] = []
    start = 0
    length = len(text)
    while start < length:
        end = min(length, start + CHUNK_CHARS)
        if end < length:
            boundary = text.rfind(" ", start + CHUNK_CHARS - 200, end)
            if boundary > start:
                end = boundary
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= length:
            break
        start = max(end - OVERLAP_CHARS, start + 1)
    return chunks


def _store_chunks(session_id: str, path: Path, chunks: List[str]) -> None:
    conn = get_db()
    try:
        cur = conn.cursor()
        for index, chunk in enumerate(chunks):
            cur.execute(
                """INSERT INTO doc_chunks (session_id, file_name, file_path, chunk_index, chunk_text)
                   VALUES (?, ?, ?, ?, ?)""",
                (session_id, path.name, str(path), index, chunk),
            )
            cur.execute(
                "INSERT INTO vec_doc_chunks (chunk_id, embedding) VALUES (?, ?)",
                (cur.lastrowid, embed_text(chunk)),
            )
        conn.commit()
    finally:
        conn.close()


def attach_file_for_ask(session_id: str, file_path: str) -> Dict[str, Any]:
    """Attaches a document or image to the session for the next user question."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    if not is_ask_eligible(str(path)):
        raise ValueError(f"ASK does not support {path.suffix or 'this file type'} files.")

    if path.suffix.lower() in IMAGE_EXTENSIONS:
        upsert_attachment(session_id, path.name, str(path), "image")
        return {
            "file_name": path.name,
            "file_path": str(path),
            "mode": "image",
            "chunks": 0,
            "token_count": 0,
        }

    remove_attachment(session_id, str(path))
    try:
        text = _extract_text(path)
        token_count = len(text) // 4
        if token_count <= 1500:
            upsert_attachment(
                session_id, path.name, str(path), "inline", text, token_count, 0
            )
            return {
                "file_name": path.name,
                "file_path": str(path),
                "mode": "inline",
                "chunks": 0,
                "token_count": token_count,
            }

        chunks = _chunk_text(text)
        _store_chunks(session_id, path, chunks)
        upsert_attachment(
            session_id, path.name, str(path), "rag_vector", "", token_count, len(chunks)
        )
        return {
            "file_name": path.name,
            "file_path": str(path),
            "mode": "rag_vector",
            "chunks": len(chunks),
            "token_count": token_count,
        }
    except Exception:
        remove_attachment(session_id, str(path))
        raise


def image_attachment_paths(session_id: str) -> List[str]:
    """Returns absolute paths of images attached to the active session."""
    return [
        row["file_path"]
        for row in list_attachments(session_id)
        if row.get("mode") == "image"
    ]


def _query_session_chunks(session_id: str, query: str, k: int = 4) -> List[Any]:
    """Returns the top k semantically matching chunks for the session."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            f"""SELECT dc.file_name, dc.chunk_index, dc.chunk_text, v.distance
               FROM vec_doc_chunks v
               JOIN doc_chunks dc ON dc.id = v.chunk_id
               WHERE dc.session_id = ? AND v.embedding MATCH ? AND k = {int(k)}
               ORDER BY v.distance ASC""",
            (session_id, embed_text(query)),
        )
        return cur.fetchall()
    finally:
        conn.close()


def build_attachment_context(session_id: str, query: str) -> str:
    """Builds the ASK context injected before each prompt in the session."""
    rows = list_attachments(session_id, include_text=True)
    if not rows:
        return ""

    parts: List[str] = []
    inline_blocks = [
        f"[Attached File: {row['file_name']}]\n{row.get('inline_text', '')}"
        for row in rows
        if row.get("mode") == "inline" and row.get("inline_text")
    ]
    if inline_blocks:
        parts.append("\n\n".join(inline_blocks))

    image_names = [row["file_name"] for row in rows if row.get("mode") == "image"]
    if image_names:
        parts.append(
            "[Attached Images]\n"
            + ", ".join(image_names)
            + "\nAnalyze the attached image(s) when answering the user."
        )

    if query and any(row.get("mode") == "rag_vector" for row in rows):
        chunks = _query_session_chunks(session_id, query)
        if chunks:
            blocks = [
                f"[{row['file_name']} - Chunk {row['chunk_index']}]\n{row['chunk_text']}"
                for row in chunks
            ]
            parts.append("[Attached File RAG Matches]\n" + "\n\n---\n\n".join(blocks))

    return "\n\n".join(parts)
