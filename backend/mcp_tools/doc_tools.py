"""
Aether Document & RAG Tools
Deterministic PDF/document conversion, chunking, and session-scoped semantic search.
Uses PyMuPDF (fitz), pdf2docx, pymupdf4llm, MarkItDown, and sqlite-vec.
"""

from pathlib import Path
from typing import Any, Dict, List
import fitz  # PyMuPDF
from ..db.database import get_db
from ..ai.embedder import embed_text
from ..output_paths import exported_path
from .attachment_tools import (  # re-exported for the ASK pipeline
    ASK_EXTENSIONS,
    is_ask_eligible,
    attach_file_for_ask,
    build_attachment_context,
    image_attachment_paths,
)


def convert_document(file_path: str, target_format: str) -> str:
    """
    Converts a PDF to DOCX, JPG, PNG, or TXT.
    target_format: 'docx', 'jpg', 'png', 'txt'
    """
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Document not found: {file_path}")

    fmt = target_format.lower().strip(".")
    if p.suffix.lower() == ".pdf":
        if fmt == "docx":
            from pdf2docx import Converter
            out_path = exported_path(p, f"{p.stem}.docx")
            cv = Converter(str(p))
            cv.convert(str(out_path))
            cv.close()
            return str(out_path)

        elif fmt in ("jpg", "png"):
            doc = fitz.open(str(p))
            page = doc.load_page(0)
            pix = page.get_pixmap(dpi=200)
            out_path = exported_path(p, f"{p.stem}.{fmt}")
            pix.save(str(out_path))
            doc.close()
            return str(out_path)

        elif fmt == "txt":
            import pymupdf4llm
            out_path = exported_path(p, f"{p.stem}.txt")
            md_text = pymupdf4llm.to_markdown(str(p))
            out_path.write_text(md_text, encoding="utf-8")
            return str(out_path)

    return f"Unsupported conversion from {p.suffix} to {fmt}"


def ingest_file_for_rag(session_id: str, file_path: str) -> Dict[str, Any]:
    """
    Ingests dropped text/PDF/DOCX file:
    - If < 1200 words: Returns inline text for immediate prompt context.
    - If >= 1200 words: Chunks into 350-word segments and writes to vec_doc_chunks.
    """
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Document not found: {file_path}")

    if p.suffix.lower() == ".pdf":
        import pymupdf4llm
        text = pymupdf4llm.to_markdown(str(p))
    else:
        from markitdown import MarkItDown
        md = MarkItDown()
        text = md.convert(str(p)).text_content

    words = text.split()
    if len(words) < 1200:
        return {"mode": "inline", "file_name": p.name, "content": text}

    # Chunking: 350-word blocks with 50-word overlap
    chunks: List[str] = []
    step = 300
    for i in range(0, len(words), step):
        chunk = " ".join(words[i:i + 350])
        if chunk.strip():
            chunks.append(chunk)

    conn = get_db()
    cur = conn.cursor()
    for idx, chunk_str in enumerate(chunks):
        cur.execute("""
            INSERT INTO doc_chunks (session_id, file_name, file_path, chunk_index, chunk_text)
            VALUES (?, ?, ?, ?, ?)
        """, (session_id, p.name, str(p), idx, chunk_str))
        chunk_id = cur.lastrowid
        vec_bytes = embed_text(chunk_str)
        cur.execute(
            "INSERT INTO vec_doc_chunks (chunk_id, embedding) VALUES (?, ?)",
            (chunk_id, vec_bytes)
        )

    conn.commit()
    conn.close()
    return {"mode": "indexed", "file_name": p.name, "total_chunks": len(chunks)}


def search_dropped_file(session_id: str, query: str, file_name: str = "") -> str:
    """
    Semantic search inside large PDF/DOCX/TXT files dropped into the current session.
    Returns the top 4 most relevant chunks.
    """
    conn = get_db()
    cur = conn.cursor()
    q_vec = embed_text(query)

    if file_name:
        cur.execute("""
            SELECT dc.file_name, dc.chunk_index, dc.chunk_text, v.distance
            FROM vec_doc_chunks v
            JOIN doc_chunks dc ON dc.id = v.chunk_id
            WHERE dc.session_id = ? AND dc.file_name LIKE ?
              AND v.embedding MATCH ? AND k = 4
            ORDER BY v.distance ASC
        """, (session_id, f"%{file_name}%", q_vec))
    else:
        cur.execute("""
            SELECT dc.file_name, dc.chunk_index, dc.chunk_text, v.distance
            FROM vec_doc_chunks v
            JOIN doc_chunks dc ON dc.id = v.chunk_id
            WHERE dc.session_id = ?
              AND v.embedding MATCH ? AND k = 4
            ORDER BY v.distance ASC
        """, (session_id, q_vec))

    rows = cur.fetchall()
    conn.close()
    if not rows:
        return "No matching sections found in dropped files."

    blocks = [
        f"[{r['file_name']} - Chunk {r['chunk_index']} (dist: {r['distance']:.3f})]\n{r['chunk_text']}"
        for r in rows
    ]
    return "\n\n---\n\n".join(blocks)
