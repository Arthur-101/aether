"""
Aether STT Worker
Runs Phonon-2 inside the isolated runtime in ``aether/bin/stt-runtime``.

The Aether backend never imports torch. This process loads the model once and
answers newline-delimited JSON requests on stdin until its parent closes the
pipe. Protocol lines are prefixed so runtime logs on stdout cannot be mistaken
for responses.
"""

import base64
import json
import sys
from typing import Any, Dict

PREFIX = "@@AETHER_STT@@ "


def _emit(payload: Dict[str, Any]) -> None:
    sys.stdout.write(PREFIX + json.dumps(payload) + "\n")
    sys.stdout.flush()


def main() -> int:
    if len(sys.argv) < 2:
        _emit({"event": "fatal", "error": "model directory argument missing"})
        return 2

    model_dir = sys.argv[1]
    try:
        import fermion  # type: ignore[import-not-found]
        import numpy as np

        speech = fermion.load_speech(model_dir)
    except Exception as exc:  # pragma: no cover - depends on external runtime
        _emit({
            "event": "fatal",
            "error": f"{type(exc).__name__}: {exc}",
        })
        return 1

    _emit({"event": "ready"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            raw = base64.b64decode(request["audio"], validate=True)
            audio = np.frombuffer(raw, dtype=np.float32).copy()
            text, decode_s, audio_s = speech.transcribe_array(audio)
            _emit({
                "id": request_id,
                "text": text or "",
                "decode_s": round(float(decode_s), 3),
                "audio_s": round(float(audio_s), 3),
            })
        except Exception as exc:
            _emit({
                "id": request_id,
                "error": f"{type(exc).__name__}: {exc}",
            })

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
