"""
Aether Vector Embedder
CPU-only embedding generation using fastembed (BAAI/bge-small-en-v1.5, 384 dimensions).
Uses 0 VRAM and provides lazy-loaded serialization for sqlite-vec.
"""

import struct
import threading
from typing import List

from ..resource_lifecycle import embedding_activity, note_embedding_loaded

_embedder = None
_lock = threading.Lock()
MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBEDDING_DIM = 384


def get_embedder():
    """Lazy loader for fastembed to guarantee non-blocking backend initialization.

    Double-checked locking so a burst of concurrent memory lookups loads the
    model once, not once per thread.
    """
    global _embedder
    if _embedder is None:
        with _lock:
            if _embedder is None:
                from fastembed import TextEmbedding

                _embedder = TextEmbedding(
                    model_name=MODEL_NAME,
                    providers=["CPUExecutionProvider"],
                )
                note_embedding_loaded()
    return _embedder


def is_loaded() -> bool:
    """Whether the embedding model is currently resident in memory."""
    return _embedder is not None


def release() -> bool:
    """Drops the embedding model so its memory can be reclaimed.

    The next :func:`get_embedder` reloads it from the local cache. Returns
    ``True`` when a model was actually released. Called by the idle-unload loop,
    which never runs while an embed is active.
    """
    global _embedder
    with _lock:
        if _embedder is None:
            return False
        _embedder = None
    return True


def serialize_f32(vector: List[float]) -> bytes:
    """Packs a float list into raw little-endian IEEE-754 bytes for sqlite-vec."""
    return struct.pack(f"{len(vector)}f", *vector)


def embed_text(text: str) -> bytes:
    """Embeds a single string into raw 384-dimensional float32 bytes."""
    with embedding_activity():
        embedder = get_embedder()
        vec = list(embedder.embed([text]))[0].tolist()
        return serialize_f32(vec)


def embed_texts(texts: List[str]) -> List[bytes]:
    """Batch embeds a list of strings into raw float32 byte arrays."""
    if not texts:
        return []
    with embedding_activity():
        embedder = get_embedder()
        embeddings = list(embedder.embed(texts))
        return [serialize_f32(vec.tolist()) for vec in embeddings]
