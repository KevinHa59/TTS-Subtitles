"""OpenVoice V2 + edge-tts (tiếng Việt) – Gradio.

Luồng: văn bản VI -> edge-tts (giọng nguồn) -> OpenVoice tone color converter
       -> giọng của audio tham chiếu.

Chạy:  python app_vi.py
Ép CPU: set OV_FORCE_CPU=1   (PowerShell: $env:OV_FORCE_CPU=1)
"""
import asyncio
import os
import uuid

import edge_tts
import gradio as gr
import torch
from pydub import AudioSegment

from openvoice.api import ToneColorConverter

CKPT = "checkpoints_v2"
CONVERTER_DIR = os.path.join(CKPT, "converter")
SE_DIR = os.path.join(CKPT, "vi_ses")
OUT_DIR = "outputs"
TMP_DIR = "tmp"
for d in (SE_DIR, OUT_DIR, TMP_DIR):
    os.makedirs(d, exist_ok=True)

# ---------- Thiết bị: XPU (Arc) trước, CPU làm dự phòng ----------
DEVICES = []
if os.environ.get("OV_FORCE_CPU") != "1" and hasattr(torch, "xpu") and torch.xpu.is_available():
    DEVICES.append("xpu:0")
DEVICES.append("cpu")
print("Thiết bị theo thứ tự thử:", DEVICES)

_converters = {}


def get_converter(dev):
    if dev not in _converters:
        conv = ToneColorConverter(
            os.path.join(CONVERTER_DIR, "config.json"),
            device=dev,
            enable_watermark=False,  # không cần wavmark
        )
        conv.load_ckpt(os.path.join(CONVERTER_DIR, "checkpoint.pth"))
        _converters[dev] = conv
    return _converters[dev]


def run_on_devices(fn):
    """Chạy fn(converter) trên từng thiết bị cho tới khi thành công."""
    last = None
    for dev in DEVICES:
        try:
            return fn(get_converter(dev))
        except Exception as e:  # noqa: BLE001
            print(f"[{dev}] lỗi: {e!r}")
            last = e
    raise last


# ---------- Giọng nguồn tiếng Việt (edge-tts) ----------
VOICES = {
    "Hoài My (nữ)": "vi-VN-HoaiMyNeural",
    "Nam Minh (nam)": "vi-VN-NamMinhNeural",
}

CALIB_TEXT = (
    "Xin chào các bạn, hôm nay trời đẹp và tôi muốn chia sẻ với các bạn một câu chuyện nhỏ. "
    "Ngày xưa, có một cậu bé sống ở một ngôi làng bên bờ sông. "
    "Mỗi buổi sáng, cậu thức dậy thật sớm, đi dọc theo con đường làng để ngắm mặt trời mọc. "
    "Cậu luôn tin rằng, chỉ cần kiên trì và chăm chỉ, mọi ước mơ rồi sẽ trở thành hiện thực. "
    "Còn bây giờ, hãy cùng lắng nghe giọng nói này nhé."
)


async def _edge_save(text, voice, rate, path):
    await edge_tts.Communicate(text, voice, rate=rate).save(path)


def edge_to_wav(text, voice, speed, out_wav):
    pct = int(round((speed - 1.0) * 100))
    rate = f"{pct:+d}%"
    mp3 = out_wav[:-4] + ".mp3"
    try:
        asyncio.run(_edge_save(text, voice, rate, mp3))
    except Exception as e:  # noqa: BLE001
        raise gr.Error(f"Không gọi được edge-tts (kiểm tra internet): {e}")
    AudioSegment.from_file(mp3).export(out_wav, format="wav")
    os.remove(mp3)


def extract_se(wav_path):
    se = run_on_devices(lambda c: c.extract_se([wav_path]))
    return se.detach().cpu()


def get_src_se(voice_id):
    """Âm sắc của giọng nguồn: tính một lần rồi lưu lại."""
    path = os.path.join(SE_DIR, f"{voice_id}.pth")
    if os.path.exists(path):
        return torch.load(path, map_location="cpu")
    gr.Info("Lần đầu dùng giọng này: đang tạo âm sắc cho giọng nguồn...")
    wav = os.path.join(TMP_DIR, f"calib_{voice_id}.wav")
    edge_to_wav(CALIB_TEXT, voice_id, 1.0, wav)
    se = extract_se(wav)
    torch.save(se, path)
    return se


# ---------- Âm sắc của audio tham chiếu ----------
_ref_cache = {}


def get_tgt_se(ref_path):
    key = (ref_path, os.path.getmtime(ref_path))
    if key in _ref_cache:
        return _ref_cache[key]
    audio = AudioSegment.from_file(ref_path).set_channels(1)
    if len(audio) < 3000:
        raise gr.Error("Audio tham chiếu quá ngắn (cần ít nhất ~3 giây, nên 10–30 giây).")
    audio = audio[:30000]  # tối đa 30 giây
    tmp = os.path.join(TMP_DIR, f"ref_{uuid.uuid4().hex[:8]}.wav")
    audio.export(tmp, format="wav")
    se = extract_se(tmp)
    _ref_cache[key] = se
    return se


# ---------- Sinh giọng ----------
def generate(ref_audio, text, voice_name, speed):
    if not ref_audio:
        raise gr.Error("Hãy upload audio tham chiếu.")
    if not text or not text.strip():
        raise gr.Error("Hãy nhập văn bản.")

    voice_id = VOICES[voice_name]
    tgt_se = get_tgt_se(ref_audio)
    src_se = get_src_se(voice_id)

    uid = uuid.uuid4().hex[:8]
    base_wav = os.path.join(TMP_DIR, f"base_{uid}.wav")
    out_wav = os.path.join(OUT_DIR, f"result_{uid}.wav")

    edge_to_wav(text.strip(), voice_id, speed, base_wav)

    def _convert(c):
        c.convert(
            audio_src_path=base_wav,
            src_se=src_se.to(c.device),
            tgt_se=tgt_se.to(c.device),
            output_path=out_wav,
        )

    run_on_devices(_convert)
    return out_wav


with gr.Blocks(title="OpenVoice V2 – Tiếng Việt") as demo:
    gr.Markdown(
        "# OpenVoice V2 – Clone giọng tiếng Việt\n"
        "Văn bản → giọng nguồn (edge-tts) → đổi âm sắc sang giọng tham chiếu."
    )
    with gr.Row():
        with gr.Column():
            ref = gr.Audio(label="Audio tham chiếu (10–30s, sạch, 1 người nói)", type="filepath")
            txt = gr.Textbox(label="Văn bản tiếng Việt", lines=5, placeholder="Nhập văn bản...")
            voice = gr.Dropdown(list(VOICES.keys()), value="Hoài My (nữ)", label="Giọng nguồn")
            spd = gr.Slider(0.7, 1.4, value=1.0, step=0.05, label="Tốc độ")
            btn = gr.Button("Generate", variant="primary")
        with gr.Column():
            out = gr.Audio(label="Kết quả", type="filepath")

    btn.click(generate, inputs=[ref, txt, voice, spd], outputs=out)

if __name__ == "__main__":
    demo.launch(server_name="127.0.0.1", server_port=7860)
