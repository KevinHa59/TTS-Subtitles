import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  Clock3,
  FileText,
  Film,
  FolderOpen,
  HardDrive,
  History,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import {
  SrtAnalysis,
  VideoDubbingJob,
  VideoDubbingJobHistoryItem,
  VideoDubbingMetadata,
  VideoDubbingMixerSettings,
  VideoDubbingMixerTrack,
  VideoDubbingSeparationAvailability,
} from "../types/videoDubbing";
import { formatSecondsToSrtTime } from "../utils/srtParser";
import { analyzeSrtContent } from "../utils/videoDubbingSrt";

interface SelectedVideo {
  fileName: string;
  sizeBytes: number;
  progress: number;
  job: VideoDubbingJob | null;
  error?: string;
  warning?: string;
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

const DEFAULT_MIXER_SETTINGS: VideoDubbingMixerSettings = {
  vocals: { volumePercent: 100, muted: false },
  instrumental: { volumePercent: 100, muted: false },
  ttsMaster: { volumePercent: 100, muted: false },
};

interface PreviewTrackNode {
  element: HTMLAudioElement;
  gain: GainNode;
}

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
    case "interrupted":
      return "Bị gián đoạn";
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
  const [mixerSettings, setMixerSettings] =
    useState<VideoDubbingMixerSettings>(DEFAULT_MIXER_SETTINGS);
  const [mixerSettingsSaved, setMixerSettingsSaved] = useState(false);
  const [mixerMode, setMixerMode] = useState<"legacy" | "final">("legacy");
  const [mixerError, setMixerError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<
    "stopped" | "playing" | "paused"
  >("stopped");
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [separationAvailability, setSeparationAvailability] =
    useState<VideoDubbingSeparationAvailability | null>(null);
  const [separationError, setSeparationError] = useState<string | null>(null);
  const [jobHistory, setJobHistory] = useState<VideoDubbingJobHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<XMLHttpRequest | null>(null);
  const videoGenerationRef = useRef(0);
  const srtGenerationRef = useRef(0);
  const activeJobIdRef = useRef<string | null>(null);
  const mixerSettingsTimerRef = useRef<number | null>(null);
  const mixerSettingsRequestRef = useRef(0);
  const mixerSaveChainRef = useRef(Promise.resolve());
  const mixerTouchedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previewNodesRef = useRef<Map<VideoDubbingMixerTrack, PreviewTrackNode>>(
    new Map(),
  );
  const previewJobIdRef = useRef<string | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const previewClockRef = useRef({ offset: 0, startedAt: 0 });

  const releasePreviewGraph = (updateUi = true) => {
    if (previewTimerRef.current !== null) {
      window.clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    for (const { element } of previewNodesRef.current.values()) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
    previewNodesRef.current.clear();
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch((error: unknown) => {
        console.error("Không thể đóng Web Audio context:", error);
      });
    }
    previewJobIdRef.current = null;
    previewClockRef.current = { offset: 0, startedAt: 0 };
    if (updateUi) {
      setPreviewStatus("stopped");
      setPreviewCurrentTime(0);
    }
  };

  const pauseMixerPreview = () => {
    const context = audioContextRef.current;
    if (previewStatus !== "playing" || !context) return;
    const elapsed = Math.max(
      0,
      context.currentTime - previewClockRef.current.startedAt,
    );
    previewClockRef.current.offset += elapsed;
    for (const { element } of previewNodesRef.current.values()) {
      element.pause();
    }
    if (previewTimerRef.current !== null) {
      window.clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreviewCurrentTime(previewClockRef.current.offset);
    setPreviewStatus("paused");
  };

  const stopMixerPreview = () => {
    for (const { element } of previewNodesRef.current.values()) {
      element.pause();
      try {
        element.currentTime = 0;
      } catch (error) {
        console.error("Không thể tua track mixer về đầu:", error);
      }
    }
    if (previewTimerRef.current !== null) {
      window.clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    previewClockRef.current = { offset: 0, startedAt: 0 };
    setPreviewCurrentTime(0);
    setPreviewStatus("stopped");
  };

  const seekMixerPreview = (time: number) => {
    const context = audioContextRef.current;
    const seekTo = Math.max(0, time);
    for (const { element } of previewNodesRef.current.values()) {
      try {
        element.currentTime = seekTo;
      } catch (error) {
        console.error("Không thể seek track mixer:", error);
      }
    }
    previewClockRef.current = {
      offset: seekTo,
      startedAt: context?.currentTime || 0,
    };
    setPreviewCurrentTime(seekTo);
  };

  const updateMixerSetting = (
    track: VideoDubbingMixerTrack,
    patch: Partial<VideoDubbingMixerSettings[VideoDubbingMixerTrack]>,
  ) => {
    mixerTouchedRef.current = true;
    setMixerMode("final");
    setMixerSettingsSaved(false);
    setMixerSettings((current) => ({
      ...current,
      [track]: { ...current[track], ...patch },
    }));
  };

  const playMixerPreview = async () => {
    const job = video?.job;
    if (!job) return;
    if (previewStatus === "playing") {
      pauseMixerPreview();
      return;
    }
    const availableTracks: Array<{
      track: VideoDubbingMixerTrack;
      url: string;
    }> = [];
    if (
      job.masterGeneration?.sizeBytes &&
      job.masterGeneration.durationSeconds !== undefined
    ) {
      availableTracks.push({
        track: "ttsMaster",
        url: `/api/video-dubbing/jobs/${job.id}/master-audio`,
      });
    }
    if (job.separation?.vocalsSizeBytes) {
      availableTracks.push({
        track: "vocals",
        url: `/api/video-dubbing/jobs/${job.id}/separation/vocals`,
      });
    }
    if (job.separation?.instrumentalSizeBytes) {
      availableTracks.push({
        track: "instrumental",
        url: `/api/video-dubbing/jobs/${job.id}/separation/instrumental`,
      });
    }
    const included = availableTracks.filter(
      ({ track }) =>
        !mixerSettings[track].muted &&
        mixerSettings[track].volumePercent > 0,
    );
    if (included.length === 0) {
      setPreviewError("Bật ít nhất một track có sẵn để nghe thử.");
      return;
    }
    setPreviewError(null);
    try {
      let context = audioContextRef.current;
      if (!context || previewJobIdRef.current !== job.id) {
        releasePreviewGraph(false);
        context = new AudioContext();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -1;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.15;
        limiter.connect(context.destination);
        audioContextRef.current = context;
        previewJobIdRef.current = job.id;
        for (const { track, url } of availableTracks) {
          const element = new Audio();
          element.preload = "auto";
          element.src = url;
          const source = context.createMediaElementSource(element);
          const gain = context.createGain();
          source.connect(gain);
          gain.connect(limiter);
          const setting = mixerSettings[track];
          gain.gain.value = setting.muted ? 0 : setting.volumePercent / 100;
          previewNodesRef.current.set(track, { element, gain });
        }
      }
      await context.resume();
      const nodes = included
        .map(({ track }) => previewNodesRef.current.get(track))
        .filter((node): node is PreviewTrackNode => Boolean(node));
      if (nodes.length !== included.length) {
        throw new Error("Không thể tạo đầy đủ các track nghe thử.");
      }
      await Promise.all(nodes.map(({ element }) => element.play()));
      const duration = job.metadata?.durationSeconds || 0;
      const offset = previewClockRef.current.offset;
      for (const { element } of nodes) {
        if (offset > 0 && Number.isFinite(element.duration)) {
          element.currentTime = Math.min(offset, element.duration);
        } else if (offset > 0) {
          element.currentTime = offset;
        }
      }
      previewClockRef.current = {
        offset,
        startedAt: context.currentTime,
      };
      setPreviewCurrentTime(offset);
      setPreviewStatus("playing");
      previewTimerRef.current = window.setInterval(() => {
        const currentContext = audioContextRef.current;
        if (!currentContext) return;
        const current =
          previewClockRef.current.offset +
          currentContext.currentTime -
          previewClockRef.current.startedAt;
        if (duration > 0 && current >= duration) {
          stopMixerPreview();
          return;
        }
        setPreviewCurrentTime(Math.min(current, duration || current));
      }, 100);
    } catch (error) {
      for (const { element } of previewNodesRef.current.values()) {
        element.pause();
      }
      setPreviewStatus("paused");
      setPreviewError(
        error instanceof Error ? error.message : "Không thể phát mixer preview.",
      );
    }
  };

  const loadJobHistory = async (): Promise<VideoDubbingJobHistoryItem[]> => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch("/api/video-dubbing/jobs");
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.jobs)) {
        throw new Error(result.error || "Không thể tải lịch sử Video Dubbing.");
      }
      const items = result.jobs as VideoDubbingJobHistoryItem[];
      setJobHistory(items);
      return items;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể tải lịch sử Video Dubbing.";
      setHistoryError(message);
      return [];
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistoryJob = (item: VideoDubbingJobHistoryItem) => {
    videoGenerationRef.current++;
    uploadRef.current?.abort();
    uploadRef.current = null;
    activeJobIdRef.current = item.job.id;
    setVideo({
      fileName: item.job.fileName,
      sizeBytes: item.job.sizeBytes,
      progress: 100,
      job: item.job,
      warning: item.warning,
    });
    setSrt(null);
    setMasterError(null);
    setMediaError(null);
    setSeparationError(null);
    if (srtInputRef.current) srtInputRef.current.value = "";
  };

  const deleteHistoryJob = async (item: VideoDubbingJobHistoryItem) => {
    if (
      !window.confirm(
        `Xóa job "${item.job.fileName}" và toàn bộ file đầu ra của job này?`,
      )
    ) {
      return;
    }
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${item.job.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể xóa job Video Dubbing.");
      }
      setJobHistory((current) =>
        current.filter((entry) => entry.job.id !== item.job.id),
      );
      if (activeJobIdRef.current === item.job.id) {
        activeJobIdRef.current = null;
        setVideo(null);
      }
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "Không thể xóa job Video Dubbing.",
      );
    }
  };

  useEffect(() => {
    let active = true;
    void loadJobHistory().then((items) => {
      if (!active || activeJobIdRef.current || items.length === 0) return;
      openHistoryJob(items[0]);
    });
    return () => {
      active = false;
    };
  }, []);

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
    let active = true;
    const loadSeparationAvailability = async () => {
      try {
        const response = await fetch("/api/video-dubbing/separation/status");
        const result = (await response.json()) as VideoDubbingSeparationAvailability;
        if (!response.ok) {
          throw new Error("Không thể kiểm tra công cụ tách audio.");
        }
        if (active) setSeparationAvailability(result);
      } catch {
        if (active) {
          setSeparationAvailability({
            status: "unavailable",
            model: "htdemucs",
            message: "Không thể kiểm tra trạng thái Demucs trên máy này.",
          });
        }
      }
    };
    void loadSeparationAvailability();
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
        video?.job?.finalMix?.status !== "running" &&
        video?.job?.videoExport?.status !== "running" &&
        video?.job?.separation?.status !== "processing")
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
    video?.job?.finalMix?.status,
    video?.job?.masterGeneration?.status,
    video?.job?.separation?.status,
    video?.job?.status,
    video?.job?.videoExport?.status,
  ]);

  const serverMixerSettingsKey = JSON.stringify(
    video?.job?.mixerSettings || null,
  );
  const localMixerSettingsKey = JSON.stringify(mixerSettings);

  useEffect(() => {
    releasePreviewGraph();
    setPreviewError(null);
    setMixerError(null);
    mixerTouchedRef.current = false;
  }, [video?.job?.id]);

  useEffect(() => {
    const savedSettings = video?.job?.mixerSettings;
    setMixerSettings(savedSettings || DEFAULT_MIXER_SETTINGS);
    setMixerSettingsSaved(Boolean(savedSettings));
    setMixerMode(
      video?.job?.mixSelection ||
        (savedSettings ? "final" : "legacy"),
    );
  }, [video?.job?.id, serverMixerSettingsKey, video?.job?.mixSelection]);

  useEffect(() => {
    const job = video?.job;
    if (!job || job.status !== "completed" || !mixerTouchedRef.current) return;
    const version = ++mixerSettingsRequestRef.current;
    if (mixerSettingsTimerRef.current !== null) {
      window.clearTimeout(mixerSettingsTimerRef.current);
    }
    mixerSettingsTimerRef.current = window.setTimeout(() => {
      mixerSaveChainRef.current = mixerSaveChainRef.current.then(async () => {
        if (version !== mixerSettingsRequestRef.current) return;
        try {
          const response = await fetch(
            `/api/video-dubbing/jobs/${job.id}/mixer-settings`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: localMixerSettingsKey,
            },
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Không thể lưu mixer settings.");
          }
          if (version === mixerSettingsRequestRef.current) {
            mixerTouchedRef.current = false;
            setMixerSettingsSaved(true);
            setMixerError(null);
          }
        } catch (error) {
          if (version === mixerSettingsRequestRef.current) {
            setMixerSettingsSaved(false);
            setMixerError(
              error instanceof Error
                ? error.message
                : "Không thể lưu mixer settings.",
            );
          }
        }
      });
    }, 350);
    return () => {
      if (mixerSettingsTimerRef.current !== null) {
        window.clearTimeout(mixerSettingsTimerRef.current);
        mixerSettingsTimerRef.current = null;
      }
    };
  }, [
    video?.job?.id,
    video?.job?.status,
    localMixerSettingsKey,
  ]);

  useEffect(() => {
    const context = audioContextRef.current;
    if (!context) return;
    for (const [track, node] of previewNodesRef.current) {
      const setting = mixerSettings[track];
      node.gain.gain.setTargetAtTime(
        setting.muted ? 0 : setting.volumePercent / 100,
        context.currentTime,
        0.015,
      );
    }
  }, [localMixerSettingsKey]);

  useEffect(
    () => () => {
      releasePreviewGraph(false);
      if (mixerSettingsTimerRef.current !== null) {
        window.clearTimeout(mixerSettingsTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const job = video?.job;
    if (!job) return;
    setJobHistory((current) =>
      current.map((item) =>
        item.job.id === job.id
          ? {
              ...item,
              job,
              outputs: {
                ...item.outputs,
                sourceVideo:
                  job.status === "completed" && Boolean(job.metadata),
                masterAudio:
                  job.masterGeneration?.status === "completed" ||
                  item.outputs.masterAudio,
                vocals:
                  Boolean(job.separation?.vocalsSizeBytes) || item.outputs.vocals,
                instrumental:
                  Boolean(job.separation?.instrumentalSizeBytes) ||
                  item.outputs.instrumental,
                mixedAudio:
                  job.audioMix?.status === "completed" || item.outputs.mixedAudio,
                exportedVideo:
                  job.videoExport?.status === "completed" ||
                  item.outputs.exportedVideo,
                finalMix:
                  job.finalMix?.status === "completed" || item.outputs.finalMix,
              },
            }
          : item,
      ),
    );
  }, [video?.job]);

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
    activeJobIdRef.current = null;
    if (uploadRef.current) {
      uploadRef.current.abort();
      uploadRef.current = null;
    }
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
          void loadJobHistory();
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
    const previousJobStatus = video?.job?.status;
    activeJobIdRef.current = null;
    uploadRef.current?.abort();
    uploadRef.current = null;
    if (
      previousJobId &&
      (previousJobStatus === "uploading" || previousJobStatus === "probing")
    ) {
      void fetch(`/api/video-dubbing/jobs/${previousJobId}/cancel`, {
        method: "POST",
      });
    }

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
  const finalMix = job?.finalMix;
  const videoExport = job?.videoExport;
  const separation = job?.separation;
  const isSeparationProcessing = separation?.status === "processing";
  const hasMixedAudio = Boolean(audioMix?.sizeBytes && audioMix.sizeBytes > 0);
  const hasFinalMix = Boolean(finalMix?.sizeBytes && finalMix.sizeBytes > 44);
  const hasExportedVideo = Boolean(videoExport?.sizeBytes && videoExport.sizeBytes > 0);
  const isMediaProcessing =
    audioMix?.status === "running" ||
    finalMix?.status === "running" ||
    videoExport?.status === "running" ||
    isSeparationProcessing;
  const hasMasterAudio = Boolean(
    masterGeneration?.durationSeconds !== undefined &&
      masterGeneration.sizeBytes !== undefined,
  );
  const isMixCurrent = Boolean(
    audioMix?.status === "completed" &&
      audioMix.ttsVolumePercent === ttsVolumePercent &&
      audioMix.originalVolumePercent === originalVolumePercent,
  );
  const isFinalMixCurrent = Boolean(
    finalMix &&
      finalMix.status !== "stale" &&
      finalMix.status !== "idle" &&
      finalMix.sizeBytes &&
      JSON.stringify(finalMix.renderedSettings) === localMixerSettingsKey,
  );
  const isSelectedMixCurrent =
    mixerMode === "final"
      ? mixerSettingsSaved && isFinalMixCurrent
      : isMixCurrent;
  const mixerTrackAvailability: Record<VideoDubbingMixerTrack, boolean> = {
    vocals: Boolean(separation?.vocalsSizeBytes),
    instrumental: Boolean(
      separation?.instrumentalSizeBytes,
    ),
    ttsMaster: hasMasterAudio,
  };
  const hasPreviewTrack = Object.entries(mixerTrackAvailability).some(
    ([track, available]) =>
      available &&
      !mixerSettings[track as VideoDubbingMixerTrack].muted &&
      mixerSettings[track as VideoDubbingMixerTrack].volumePercent > 0,
  );
  const canRenderFinalMix = Boolean(
    job?.status === "completed" &&
      hasMasterAudio &&
      hasPreviewTrack &&
      !isMasterGenerating &&
      !isMediaProcessing,
  );
  const canStartSeparation = Boolean(
    job?.status === "completed" &&
      !isSeparationProcessing &&
      separationAvailability?.status === "ready" &&
      Boolean(job.metadata?.audioCodec) &&
      !isMasterGenerating &&
      !isMediaProcessing,
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
    isSelectedMixCurrent &&
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
  const startFinalMix = async () => {
    if (!job) return;
    setMediaError(null);
    setMixerError(null);
    try {
      await flushMixerSettings(job.id);
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/final-mix`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: localMixerSettingsKey,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể render final mix.");
      }
      setMixerMode("final");
      setMixerSettingsSaved(true);
      mixerTouchedRef.current = false;
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: {
                ...current.job,
                mixerSettings,
                mixSelection: "final",
                finalMix: result.finalMix,
              },
            }
          : current,
      );
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể render final mix.",
      );
    }
  };
  const cancelFinalMix = async () => {
    if (!job) return;
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/final-mix/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy final mix.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id ? { ...current, job: result.job } : current,
        );
      }
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể hủy final mix.",
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
  const flushMixerSettings = async (jobId: string) => {
    if (mixerSettingsTimerRef.current !== null) {
      window.clearTimeout(mixerSettingsTimerRef.current);
      mixerSettingsTimerRef.current = null;
    }
    const version = ++mixerSettingsRequestRef.current;
    if (!mixerTouchedRef.current) return;
    const response = await fetch(
      `/api/video-dubbing/jobs/${jobId}/mixer-settings`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: localMixerSettingsKey,
      },
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Không thể lưu mixer settings.");
    }
    if (version === mixerSettingsRequestRef.current) {
      mixerTouchedRef.current = false;
      setMixerSettingsSaved(true);
      setMixerError(null);
    }
  };
  const startAudioMix = async () => {
    if (!job) return;
    setMediaError(null);
    try {
      await flushMixerSettings(job.id);
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
          ? {
              ...current,
              job: {
                ...current.job,
                audioMix: result.audioMix,
                mixSelection: "legacy",
              },
            }
          : current,
      );
      setMixerMode("legacy");
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
  const startSeparation = async () => {
    if (!job) return;
    setSeparationError(null);
    setVideo((current) =>
      current?.job?.id === job.id
        ? {
            ...current,
            job: {
              ...current.job,
              separation: {
                ...current.job.separation,
                status: "processing",
                phase: "checking",
              },
            },
          }
        : current,
    );
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/separation`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu tách audio.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: { ...current.job, separation: result.separation },
            }
          : current,
      );
    } catch (error) {
      setSeparationError(
        error instanceof Error ? error.message : "Không thể bắt đầu tách audio.",
      );
      try {
        const statusResponse = await fetch(`/api/video-dubbing/jobs/${job.id}`);
        const statusResult = await statusResponse.json();
        if (statusResponse.ok && statusResult.job) {
          setVideo((current) =>
            current?.job?.id === job.id
              ? { ...current, job: statusResult.job }
              : current,
          );
        }
      } catch (statusError) {
        console.error("Không thể tải trạng thái tách audio:", statusError);
      }
    }
  };
  const cancelSeparation = async () => {
    if (!job) return;
    setSeparationError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/separation/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy tác vụ tách audio.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id ? { ...current, job: result.job } : current,
        );
      }
    } catch (error) {
      setSeparationError(
        error instanceof Error ? error.message : "Không thể hủy tác vụ tách audio.",
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
          Video Dubbing · Piper · Demucs cục bộ
        </span>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-white">Lịch sử job</h3>
            <span className="text-xs text-slate-500">{jobHistory.length}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadJobHistory()}
            disabled={historyLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>
        {historyError && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-xs text-rose-200">
            {historyError}
          </p>
        )}
        {jobHistory.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-500">
            {historyLoading ? "Đang tải lịch sử job…" : "Chưa có job Video Dubbing được lưu."}
          </p>
        ) : (
          <ul className="space-y-2">
            {jobHistory.map((item) => {
              const isSelected = item.job.id === job?.id;
              const outputs = [
                ["Video", item.outputs.sourceVideo],
                ["TTS Master", item.outputs.masterAudio],
                ["Vocals", item.outputs.vocals],
                ["Instrumental", item.outputs.instrumental],
                ["Bản phối", item.outputs.mixedAudio],
                ["Final mix", item.outputs.finalMix],
                ["MP4", item.outputs.exportedVideo],
              ] as const;
              return (
                <li
                  key={item.job.id}
                  className={`rounded-xl border p-3 ${
                    isSelected
                      ? "border-amber-500/40 bg-amber-950/15"
                      : "border-slate-800 bg-slate-950/50"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-semibold text-slate-100">
                          {item.job.fileName}
                        </span>
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                          {statusLabel(item.job)}
                        </span>
                        <code className="text-[10px] text-slate-500">
                          {item.job.id.slice(-8)}
                        </code>
                        <span className="text-[10px] text-slate-500">
                          {new Date(item.job.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {outputs.map(([label, available]) => (
                          <span
                            key={label}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                              available
                                ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-300"
                                : "border-slate-800 bg-slate-900/60 text-slate-500"
                            }`}
                          >
                            {available && <CheckCircle2 className="h-3 w-3" />}
                            {label}
                          </span>
                        ))}
                      </div>
                      {item.warning && (
                        <p className="mt-2 text-[11px] leading-relaxed text-amber-300">
                          {item.warning}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => openHistoryJob(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-950/40"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Mở job
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteHistoryJob(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:border-rose-500/40 hover:text-rose-200"
                        aria-label={`Xóa job ${item.job.fileName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xóa
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
                    Đóng job
                  </>
                )}
                {video.warning && (
                  <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                    {video.warning}
                  </p>
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
                  ) : job.status === "failed" ||
                    job.status === "cancelled" ||
                    job.status === "interrupted" ? (
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
              {job?.status === "interrupted" && job.error && (
                <p className="mt-3 text-xs text-amber-300">{job.error}</p>
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
          {job && !srt && masterGeneration?.status !== "completed" && (
            <p className="text-[11px] leading-relaxed text-amber-300">
              File SRT không được lưu trong lịch sử job. Hãy chọn lại SRT nếu cần tạo TTS Master cho job này.
            </p>
          )}
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
        {masterGeneration?.status === "interrupted" && (
          <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
            {masterGeneration.error || "Tác vụ TTS Master bị gián đoạn."}
          </p>
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

      {job &&
        (job.status === "completed" ||
          Boolean(separation?.vocalsSizeBytes || separation?.instrumentalSizeBytes)) && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 text-violet-300 border border-violet-500/25 flex items-center justify-center shrink-0">
              <AudioLines className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-white">Tách giọng và nhạc nền</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Chạy cục bộ bằng Demucs {separationAvailability?.model || "htdemucs"}.
                Kết quả là các stem ước lượng, có thể còn lẫn giọng hoặc nhạc.
              </p>
            </div>
          </div>

          {!separationAvailability ? (
            <p className="text-xs text-slate-400">Đang kiểm tra Python, model và thiết bị…</p>
          ) : (
            <div
              className={`rounded-xl border p-3 text-xs ${
                separationAvailability.status === "ready"
                  ? "border-emerald-500/25 bg-emerald-950/20 text-emerald-200"
                  : "border-amber-500/25 bg-amber-950/20 text-amber-200"
              }`}
            >
              <div className="font-semibold">
                {separationAvailability.status === "ready"
                  ? `Sẵn sàng · ${separationAvailability.device === "cuda" ? "CUDA" : "CPU"}`
                  : "Chưa sẵn sàng"}
              </div>
              <p className="mt-1 leading-relaxed">{separationAvailability.message}</p>
              {separationAvailability.status === "unavailable" && (
                <p className="mt-2 leading-relaxed">
                  Cấu hình riêng Python bằng biến VIDEO_DUBBING_SEPARATION_PYTHON rồi khởi động lại ứng dụng. Cần cài Demucs/PyTorch và tải model htdemucs trước; nút xử lý không tự cài hoặc tải model.
                </p>
              )}
            </div>
          )}

          {job.metadata?.audioCodec === null && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
              Video này không có audio gốc để tách.
            </p>
          )}
          {separationError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{separationError}</span>
            </div>
          )}
          {separation?.status === "error" && separation.error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{separation.error}</span>
            </div>
          )}
          {isSeparationProcessing && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-violet-500/25 bg-violet-950/20 p-3.5">
              <span className="inline-flex items-center gap-2 text-xs text-violet-200">
                <LoaderCircle className="w-4 h-4 animate-spin" />
                {separation.phase === "extracting"
                  ? "Đang trích và chuẩn hóa audio nguồn"
                  : separation.phase === "checking"
                    ? "Đang kiểm tra môi trường tách audio"
                    : separation.phase === "loading_model"
                      ? "Đang tải model Demucs từ cache cục bộ"
                      : separation.phase === "writing_outputs"
                        ? "Đang ghi các track vocals và instrumental"
                    : separation.phase === "validating"
                      ? "Đang ghi và xác minh hai track"
                      : "Demucs đang tách audio"}
              </span>
              <span className="text-xs text-violet-100">
                {separation.progressPercent === undefined
                  ? "Đang xử lý…"
                  : `${separation.progressPercent}%${
                      separation.completedSegments !== undefined &&
                      separation.totalSegments !== undefined
                        ? ` · ${separation.completedSegments}/${separation.totalSegments} đoạn`
                        : ""
                    }`}
              </span>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-label="Tiến trình tách audio"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={separation.progressPercent}
                aria-valuetext={
                  separation.progressPercent === undefined
                    ? "Đang xử lý, chưa xác định phần trăm"
                    : `${separation.progressPercent}%`
                }
              >
                <div
                  className={`h-full rounded-full bg-violet-400 transition-all ${
                    separation.progressPercent === undefined
                      ? "w-1/3 animate-pulse"
                      : ""
                  }`}
                  style={
                    separation.progressPercent === undefined
                      ? undefined
                      : { width: `${separation.progressPercent}%` }
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => void cancelSeparation()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Hủy tách audio
              </button>
            </div>
          )}
          {separation?.status === "cancelled" && (
            <p className="text-xs text-amber-300">Tác vụ tách audio đã bị hủy.</p>
          )}
          {separation?.status === "interrupted" && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
              {separation.error || "Tác vụ tách audio bị gián đoạn; có thể chạy lại."}
            </p>
          )}

          {separationAvailability?.status === "ready" &&
            Boolean(job.metadata?.audioCodec) && (
              <button
                type="button"
                onClick={() => void startSeparation()}
                disabled={!canStartSeparation}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {isSeparationProcessing ? (
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                ) : (
                  <AudioLines className="w-4 h-4" />
                )}
                Tách audio nguồn
              </button>
            )}

          {(separation?.vocalsSizeBytes || separation?.instrumentalSizeBytes) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {([
                { key: "vocals", label: "Giọng (vocals)", size: separation.vocalsSizeBytes },
                {
                  key: "instrumental",
                  label: "Nhạc nền (instrumental)",
                  size: separation.instrumentalSizeBytes,
                },
              ] as const).map((track) => (
                <div
                  key={track.key}
                  className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-200">{track.label}</span>
                    <span className="text-slate-400">
                      {track.size ? formatFileSize(track.size) : "Không có"}
                    </span>
                  </div>
                  <audio
                    controls
                    preload="metadata"
                    src={`/api/video-dubbing/jobs/${job.id}/separation/${track.key}`}
                    className="w-full"
                  >
                    Trình duyệt không hỗ trợ phát WAV.
                  </audio>
                </div>
              ))}
            </div>
          )}
          {separation?.status === "completed" && (
            <p className="text-xs text-emerald-300">
              Đã xác minh hai track WAV · {formatDuration(separation.durationSeconds || 0)} · {separation.sampleRate} Hz · {separation.channels} kênh. Kết quả chưa được tự động đưa vào bản phối.
            </p>
          )}
        </section>
      )}

      {job?.status === "completed" && (
        <section className="space-y-4 rounded-2xl border border-cyan-500/25 bg-slate-900/80 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/15 text-cyan-300">
              <AudioLines className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Mixer Preview · 3 track</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Nghe đồng bộ bằng Web Audio với gain riêng cho vocals,
                instrumental và TTS Master. Mọi thay đổi chỉ áp dụng tức thời
                cho preview; chỉ nút render mới tạo file dùng khi xuất MP4.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {(
              [
                ["vocals", "Giọng tách (vocals)"],
                ["instrumental", "Nhạc nền (instrumental)"],
                ["ttsMaster", "TTS Master"],
              ] as const
            ).map(([track, label]) => {
              const available = mixerTrackAvailability[track];
              const setting = mixerSettings[track];
              return (
                <div
                  key={track}
                  className={`space-y-3 rounded-xl border p-3 ${
                    available
                      ? "border-slate-700 bg-slate-950/60"
                      : "border-slate-800 bg-slate-950/30 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200">
                      {label}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {available ? "Sẵn sàng" : "Chưa có track"}
                    </span>
                  </div>
                  <label className="block space-y-2">
                    <span className="flex justify-between text-[11px] text-slate-400">
                      <span>Âm lượng</span>
                      <span className="font-semibold text-slate-200">
                        {setting.volumePercent}%
                      </span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      step={1}
                      value={setting.volumePercent}
                      disabled={!available || isMediaProcessing}
                      onChange={(event) =>
                        updateMixerSetting(track, {
                          volumePercent: Number(event.target.value),
                        })
                      }
                      className="w-full accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`${label} preview volume`}
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={setting.muted}
                      disabled={!available || isMediaProcessing}
                      onChange={(event) =>
                        updateMixerSetting(track, {
                          muted: event.target.checked,
                        })
                      }
                      className="accent-cyan-400"
                    />
                    Tắt track
                  </label>
                </div>
              );
            })}
          </div>

          {!hasMasterAudio && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
              Cần tạo TTS Master bằng pipeline hiện có trước khi render final
              mix. Các track vocals/instrumental có thể nghe riêng ở phần tách
              audio phía trên.
            </p>
          )}
          {mixerError && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
              {mixerError}
            </p>
          )}
          {previewError && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
              {previewError}
            </p>
          )}
          {mediaError && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
              {mediaError}
            </p>
          )}

          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void playMixerPreview()}
                disabled={!hasPreviewTrack || isMediaProcessing}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-950/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {previewStatus === "playing" ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {previewStatus === "playing"
                  ? "Tạm dừng preview"
                  : previewStatus === "paused"
                    ? "Tiếp tục preview"
                    : "Nghe thử đồng bộ"}
              </button>
              <button
                type="button"
                onClick={stopMixerPreview}
                disabled={previewStatus === "stopped"}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-40"
              >
                <Square className="h-3 w-3" />
                Dừng
              </button>
              <span className="text-xs tabular-nums text-slate-400">
                {formatDuration(previewCurrentTime)}
                {job.metadata && ` / ${formatDuration(job.metadata.durationSeconds)}`}
              </span>
            </div>
            {job.metadata && (
              <input
                type="range"
                min={0}
                max={job.metadata.durationSeconds}
                step={0.05}
                value={Math.min(
                  previewCurrentTime,
                  job.metadata.durationSeconds,
                )}
                onChange={(event) =>
                  seekMixerPreview(Number(event.target.value))
                }
                className="w-full accent-cyan-400"
                aria-label="Tua mixer preview"
              />
            )}
            <p className="text-[10px] leading-relaxed text-slate-500">
              Preview dùng compressor giới hạn đỉnh để giảm nguy cơ clipping;
              bản render cuối được FFmpeg trộn và xác minh riêng. Hai kết quả
              nghe có thể khác nhẹ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void startFinalMix()}
              disabled={!canRenderFinalMix}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {finalMix?.status === "running" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
              Render final mix
            </button>
            {finalMix?.status === "running" && (
              <button
                type="button"
                onClick={() => void cancelFinalMix()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-rose-500/40 hover:text-rose-200"
              >
                <X className="h-3.5 w-3.5" />
                Hủy render
              </button>
            )}
            {mixerSettingsSaved ? (
              <span className="text-[11px] text-emerald-300">
                Cấu hình mixer đã lưu cho job
              </span>
            ) : mixerTouchedRef.current ? (
              <span className="text-[11px] text-slate-400">
                Đang lưu cấu hình mixer…
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">
                Cấu hình mặc định · thay đổi để lưu
              </span>
            )}
          </div>

          {finalMix?.status === "running" && (
            <div className="space-y-2 rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3">
              <div className="flex justify-between gap-3 text-xs text-cyan-100">
                <span>
                  {finalMix.phase === "validating"
                    ? "Đang xác minh WAV đầu ra"
                    : "Đang render các track bằng FFmpeg"}
                </span>
                <span>
                  {finalMix.progressPercent === undefined
                    ? "Đang xử lý…"
                    : `${finalMix.progressPercent}%`}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Tiến trình render final mix"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={finalMix.progressPercent}
                className="h-2 overflow-hidden rounded-full bg-slate-800"
              >
                <div
                  className="h-full rounded-full bg-cyan-400 transition-all"
                  style={{
                    width: `${finalMix.progressPercent ?? 30}%`,
                    ...(finalMix.progressPercent === undefined
                      ? { animation: "pulse 1.5s ease-in-out infinite" }
                      : {}),
                  }}
                />
              </div>
            </div>
          )}
          {finalMix?.status === "failed" && finalMix.error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
              Render final mix thất bại: {finalMix.error}
            </p>
          )}
          {finalMix?.status === "cancelled" && (
            <p className="text-xs text-amber-200">Đã hủy render final mix.</p>
          )}
          {finalMix?.status === "interrupted" && finalMix.error && (
            <p className="text-xs text-amber-200">{finalMix.error}</p>
          )}
          {hasFinalMix && job && (
            <div className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
              <p className="text-xs font-semibold text-emerald-300">
                {isFinalMixCurrent
                  ? "Final mix đã xác minh"
                  : "Final mix cũ vẫn được giữ; chưa khớp mixer settings hiện tại"}
              </p>
              <audio
                key={`${job.id}-${finalMix?.sizeBytes}`}
                controls
                preload="metadata"
                src={`/api/video-dubbing/jobs/${job.id}/final-mix-audio`}
                className="w-full"
              >
                Trình duyệt không hỗ trợ phát WAV.
              </audio>
            </div>
          )}
        </section>
      )}

      {(hasMasterAudio || hasMixedAudio || hasFinalMix || hasExportedVideo) && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-300 border border-sky-500/25 flex items-center justify-center shrink-0">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Trộn cơ bản · 2 track</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Mixer tương thích cũ cho TTS Master và audio gốc của video.
                Dùng Mixer Preview 3 track ở trên để phối vocals/instrumental.
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
          {audioMix?.status === "interrupted" && audioMix.error && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
              {audioMix.error}
            </p>
          )}
          {videoExport?.status === "interrupted" && videoExport.error && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
              {videoExport.error}
            </p>
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
                {isMixCurrent && mixerMode === "legacy"
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
                  {videoExport?.status === "completed" && isSelectedMixCurrent
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
            {!isSelectedMixCurrent && (
              <p className="text-xs text-slate-500">
                Render lại đúng mixer mode và settings hiện tại trước khi xuất video.
              </p>
            )}
          </div>
        </section>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs text-slate-400">
        <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
        <p>
          Tách giọng và nhạc nền chạy cục bộ bằng Demucs khi model đã sẵn sàng. Các track tách được chỉ để nghe thử; chưa tự động đưa vào bản phối. Preset chưa được hỗ trợ.
        </p>
      </div>
    </section>
  );
}
