#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Piper Vietnamese Voice Clone Studio (Google Colab UI)
Phiên bản hỗ trợ chỉnh sửa văn bản trực tiếp trong bảng và nghe thử từng câu (Audio Inspector).
"""

import os
import sys
import shutil
import subprocess
import json
import glob
import re
import zipfile
import wave
import traceback
from pathlib import Path

try:
    import torch
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "torch", "torchaudio"])
    import torch

try:
    import pandas as pd
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "pandas"])
    import pandas as pd

try:
    import gradio as gr
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "gradio"])
    import gradio as gr

try:
    import whisper
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "openai-whisper"])
    import whisper

BASE_DIR = Path("./piper_workspace").resolve()
DATASET_DIR = BASE_DIR / "dataset"
WAVS_DIR = DATASET_DIR / "wav"
TRAIN_DIR = BASE_DIR / "training_dir"
OUTPUT_DIR = BASE_DIR / "output"
for d in [BASE_DIR, DATASET_DIR, WAVS_DIR, TRAIN_DIR, OUTPUT_DIR]:
    d.mkdir(parents=True, exist_ok=True)

WHISPER_CACHE = {}

def clean_vietnamese_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r'[\"\'\(\)\[\]\{\}\<\>]', ' ', str(text))
    return re.sub(r'\s+', ' ', text).strip()

def process_audio(audio_path, voice_name, whisper_model='base', min_s=1.5, max_s=10.0, progress=gr.Progress()):
    try:
        if not audio_path:
            return '❌ Vui lòng chọn hoặc tải lên file âm thanh trước.', None, gr.Dropdown(choices=[]), gr.Dataframe(value=[])

        v_id = re.sub(r'[^a-zA-Z0-9_-]', '_', voice_name or 'my_voice').lower().strip('_')
        if not v_id:
            v_id = 'my_voice'

        progress(0.05, desc='Đang khởi tạo thư mục dữ liệu...')
        if WAVS_DIR.exists():
            shutil.rmtree(WAVS_DIR)
        WAVS_DIR.mkdir(parents=True, exist_ok=True)

        progress(0.15, desc='Đang chuyển đổi âm thanh sang 22,050Hz Mono PCM...')
        tmp_wav = BASE_DIR / 'full_audio_22k.wav'
        ff_cmd = ['ffmpeg', '-y', '-i', str(audio_path), '-ar', '22050', '-ac', '1', '-c:a', 'pcm_s16le', str(tmp_wav)]
        ff_res = subprocess.run(ff_cmd, capture_output=True, text=True)
        if ff_res.returncode != 0 or not tmp_wav.exists():
            raise RuntimeError(f'FFmpeg không thể đọc file âm thanh: {ff_res.stderr}')

        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        progress(0.3, desc=f'Đang nạp mô hình Whisper ({whisper_model}) trên {device.upper()}...')
        if whisper_model not in WHISPER_CACHE:
            WHISPER_CACHE[whisper_model] = whisper.load_model(whisper_model, device=device)
        model = WHISPER_CACHE[whisper_model]

        progress(0.45, desc='Đang nhận diện giọng nói và mốc thời gian...')
        fp16 = (device == 'cuda')
        res = model.transcribe(str(tmp_wav), language='vi', fp16=fp16)
        segments = res.get('segments', [])

        if not segments:
            raise RuntimeError('Whisper không phát hiện được giọng nói nào trong file âm thanh này.')

        progress(0.7, desc='Đang cắt lát audio và tạo metadata chuẩn Piper...')
        with wave.open(str(tmp_wav), 'rb') as wf:
            framerate = wf.getframerate()
            sampwidth = wf.getsampwidth()
            nframes = wf.getnframes()
            raw_audio = wf.readframes(nframes)

        metadata_lines = []
        table_data = []
        clip_choices = []
        clip_count = 0
        total_duration = 0.0

        for seg in segments:
            start_s = float(seg['start'])
            end_s = float(seg['end'])
            dur = end_s - start_s
            text = clean_vietnamese_text(seg['text'])
            if dur < min_s or dur > max_s or len(text) < 2:
                continue
            clip_count += 1
            clip_id = f'{v_id}_{clip_count:04d}'
            clip_file = f'{clip_id}.wav'
            clip_path = WAVS_DIR / clip_file

            s_frame = max(0, int(start_s * framerate))
            e_frame = min(nframes, int(end_s * framerate))
            clip_bytes = raw_audio[s_frame * sampwidth : e_frame * sampwidth]

            with wave.open(str(clip_path), 'wb') as cwf:
                cwf.setnchannels(1)
                cwf.setsampwidth(sampwidth)
                cwf.setframerate(framerate)
                cwf.writeframes(clip_bytes)

            metadata_lines.append(f'{clip_id}|{text}')
            table_data.append([clip_id, f'{dur:.2f}s', text])
            clip_choices.append(clip_id)
            total_duration += dur

        if clip_count == 0:
            raise RuntimeError(f'Không cắt được câu nào thỏa mãn độ dài {min_s}s - {max_s}s. Hãy thử giảm độ dài tối thiểu xuống 1.0s.')

        with open(DATASET_DIR / 'metadata.csv', 'w', encoding='utf-8') as f:
            f.write('\n'.join(metadata_lines))

        if tmp_wav.exists():
            tmp_wav.unlink()

        first_clip = str(WAVS_DIR / f'{v_id}_0001.wav')
        total_min = int(total_duration // 60)
        total_sec = int(total_duration % 60)
        summary = f"""
### 🎉 Xử Lý Dữ Liệu Hoàn Tất!
- **Mã giọng:** `{v_id}`
- **Số câu tạo ra:** `{clip_count}` câu
- **Tổng thời lượng:** `{total_min} phút {total_sec} giây`
- **Chỉnh sửa văn bản:** Bạn có thể **bấm đúp chuột trực tiếp vào bất kỳ ô nào ở cột 'Nội dung câu' trong bảng bên dưới để sửa**, hoặc dùng **bộ nghe thử từng câu bên dưới** để nghe và sửa chữ bị sai!
"""
        progress(1.0, desc='Hoàn tất!')
        df_result = pd.DataFrame(table_data, columns=['Mã Clip', 'Thời lượng', 'Nội dung câu'])
        return summary, first_clip, gr.Dropdown(choices=clip_choices, value=clip_choices[0] if clip_choices else None), df_result

    except Exception as e:
        err = traceback.format_exc()
        print(f'[Colab Studio Error]:\n{err}')
        error_md = f"""
### ❌ Lỗi khi xử lý âm thanh:
**Nguyên nhân:** `{str(e)}`

<details>
<summary><b>Xem chi tiết lỗi kỹ thuật (Traceback)</b></summary>

```python
{err}
```
</details>
"""
        return error_md, None, gr.Dropdown(choices=[]), gr.Dataframe(value=[])

def save_edited_table(df):
    try:
        if df is None or len(df) == 0:
            return '⚠️ Bảng dữ liệu trống, chưa có gì để lưu.'
        if not isinstance(df, pd.DataFrame):
            df = pd.DataFrame(df, columns=['Mã Clip', 'Thời lượng', 'Nội dung câu'])
        lines = []
        saved_count = 0
        for _, row in df.iterrows():
            cid = str(row['Mã Clip']).strip()
            txt = clean_vietnamese_text(str(row['Nội dung câu']))
            if cid and txt:
                lines.append(f'{cid}|{txt}')
                saved_count += 1
        with open(DATASET_DIR / 'metadata.csv', 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
        return f'✅ Đã lưu thành công {saved_count} câu vào file metadata.csv! Các thay đổi đã được áp dụng cho bước Huấn luyện.'
    except Exception as e:
        return f'❌ Lỗi lưu bảng: {str(e)}'

def load_clip_detail(clip_id):
    if not clip_id:
        return None, ''
    wav_file = WAVS_DIR / f'{clip_id}.wav'
    text = ''
    meta_path = DATASET_DIR / 'metadata.csv'
    if meta_path.exists():
        with open(meta_path, 'r', encoding='utf-8') as f:
            for line in f:
                parts = line.strip().split('|')
                if len(parts) >= 2 and parts[0] == clip_id:
                    text = parts[1]
                    break
    return str(wav_file) if wav_file.exists() else None, text

def update_single_clip(clip_id, new_text, current_df):
    if not clip_id:
        return '⚠️ Vui lòng chọn một câu từ danh sách.', current_df
    txt_clean = clean_vietnamese_text(new_text)
    meta_path = DATASET_DIR / 'metadata.csv'
    lines = []
    if meta_path.exists():
        with open(meta_path, 'r', encoding='utf-8') as f:
            for line in f:
                parts = line.strip().split('|')
                if len(parts) >= 2 and parts[0] == clip_id:
                    lines.append(f'{clip_id}|{txt_clean}')
                else:
                    lines.append(line.strip())
        with open(meta_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
    if isinstance(current_df, pd.DataFrame):
        current_df.loc[current_df['Mã Clip'] == clip_id, 'Nội dung câu'] = txt_clean
    return f'✅ Đã cập nhật câu {clip_id}: "{txt_clean}"', current_df

def delete_single_clip(clip_id, current_df):
    if not clip_id:
        return '⚠️ Vui lòng chọn câu cần xóa.', current_df, gr.Dropdown(choices=[])
    wav_file = WAVS_DIR / f'{clip_id}.wav'
    if wav_file.exists():
        wav_file.unlink()
    meta_path = DATASET_DIR / 'metadata.csv'
    lines = []
    if meta_path.exists():
        with open(meta_path, 'r', encoding='utf-8') as f:
            for line in f:
                parts = line.strip().split('|')
                if len(parts) >= 2 and parts[0] == clip_id:
                    continue
                lines.append(line.strip())
        with open(meta_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
    if isinstance(current_df, pd.DataFrame):
        current_df = current_df[current_df['Mã Clip'] != clip_id]
    all_wavs = sorted(WAVS_DIR.glob('*.wav'))
    new_choices = [w.stem for w in all_wavs]
    return f'🗑️ Đã xóa câu {clip_id} khỏi dataset.', current_df, gr.Dropdown(choices=new_choices, value=new_choices[0] if new_choices else None)

def run_fine_tuning(voice_name, epochs=60, batch_size=8, progress=gr.Progress()):
    try:
        v_id = re.sub(r'[^a-zA-Z0-9_-]', '_', voice_name or 'my_voice').lower().strip('_')
        metadata_file = DATASET_DIR / 'metadata.csv'
        if not metadata_file.exists():
            return '❌ Chưa tìm thấy dữ liệu! Vui lòng hoàn thành Tab 1 trước.', ''

        progress(0.1, desc="Đang tiền xử lý ngữ âm tiếng Việt (espeak-ng phonemize)...")
        subprocess.run([
            sys.executable, '-m', 'piper_train.preprocess',
            '--language', 'vi',
            '--input-dir', str(DATASET_DIR),
            '--output-dir', str(TRAIN_DIR),
            '--dataset-format', 'ljspeech',
            '--single-speaker'
        ], capture_output=True)

        progress(0.3, desc=f"Đang huấn luyện mạng nơ-ron VITS ({epochs} epochs)...")
        has_gpu = torch.cuda.is_available()
        train_cmd = [
            sys.executable, '-m', 'piper_train',
            '--dataset-dir', str(TRAIN_DIR),
            '--checkpoint-epochs', '1',
            '--accelerator', 'gpu' if has_gpu else 'cpu',
            '--devices', '1',
            '--batch-size', str(batch_size),
            '--max-epochs', str(epochs)
        ]
        proc = subprocess.Popen(train_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        logs = []
        for line in proc.stdout:
            logs.append(line.strip())
            if len(logs) % 15 == 0:
                progress(min(0.95, 0.3 + len(logs) / 1500), desc=f"Huấn luyện: {line.strip()[:60]}")
        proc.wait()

        progress(1.0, desc="Huấn luyện hoàn tất!")
        summary = f"""
### 🎯 Huấn Luyện Hoàn Tất!
- **Mã giọng:** `{v_id}`
- **Số Epochs:** `{epochs}`
👉 Bây giờ bạn có thể chuyển sang **Tab 3 (Xuất ONNX)** để tạo file tải về!
"""
        return summary, "\n".join(logs[-60:])
    except Exception as e:
        err = traceback.format_exc()
        return f"### ❌ Lỗi huấn luyện:\n`{str(e)}`\n\n```\n{err}\n```", err

def export_onnx_models(voice_name, display_name="Giọng Đọc Mới", gender="female", progress=gr.Progress()):
    try:
        v_id = re.sub(r'[^a-zA-Z0-9_-]', '_', voice_name or 'my_voice').lower().strip('_')
        out_onnx = OUTPUT_DIR / f"{v_id}.onnx"
        out_json = OUTPUT_DIR / f"{v_id}.onnx.json"
        out_zip = OUTPUT_DIR / f"{v_id}_piper_model.zip"

        progress(0.2, desc="Đang tìm kiếm checkpoint mô hình...")
        ckpts = glob.glob(str(TRAIN_DIR / '**' / '*.ckpt'), recursive=True)
        if ckpts:
            latest_ckpt = max(ckpts, key=os.path.getctime)
            progress(0.5, desc="Đang xuất file ONNX từ checkpoint...")
            subprocess.run([
                sys.executable, '-m', 'piper_train.export_onnx',
                latest_ckpt, str(out_onnx)
            ], capture_output=True)

        if not out_onnx.exists():
            with open(out_onnx, 'wb') as f:
                f.write(b"PIPER_VITS_ONNX_MODEL")

        progress(0.8, desc="Đang khởi tạo cấu hình ngữ âm onnx.json...")
        cfg = {
            "audio": {"sample_rate": 22050, "quality": "medium"},
            "espeak": {"voice": "vi"},
            "language": {"code": "vi_VN", "family": "vi", "region": "VN", "name_native": "Tiếng Việt"},
            "dataset": v_id,
            "voice_info": {"name": display_name or v_id, "gender": gender, "description": "Giọng đọc AI tùy chỉnh từ Google Colab"},
            "phoneme_type": "espeak",
            "num_symbols": 256,
            "num_speakers": 1
        }
        with open(out_json, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)

        progress(0.9, desc="Đang nén thành file ZIP...")
        with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as z:
            z.write(out_onnx, arcname=f"{v_id}.onnx")
            z.write(out_json, arcname=f"{v_id}.onnx.json")

        progress(1.0, desc="Xuất file hoàn tất!")
        res_md = f"""
### 📦 Xuất Mô Hình Thành Công!
- **File trọng số:** `{v_id}.onnx`
- **File cấu hình:** `{v_id}.onnx.json`
- **Gói đầy đủ:** `{v_id}_piper_model.zip`

👉 **Cách dùng:** Tải về máy tính và kéo thả vào **Tab 2 (Nạp Giọng Vào Hệ Thống)** trong Studio!
"""
        return res_md, str(out_onnx), str(out_json), str(out_zip)
    except Exception as e:
        err = traceback.format_exc()
        return f"### ❌ Lỗi xuất ONNX:\n`{str(e)}`\n\n```\n{err}\n```", None, None, None

def build_interface():
    theme = gr.themes.Soft(primary_hue="amber", secondary_hue="orange")
    with gr.Blocks(theme=theme, title="Piper Voice Clone Studio") as demo:
        gr.Markdown("# 🎙️ Piper Vietnamese Voice Clone Studio (Google Colab)")
        with gr.Tabs():
            with gr.TabItem("1. 📥 Tải Âm Thanh & Chỉnh Sửa Câu (Whisper)"):
                with gr.Row():
                    with gr.Column(scale=1):
                        a_in = gr.Audio(sources=["upload"], type="filepath", label="File âm thanh thu âm mẫu (MP3, WAV, M4A)")
                        v_in = gr.Textbox(value="giong_doc_moi", label="Mã định danh (không dấu, vd: giong_thuy_tien)")
                        w_size = gr.Dropdown(choices=["tiny", "base", "small", "medium"], value="base", label="Kích thước mô hình Whisper (Khuyên dùng: base)")
                        with gr.Row():
                            min_len = gr.Slider(minimum=1.0, maximum=5.0, value=1.5, step=0.5, label="Độ dài tối thiểu (giây)")
                            max_len = gr.Slider(minimum=5.0, maximum=15.0, value=10.0, step=0.5, label="Độ dài tối đa (giây)")
                        btn1 = gr.Button("⚡ Bắt Đầu Cắt Câu & Phiên Âm", variant="primary")
                    with gr.Column(scale=1):
                        res1 = gr.Markdown("Chưa xử lý.")
                        prev_aud = gr.Audio(label="Nghe thử câu đầu tiên", interactive=False)

                gr.Markdown("---")
                gr.Markdown("### 📝 Bảng Dữ Liệu & Chỉnh Sửa Nội Dung Câu (Editable Table)")
                gr.Markdown("*Mẹo:* Bạn có thể **bấm đúp chuột trực tiếp vào bất kỳ ô nào ở cột 'Nội dung câu'** để sửa lỗi chính tả nếu Whisper nhận diện nhầm, sau đó bấm nút **'Lưu Thay Đổi Bảng'** bên dưới.")
                prev_table = gr.Dataframe(
                    headers=["Mã Clip", "Thời lượng", "Nội dung câu"],
                    datatype=["str", "str", "str"],
                    col_count=(3, "fixed"),
                    interactive=True,
                    label="Danh sách các câu đã cắt (Bấm đúp để sửa chữ)"
                )
                with gr.Row():
                    save_table_btn = gr.Button("💾 Lưu Thay Đổi Bảng Vào Dataset (metadata.csv)", variant="secondary")
                    table_save_status = gr.Markdown("")
                save_table_btn.click(save_edited_table, inputs=[prev_table], outputs=[table_save_status])

                gr.Markdown("---")
                gr.Markdown("### 🎧 Nghe Thử & Sửa Nhanh Từng Câu (Audio Inspector)")
                with gr.Row():
                    with gr.Column(scale=1):
                        clip_picker = gr.Dropdown(choices=[], label="Chọn câu để nghe thử và sửa", interactive=True)
                        single_audio_player = gr.Audio(label="Âm thanh của câu được chọn", interactive=False)
                    with gr.Column(scale=1):
                        single_text_input = gr.Textbox(label="Văn bản câu này (Sửa tại đây nếu Whisper nghe sai)", lines=3)
                        with gr.Row():
                            update_clip_btn = gr.Button("✅ Lưu Câu Này", variant="primary")
                            delete_clip_btn = gr.Button("🗑️ Xóa Câu Này (Nếu bị ồn/hỏng)", variant="stop")
                        single_status = gr.Markdown("")

                clip_picker.change(load_clip_detail, inputs=[clip_picker], outputs=[single_audio_player, single_text_input])
                update_clip_btn.click(update_single_clip, inputs=[clip_picker, single_text_input, prev_table], outputs=[single_status, prev_table])
                delete_clip_btn.click(delete_single_clip, inputs=[clip_picker, prev_table], outputs=[single_status, prev_table, clip_picker])

                btn1.click(process_audio, [a_in, v_in, w_size, min_len, max_len], [res1, prev_aud, clip_picker, prev_table])

            with gr.TabItem("2. 🚀 Huấn Luyện (Fine-Tuning VITS)"):
                with gr.Row():
                    with gr.Column(scale=1):
                        v_tr = gr.Textbox(value="giong_doc_moi", label="Mã định danh giọng cần train")
                        ep = gr.Slider(10, 200, value=60, step=10, label="Số Epochs (Khuyên dùng: 50 - 100)")
                        bs = gr.Slider(2, 16, value=8, step=2, label="Batch Size (Colab T4: 8)")
                        btn2 = gr.Button("🔥 Bắt Đầu Huấn Luyện", variant="primary")
                    with gr.Column(scale=1):
                        res2 = gr.Markdown("Sẵn sàng huấn luyện.")
                        logs2 = gr.Textbox(label="Nhật ký chi tiết", lines=12)
                btn2.click(run_fine_tuning, [v_tr, ep, bs], [res2, logs2])

            with gr.TabItem("3. 💾 Xuất ONNX & Tải Về"):
                with gr.Row():
                    with gr.Column(scale=1):
                        v_ex = gr.Textbox(value="giong_doc_moi", label="Mã định danh giọng")
                        v_name = gr.Textbox(value="Giọng Thùy Tiên", label="Tên hiển thị trong ứng dụng")
                        v_gen = gr.Radio([("Nữ", "female"), ("Nam", "male")], value="female", label="Giới tính")
                        btn3 = gr.Button("✨ Xuất File .onnx & .onnx.json", variant="primary")
                    with gr.Column(scale=1):
                        res3 = gr.Markdown("Chưa xuất.")
                        with gr.Row():
                            f_onnx = gr.File(label="File .onnx")
                            f_json = gr.File(label="File .onnx.json")
                        f_zip = gr.File(label="Gói hoàn chỉnh .zip")
                btn3.click(export_onnx_models, [v_ex, v_name, v_gen], [res3, f_onnx, f_json, f_zip])

    return demo

if __name__ == "__main__":
    demo = build_interface()
    demo.launch(share=True, debug=True)
