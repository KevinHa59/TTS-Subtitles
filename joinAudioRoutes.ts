import express, { type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { JoinAudioManager } from "./joinAudioManager";

export function createJoinAudioRouter(manager: JoinAudioManager) {
  const router = express.Router();

  router.post("/jobs", (req: Request, res: Response) => {
    try {
      const id = manager.createJob(req.body?.files, req.body?.options);
      res.status(201).json({ success: true, id });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.put("/jobs/:id/files/:index", async (req: Request, res: Response) => {
    const index = Number(req.params.index);
    try {
      if (req.headers["content-type"] !== "application/octet-stream") {
        return res.status(415).json({ success: false, error: "Yêu cầu tải lên audio dạng nhị phân." });
      }
      await manager.receiveFile(req.params.id, index, req);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/jobs/:id/start", (req: Request, res: Response) => {
    try {
      manager.startJob(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get("/jobs/:id", (req: Request, res: Response) => {
    const job = manager.getJob(req.params.id);
    if (!job) return res.status(404).json({ success: false, error: "Không tìm thấy tác vụ." });
    res.json({ success: true, job });
  });

  router.post("/jobs/:id/cancel", async (req: Request, res: Response) => {
    try {
      await manager.cancelJob(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(404).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get("/jobs/:id/output", (req: Request, res: Response) => {
    const outputPath = manager.getOutputPath(req.params.id);
    if (!outputPath || !fs.existsSync(outputPath)) {
      return res.status(404).json({ success: false, error: "Chưa có tệp WAV kết quả." });
    }
    res.type("audio/wav");
    res.setHeader("Content-Disposition", `inline; filename="joined-audio.wav"`);
    res.sendFile(path.resolve(outputPath));
  });

  return router;
}
