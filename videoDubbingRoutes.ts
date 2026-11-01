import { Request, Response, Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { VideoDubbingMasterCoordinator } from "./videoDubbingMaster";
import { VideoDubbingMediaCoordinator } from "./videoDubbingMedia";
import { VideoDubbingManager } from "./videoDubbingManager";
import { VideoDubbingSeparationCoordinator } from "./videoDubbingSeparation";
import { VideoDubbingPipelineCoordinator } from "./videoDubbingPipeline";
import { DEFAULT_SUBTITLE_FONT_FAMILIES, getSubtitleFontFaces } from "./videoDubbingFonts";
import { VideoDubbingProjects } from "./videoDubbingProjects";

function streamVideoDubbingMp4(
  req: Request,
  res: Response,
  filePath: string,
  downloadFileName?: string,
): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.status(404).end("MP4 đầu ra chưa sẵn sàng.");
    return;
  }

  if (!stat.isFile() || stat.size <= 0) {
    res.status(404).end("MP4 đầu ra không hợp lệ.");
    return;
  }

  const fileSize = stat.size;
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.setHeader("Content-Length", String(fileSize));
  if (downloadFileName) {
    const asciiFileName = downloadFileName
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/[\\/;"]/g, "_");
    const encodedFileName = encodeURIComponent(downloadFileName)
      .replace(/[!'()*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`,
    );
  }
  res.setHeader("X-Content-Type-Options", "nosniff");

  const range = req.headers.range;
  if (!range || !range.startsWith("bytes=")) {
    res.status(200);
    const stream = fs.createReadStream(filePath);
    stream.on("error", (error) => {
      console.error("[VideoDubbing] Lỗi stream MP4:", error);
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) {
    res.setHeader("Content-Range", `bytes */${fileSize}`);
    res.status(416).end("Requested Range Not Satisfiable");
    return;
  }

  let start: number;
  let end: number;
  if (match[1]) {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : fileSize - 1;
  } else {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      res.status(416).end("Requested Range Not Satisfiable");
      return;
    }
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    res.setHeader("Content-Range", `bytes */${fileSize}`);
    res.status(416).end("Requested Range Not Satisfiable");
    return;
  }

  end = Math.min(end, fileSize - 1);
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
  res.setHeader("Content-Length", String(end - start + 1));
  const stream = fs.createReadStream(filePath, { start, end });
  stream.on("error", (error) => {
    console.error("[VideoDubbing] Lỗi stream MP4 theo range:", error);
    if (!res.headersSent) res.status(500);
    res.end();
  });
  stream.pipe(res);
}

export function createVideoDubbingRouter(
  videoDubbingManager: VideoDubbingManager,
  masterCoordinator?: VideoDubbingMasterCoordinator,
  mediaCoordinator?: VideoDubbingMediaCoordinator,
  separationCoordinator?: VideoDubbingSeparationCoordinator,
  pipelineCoordinator?: VideoDubbingPipelineCoordinator,
  projects?: VideoDubbingProjects,
): Router {
  const router = Router();
  const pipelineIsBusy = (jobId: string) =>
    pipelineCoordinator?.isBusy(jobId) === true;

  router.use(async (_req: Request, res: Response, next) => {
    try {
      await videoDubbingManager.initialize();
      next();
    } catch (error) {
      console.error("[VideoDubbing] Không thể khôi phục job:", error);
      res.status(500).json({ error: "Không thể khôi phục dữ liệu Video Dubbing." });
    }
  });

  router.get("/subtitle-backgrounds", async (_req: Request, res: Response) => {
    const assetDirectory = path.resolve(
      process.cwd(),
      "public",
      "assets",
      "subtitle",
    );
    try {
      const names = await fs.promises.readdir(assetDirectory, {
        withFileTypes: true,
      });
      const backgrounds = names
        .filter(
          (entry) =>
            entry.isFile() && /\.(png|webp)$/i.test(entry.name),
        )
        .map((entry) => entry.name)
        .filter((name) => /-left\.(png|webp)$/i.test(name))
        .map((name) =>
          name.replace(/\.(png|webp)$/i, "").replace(/-left$/, ""),
        )
        .filter(
          (base) =>
            names.some(
              (entry) => entry.isFile() && entry.name === `${base}-center.png`,
            ) &&
            names.some(
              (entry) => entry.isFile() && entry.name === `${base}-right.png`,
            ),
        )
        .filter((base, index, bases) => bases.indexOf(base) === index)
        .sort((a, b) => a.localeCompare(b, "vi", { sensitivity: "base" }));
      res.json({ backgrounds });
    } catch {
      res.json({ backgrounds: [] });
    }
  });

  router.get("/fonts", (_req: Request, res: Response) => {
    const faces = getSubtitleFontFaces();
    const families = Array.from(new Set([
      ...DEFAULT_SUBTITLE_FONT_FAMILIES,
      ...faces.map((face) => face.family),
    ])).sort((a, b) => a.localeCompare(b, "vi", { sensitivity: "base" }));
    res.setHeader("Cache-Control", "no-store");
    return res.json({ families, faces });
  });

  router.get("/separation/status", async (_req: Request, res: Response) => {
    if (!separationCoordinator) {
      return res.status(200).json({
        status: "unavailable",
        model: "htdemucs",
        message: "Tách audio chưa được cấu hình.",
      });
    }
    return res.json(await separationCoordinator.getAvailability());
  });

  router.get("/jobs", async (_req: Request, res: Response) => {
    try {
      const jobs = await videoDubbingManager.listJobs();
      return res.json({ success: true, jobs });
    } catch (error) {
      console.error("[VideoDubbing] Không thể liệt kê job:", error);
      return res.status(500).json({ error: "Không thể tải lịch sử Video Dubbing." });
    }
  });

  router.get("/projects", async (_req: Request, res: Response) => {
    if (!projects) return res.status(501).json({ error: "Project chưa được cấu hình." });
    try { return res.json({ success: true, projects: await projects.list() }); }
    catch (error) { console.error("[VideoDubbing] Không thể tải project:", error); return res.status(500).json({ error: "Không thể tải danh sách project." }); }
  });

  router.post("/projects", async (req: Request, res: Response) => {
    if (!projects) return res.status(501).json({ error: "Project chưa được cấu hình." });
    try { return res.status(201).json({ success: true, project: await projects.create(req.body?.name) }); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Không thể tạo project." }); }
  });

  router.get("/projects/:projectId", async (req: Request, res: Response) => {
    if (!projects) return res.status(501).json({ error: "Project chưa được cấu hình." });
    const project = await projects.get(req.params.projectId);
    return project ? res.json({ success: true, project }) : res.status(404).json({ error: "Không tìm thấy project." });
  });

  router.put("/projects/:projectId", async (req: Request, res: Response) => {
    if (!projects) return res.status(501).json({ error: "Project chưa được cấu hình." });
    try {
      const requestedJobIds = req.body?.jobIds;
      if (Array.isArray(requestedJobIds) && requestedJobIds.some((id: unknown) => typeof id !== "string" || !videoDubbingManager.getJob(id))) return res.status(400).json({ error: "Project chỉ có thể tham gia job còn tồn tại." });
      return res.json({ success: true, project: await projects.update(req.params.projectId, req.body) });
    } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Không thể lưu project." }); }
  });

  router.delete("/projects/:projectId", async (req: Request, res: Response) => {
    if (!projects) return res.status(501).json({ error: "Project chưa được cấu hình." });
    try {
      const project = await projects.get(req.params.projectId);
      if (!project) return res.status(404).json({ error: "Không tìm thấy project." });
      for (const jobId of project.jobIds) {
        await pipelineCoordinator?.cancel(jobId);
        await separationCoordinator?.cancel(jobId);
        await mediaCoordinator?.cancel(jobId);
        await masterCoordinator?.cancel(jobId);
      }
      const deleted = await projects.delete(req.params.projectId, (jobId) => videoDubbingManager.deleteJob(jobId));
      return deleted ? res.json({ success: true }) : res.status(404).json({ error: "Không tìm thấy project." });
    } catch (error) { console.error("[VideoDubbing] Lỗi xóa project:", error); return res.status(500).json({ error: "Không thể xóa toàn bộ dữ liệu project." }); }
  });

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
    masterCoordinator?.refresh(req.params.jobId);
    res.json({ success: true, job: videoDubbingManager.getJob(req.params.jobId) });
  });

  router.get("/jobs/:jobId/auto-pipeline", (req: Request, res: Response) => {
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    const job = videoDubbingManager.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
    }
    return res.json({
      success: true,
      config: job.autoPipeline?.config || null,
      state: job.autoPipeline || null,
    });
  });

  router.put("/jobs/:jobId/auto-pipeline/config", (req: Request, res: Response) => {
    if (!pipelineCoordinator) {
      return res.status(501).json({ error: "Auto Pipeline chưa được cấu hình." });
    }
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    if (!videoDubbingManager.getJob(req.params.jobId)) {
      return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
    }
    try {
      const config = pipelineCoordinator.configure(req.params.jobId, req.body);
      return res.json({ success: true, config });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể lưu cấu hình Auto Pipeline.";
      return res.status(400).json({ error: message });
    }
  });

  router.post("/jobs/:jobId/auto-pipeline", async (req: Request, res: Response) => {
    if (!pipelineCoordinator) {
      return res.status(501).json({ error: "Auto Pipeline chưa được cấu hình." });
    }
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    if (!videoDubbingManager.getJob(req.params.jobId)) {
      return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
    }
    try {
      const state = await pipelineCoordinator.start(req.params.jobId, req.body);
      return res.status(202).json({ success: true, state });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể bắt đầu Auto Pipeline.";
      const unavailable =
        message.includes("chưa sẵn sàng") ||
        message.includes("chưa được cấu hình") ||
        message.includes("không khả dụng");
      return res.status(unavailable ? 503 : 400).json({ error: message });
    }
  });

  router.post(
    "/jobs/:jobId/auto-pipeline/cancel",
    async (req: Request, res: Response) => {
      if (!pipelineCoordinator) {
        return res.status(501).json({ error: "Auto Pipeline chưa được cấu hình." });
      }
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      if (!videoDubbingManager.getJob(req.params.jobId)) {
        return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
      }
      try {
        await pipelineCoordinator.cancel(req.params.jobId);
        return res.json({
          success: true,
          state: videoDubbingManager.getJob(req.params.jobId)?.autoPipeline || null,
        });
      } catch (error) {
        console.error("[VideoDubbing] Lỗi khi hủy Auto Pipeline:", error);
        return res.status(500).json({ error: "Không thể hủy Auto Pipeline." });
      }
    },
  );

  router.use("/jobs/:jobId", (req: Request, res: Response, next) => {
    const jobId = req.params.jobId;
    const mutating = req.method === "POST" || req.method === "PUT" ||
      req.method === "PATCH" || req.method === "DELETE";
    const autoPipelineRoute = req.path.startsWith("/auto-pipeline");
    const jobLifecycleRoute = req.path === "/cancel" || req.method === "DELETE";
    if (
      mutating &&
      !autoPipelineRoute &&
      !jobLifecycleRoute &&
      pipelineIsBusy(jobId)
    ) {
      return res.status(409).json({
        error: "Auto Pipeline đang chạy. Hãy hủy pipeline trước khi chạy thao tác thủ công.",
      });
    }
    return next();
  });

  router.get("/jobs/:jobId/source-video", (req: Request, res: Response) => {
    const { jobId } = req.params;
    if (!videoDubbingManager.isValidJobId(jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    const job = videoDubbingManager.getJob(jobId);
    let filePath: string | null;
    try {
      filePath = videoDubbingManager.getSourceVideoPath(jobId);
    } catch (error) {
      console.error("[VideoDubbing] Không thể xác minh video nguồn:", error);
      return res.status(500).json({ error: "Không thể tải video nguồn." });
    }
    if (!job || !filePath) {
      return res.status(404).json({ error: "Video nguồn chưa sẵn sàng." });
    }
    const mediaTypes: Record<string, string> = {
      ".avi": "video/x-msvideo",
      ".mkv": "video/x-matroska",
      ".mov": "video/quicktime",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
    };
    res.type(
      mediaTypes[path.extname(job.fileName).toLowerCase()] ||
        "application/octet-stream",
    );
    return res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        console.error("[VideoDubbing] Lỗi gửi video xem trước:", error);
        res.status(500).end();
      }
    });
  });

  router.post("/jobs/:jobId/master", (req: Request, res: Response) => {
    if (!masterCoordinator) {
      return res.status(501).json({ error: "Tạo TTS Master chưa được cấu hình." });
    }
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    if (!videoDubbingManager.getJob(req.params.jobId)) {
      return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
    }
    const currentJob = videoDubbingManager.getJob(req.params.jobId);
    if (
      mediaCoordinator?.isBusy(req.params.jobId) ||
      currentJob?.separation?.status === "processing"
    ) {
      return res.status(409).json({
        error: "Hãy đợi tác vụ media hoặc tách audio của job hoàn tất trước khi tạo TTS Master.",
      });
    }
    try {
      const masterGeneration = masterCoordinator.start(req.params.jobId, req.body);
      return res.status(202).json({ success: true, masterGeneration });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể tạo TTS Master.";
      const status =
        error &&
        typeof error === "object" &&
        "code" in error
          ? 500
          : 400;
      return res.status(status).json({ error: message });
    }
  });

  router.post(
    "/jobs/:jobId/master/cancel",
    async (req: Request, res: Response) => {
      if (!masterCoordinator) {
        return res.status(501).json({ error: "Tạo TTS Master chưa được cấu hình." });
      }
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      if (!videoDubbingManager.getJob(req.params.jobId)) {
        return res
          .status(404)
          .json({ error: "Không tìm thấy job Video Dubbing." });
      }
      try {
        await masterCoordinator.cancel(req.params.jobId);
        return res.json({
          success: true,
          job: videoDubbingManager.getJob(req.params.jobId),
        });
      } catch (error) {
        console.error("[VideoDubbing] Lỗi khi hủy tạo TTS Master:", error);
        return res
          .status(500)
          .json({ error: "Không thể hủy quá trình tạo TTS Master." });
      }
    },
  );

  router.get(
    "/jobs/:jobId/master-audio",
    (req: Request, res: Response) => {
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      const filePath = videoDubbingManager.getMasterAudioPath(req.params.jobId);
      if (!filePath) {
        return res.status(404).json({ error: "TTS Master chưa được tạo." });
      }
      res.type("audio/wav");
      return res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) {
          console.error("[VideoDubbing] Lỗi gửi TTS Master:", error);
          res.status(500).end();
        }
      });
    },
  );

  router.get("/jobs/:jobId/separation", (req: Request, res: Response) => {
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    const job = videoDubbingManager.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
    }
    return res.json({
      success: true,
      separation: job.separation || { status: "unavailable" },
    });
  });

  router.post(
    "/jobs/:jobId/separation",
    async (req: Request, res: Response) => {
      if (!separationCoordinator) {
        return res.status(501).json({ error: "Tách audio chưa được cấu hình." });
      }
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      if (!videoDubbingManager.getJob(req.params.jobId)) {
        return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
      }
      try {
        const separation = await separationCoordinator.start(req.params.jobId);
        return res.status(202).json({ success: true, separation });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Không thể bắt đầu tách audio.";
        const unavailable = (await separationCoordinator.getAvailability()).status === "unavailable";
        return res.status(unavailable ? 503 : 400).json({ error: message });
      }
    },
  );

  router.post(
    "/jobs/:jobId/separation/cancel",
    async (req: Request, res: Response) => {
      if (!separationCoordinator) {
        return res.status(501).json({ error: "Tách audio chưa được cấu hình." });
      }
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      if (!videoDubbingManager.getJob(req.params.jobId)) {
        return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
      }
      try {
        await separationCoordinator.cancel(req.params.jobId);
        return res.json({ success: true, job: videoDubbingManager.getJob(req.params.jobId) });
      } catch (error) {
        console.error("[VideoDubbing] Lỗi khi hủy tách audio:", error);
        return res.status(500).json({ error: "Không thể hủy tác vụ tách audio." });
      }
    },
  );

  for (const track of ["vocals", "instrumental"] as const) {
    router.get(
      `/jobs/:jobId/separation/${track}`,
      (req: Request, res: Response) => {
        if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
          return res.status(400).json({ error: "ID job video không hợp lệ." });
        }
        if (!videoDubbingManager.getJob(req.params.jobId)) {
          return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
        }
        const filePath = separationCoordinator?.getTrackPath(req.params.jobId, track);
        if (!filePath) {
          return res.status(404).json({ error: "Track chưa sẵn sàng." });
        }
        res.type("audio/wav");
        return res.sendFile(filePath, (error) => {
          if (error && !res.headersSent) {
            console.error(`[VideoDubbing] Lỗi gửi track ${track}:`, error);
            res.status(500).end();
          }
        });
      },
    );
  }

  router.post("/jobs/:jobId/audio-mix", (req: Request, res: Response) => {
    if (!mediaCoordinator) {
      return res.status(501).json({ error: "Trộn âm thanh chưa được cấu hình." });
    }
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    if (!videoDubbingManager.getJob(req.params.jobId)) {
      return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
    }
    try {
      const audioMix = mediaCoordinator.startMix(req.params.jobId, req.body);
      return res.status(202).json({ success: true, audioMix });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể bắt đầu trộn âm thanh.";
      return res.status(400).json({ error: message });
    }
  });

  router.put(
    "/jobs/:jobId/mixer-settings",
    (req: Request, res: Response) => {
      if (!mediaCoordinator) {
        return res.status(501).json({ error: "Mixer chưa được cấu hình." });
      }
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      if (!videoDubbingManager.getJob(req.params.jobId)) {
        return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
      }
      try {
        const mixerSettings = mediaCoordinator.updateMixerSettings(
          req.params.jobId,
          req.body,
        );
        return res.json({
          success: true,
          mixerSettings,
          job: videoDubbingManager.getJob(req.params.jobId),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Không thể lưu mixer settings.";
        return res.status(400).json({ error: message });
      }
    },
  );

  router.post(
    "/jobs/:jobId/final-mix",
    (req: Request, res: Response) => {
      if (!mediaCoordinator) {
        return res.status(501).json({ error: "Mixer chưa được cấu hình." });
      }
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      if (!videoDubbingManager.getJob(req.params.jobId)) {
        return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
      }
      try {
        const finalMix = mediaCoordinator.startFinalMix(
          req.params.jobId,
          req.body,
        );
        return res.status(202).json({ success: true, finalMix });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Không thể render final mix.";
        return res.status(400).json({ error: message });
      }
    },
  );

  router.post(
    "/jobs/:jobId/final-mix/cancel",
    async (req: Request, res: Response) => {
      if (!mediaCoordinator) {
        return res.status(501).json({ error: "Mixer chưa được cấu hình." });
      }
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      if (!videoDubbingManager.getJob(req.params.jobId)) {
        return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
      }
      if (videoDubbingManager.getJob(req.params.jobId)?.finalMix?.status !== "running") {
        return res.status(409).json({ error: "Job không có final mix đang chạy." });
      }
      try {
        await mediaCoordinator.cancel(req.params.jobId);
        return res.json({
          success: true,
          job: videoDubbingManager.getJob(req.params.jobId),
        });
      } catch (error) {
        console.error("[VideoDubbing] Lỗi khi hủy final mix:", error);
        return res.status(500).json({ error: "Không thể hủy final mix." });
      }
    },
  );

  router.get(
    "/jobs/:jobId/final-mix-audio",
    (req: Request, res: Response) => {
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      const filePath = mediaCoordinator?.getFinalMixPath(req.params.jobId);
      if (!filePath) {
        return res.status(404).json({ error: "Final mix chưa sẵn sàng." });
      }
      res.type("audio/wav");
      return res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) {
          console.error("[VideoDubbing] Lỗi gửi final mix:", error);
          res.status(500).end();
        }
      });
    },
  );

  router.post(
    "/jobs/:jobId/audio-mix/cancel",
    async (req: Request, res: Response) => {
      if (!mediaCoordinator) {
        return res.status(501).json({ error: "Trộn âm thanh chưa được cấu hình." });
      }
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      if (!videoDubbingManager.getJob(req.params.jobId)) {
        return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
      }
      try {
        await mediaCoordinator.cancel(req.params.jobId);
        return res.json({
          success: true,
          job: videoDubbingManager.getJob(req.params.jobId),
        });
      } catch (error) {
        console.error("[VideoDubbing] Lỗi khi hủy trộn audio:", error);
        return res.status(500).json({ error: "Không thể hủy trộn âm thanh." });
      }
    },
  );

  router.get(
    "/jobs/:jobId/mixed-audio",
    (req: Request, res: Response) => {
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      const filePath = mediaCoordinator?.getAudioMixPath(req.params.jobId);
      if (!filePath) {
        return res.status(404).json({ error: "Bản phối âm thanh chưa sẵn sàng." });
      }
      res.type("audio/mp4");
      return res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) {
          console.error("[VideoDubbing] Lỗi gửi bản phối audio:", error);
          res.status(500).end();
        }
      });
    },
  );

  router.post("/jobs/:jobId/export", (req: Request, res: Response) => {
    if (!mediaCoordinator) {
      return res.status(501).json({ error: "Xuất MP4 chưa được cấu hình." });
    }
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    if (!videoDubbingManager.getJob(req.params.jobId)) {
      return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
    }
    try {
      const videoExport = mediaCoordinator.startExport(
        req.params.jobId,
        req.body,
      );
      return res.status(202).json({
        success: true,
        videoExport,
        job: videoDubbingManager.getJob(req.params.jobId),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể bắt đầu xuất MP4.";
      return res.status(400).json({ error: message });
    }
  });

  router.put("/jobs/:jobId/overlay-settings", (req: Request, res: Response) => {
    if (!mediaCoordinator) {
      return res.status(501).json({ error: "Cấu hình logo/phụ đề chưa được cấu hình." });
    }
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    try {
      const job = mediaCoordinator.saveOverlaySettings(req.params.jobId, req.body);
      return res.json({ success: true, job });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể lưu cấu hình logo/phụ đề.";
      const status = message.includes("không tìm thấy") ? 404 : 400;
      return res.status(status).json({ error: message });
    }
  });

  router.put("/jobs/:jobId/logo", async (req: Request, res: Response) => {
    if (!mediaCoordinator) {
      return res.status(501).json({ error: "Chèn logo chưa được cấu hình." });
    }
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    if (!videoDubbingManager.getJob(req.params.jobId)) {
      return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
    }
    if (!req.is("application/octet-stream")) {
      return res.status(415).json({
        error: "Logo phải được gửi dưới dạng luồng application/octet-stream.",
      });
    }
    try {
      const job = await mediaCoordinator.uploadLogo(
        req.params.jobId,
        req,
        req.query.extension,
      );
      return res.json({ success: true, job });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể tải logo lên.";
      console.error("[VideoDubbing] Lỗi khi nhận logo:", error);
      if (!res.headersSent && !req.destroyed) {
        return res.status(message.includes("không tìm thấy") ? 404 : 400).json({
          error: message,
        });
      }
    }
  });

  router.get("/jobs/:jobId/logo", (req: Request, res: Response) => {
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    const filePath = mediaCoordinator?.getLogoPath(req.params.jobId);
    if (!filePath) {
      return res.status(404).json({ error: "Logo chưa được tải lên." });
    }
    res.type(path.extname(filePath));
    return res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        console.error("[VideoDubbing] Lỗi gửi logo:", error);
        res.status(500).end();
      }
    });
  });

  router.post(
    "/jobs/:jobId/export/cancel",
    async (req: Request, res: Response) => {
      if (!mediaCoordinator) {
        return res.status(501).json({ error: "Xuất MP4 chưa được cấu hình." });
      }
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      if (!videoDubbingManager.getJob(req.params.jobId)) {
        return res.status(404).json({ error: "Không tìm thấy job Video Dubbing." });
      }
      try {
        await mediaCoordinator.cancel(req.params.jobId);
        return res.json({
          success: true,
          job: videoDubbingManager.getJob(req.params.jobId),
        });
      } catch (error) {
        console.error("[VideoDubbing] Lỗi khi hủy xuất MP4:", error);
        return res.status(500).json({ error: "Không thể hủy xuất MP4." });
      }
    },
  );

  router.get(
    "/jobs/:jobId/download",
    (req: Request, res: Response) => {
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      const filePath = mediaCoordinator?.getVideoExportPath(req.params.jobId);
      if (!filePath) {
        return res.status(404).json({ error: "MP4 đầu ra chưa sẵn sàng." });
      }
      const fileName = path.basename(filePath);
      streamVideoDubbingMp4(req, res, filePath, fileName);
      return;
    },
  );

  router.post("/jobs/:jobId/open-export-folder", (req: Request, res: Response) => {
    if (!mediaCoordinator) {
      return res.status(501).json({ error: "Thư mục export chưa được cấu hình." });
    }
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    try {
      mediaCoordinator.openExportFolder(req.params.jobId);
      return res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Không thể mở thư mục export.";
      return res.status(404).json({ error: message });
    }
  });

  router.get(
    "/jobs/:jobId/exported-video",
    (req: Request, res: Response) => {
      if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
        return res.status(400).json({ error: "ID job video không hợp lệ." });
      }
      const filePath = mediaCoordinator?.getVideoExportPath(req.params.jobId);
      if (!filePath) {
        return res.status(404).json({ error: "MP4 đầu ra chưa sẵn sàng." });
      }
      streamVideoDubbingMp4(req, res, filePath);
      return;
    },
  );

  router.post("/jobs/:jobId/cancel", async (req: Request, res: Response) => {
    if (!videoDubbingManager.isValidJobId(req.params.jobId)) {
      return res.status(400).json({ error: "ID job video không hợp lệ." });
    }
    try {
      await pipelineCoordinator?.cancel(req.params.jobId);
      await separationCoordinator?.cancel(req.params.jobId);
      await mediaCoordinator?.cancel(req.params.jobId);
      await masterCoordinator?.cancel(req.params.jobId);
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
      await pipelineCoordinator?.cancel(req.params.jobId);
      await separationCoordinator?.cancel(req.params.jobId);
      await mediaCoordinator?.cancel(req.params.jobId);
      await masterCoordinator?.cancel(req.params.jobId);
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
