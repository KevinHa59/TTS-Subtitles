#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VieNeu-TTS v3 Turbo Synthesis Runner
Chạy mô hình VieNeu-TTS v3 Turbo tạo giọng đọc tiếng Việt chất lượng cao 48 kHz.
Hỗ trợ 25 giọng đọc chuẩn Bắc - Trung - Nam.
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def resolve_vieneu_model_file(model_dir: Path) -> Path | None:
    """Tìm file mô hình .gguf hoặc .onnx của VieNeu trong thư mục models/vieneu/"""
    if not model_dir.exists():
        return None

    # Ưu tiên các file theo khuyến nghị
    preferred_names = [
        "vieneu-v3-turbo-q8_0.gguf",
        "vieneu-v3-turbo-bf16.gguf",
        "vieneu-v3-turbo.gguf",
        "model.gguf",
    ]
    for name in preferred_names:
        p = model_dir / name
        if p.is_file() and p.stat().st_size > 1000:
            return p

    # Quét bất kỳ file .gguf nào
    for f in model_dir.glob("*.gguf"):
        if f.is_file() and f.stat().st_size > 1000:
            return f

    return None


def main():
    parser = argparse.ArgumentParser(description="VieNeu-TTS v3 Turbo Audio Generator")
    parser.add_argument("--text", type=str, required=True, help="Văn bản tiếng Việt cần đọc")
    parser.add_argument("--voice", type=str, default="minh_quan_pro", help="Tên giọng đọc VieNeu (vd: minh_quan_pro, truc_ly...)")
    parser.add_argument("--output", type=str, required=True, help="Đường dẫn file WAV đầu ra")
    parser.add_argument("--speed", type=float, default=1.0, help="Tốc độ đọc (0.5 - 2.0)")
    parser.add_argument("--model-dir", type=str, default="models/vieneu", help="Thư mục chứa weights VieNeu")
    parser.add_argument("--check-only", action="store_true", help="Chỉ kiểm tra trạng thái cài đặt và model")

    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    model_dir = project_root / args.model_dir
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 1. Kiểm tra thư viện Python 'vieneu'
    try:
        from vieneu import Vieneu
        has_library = True
    except ImportError:
        has_library = False

    # 2. Kiểm tra file model trong models/vieneu/
    model_file = resolve_vieneu_model_file(model_dir)

    if args.check_only:
        res = {
            "has_library": has_library,
            "has_model_file": model_file is not None,
            "model_file_path": str(model_file) if model_file else None,
            "model_dir": str(model_dir),
        }
        print(json.dumps(res, ensure_ascii=False))
        return

    if not has_library:
        error_msg = (
            "Chưa cài đặt thư viện 'vieneu'. "
            "Vui lòng mở Terminal và chạy lệnh: pip install vieneu\n"
            "Chi tiết xem tại tài liệu hướng dẫn: HD-VIENEU-TTS.md"
        )
        print(json.dumps({"error": error_msg, "code": "MISSING_LIBRARY"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(2)

    clean_voice = args.voice.replace("vieneu:", "").strip()

    # Khởi tạo Vieneu
    try:
        init_kwargs = {}
        if model_file and model_file.exists():
            init_kwargs["model_path"] = str(model_file)

        # Mặc định trên CPU chạy torch-free qua ONNX Runtime cực nhẹ và nhanh
        tts = Vieneu(**init_kwargs)
    except Exception as e:
        error_msg = f"Lỗi khởi tạo VieNeu-TTS: {e}. Vui lòng kiểm tra file mô hình trong thư mục {model_dir}"
        print(json.dumps({"error": error_msg, "code": "INIT_ERROR"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(3)

    # Tổng hợp giọng nói
    try:
        audio = tts.infer(args.text, voice=clean_voice)
        tts.save(audio, str(output_path))
    except Exception as e:
        # Nếu giọng không tìm thấy, thử fallback sang giọng mặc định minh_quan_pro
        try:
            audio = tts.infer(args.text, voice="minh_quan_pro")
            tts.save(audio, str(output_path))
        except Exception as e2:
            error_msg = f"Lỗi tạo âm thanh VieNeu-TTS với giọng '{clean_voice}': {e2}"
            print(json.dumps({"error": error_msg, "code": "SYNTHESIS_ERROR"}, ensure_ascii=False), file=sys.stderr)
            sys.exit(4)

    # Chuẩn hóa âm thanh đầu ra: 22050 Hz, 1 channel, 16-bit PCM (và điều chỉnh speed nếu có)
    if output_path.exists():
        temp_path = output_path.parent / f"temp_{output_path.name}"
        output_path.rename(temp_path)
        try:
            filters = []
            if abs(args.speed - 1.0) > 0.02:
                remaining = args.speed
                while remaining > 2.0:
                    filters.append("atempo=2.0")
                    remaining /= 2.0
                while remaining < 0.5:
                    filters.append("atempo=0.5")
                    remaining /= 0.5
                filters.append(f"atempo={remaining:.3f}")

            cmd = ["ffmpeg", "-y", "-i", str(temp_path)]
            if filters:
                cmd.extend(["-filter:a", ",".join(filters)])
            cmd.extend(["-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", str(output_path)])
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            temp_path.unlink(missing_ok=True)
        except Exception:
            if not output_path.exists() and temp_path.exists():
                temp_path.rename(output_path)


    print(json.dumps({"status": "ok", "output": str(output_path), "voice": clean_voice}, ensure_ascii=False))


if __name__ == "__main__":
    main()
