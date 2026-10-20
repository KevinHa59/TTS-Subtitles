import json
import math
import os
import sys
import wave
from pathlib import Path


MAX_CHUNK_SECONDS = 10
MAX_DURATION_SECONDS = 184


def emit_progress(percent: int, stage: str, message: str) -> None:
    print(
        json.dumps(
            {"type": "progress", "percent": percent, "stage": stage, "message": message},
            ensure_ascii=True,
        ),
        flush=True,
    )


def generate(request: dict) -> None:
    import numpy as np
    import torch
    from diffusers import AudioLDMPipeline

    prompt = str(request.get("prompt", "")).strip()
    duration = float(request.get("duration", 0))
    model_dir = Path(request["modelDir"]).resolve()
    output_path = Path(request["outputPath"]).resolve()
    available_threads = max(1, os.cpu_count() or 1)
    requested_threads = int(request.get("cpuThreads", min(12, available_threads)))
    cpu_threads = max(1, min(available_threads, requested_threads))

    if not prompt:
        raise RuntimeError("Prompt AudioLDM không được để trống.")
    if not math.isfinite(duration) or duration <= 0 or duration > MAX_DURATION_SECONDS:
        raise RuntimeError(f"Thời lượng AudioLDM không hợp lệ: {duration}")
    if not (model_dir / "model_index.json").is_file():
        raise RuntimeError(
            f"Không tìm thấy pipeline AudioLDM tại {model_dir}. "
            "Tải đầy đủ AudioLDM Soundscape trong phần Quản lý Model."
        )

    torch.set_num_threads(cpu_threads)
    torch.set_num_interop_threads(max(1, min(4, cpu_threads // 4)))
    emit_progress(
        3,
        "loading",
        f"Đang dùng {cpu_threads}/{available_threads} luồng CPU; nạp AudioLDM...",
    )

    try:
        pipeline = AudioLDMPipeline.from_pretrained(
            str(model_dir),
            local_files_only=True,
            use_safetensors=True,
            torch_dtype=torch.float32,
        )
        pipeline = pipeline.to("cpu")
        pipeline.enable_attention_slicing()
        pipeline.set_progress_bar_config(disable=True)
    except Exception as error:
        raise RuntimeError(
            "Không nạp được pipeline AudioLDM cục bộ. "
            "Kiểm tra requirements-bgm.txt và tải lại model nếu thiếu file. "
            f"Chi tiết: {error}"
        ) from error

    sample_rate = int(pipeline.vocoder.config.sampling_rate)
    chunk_count = math.ceil(duration / MAX_CHUNK_SECONDS)
    base_seed = int(request.get("seed", int.from_bytes(os.urandom(4), "little")))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    emit_progress(25, "loading", "Đã nạp AudioLDM; bắt đầu sinh soundscape...")

    with wave.open(str(output_path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)

        for chunk_index in range(chunk_count):
            chunk_duration = min(
                MAX_CHUNK_SECONDS,
                duration - chunk_index * MAX_CHUNK_SECONDS,
            )
            emit_progress(
                25 + round((chunk_index / chunk_count) * 60),
                "generating",
                f"Đang sinh soundscape AudioLDM: đoạn {chunk_index + 1}/{chunk_count}...",
            )
            generator = torch.Generator(device="cpu").manual_seed(base_seed + chunk_index)

            with torch.inference_mode():
                result = pipeline(
                    prompt,
                    audio_length_in_s=chunk_duration,
                    num_inference_steps=10,
                    guidance_scale=2.5,
                    num_waveforms_per_prompt=1,
                    generator=generator,
                )

            audio = np.asarray(result.audios[0], dtype=np.float32).reshape(-1)
            expected_samples = round(chunk_duration * sample_rate)
            if audio.size == 0 or not np.isfinite(audio).any():
                raise RuntimeError(
                    f"AudioLDM trả về audio rỗng hoặc không hợp lệ ở đoạn {chunk_index + 1}."
                )
            audio = np.nan_to_num(audio, copy=False)
            audio = audio[:expected_samples]
            if audio.size < expected_samples:
                audio = np.pad(audio, (0, expected_samples - audio.size))
            pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
            output.writeframes(pcm.tobytes())

            emit_progress(
                25 + round(((chunk_index + 1) / chunk_count) * 60),
                "generating",
                f"Đã sinh soundscape AudioLDM: {chunk_index + 1}/{chunk_count} đoạn.",
            )

    emit_progress(90, "encoding", "Đã ghi WAV AudioLDM; chuẩn bị xuất audio...")


def main() -> int:
    try:
        request = json.load(sys.stdin)
        generate(request)
        return 0
    except Exception as error:
        print(f"AudioLDM error: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
