export function getOverlayAlignment(position) {
  const horizontal = position.endsWith("left")
    ? "flex-start"
    : position.endsWith("right")
      ? "flex-end"
      : "center";
  const vertical = position.startsWith("top")
    ? "flex-start"
    : position.startsWith("bottom")
      ? "flex-end"
      : "center";
  return { horizontal, vertical };
}

export function getSubtitleTextAlignment(position) {
  return position.endsWith("left")
    ? "left"
    : position.endsWith("right")
      ? "right"
      : "center";
}

export function getJobProcessingProgress(job) {
  if (job.autoPipeline?.status === "running") {
    const separating =
      job.autoPipeline.phase === "separation" &&
      job.separation?.status === "processing";
    return {
      label: separating
        ? "Đang tách audio"
        : job.autoPipeline.phase === "master"
          ? "Đang tạo TTS"
          : `Đang xử lý ${job.autoPipeline.phase}`,
      progressPercent: separating
        ? job.separation?.progressPercent
        : job.autoPipeline.progressPercent,
      colorClass: "bg-indigo-400",
    };
  }
  if (job.masterGeneration?.status === "generating") {
    return {
      label: "Đang tạo TTS Master",
      progressPercent: job.masterGeneration.progressPercent,
      colorClass: "bg-indigo-400",
    };
  }
  if (job.separation?.status === "processing") {
    return {
      label: "Đang tách audio",
      progressPercent: job.separation.progressPercent,
      colorClass: "bg-violet-400",
    };
  }
  if (
    job.finalMix?.status === "running" ||
    job.audioMix?.status === "running"
  ) {
    const task =
      job.finalMix?.status === "running" ? job.finalMix : job.audioMix;
    return {
      label: "Đang Mix Audio",
      progressPercent: task?.progressPercent,
      colorClass: "bg-cyan-400",
    };
  }
  if (job.videoExport?.status === "running") {
    return {
      label: job.videoExport.detail?.toLowerCase().includes("audio mp4")
        ? "Đang cập nhật Audio MP4"
        : "Đang Render",
      progressPercent: job.videoExport.progressPercent,
      colorClass: "bg-sky-400",
    };
  }
  return null;
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(seconds) {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const remainingSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}.${pad(milliseconds, 3)}`;
}

export function formatElapsed(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`
    : `${pad(minutes)}:${pad(remainingSeconds)}`;
}

export function formatFrameRate(frameRate) {
  return frameRate
    ? `${frameRate.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} fps`
    : "Không xác định";
}

export function statusLabel(job) {
  if (!job) return "Đang chuẩn bị upload";
  switch (job.status) {
    case "uploading":
      return "Đang tải video lên";
    case "probing":
      return "Đang kiểm tra video";
    case "completed":
      return "Đã kiểm tra video";
    case "failed":
      return "Kiểm tra thất bại";
    case "cancelled":
      return "Đã hủy";
    case "interrupted":
      return "Bị gián đoạn";
  }
}
