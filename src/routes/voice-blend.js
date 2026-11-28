import express, { Router } from "express";
import multer from "multer";

// Router "cổng" giữa webapp và API OpenVoice (FastAPI chạy bằng run_api.bat).
// Gắn vào server:  app.use("/api/voice", voiceRouter);
// Cần: Node >= 18 (fetch, FormData, Blob có sẵn) và `npm i multer`.

const router = Router();

const VOICE_API = (
  process.env.VOICE_API_URL ?? "http://127.0.0.1:8000/api"
).replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.VOICE_TIMEOUT_MS ?? 120_000); // tạo giọng có thể mất vài chục giây
const MAX_UPLOAD = 25 * 1024 * 1024; // 25 MB, khớp với giới hạn bên FastAPI

router.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD },
});

function uploadSingle(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ detail: "File quá lớn (tối đa 25 MB)." });
    }
    return res.status(400).json({ detail: "Upload thất bại." });
  });
}

const jsonInit = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body ?? {}),
});

// Chuyển tiếp request sang FastAPI và trả nguyên status + nội dung (JSON hoặc audio/wav) về client.
async function forward(res, path, init = {}) {
  let upstream;
  try {
    upstream = await fetch(`${VOICE_API}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === "TimeoutError") {
      return res
        .status(504)
        .json({ detail: "Máy chủ giọng nói xử lý quá lâu." });
    }
    console.error(
      "[voice] Không kết nối được OpenVoice API:",
      err?.cause?.code ?? err?.message,
    );
    return res
      .status(502)
      .json({
        detail: "Không kết nối được máy chủ giọng nói. Hãy chạy run_api.bat.",
      });
  }

  const type = upstream.headers.get("content-type");
  if (type) res.set("Content-Type", type);
  res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
}

// ---------- Kiểm tra / danh sách ----------
router.get("/health", (req, res) => forward(res, "/health"));
router.get("/voices", (req, res) => forward(res, "/voices"));
router.get("/profiles", (req, res) => forward(res, "/profiles"));

// ---------- Thư viện giọng tham chiếu ----------
// multipart: file (audio) + name
router.post("/profiles", uploadSingle, async (req, res) => {
  if (!req.file) return res.status(400).json({ detail: "Thiếu file audio." });

  const form = new FormData();
  form.append(
    "file",
    new Blob([req.file.buffer], { type: req.file.mimetype }),
    req.file.originalname || "reference.wav",
  );
  form.append("name", String(req.body?.name ?? ""));

  return forward(res, "/profiles", { method: "POST", body: form });
});

// JSON: { name, items: [{ profile_id, weight }], keep_norm }
router.post("/profiles/blend", (req, res) =>
  forward(res, "/profiles/blend", jsonInit("POST", req.body)),
);

// JSON: { name }
router.patch("/profiles/:id", (req, res) =>
  forward(
    res,
    `/profiles/${encodeURIComponent(req.params.id)}`,
    jsonInit("PATCH", req.body),
  ),
);

router.delete("/profiles/:id", (req, res) =>
  forward(res, `/profiles/${encodeURIComponent(req.params.id)}`, {
    method: "DELETE",
  }),
);

// ---------- Tạo giọng nói ----------
// JSON: { text, voice, speed, profile_id }  hoặc  { text, voice, speed, blend: [...], keep_norm }
// (blend = nghe thử giọng pha trộn mà không lưu)  ->  audio/wav
router.post("/tts", async (req, res) => {
  const { text, profile_id, blend } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ detail: "Văn bản trống." });
  }
  const hasProfile = typeof profile_id === "string" && profile_id !== "";
  if (!hasProfile && !Array.isArray(blend)) {
    return res.status(400).json({ detail: "Thiếu profile_id hoặc blend." });
  }
  return forward(res, "/tts", jsonInit("POST", req.body));
});

// multipart: file (audio nguồn từ hệ thống TTS) + profile_id hoặc blend + keep_norm -> audio/wav
router.post("/convert", uploadSingle, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "Thiếu file audio nguồn." });
  }
  const profileId = String(req.body?.profile_id ?? "").trim();
  const blend = String(req.body?.blend ?? "").trim();
  if (!profileId && !blend) {
    return res.status(400).json({ detail: "Thiếu profile_id hoặc blend." });
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([req.file.buffer], { type: req.file.mimetype || "audio/wav" }),
    req.file.originalname || "source.wav",
  );
  if (profileId) form.append("profile_id", profileId);
  if (blend) form.append("blend", blend);
  if (req.body?.keep_norm !== undefined) {
    form.append("keep_norm", String(req.body.keep_norm));
  }

  return forward(res, "/convert", { method: "POST", body: form });
});

export default router;
