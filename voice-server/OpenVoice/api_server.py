"""API HTTP cho OpenVoice V2 (tiếng Việt) – dùng cho webapp Vite.

Chạy (từ thư mục chứa app_vi.py):
    python -m uvicorn api_server:app --host 127.0.0.1 --port 8000

File này tái sử dụng các hàm trong app_vi.py nên phải đặt cùng thư mục với nó.

Endpoint:
    GET    /api/health
    GET    /api/voices
    GET    /api/profiles                                     -> [{id, name, created_at}]
    POST   /api/profiles        (multipart: file, name)      -> {"profile_id", "name"}
    POST   /api/profiles/blend  (JSON: name, items[{profile_id, weight}], keep_norm) -> profile mới
    PATCH  /api/profiles/{id}   (JSON: name)
    DELETE /api/profiles/{id}
    POST   /api/tts             (JSON: text, voice, speed + profile_id HOẶC blend[{profile_id, weight}]) -> audio/wav
                                (dùng blend để nghe thử giọng pha trộn mà không lưu)

Biến môi trường tuỳ chọn:
    ALLOW_ORIGINS  danh sách origin được phép (CORS), phân tách bằng dấu phẩy
    STATIC_DIR     thư mục build của Vite (vd: ..\\dist) để server phục vụ luôn cả web
"""
import hashlib
import json
import os
import re
import threading
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import gradio as gr  # chỉ để bắt gr.Error do app_vi.py ném ra
import torch
from fastapi import APIRouter, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pydub import AudioSegment
from starlette.background import BackgroundTask

from app_vi import (  # noqa: E402  (import app_vi không mở giao diện Gradio)
    DEVICES,
    OUT_DIR,
    TMP_DIR,
    VOICES,
    edge_to_wav,
    extract_se,
    get_src_se,
    get_tgt_se,
    run_on_devices,
)

API_VERSION = "v6-custom-tts-convert"

PROFILE_DIR = Path("profiles")
PROFILE_DIR.mkdir(exist_ok=True)

MAX_UPLOAD = 25 * 1024 * 1024  # 25 MB
ALLOWED_EXT = {".wav", ".mp3", ".m4a", ".ogg", ".opus", ".flac", ".webm", ".aac"}
PROFILE_RE = re.compile(r"^[0-9a-f]{16}$")
VOICE_IDS = set(VOICES.values())

# Chỉ cho một tác vụ chạy trên model/GPU tại một thời điểm.
LOCK = threading.Lock()


def _msg(e: Exception) -> str:
    return getattr(e, "message", None) or str(e)


def _clean(*paths):
    for p in paths:
        try:
            os.remove(p)
        except OSError:
            pass


def _meta_path(pid: str) -> Path:
    return PROFILE_DIR / f"{pid}.json"


def _read_raw_meta(pid: str) -> dict:
    try:
        return json.loads(_meta_path(pid).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _read_meta(pid: str) -> dict:
    """Đọc tên/ngày tạo của profile; profile cũ chưa có tên thì dùng id làm tên."""
    raw = _read_raw_meta(pid)
    created = raw.get("created_at")
    if created is None:
        try:
            created = int((PROFILE_DIR / f"{pid}.pt").stat().st_mtime)
        except OSError:
            created = 0
    return {
        "id": pid,
        "name": raw.get("name") or pid,
        "created_at": created,
        "blend": raw.get("blend"),  # None nếu không phải giọng pha trộn
    }


def _write_meta(pid: str, name: str, extra: dict | None = None) -> dict:
    raw = _read_raw_meta(pid)
    meta = dict(raw)
    meta["id"] = pid
    meta["name"] = name or raw.get("name") or pid
    meta["created_at"] = raw.get("created_at") or int(time.time())
    if extra:
        meta.update(extra)
    _meta_path(pid).write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return meta


@asynccontextmanager
async def lifespan(_app):
    # Khởi động sẵn: tạo âm sắc giọng nguồn và nạp converter để request đầu không bị chậm.
    try:
        for vid in VOICE_IDS:
            get_src_se(vid)
        run_on_devices(lambda c: None)
        print(f"[api] Khoi dong xong. Phien ban API: {API_VERSION}")
    except Exception as e:  # noqa: BLE001
        print(f"[api] Canh bao khi khoi dong: {e!r}")
    yield


app = FastAPI(title="OpenVoice VI API", lifespan=lifespan)

origins = os.environ.get("ALLOW_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")


@api.get("/health")
def health():
    return {"status": "ok", "devices": DEVICES, "version": API_VERSION}


@api.get("/voices")
def voices():
    return [{"id": vid, "name": name} for name, vid in VOICES.items()]


@api.post("/profiles")
def create_profile(file: UploadFile = File(...), name: str = Form("")):
    """Upload audio tham chiếu một lần, lưu thành profile có tên, dùng lại cho nhiều lần /tts."""
    name = name.strip()[:60]
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, "Định dạng audio không được hỗ trợ.")

    data = file.file.read(MAX_UPLOAD + 1)
    if not data:
        raise HTTPException(400, "File rỗng.")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "File quá lớn (tối đa 25 MB).")

    pid = hashlib.sha256(data).hexdigest()[:16]
    target = PROFILE_DIR / f"{pid}.pt"
    if target.exists():
        return {"profile_id": pid, "name": _write_meta(pid, name)["name"]}

    tmp = Path(TMP_DIR) / f"upload_{uuid.uuid4().hex[:8]}{ext}"
    tmp.write_bytes(data)
    try:
        with LOCK:
            se = get_tgt_se(str(tmp))
        torch.save(se, target)
    except gr.Error as e:
        raise HTTPException(400, _msg(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Không trích được âm sắc: {e}")
    finally:
        _clean(tmp)
    return {"profile_id": pid, "name": _write_meta(pid, name)["name"]}


class BlendItem(BaseModel):
    profile_id: str
    weight: float = Field(gt=0)


class BlendRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    items: list[BlendItem] = Field(min_length=2, max_length=5)
    # True: co vector ket qua ve do dai trung binh cua cac vector goc (thu neu giong bi "nhat")
    keep_norm: bool = False


def _load_profile_se(pid: str):
    if not PROFILE_RE.match(pid):
        raise HTTPException(400, "profile_id không hợp lệ.")
    path = PROFILE_DIR / f"{pid}.pt"
    if not path.exists():
        raise HTTPException(404, f"Không tìm thấy profile {pid}. Hãy upload lại audio tham chiếu.")
    return torch.load(path, map_location="cpu")


def _blend_se(items: list[BlendItem], keep_norm: bool):
    """Trung bình có trọng số của các âm sắc đã lưu. Trả về (vector, công thức)."""
    ids = [it.profile_id for it in items]
    if len(set(ids)) != len(ids):
        raise HTTPException(400, "Mỗi giọng chỉ được dùng một lần.")

    ses = [_load_profile_se(i) for i in ids]
    if len({tuple(se.shape) for se in ses}) != 1:
        raise HTTPException(400, "Các profile có kích thước âm sắc khác nhau, không pha trộn được.")

    total = sum(it.weight for it in items)
    weights = [it.weight / total for it in items]

    blended = sum(w * se for w, se in zip(weights, ses))
    if keep_norm:
        target = sum(w * se.norm() for w, se in zip(weights, ses))
        blended = blended * (target / blended.norm())

    recipe = [{"id": i, "weight": round(w, 4)} for i, w in sorted(zip(ids, weights))]
    return blended, recipe


@api.post("/profiles/blend")
def blend_profiles(req: BlendRequest):
    """Pha trộn nhiều giọng đã lưu thành một giọng mới (trung bình có trọng số) và lưu lại."""
    blended, recipe = _blend_se(req.items, req.keep_norm)
    pid = hashlib.sha256(json.dumps([recipe, req.keep_norm]).encode()).hexdigest()[:16]
    torch.save(blended, PROFILE_DIR / f"{pid}.pt")
    meta = _write_meta(
        pid,
        req.name.strip()[:60],
        extra={"blend": recipe, "keep_norm": req.keep_norm},
    )
    return {"profile_id": pid, "name": meta["name"]}


@api.get("/profiles")
def list_profiles():
    items = [_read_meta(pt.stem) for pt in PROFILE_DIR.glob("*.pt") if PROFILE_RE.match(pt.stem)]
    items.sort(key=lambda m: m["created_at"], reverse=True)
    return items


class RenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)


@api.patch("/profiles/{profile_id}")
def rename_profile(profile_id: str, req: RenameRequest):
    if not PROFILE_RE.match(profile_id) or not (PROFILE_DIR / f"{profile_id}.pt").exists():
        raise HTTPException(404, "Không tìm thấy profile.")
    return _write_meta(profile_id, req.name.strip()[:60])


@api.delete("/profiles/{profile_id}")
def delete_profile(profile_id: str):
    if not PROFILE_RE.match(profile_id):
        raise HTTPException(400, "profile_id không hợp lệ.")
    _clean(PROFILE_DIR / f"{profile_id}.pt", _meta_path(profile_id))
    return {"deleted": True}


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    profile_id: str | None = None
    # Nghe thử giọng pha trộn mà không lưu: dùng blend thay cho profile_id
    blend: list[BlendItem] | None = Field(default=None, min_length=2, max_length=5)
    keep_norm: bool = False
    voice: str = "vi-VN-HoaiMyNeural"
    speed: float = Field(1.0, ge=0.7, le=1.4)


@api.post("/tts")
def tts(req: TTSRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Văn bản trống.")
    if req.voice not in VOICE_IDS:
        raise HTTPException(400, "Giọng nguồn không hợp lệ.")
    if (req.profile_id is None) == (req.blend is None):
        raise HTTPException(400, "Cần đúng một trong hai: profile_id hoặc blend.")

    if req.blend is not None:
        tgt_se, _ = _blend_se(req.blend, req.keep_norm)  # không lưu gì
    else:
        tgt_se = _load_profile_se(req.profile_id)

    uid = uuid.uuid4().hex[:8]
    base_wav = str(Path(TMP_DIR) / f"api_base_{uid}.wav")
    out_wav = str(Path(OUT_DIR) / f"api_result_{uid}.wav")

    try:
        edge_to_wav(text, req.voice, req.speed, base_wav)  # gọi mạng, không cần khóa
        src_se = get_src_se(req.voice)

        def _convert(c):
            c.convert(
                audio_src_path=base_wav,
                src_se=src_se.to(c.device),
                tgt_se=tgt_se.to(c.device),
                output_path=out_wav,
            )

        with LOCK:
            run_on_devices(_convert)
    except gr.Error as e:
        _clean(base_wav, out_wav)
        raise HTTPException(502, _msg(e))
    except Exception as e:  # noqa: BLE001
        _clean(base_wav, out_wav)
        raise HTTPException(500, f"Lỗi tạo giọng: {e}")

    _clean(base_wav)
    return FileResponse(
        out_wav,
        media_type="audio/wav",
        filename="voice.wav",
        background=BackgroundTask(_clean, out_wav),
    )


@api.post("/convert")
async def convert_audio(
    file: UploadFile = File(...),
    profile_id: str | None = Form(default=None),
    blend: str | None = Form(default=None),
    keep_norm: bool = Form(default=False),
):
    """Chuyển âm sắc từ file audio nguồn (do hệ thống TTS ngoài tạo) sang profile_id hoặc blend."""
    has_profile = bool(profile_id and profile_id.strip())
    has_blend = bool(blend and blend.strip())
    if has_profile == has_blend:
        raise HTTPException(400, "Cần đúng một trong hai: profile_id hoặc blend.")

    if has_blend:
        try:
            raw_items = json.loads(blend)
            items = [BlendItem(**it) for it in raw_items]
            if not (2 <= len(items) <= 5):
                raise ValueError("blend phải có từ 2 đến 5 giọng.")
        except Exception as e:
            raise HTTPException(400, f"blend không hợp lệ: {e}")
        tgt_se, _ = _blend_se(items, keep_norm)
    else:
        tgt_se = _load_profile_se(profile_id.strip())

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "File audio nguồn trống.")
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, "File quá lớn (tối đa 25 MB).")

    uid = uuid.uuid4().hex[:8]
    ext = Path(file.filename or "source.wav").suffix.lower()
    if ext not in ALLOWED_EXT:
        ext = ".wav"
    upload_path = str(Path(TMP_DIR) / f"api_src_{uid}{ext}")
    base_wav = str(Path(TMP_DIR) / f"api_base_{uid}.wav")
    out_wav = str(Path(OUT_DIR) / f"api_result_{uid}.wav")

    try:
        Path(upload_path).write_bytes(raw)
        AudioSegment.from_file(upload_path).set_channels(1).export(base_wav, format="wav")

        def _extract_and_convert(c):
            src_se = c.extract_se([base_wav]).detach().cpu()
            c.convert(
                audio_src_path=base_wav,
                src_se=src_se.to(c.device),
                tgt_se=tgt_se.to(c.device),
                output_path=out_wav,
            )

        with LOCK:
            run_on_devices(_extract_and_convert)
    except gr.Error as e:
        _clean(upload_path, base_wav, out_wav)
        raise HTTPException(502, _msg(e))
    except Exception as e:  # noqa: BLE001
        _clean(upload_path, base_wav, out_wav)
        raise HTTPException(500, f"Lỗi chuyển đổi giọng: {e}")

    _clean(upload_path, base_wav)
    return FileResponse(
        out_wav,
        media_type="audio/wav",
        filename="voice.wav",
        background=BackgroundTask(_clean, out_wav),
    )


app.include_router(api)

# Tuỳ chọn: phục vụ luôn bản build của Vite (cùng origin, không cần CORS).
_static = os.environ.get("STATIC_DIR")
if _static and os.path.isdir(_static):
    app.mount("/", StaticFiles(directory=_static, html=True), name="web")