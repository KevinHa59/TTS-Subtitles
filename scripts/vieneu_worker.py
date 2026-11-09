#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Persistent VieNeu worker. JSON-lines protocol on stdin/stdout."""

import contextlib
import json
import os
import subprocess
import sys
import traceback
from pathlib import Path


def resolve_model_file(model_dir: Path):
    preferred = [
        "vieneu-v3-turbo-q8_0.gguf",
        "vieneu-v3-turbo-bf16.gguf",
        "vieneu-v3-turbo.gguf",
        "model.gguf",
    ]
    for name in preferred:
        candidate = model_dir / name
        if candidate.is_file() and candidate.stat().st_size > 1000:
            return candidate
    for candidate in model_dir.glob("*.gguf"):
        if candidate.is_file() and candidate.stat().st_size > 1000:
            return candidate
    return None


def synthesize(tts, request):
    output = Path(request["output"]).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    voice = str(request["voice"]).replace("vieneu:", "", 1).strip()
    audio = tts.infer(str(request["text"]), voice=voice)
    tts.save(audio, str(output))

    if output.exists():
        temporary = output.parent / f"temp_{output.name}"
        output.rename(temporary)
        try:
            speed = float(request.get("speed", 1.0))
            filters = []
            if abs(speed - 1.0) > 0.02:
                remaining = speed
                while remaining > 2.0:
                    filters.append("atempo=2.0")
                    remaining /= 2.0
                while remaining < 0.5:
                    filters.append("atempo=0.5")
                    remaining /= 0.5
                filters.append(f"atempo={remaining:.3f}")

            command = ["ffmpeg", "-y", "-i", str(temporary)]
            if filters:
                command.extend(["-filter:a", ",".join(filters)])
            command.extend(["-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", str(output)])
            subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            temporary.unlink(missing_ok=True)
        except Exception:
            if not output.exists() and temporary.exists():
                temporary.rename(output)
            raise


def main():
    project_root = Path(__file__).resolve().parent.parent
    model_dir = project_root / os.environ.get("VIENEU_MODEL_DIR", "models/vieneu")
    model_file = resolve_model_file(model_dir)
    init_kwargs = {"model_path": str(model_file)} if model_file else {}

    # Keep model/library chatter off stdout, which is reserved for protocol messages.
    with contextlib.redirect_stdout(sys.stderr):
        from vieneu import Vieneu
        tts = Vieneu(**init_kwargs)
    print(json.dumps({"ready": True}), flush=True)

    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            with contextlib.redirect_stdout(sys.stderr):
                synthesize(tts, request)
            response = {"id": request["id"], "ok": True}
        except Exception as error:
            response = {"id": request.get("id") if isinstance(request, dict) else None,
                        "ok": False, "error": str(error)}
            traceback.print_exc(file=sys.stderr)
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
