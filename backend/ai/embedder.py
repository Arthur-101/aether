"""
Aether Vector Embedder
CPU-only embedding generation using fastembed (BAAI/bge-small-en-v1.5, 384 dimensions).
Uses 0 VRAM and provides lazy-loaded serialization for sqlite-vec.
"""

import struct
from typing import List, Optional

_embedder = None
MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBEDDING_DIM = 384


def get_embedder():
    """Lazy loader for fastembed to guarantee non-blocking backend initialization."""
    global _embedder
    if _embedder is None:
        from fastembed import TextEmbedding
        _embedder = TextEmbedding(
            model_name=MODEL_NAME,
            providers=["CPUExecutionProvider"]
        )
    return _embedder


def serialize_f32(vector: List[float]) -> bytes:
    """Packs a float list into raw little-endian IEEE-754 bytes for sqlite-vec."""
    return struct.pack(f"{len(vector)}f", *vector)


def embed_text(text: str) -> bytes:
    """Embeds a single string into raw 384-dimensional float32 bytes."""
    embedder = get_embedder()
    vec = list(embedder.embed([text]))[0].tolist()
    return serialize_f32(vec)


def embed_texts(texts: List[str]) -> List[bytes]:
    """Batch embeds a list of strings into raw float32 byte arrays."""
    if not texts:
        return []
    embedder = get_embedder()
    embeddings = list(embedder.embed(texts))
    return [serialize_f32(vec.tolist()) for vec in embeddings]
