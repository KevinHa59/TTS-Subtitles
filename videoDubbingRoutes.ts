import { Request, Response, Router } from "express";
import { VideoDubbingManager } from "./videoDubbingManager";

export function createVideoDubbingRouter(
  videoDubbingManager: VideoDubbingManager,
): Router {
  const router = Router();

  router.post("/jobs", (req: Request, res: Response) => {
    try {
      const { fileName, sizeBytes } = req.body || {};
      const job = videoDubbingManager.createJob(fileName, Number(sizeBytes));
      res.status(201).json({ success: true, job });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể tạo job video.";
      res.status(400).json({ error: message });
    }
  });

  router.put("/jobs/:jobId/video", async (req: Request, res: Response) => {
    const { jobId } = req.params;
    if (!videoDubbingManager.isValidJobId(jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    if (!videoDubbingManager.getJob(jobId)) {
      return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
    }
    if (!req.is("application/octet-stream")) {
      return res.status(415).json({
        error: "Video phải được gửi dưới dạng luồng application/octet-stream.",
      });
    }

    try {
      const job = await videoDubbingManager.receiveUpload(jobId, req);
      if (job.status === "completed") {
        return res.json({ success: true, job });
      }
      if (job.status === "cancelled") {
        return res.status(409).json({ error: "Đã hủy upload video.", job });
      }
      return res.status(422).json({
        error: job.error || "Không thể kiểm tra video.",
        job,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể nhận video.";
      const status = message.includes("không tìm thấy") ? 404 : 400;
      console.error("[VideoDubbing] Lỗi khi nhận video:", error);
      if (!res.headersSent && !req.destroyed) {
        return res.status(status).json({ error: message });
      }
    }
  });

  router.get("/jobs/:jobId", (req: Request, res: Response) => {
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    const job = videoDubbingManager.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
    }
    res.json({ success: true, job });
  });

  router.post("/jobs/:jobId/cancel", async (req: Request, res: Response) => {
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    try {
      const job = await videoDubbingManager.cancelJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
      }
      return res.json({ success: true, job });
    } catch (error) {
      console.error("[VideoDubbing] Lỗi khi hủy job:", error);
      return res.status(500).json({ error: "Không thể hủy job Video Dubbing." });
    }
  });

  router.delete("/jobs/:jobId", async (req: Request, res: Response) => {
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    try {
      const deleted = await videoDubbingManager.deleteJob(req.params.jobId);
      if (!deleted) {
        return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("[VideoDubbing] Lỗi dọn dữ liệu job:", error);
      return res.status(500).json({ error: "Không thể dọn dữ liệu job." });
    }
  });

  return router;
}
