import { Router, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import type { JoinSplitVideoManager } from "./joinSplitVideoManager";

export function createJoinSplitVideoRouter(manager: JoinSplitVideoManager): Router {
  const router = Router();

  router.get("/files", (_req: Request, res: Response) => {
    return res.json(manager.listPersistedState());
  });

  router.post("/files", async (req: Request, res: Response) => {
    const encodedName = req.header("x-file-name");
    if (!encodedName) return res.status(400).json({ error: "Thiếu tên video." });
    const uploadId = req.header("x-upload-id");
    if (uploadId && !/^[a-zA-Z0-9-]{1,100}$/.test(uploadId)) {
      return res.status(400).json({ error: "Mã tải video không hợp lệ." });
    }
    let fileName: string;
    try {
      fileName = decodeURIComponent(encodedName);
    } catch {
      return res.status(400).json({ error: "Tên video không hợp lệ." });
    }

    try {
      if (uploadId) manager.beginUpload(uploadId);
      const source = await manager.addUpload(req, fileName, uploadId || undefined);
      return res.status(201).json({ source });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể tải video lên.";
      return res.status(400).json({ error: message });
    }
  });

  router.get("/files/upload-progress/:id", (req: Request, res: Response) => {
    const progress = manager.getUploadProgress(req.params.id);
    if (!progress) return res.status(404).json({ error: "Không tìm thấy tiến trình tải video." });
    return res.json(progress);
  });

  router.delete("/files/:id", (req: Request, res: Response) => {
    manager.deleteSource(req.params.id);
    return res.json({ success: true });
  });

  router.post("/cleanup", async (_req: Request, res: Response) => {
    try {
      const deletedCount = await manager.cleanStorage();
      return res.json({ success: true, deletedCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể dọn dữ liệu video.";
      return res.status(409).json({ error: message });
    }
  });

  router.post("/ranges/inspect", (req: Request, res: Response) => {
    try {
      return res.json({
        ranges: manager.inspectRanges(
          req.body?.ranges,
          req.body?.referenceSourceId,
          req.body?.preferKeyframeCuts !== false,
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể kiểm tra queue.";
      return res.status(400).json({ error: message });
    }
  });

  router.post("/export", async (req: Request, res: Response) => {
    try {
      const files = await manager.exportRanges(
        req.body?.ranges,
        req.body?.referenceSourceId,
        req.body?.progressId,
        req.body?.preferKeyframeCuts !== false,
        req.body?.queueIndex,
      );
      return res.json({ files });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể xuất video.";
      return res.status(400).json({ error: message });
    }
  });

  router.get("/export/progress/:id", (req: Request, res: Response) => {
    const progress = manager.getExportProgress(req.params.id);
    if (!progress) return res.status(404).json({ error: "Không tìm thấy tiến trình xuất video." });
    return res.json(progress);
  });

  router.post("/export/cancel/:id", (req: Request, res: Response) => {
    const cancelled = manager.cancelExport(req.params.id);
    if (!cancelled) return res.status(409).json({ error: "Tác vụ xuất đã kết thúc hoặc không còn tồn tại." });
    return res.json({ success: true });
  });

  router.post("/join", async (req: Request, res: Response) => {
    try {
      const file = await manager.joinSources(
        req.body?.sourceIds,
        req.body?.referenceSourceId,
      );
      return res.json({ file });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể ghép timeline.";
      return res.status(400).json({ error: message });
    }
  });

  router.post("/exports/join", async (req: Request, res: Response) => {
    try {
      const file = await manager.joinExports(
        req.body?.exportIds,
        req.body?.referenceSourceId,
        req.body?.progressId,
      );
      return res.json({ file });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể ghép video trong queue.";
      return res.status(400).json({ error: message });
    }
  });

  router.get("/files/:id/preview", (req: Request, res: Response) => {
    const filePath = manager.getSourcePath(req.params.id);
    const fileName = manager.getSourceFileName(req.params.id);
    if (!filePath || !fileName) return res.status(404).end("Không tìm thấy video nguồn.");
    const mimeType: Record<string, string> = {
      ".mp4": "video/mp4",
      ".m4v": "video/mp4",
      ".mov": "video/quicktime",
      ".mkv": "video/x-matroska",
      ".avi": "video/x-msvideo",
      ".webm": "video/webm",
    };
    res.setHeader("Content-Type", mimeType[path.extname(fileName).toLowerCase()] || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    if (!range) return res.sendFile(filePath);
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      return res.status(416).end();
    }
    let start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
    let end = match[2] && match[1] ? Number(match[2]) : stat.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= stat.size) {
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      return res.status(416).end();
    }
    end = Math.min(end, stat.size - 1);
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  });

  router.get("/exports/:id/download", (req: Request, res: Response) => {
    const output = manager.getExport(req.params.id);
    if (!output || !fs.existsSync(output.filePath)) {
      return res.status(404).end("Không tìm thấy video đã xuất.");
    }
    const asciiName = output.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/[\\/;"]/g, "_");
    const encodedName = encodeURIComponent(output.fileName).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    const extension = path.extname(output.fileName).toLowerCase();
    const contentType = extension === ".webm"
      ? "video/webm"
      : extension === ".mkv"
        ? "video/x-matroska"
        : "video/mp4";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.sendFile(path.resolve(output.filePath));
  });

  return router;
}
