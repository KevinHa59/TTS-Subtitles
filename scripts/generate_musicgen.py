import json
import math
import os
import shutil
import sys
import wave
from pathlib import Path


MODEL_REPO = "facebook/musicgen-small"
MAX_CHUNK_SECONDS = 25
TOKENS_PER_SECOND = 50


def emit_progress(percent: int, stage: str, message: str) -> None:
    print(
        json.dumps(
            {"type": "progress", "percent": percent, "stage": stage, "message": message},
            ensure_ascii=True,
        ),
        flush=True,
    )


def load_model(model_dir: Path, checkpoint_path: Path, cpu_threads: int):
    try:
        import torch
        from huggingface_hub import snapshot_download
        from transformers import AutoProcessor, MusicgenForConditionalGeneration
    except ImportError as error:
        raise RuntimeError(
            "Thiếu thư viện AI. Hãy cài bằng: "
            "python -m pip install -r requirements-bgm.txt"
        ) from error

    torch.set_num_threads(cpu_threads)
    torch.set_num_interop_threads(max(1, min(4, cpu_threads // 4)))

    if not checkpoint_path.is_file():
        raise RuntimeError(f"Không tìm thấy weights MusicGen: {checkpoint_path}")

    model_dir.mkdir(parents=True, exist_ok=True)
    required_metadata = (
        "config.json",
        "generation_config.json",
        "preprocessor_config.json",
        "special_tokens_map.json",
        "spiece.model",
        "tokenizer_config.json",
        "tokenizer.json",
    )
    if any(not (model_dir / asset).is_file() for asset in required_metadata):
        emit_progress(5, "metadata", "Đang tải metadata và tokenizer MusicGen lần đầu...")
        try:
            snapshot_download(
                repo_id=MODEL_REPO,
                local_dir=str(model_dir),
                allow_patterns=[
                    "*.json",
                    "*.model",
                    "*.txt",
                    "*.tiktoken",
                    "*.vocab",
                    "*.merges",
                ],
                ignore_patterns=["*.safetensors", "*.bin", "*.pt", "*.onnx"],
            )
        except Exception as error:
            raise RuntimeError(
                "Không tải được metadata MusicGen từ Hugging Face. "
                "Kiểm tra kết nối mạng rồi chạy lại; các file metadata "
                f"được lưu tại {model_dir}. Chi tiết: {error}"
            ) from error

    emit_progress(12, "loading", "Đang nạp tokenizer và weights MusicGen vào RAM...")
    model_weights = model_dir / "model.safetensors"
    if not model_weights.is_file():
        try:
            os.link(checkpoint_path, model_weights)
        except OSError:
            shutil.copy2(checkpoint_path, model_weights)

    try:
        processor = AutoProcessor.from_pretrained(
            str(model_dir),
            local_files_only=True,
        )
        model = MusicgenForConditionalGeneration.from_pretrained(
            str(model_dir),
            local_files_only=True,
            low_cpu_mem_usage=True,
            use_safetensors=True,
            torch_dtype=torch.float32,
        )
    except Exception as error:
        raise RuntimeError(
            "Không thể nạp MusicGen từ weights và metadata cục bộ. "
            f"Kiểm tra file model.safetensors trong {model_dir}. Chi tiết: {error}"
        ) from error

    model.eval()
    emit_progress(
        25,
        "loading",
        f"Đã nạp MusicGen; đang dùng {cpu_threads} luồng CPU để sinh nhạc...",
    )
    return torch, processor, model


def write_wave(output_path: Path, audio, sample_rate: int) -> None:
    import numpy as np

    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim == 1:
        audio = audio[np.newaxis, :]
    if audio.ndim != 2 or audio.shape[0] < 1:
        raise RuntimeError(f"MusicGen trả về audio có shape không hợp lệ: {audio.shape}")

    audio = np.nan_to_num(audio, copy=False)
    audio = np.clip(audio, -1.0, 1.0)
    pcm = (audio.T * 32767.0).astype("<i2", copy=False)

    with wave.open(str(output_path), "wb") as output:
        output.setnchannels(pcm.shape[1])
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(pcm.tobytes())


def generate(request: dict) -> None:
    import numpy as np

    prompt = str(request.get("prompt", "")).strip()
    duration = float(request.get("duration", 0))
    available_threads = max(1, os.cpu_count() or 1)
    requested_threads = int(request.get("cpuThreads", min(12, available_threads)))
    cpu_threads = max(1, min(available_threads, requested_threads))
    model_dir = Path(request["modelDir"]).resolve()
    output_path = Path(request["outputPath"]).resolve()
    checkpoint_path = model_dir / "musicgen_small_weights.bin"

    if not prompt:
        raise RuntimeError("Prompt nhạc nền không được để trống.")
    if not math.isfinite(duration) or duration <= 0 or duration > 184:
        raise RuntimeError(f"Thời lượng MusicGen không hợp lệ: {duration}")

    emit_progress(
        3,
        "loading",
        f"Đang dùng {cpu_threads}/{available_threads} luồng CPU; nạp MusicGen...",
    )
    hf_model_dir = model_dir / "hf_model"
    torch, processor, model = load_model(hf_model_dir, checkpoint_path, cpu_threads)
    sample_rate = int(
        getattr(getattr(model.config, "audio_encoder", None), "sampling_rate", 32000)
    )
    target_samples = round(duration * sample_rate)
    chunk_count = math.ceil(duration / MAX_CHUNK_SECONDS)
    generated_chunks = []

    for chunk_index in range(chunk_count):
        chunk_start = chunk_index * MAX_CHUNK_SECONDS
        chunk_duration = min(MAX_CHUNK_SECONDS, duration - chunk_start)
        max_new_tokens = max(1, math.ceil(chunk_duration * TOKENS_PER_SECOND))
        inputs = processor(
            text=[prompt],
            padding=True,
            return_tensors="pt",
        )
        prompt_tokens = inputs["input_ids"].shape[-1]
        last_progress_at = [0]

        try:
            from transformers import LogitsProcessor, LogitsProcessorList
        except ImportError as error:
            raise RuntimeError(
                "Phiên bản Transformers thiếu LogitsProcessor; "
                "hãy cài lại requirements-bgm.txt."
            ) from error

        class GenerationProgress(LogitsProcessor):
            def __call__(self, input_ids, scores):
                generated_tokens = max(0, input_ids.shape[-1] - prompt_tokens)
                chunk_progress = min(1.0, generated_tokens / max_new_tokens)
                overall_progress = (chunk_index + chunk_progress) / chunk_count
                percent = 25 + round(overall_progress * 55)
                if percent > last_progress_at[0]:
                    last_progress_at[0] = percent
                    emit_progress(
                        percent,
                        "generating",
                        f"Đang sinh nhạc bằng MusicGen: đoạn {chunk_index + 1}/{chunk_count}, "
                        f"token {min(generated_tokens, max_new_tokens)}/{max_new_tokens}",
                    )
                return scores

        emit_progress(
            25 + round((chunk_index / chunk_count) * 55),
            "generating",
            f"Đang sinh nhạc bằng MusicGen: bắt đầu đoạn {chunk_index + 1}/{chunk_count}...",
        )
        with torch.inference_mode():
            audio_values = model.generate(
                **inputs,
                do_sample=True,
                guidance_scale=3.0,
                min_new_tokens=max_new_tokens,
                max_new_tokens=max_new_tokens,
                logits_processor=LogitsProcessorList([GenerationProgress()]),
            )

        chunk = audio_values[0].detach().to("cpu", dtype=torch.float32).numpy()
        if chunk.ndim == 1:
            chunk = chunk[np.newaxis, :]
        expected_samples = round(chunk_duration * sample_rate)
        if chunk.shape[-1] < expected_samples:
            missing_samples = expected_samples - chunk.shape[-1]
            if missing_samples > round(0.25 * sample_rate):
                raise RuntimeError(
                    "MusicGen tạo audio ngắn hơn yêu cầu "
                    f"({chunk.shape[-1] / sample_rate:.2f}s / {chunk_duration:.2f}s)."
                )
            tail_length = min(chunk.shape[-1], round(0.1 * sample_rate))
            tail = chunk[..., -tail_length:]
            repeats = math.ceil(missing_samples / tail_length)
            chunk = np.concatenate(
                [chunk, np.tile(tail, (1, repeats))[..., :missing_samples]],
                axis=-1,
            )
        generated_chunks.append(chunk[..., :expected_samples])
        emit_progress(
            25 + round(((chunk_index + 1) / chunk_count) * 55),
            "generating",
            f"Đã sinh xong đoạn {chunk_index + 1}/{chunk_count}.",
        )

    audio = np.concatenate(generated_chunks, axis=-1)[..., :target_samples]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    emit_progress(84, "encoding", "Đang ghi audio MusicGen ra WAV...")
    write_wave(output_path, audio, sample_rate)
    emit_progress(90, "encoding", "Đã ghi WAV; chuẩn bị chuẩn hóa và xuất audio...")


def main() -> int:
    try:
        request = json.load(sys.stdin)
        generate(request)
        return 0
    except Exception as error:
        print(f"MusicGen error: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
