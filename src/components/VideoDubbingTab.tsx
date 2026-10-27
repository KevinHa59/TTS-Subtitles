import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  Film,
  HardDrive,
  LoaderCircle,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import {
  SrtAnalysis,
  VideoDubbingJob,
  VideoDubbingMetadata,
} from "../types/videoDubbing";
import { formatSecondsToSrtTime } from "../utils/srtParser";
import { analyzeSrtContent } from "../utils/videoDubbingSrt";

interface SelectedVideo {
  fileName: string;
  sizeBytes: number;
  progress: number;
  job: VideoDubbingJob | null;
  error?: string;
}

interface SelectedSrt {
  fileName: string;
  sizeBytes: number;
  analysis?: SrtAnalysis;
  error?: string;
}

interface PiperVoice {
  id: string;
  modelId: string;
  speakerId?: number;
  name: string;
  engine?: "piper" | "vieneu";
  hasLocalFile?: boolean;
}

const ACCEPTED_VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".mov",
  ".avi",
  ".webm",
]);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(seconds: number): string {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const remainingSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const pad = (value: number, length = 2) =>
    String(value).padStart(length, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}.${pad(milliseconds, 3)}`;
}

function formatFrameRate(frameRate: number | null): string {
  return frameRate ? `${frameRate.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} fps` : "Không xác định";
}

function statusLabel(job: VideoDubbingJob | null): string {
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
  }
}

function MetadataGrid({ metadata }: { metadata: VideoDubbingMetadata }) {
  const details = [
    ["Thời lượng", formatDuration(metadata.durationSeconds)],
    ["Độ phân giải", `${metadata.width} × ${metadata.height}`],
    ["Frame rate", formatFrameRate(metadata.frameRate)],
    ["Video codec", metadata.videoCodec.toUpperCase()],
    ["Audio codec", metadata.audioCodec?.toUpperCase() || "Không có audio"],
    [
      "Audio",
      metadata.audioCodec
        ? `${metadata.audioSampleRate ? `${metadata.audioSampleRate} Hz` : "?"} · ${metadata.audioChannels ? `${metadata.audioChannels} kênh` : "?"}`
        : "Không có audio stream",
    ],
    ["Container", metadata.container],
    ["Dung lượng", formatFileSize(metadata.sizeBytes)],
  ];

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
      {details.map(([label, value]) => (
        <div
          key={label}
          className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5"
        >
          <dt className="text-xs text-slate-400">{label}</dt>
          <dd className="text-xs font-semibold text-slate-100 text-right break-all">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function VideoDubbingTab() {
  const [video, setVideo] = useState<SelectedVideo | null>(null);
  const [srt, setSrt] = useState<SelectedSrt | null>(null);
  const [voices, setVoices] = useState<PiperVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [speedPriority, setSpeedPriority] = useState<
    "balanced" | "strict" | "natural"
  >("balanced");
  const [minSpeed, setMinSpeed] = useState(0.8);
  const [maxSpeed, setMaxSpeed] = useState(1.5);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [ttsVolumePercent, setTtsVolumePercent] = useState(100);
  const [originalVolumePercent, setOriginalVolumePercent] = useState(100);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<XMLHttpRequest | null>(null);
  const videoGenerationRef = useRef(0);
  const srtGenerationRef = useRef(0);
  const activeJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadVoices = async () => {
      try {
        const response = await fetch("/api/voices");
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.voices)) {
          throw new Error(result.error || "Không thể tải danh sách giọng Piper.");
        }
        const piperVoices = (result.voices as PiperVoice[]).filter(
          (voice) =>
            voice.engine === "piper" &&
            voice.hasLocalFile !== false &&
            Boolean(voice.modelId),
        );
        if (!active) return;
        setVoices(piperVoices);
        const defaultVoice = piperVoices.find(
          (voice) => voice.modelId === result.defaultModel,
        );
        setSelectedVoiceId(defaultVoice?.id || piperVoices[0]?.id || "");
        if (piperVoices.length === 0) {
          setVoicesError("Không tìm thấy mô hình Piper đã có sẵn trên máy.");
        }
      } catch (error) {
        if (!active) return;
        setVoicesError(
          error instanceof Error
            ? error.message
            : "Không thể tải danh sách giọng Piper.",
        );
      }
    };
    void loadVoices();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const jobId = video?.job?.id;
    const status = video?.job?.status;
    const masterStatus = video?.job?.masterGeneration?.status;
    if (
      video?.error ||
      !jobId ||
      (status !== "uploading" &&
        status !== "probing" &&
        masterStatus !== "generating" &&
        video?.job?.audioMix?.status !== "running" &&
        video?.job?.videoExport?.status !== "running")
    ) {
      return;
    }

    let active = true;
    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/video-dubbing/jobs/${jobId}`);
        const result = await response.json();
        if (!response.ok || !result.job || !active) return;
        const job = result.job as VideoDubbingJob;
        setVideo((current) =>
          current?.job?.id === jobId ? { ...current, job } : current,
        );
      } catch (error) {
        console.error("Không thể cập nhật trạng thái kiểm tra video:", error);
      }
    };

    void pollStatus();
    const interval = window.setInterval(() => void pollStatus(), 500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [
    video?.error,
    video?.job?.id,
    video?.job?.audioMix?.status,
    video?.job?.masterGeneration?.status,
    video?.job?.status,
    video?.job?.videoExport?.status,
  ]);

  const removeServerJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${jobId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Máy chủ trả về HTTP ${response.status}.`);
      }
    } catch (error) {
      console.error("Không thể dọn dữ liệu job Video Dubbing:", error);
    }
  };

  const clearVideo = () => {
    videoGenerationRef.current++;
    const jobId = activeJobIdRef.current;
    activeJobIdRef.current = null;
    if (uploadRef.current) {
      uploadRef.current.abort();
      uploadRef.current = null;
    }
    if (jobId) void removeServerJob(jobId);
    setVideo(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const uploadVideo = async (file: File) => {
    const generation = ++videoGenerationRef.current;
    setVideo({
      fileName: file.name,
      sizeBytes: file.size,
      progress: 0,
      job: null,
    });

    try {
      const createResponse = await fetch("/api/video-dubbing/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
      });
      const createResult = await createResponse.json();
      if (!createResponse.ok || !createResult.job) {
        throw new Error(createResult.error || "Không thể khởi tạo job video.");
      }

      const job = createResult.job as VideoDubbingJob;
      if (generation !== videoGenerationRef.current) {
        await removeServerJob(job.id);
        return;
      }
      activeJobIdRef.current = job.id;
      setVideo((current) =>
        current?.fileName === file.name
          ? { ...current, job }
          : current,
      );

      const request = new XMLHttpRequest();
      uploadRef.current = request;
      request.open("PUT", `/api/video-dubbing/jobs/${job.id}/video`);
      request.setRequestHeader("Content-Type", "application/octet-stream");
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable || generation !== videoGenerationRef.current) {
          return;
        }
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                progress: Math.min(100, (event.loaded / event.total) * 100),
              }
            : current,
        );
      };
      request.upload.onload = () => {
        if (generation !== videoGenerationRef.current) return;
        setVideo((current) =>
          current?.job?.id === job.id
            ? { ...current, progress: 100, job: { ...current.job!, status: "probing" } }
            : current,
        );
      };
      request.onload = () => {
        if (generation !== videoGenerationRef.current) return;
        uploadRef.current = null;
        try {
          const result = JSON.parse(request.responseText);
          if (!request.status || request.status >= 400) {
            setVideo((current) =>
              current?.job?.id === job.id
                ? {
                    ...current,
                    job: result.job || current.job,
                    error: result.error || "Không thể kiểm tra video.",
                  }
                : current,
            );
            return;
          }
          setVideo((current) =>
            current?.job?.id === job.id
              ? { ...current, job: result.job, progress: 100 }
              : current,
          );
        } catch {
          setVideo((current) =>
            current?.job?.id === job.id
              ? { ...current, error: "Máy chủ trả về phản hồi không hợp lệ." }
              : current,
          );
        }
      };
      request.onerror = () => {
        if (generation !== videoGenerationRef.current) return;
        uploadRef.current = null;
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                error: "Kết nối bị gián đoạn khi tải hoặc kiểm tra video.",
              }
            : current,
        );
      };
      request.onabort = () => {
        if (uploadRef.current === request) uploadRef.current = null;
      };
      request.send(file);
    } catch (error) {
      if (generation !== videoGenerationRef.current) return;
      const message =
        error instanceof Error ? error.message : "Không thể tải video lên.";
      setVideo((current) =>
        current?.fileName === file.name ? { ...current, error: message } : current,
      );
    }
  };

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    const generation = ++videoGenerationRef.current;
    const previousJobId = activeJobIdRef.current;
    activeJobIdRef.current = null;
    uploadRef.current?.abort();
    uploadRef.current = null;
    if (previousJobId) void removeServerJob(previousJobId);

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_VIDEO_EXTENSIONS.has(extension)) {
      setVideo({
        fileName: file.name,
        sizeBytes: file.size,
        progress: 0,
        job: null,
        error: "Định dạng video không được hỗ trợ. Hãy chọn MP4, MKV, MOV, AVI hoặc WebM.",
      });
      event.target.value = "";
      return;
    }
    void (async () => {
      if (previousJobId) await removeServerJob(previousJobId);
      if (generation === videoGenerationRef.current) {
        await uploadVideo(file);
      }
    })();
  };

  const handleSrtChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    const generation = ++srtGenerationRef.current;
    setSrt({ fileName: file.name, sizeBytes: file.size });

    if (!file.name.toLowerCase().endsWith(".srt")) {
      setSrt({
        fileName: file.name,
        sizeBytes: file.size,
        error: "Chỉ hỗ trợ tệp phụ đề .srt.",
      });
      event.target.value = "";
      return;
    }

    try {
      const content = await file.text();
      const analysis = analyzeSrtContent(content);
      if (generation !== srtGenerationRef.current) return;
      setSrt({ fileName: file.name, sizeBytes: file.size, analysis });
    } catch (error) {
      if (generation !== srtGenerationRef.current) return;
      setSrt({
        fileName: file.name,
        sizeBytes: file.size,
        error:
          error instanceof Error
            ? error.message
            : "Không thể đọc nội dung tệp SRT.",
      });
    }
  };

  const clearSrt = () => {
    srtGenerationRef.current++;
    setSrt(null);
    if (srtInputRef.current) srtInputRef.current.value = "";
  };

  const cancelVideo = async () => {
    const jobId = activeJobIdRef.current;
    videoGenerationRef.current++;
    activeJobIdRef.current = null;
    uploadRef.current?.abort();
    uploadRef.current = null;
    if (jobId) {
      try {
        const response = await fetch(
          `/api/video-dubbing/jobs/${jobId}/cancel`,
          { method: "POST" },
        );
        const result = await response.json();
        if (result.job) {
          setVideo((current) =>
            current?.job?.id === jobId
              ? { ...current, job: result.job, error: undefined }
              : current,
          );
          return;
        }
      } catch (error) {
        console.error("Không thể hủy job Video Dubbing:", error);
      }
    }
    setVideo((current) =>
      current ? { ...current, error: "Đã hủy quá trình tải/kiểm tra." } : current,
    );
  };

  const job = video?.job || null;
  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId);
  const masterGeneration = job?.masterGeneration;
  const isMasterGenerating = masterGeneration?.status === "generating";
  const audioMix = job?.audioMix;
  const videoExport = job?.videoExport;
  const hasMixedAudio = Boolean(audioMix?.sizeBytes && audioMix.sizeBytes > 0);
  const hasExportedVideo = Boolean(videoExport?.sizeBytes && videoExport.sizeBytes > 0);
  const isMediaProcessing =
    audioMix?.status === "running" || videoExport?.status === "running";
  const hasMasterAudio = Boolean(
    masterGeneration?.durationSeconds !== undefined &&
      masterGeneration.sizeBytes !== undefined,
  );
  const isMixCurrent = Boolean(
    audioMix?.status === "completed" &&
      audioMix.ttsVolumePercent === ttsVolumePercent &&
      audioMix.originalVolumePercent === originalVolumePercent,
  );
  const canGenerateMaster = Boolean(
    job?.status === "completed" &&
      srt?.analysis?.items.length &&
      selectedVoice &&
      !isMasterGenerating &&
      !isMediaProcessing,
  );
  const canCreateMix = Boolean(
    job?.status === "completed" &&
      hasMasterAudio &&
    !isMasterGenerating &&
    !isMediaProcessing &&
    audioMix?.status !== "running",
  );
  const canExportVideo = Boolean(
    job?.status === "completed" &&
    isMixCurrent &&
    !isMasterGenerating &&
    !isMediaProcessing,
  );
  const createMaster = async () => {
    if (!job || !srt?.analysis?.items.length || !selectedVoice) return;
    setMasterError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/master`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: srt.analysis.items,
            model: selectedVoice.modelId,
            speakerId: selectedVoice.speakerId,
            options: { minSpeed, maxSpeed, speedPriority },
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu tạo TTS Master.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: { ...current.job, masterGeneration: result.masterGeneration },
            }
          : current,
      );
    } catch (error) {
      setMasterError(
        error instanceof Error
          ? error.message
          : "Không thể bắt đầu tạo TTS Master.",
      );
    }
  };
  const cancelMaster = async () => {
    if (!job) return;
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/master/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy tạo TTS Master.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id ? { ...current, job: result.job } : current,
        );
      }
    } catch (error) {
      setMasterError(
        error instanceof Error ? error.message : "Không thể hủy TTS Master.",
      );
    }
  };
  const startAudioMix = async () => {
    if (!job) return;
    setMediaError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/audio-mix`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ttsVolumePercent, originalVolumePercent }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu trộn âm thanh.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? { ...current, job: { ...current.job, audioMix: result.audioMix } }
          : current,
      );
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể bắt đầu trộn âm thanh.",
      );
    }
  };
  const startVideoExport = async () => {
    if (!job) return;
    setMediaError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/export`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu xuất MP4.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? { ...current, job: { ...current.job, videoExport: result.videoExport } }
          : current,
      );
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể bắt đầu xuất MP4.",
      );
    }
  };
  const cancelMediaTask = async (
    task: "audio-mix" | "export",
  ) => {
    if (!job) return;
    setMediaError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/${task}/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy tác vụ media.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id ? { ...current, job: result.job } : current,
        );
      }
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể hủy tác vụ media.",
      );
    }
  };
  const isBusy =
    !video?.error &&
    (!job || job.status === "uploading" || job.status === "probing");

  return (
    <section className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6 text-slate-200">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Video Dubbing</h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Tạo TTS Master theo timestamp bằng pipeline Đồng Bộ Phụ Đề hiện có.
            </p>
          </div>
        </div>
        <span className="self-start sm:self-auto px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-800 text-slate-300 border border-slate-700">
          Giai đoạn 3A · Trộn & xuất video
        </span>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-white">Video nguồn</h3>
            </div>
            {video && (
              <button
                type="button"
                onClick={isBusy ? () => void cancelVideo() : clearVideo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                {isBusy ? (
                  <>
                    <X className="w-3.5 h-3.5" />
                    Hủy
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Bỏ video
                  </>
                )}
              </button>
            )}
          </div>

          <input
            ref={videoInputRef}
            type="file"
            accept=".mp4,.mkv,.mov,.avi,.webm,video/mp4,video/x-matroska,video/quicktime,video/x-msvideo,video/webm"
            onChange={handleVideoChange}
            className="hidden"
          />
          {!video ? (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="w-full min-h-40 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 text-slate-300 hover:border-amber-500/50 hover:bg-slate-950 transition-colors"
            >
              <Upload className="w-6 h-6 text-amber-400" />
              <span className="text-sm font-semibold">Chọn video từ máy tính</span>
              <span className="text-xs text-slate-500">MP4 · MKV · MOV · AVI · WebM</span>
            </button>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-800 text-amber-300 flex items-center justify-center shrink-0">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white break-all">{video.fileName}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatFileSize(video.sizeBytes)}</p>
                </div>
              </div>

              {isBusy && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-amber-300">
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                      {statusLabel(job)}
                    </span>
                    <span className="text-slate-400">
                      {job?.status === "probing"
                        ? "Đang đọc metadata…"
                        : `${Math.round(video.progress)}%`}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-amber-400 transition-all ${job?.status === "probing" ? "animate-pulse" : ""}`}
                      style={{ width: `${job?.status === "probing" ? 100 : video.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {job && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  {job.status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : job.status === "failed" || job.status === "cancelled" ? (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Clock3 className="w-4 h-4 text-amber-400" />
                  )}
                  <span className={job.status === "completed" ? "text-emerald-300" : "text-slate-300"}>
                    {statusLabel(job)}
                  </span>
                </div>
              )}

              {video.error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{video.error}</span>
                </div>
              )}

              {job?.status === "completed" && job.metadata && (
                <MetadataGrid metadata={job.metadata} />
              )}
              {job?.status === "failed" && job.error && !video.error && (
                <p className="mt-3 text-xs text-rose-300">{job.error}</p>
              )}

              {!isBusy && (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Chọn video khác
                </button>
              )}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-500">
            Video được gửi đến backend cục bộ để kiểm tra bằng FFprobe; tệp nguồn trên máy không bị chỉnh sửa.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-white">Phụ đề SRT</h3>
            </div>
            {srt && (
              <button
                type="button"
                onClick={clearSrt}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Bỏ SRT
              </button>
            )}
          </div>

          <input
            ref={srtInputRef}
            type="file"
            accept=".srt,application/x-subrip"
            onChange={(event) => void handleSrtChange(event)}
            className="hidden"
          />
          {!srt ? (
            <button
              type="button"
              onClick={() => srtInputRef.current?.click()}
              className="w-full min-h-40 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 text-slate-300 hover:border-amber-500/50 hover:bg-slate-950 transition-colors"
            >
              <Upload className="w-6 h-6 text-amber-400" />
              <span className="text-sm font-semibold">Chọn tệp phụ đề</span>
              <span className="text-xs text-slate-500">Chỉ hỗ trợ định dạng .SRT</span>
            </button>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-800 text-amber-300 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white break-all">{srt.fileName}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatFileSize(srt.sizeBytes)}</p>
                </div>
              </div>

              {srt.error ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{srt.error}</span>
                </div>
              ) : srt.analysis ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <p className="text-[11px] text-slate-400">Subtitle hợp lệ</p>
                    <p className="mt-1 text-sm font-bold text-emerald-300">{srt.analysis.subtitleCount}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <p className="text-[11px] text-slate-400">Bắt đầu sớm nhất</p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {formatSecondsToSrtTime(srt.analysis.earliestStart)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <p className="text-[11px] text-slate-400">Kết thúc muộn nhất</p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {formatSecondsToSrtTime(srt.analysis.latestEnd)}
                    </p>
                  </div>
                  {srt.analysis.invalidBlockCount > 0 && (
                    <div className="sm:col-span-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>
                        Bỏ qua {srt.analysis.invalidBlockCount} block không hợp lệ trong phần thống kê. Nội dung tệp không bị thay đổi.
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-500">
            SRT được đọc ngay trong trình duyệt để thống kê sơ bộ; nội dung phụ đề không được tải lên máy chủ.
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center shrink-0">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Tạo TTS Master</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Dùng pipeline Đồng Bộ Phụ Đề hiện có: Piper tạo từng câu, căn theo
              timestamp rồi ghép WAV mono 22,050 Hz. Nếu timeline vượt video,
              phần dư cuối track sẽ được trim.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-300">Giọng Piper</span>
            <select
              value={selectedVoiceId}
              onChange={(event) => setSelectedVoiceId(event.target.value)}
              disabled={voices.length === 0}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none disabled:opacity-50"
            >
              {voices.length === 0 ? (
                <option value="">Không có giọng Piper khả dụng</option>
              ) : (
                voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-300">Ưu tiên tốc độ</span>
            <select
              value={speedPriority}
              onChange={(event) =>
                setSpeedPriority(
                  event.target.value as "balanced" | "strict" | "natural",
                )
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="balanced">Cân bằng</option>
              <option value="strict">Khớp timestamp</option>
              <option value="natural">Ưu tiên tự nhiên</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-300">Tốc độ tối thiểu</span>
            <select
              value={minSpeed}
              onChange={(event) => setMinSpeed(Number(event.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            >
              {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((speed) => (
                <option key={speed} value={speed}>{speed.toFixed(1)}×</option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-300">Tốc độ tối đa</span>
            <select
              value={maxSpeed}
              onChange={(event) => setMaxSpeed(Number(event.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            >
              {[1.1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((speed) => (
                <option key={speed} value={speed}>{speed.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}×</option>
              ))}
            </select>
          </label>
        </div>

        {voicesError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{voicesError}</span>
          </div>
        )}

        {masterGeneration?.status === "generating" && (
          <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-2 text-amber-200">
                <LoaderCircle className="w-4 h-4 animate-spin" />
                Đang tạo TTS Master
              </span>
              <span className="text-slate-300">
                {masterGeneration.completedSentences}/{masterGeneration.totalSentences} câu · {Math.round(masterGeneration.progressPercent)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{ width: `${masterGeneration.progressPercent}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => void cancelMaster()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Hủy tạo Master
            </button>
          </div>
        )}

        {masterError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{masterError}</span>
          </div>
        )}
        {masterGeneration?.status === "failed" && masterGeneration.error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{masterGeneration.error}</span>
          </div>
        )}
        {masterGeneration?.status === "cancelled" && !isMasterGenerating && (
          <p className="text-xs text-slate-400">Đã hủy quá trình tạo TTS Master.</p>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={() => void createMaster()}
            disabled={!canGenerateMaster}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            {isMasterGenerating ? (
              <LoaderCircle className="w-4 h-4 animate-spin" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
            Tạo TTS Master
          </button>
          {!canGenerateMaster && !isMasterGenerating && (
            <p className="text-xs text-slate-500">
              Cần video đã kiểm tra thành công, SRT có cue hợp lệ và một giọng Piper.
            </p>
          )}
        </div>

        {hasMasterAudio && masterGeneration?.durationSeconds !== undefined && (
            <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                  {masterGeneration.status === "completed" ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      TTS Master hoàn tất
                    </>
                  ) : (
                    "Master đã hoàn tất trước đó, vẫn được giữ"
                  )}
                </span>
                <span className="text-slate-300">
                  Thời lượng {formatDuration(masterGeneration.durationSeconds)}
                </span>
                {masterGeneration.sizeBytes !== undefined && (
                  <span className="text-slate-400">
                    {formatFileSize(masterGeneration.sizeBytes)}
                  </span>
                )}
              </div>
              <audio
                key={`${job?.id}-${masterGeneration.sizeBytes}`}
                controls
                preload="metadata"
                src={`/api/video-dubbing/jobs/${job?.id}/master-audio`}
                className="w-full"
              >
                Trình duyệt không hỗ trợ phát WAV.
              </audio>
            </div>
          )}

        <p className="text-[11px] leading-relaxed text-slate-500">
          Tùy chọn giọng/tốc độ chỉ áp dụng cho lần tạo mới; Master đã hoàn tất
          vẫn được giữ nguyên cho đến khi tạo Master mới hoặc bỏ job video.
        </p>
      </section>

      {hasMasterAudio && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-300 border border-sky-500/25 flex items-center justify-center shrink-0">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Trộn âm thanh</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Điều chỉnh riêng gain của TTS Master và audio gốc. 100% giữ
                gain nguồn; giới hạn mỗi thanh từ 0% đến 200%.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {([
              {
                label: "TTS Master",
                value: ttsVolumePercent,
                update: setTtsVolumePercent,
              },
              {
                label: "Âm thanh gốc của video",
                value: originalVolumePercent,
                update: setOriginalVolumePercent,
              },
            ] as const).map((volume) => (
              <label key={volume.label} className="space-y-2">
                <span className="flex items-center justify-between text-xs font-medium text-slate-300">
                  {volume.label}
                  <span className="font-bold text-white">{volume.value}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={volume.value}
                  onChange={(event) => volume.update(Number(event.target.value))}
                  disabled={isMediaProcessing}
                  className="w-full accent-amber-400 disabled:opacity-50"
                  aria-label={`${volume.label} volume`}
                />
                <span className="flex justify-between text-[10px] text-slate-500">
                  <span>Tắt tiếng</span>
                  <span>100% nguồn</span>
                  <span>200%</span>
                </span>
              </label>
            ))}
          </div>

          {job?.metadata?.audioCodec === null && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
              Video không có audio gốc; track audio gốc sẽ là im lặng. Bạn vẫn
              có thể chọn mức âm lượng nhưng không có âm thanh để khuếch đại.
            </p>
          )}

          {mediaError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{mediaError}</span>
            </div>
          )}
          {audioMix?.status === "failed" && audioMix.error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{audioMix.error}</span>
            </div>
          )}
          {videoExport?.status === "failed" && videoExport.error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{videoExport.error}</span>
            </div>
          )}

          {audioMix?.status === "running" && (
            <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-2 text-amber-200">
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                  {audioMix.phase === "extracting"
                    ? "Đang trích xuất audio gốc"
                    : audioMix.phase === "validating"
                      ? "Đang xác minh bản phối"
                      : "Đang trộn âm thanh"}
                </span>
                <span className="text-slate-300">
                  {audioMix.progressPercent === undefined
                    ? "Đang xử lý…"
                    : `${audioMix.progressPercent}%`}
                </span>
              </div>
              {audioMix.progressPercent !== undefined && (
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${audioMix.progressPercent}%` }}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => void cancelMediaTask("audio-mix")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Hủy trộn
              </button>
            </div>
          )}
          {videoExport?.status === "running" && (
            <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-2 text-amber-200">
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                  {videoExport.phase === "validating"
                    ? "Đang xác minh MP4"
                    : "Đang xuất MP4 (copy video stream)"}
                </span>
                <span className="text-slate-300">
                  {videoExport.progressPercent === undefined
                    ? "Đang xử lý…"
                    : `${videoExport.progressPercent}%`}
                </span>
              </div>
              {videoExport.progressPercent !== undefined && (
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${videoExport.progressPercent}%` }}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => void cancelMediaTask("export")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Hủy xuất video
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={() => void startAudioMix()}
              disabled={!canCreateMix}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {audioMix?.status === "running" ? (
                <LoaderCircle className="w-4 h-4 animate-spin" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
              Tạo bản phối âm thanh
            </button>
            {audioMix?.status === "completed" && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                Bản phối sẵn sàng
                {audioMix.durationSeconds !== undefined &&
                  ` · ${formatDuration(audioMix.durationSeconds)}`}
              </span>
            )}
          </div>

          {hasMixedAudio && job && (
            <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
              <p className="text-xs font-semibold text-emerald-300">
                {isMixCurrent
                  ? "Nghe thử bản phối"
                  : "Bản phối trước đó vẫn được giữ nguyên"}
              </p>
              <audio
                key={`${job.id}-${audioMix?.sizeBytes}`}
                controls
                preload="metadata"
                src={`/api/video-dubbing/jobs/${job.id}/mixed-audio`}
                className="w-full"
              >
                Trình duyệt không hỗ trợ phát audio AAC.
              </audio>
            </div>
          )}

          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={() => void startVideoExport()}
                disabled={!canExportVideo}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {videoExport?.status === "running" ? (
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                ) : (
                  <Film className="w-4 h-4" />
                )}
                Xuất video MP4
              </button>
              {hasExportedVideo && job && (
                <a
                  href={`/api/video-dubbing/jobs/${job.id}/download`}
                  download={`video-dubbing-${job.id}.mp4`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-950/60"
                >
                  {videoExport?.status === "completed" && isMixCurrent
                    ? "Tải MP4"
                    : "Tải MP4 trước đó"}{" "}
                  ({formatFileSize(videoExport?.sizeBytes || 0)})
                </a>
              )}
              {hasExportedVideo &&
                videoExport?.durationSeconds !== undefined && (
                  <span className="text-xs text-slate-400">
                    {formatDuration(videoExport.durationSeconds)}
                  </span>
                )}
            </div>
            {!isMixCurrent && (
              <p className="text-xs text-slate-500">
                Tạo lại bản phối với mức âm lượng hiện tại trước khi xuất video.
              </p>
            )}
          </div>
        </section>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs text-slate-400">
        <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
        <p>
          Giai đoạn này trộn TTS Master với audio gốc và remux video thành MP4. Chưa có AI separation hoặc preset.
        </p>
      </div>
    </section>
  );
}
