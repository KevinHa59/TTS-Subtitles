import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  ChevronDown,
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
  RotateCcw,
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
  VideoDubbingAutoPipelineConfig,
  VideoDubbingMixerSettings,
  VideoDubbingMixerTrack,
  VideoDubbingSeparationAvailability,
} from "../types/videoDubbing";
import { formatSecondsToSrtTime } from "../utils/srtParser";
import { analyzeSrtContent } from "../utils/videoDubbingSrt";
import { VideoDubbingPreviewController } from "../utils/videoDubbingPreview";
import {
  hasMatchedVideoDubbingQueueInputs,
  pairVideoDubbingQueueRows,
} from "../utils/videoDubbingQueue";

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

interface QueuedSubtitle extends SelectedSrt {
  id: string;
  file: File;
}

interface QueueItemState {
  status:
    | "queued"
    | "uploading"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled";
  jobId?: string;
  phase?: string;
  progressPercent?: number;
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
  return frameRate
    ? `${frameRate.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} fps`
    : "Không xác định";
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
  const [mixerSettings, setMixerSettings] = useState<VideoDubbingMixerSettings>(
    DEFAULT_MIXER_SETTINGS,
  );
  const [mixerSettingsSaved, setMixerSettingsSaved] = useState(false);
  const [mixerError, setMixerError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<
    "stopped" | "playing" | "paused"
  >("stopped");
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [videoPreviewReady, setVideoPreviewReady] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [separationAvailability, setSeparationAvailability] =
    useState<VideoDubbingSeparationAvailability | null>(null);
  const [separationError, setSeparationError] = useState<string | null>(null);
  const [jobHistory, setJobHistory] = useState<VideoDubbingJobHistoryItem[]>(
    [],
  );
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [fileDetailsOpen, setFileDetailsOpen] = useState(false);
  const [detailRowIndex, setDetailRowIndex] = useState<number | null>(null);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [subtitleFiles, setSubtitleFiles] = useState<QueuedSubtitle[]>([]);
  const [queueStates, setQueueStates] = useState<
    Record<number, QueueItemState>
  >({});
  const [queueRunning, setQueueRunning] = useState(false);
  const [autoPipelineEnabled, setAutoPipelineEnabled] = useState(false);
  const [autoPipelineExpanded, setAutoPipelineExpanded] = useState(false);
  const [masterPanelExpanded, setMasterPanelExpanded] = useState(false);
  const [separationPanelExpanded, setSeparationPanelExpanded] = useState(false);
  const [mixerPanelExpanded, setMixerPanelExpanded] = useState(false);
  const [autoPipelineDemucsEnabled, setAutoPipelineDemucsEnabled] =
    useState(false);
  const [originalAudioVolumePercent, setOriginalAudioVolumePercent] =
    useState(100);
  const [autoPipelineError, setAutoPipelineError] = useState<string | null>(
    null,
  );
  const [autoPipelineSaving, setAutoPipelineSaving] = useState(false);
  const autoPipelineConfigJobRef = useRef<string | null>(null);
  const autoPipelineSavedConfigKeyRef = useRef<string | null>(null);
  const queueCancelRef = useRef(false);
  const queueCurrentJobIdRef = useRef<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
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
  const previewControllerRef = useRef<VideoDubbingPreviewController | null>(
    null,
  );
  const previewJobIdRef = useRef<string | null>(null);
  const previewTrackKeyRef = useRef<string | null>(null);

  const releasePreviewGraph = (updateUi = true) => {
    previewControllerRef.current?.dispose();
    previewControllerRef.current = null;
    previewVideoRef.current?.pause();
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
    previewTrackKeyRef.current = null;
    if (updateUi) {
      setPreviewStatus("stopped");
      setPreviewCurrentTime(0);
      if (previewVideoRef.current && videoPreviewReady) {
        previewVideoRef.current.currentTime = 0;
      }
    }
  };

  const pauseMixerPreview = () => {
    previewControllerRef.current?.pause();
    setPreviewStatus("paused");
  };

  const seekMixerPreview = (time: number) => {
    const seekTo = Math.max(0, time);
    if (previewControllerRef.current) {
      previewControllerRef.current.seek(seekTo);
    } else if (previewVideoRef.current && videoPreviewReady) {
      previewVideoRef.current.currentTime = seekTo;
    }
    setPreviewCurrentTime(seekTo);
  };

  const restartMixerPreview = async () => {
    const controller = previewControllerRef.current;
    if (!controller) {
      seekMixerPreview(0);
      await playMixerPreview();
      return;
    }
    setPreviewError(null);
    try {
      const playback = controller.restart();
      await audioContextRef.current?.resume();
      await playback;
      setPreviewStatus("playing");
    } catch (error) {
      setPreviewStatus("paused");
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Không thể khởi động lại preview.",
      );
    }
  };

  const updateMixerSetting = (
    track: VideoDubbingMixerTrack,
    patch: Partial<VideoDubbingMixerSettings[VideoDubbingMixerTrack]>,
  ) => {
    mixerTouchedRef.current = true;
    setMixerSettingsSaved(false);
    setMixerSettings((current) => ({
      ...current,
      [track]: { ...current[track], ...patch },
    }));
  };

  const playMixerPreview = async () => {
    const job = video?.job;
    const videoElement = previewVideoRef.current;
    if (!job || !videoElement || !job.metadata) return;
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
        !mixerSettings[track].muted && mixerSettings[track].volumePercent > 0,
    );
    if (included.length === 0 || !videoPreviewReady) {
      if (!videoPreviewReady) {
        setPreviewError("Video chưa sẵn sàng để xem trước.");
        return;
      }
      setPreviewError("Bật ít nhất một track có sẵn để nghe thử.");
      return;
    }
    setPreviewError(null);
    try {
      const trackKey = availableTracks
        .map(({ track, url }) => `${track}:${url}`)
        .join("|");
      let context = audioContextRef.current;
      if (
        !context ||
        previewJobIdRef.current !== job.id ||
        previewTrackKeyRef.current !== trackKey
      ) {
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
        previewTrackKeyRef.current = trackKey;
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
      const tracks = [...previewNodesRef.current.values()].map(
        ({ element }) => element,
      );
      if (!previewControllerRef.current) {
        const durationSeconds = job.metadata.durationSeconds;
        previewControllerRef.current = new VideoDubbingPreviewController(
          videoElement,
          tracks,
          durationSeconds,
          (time) => {
            setPreviewCurrentTime(time);
            if (time >= durationSeconds - 0.04) {
              setPreviewStatus("stopped");
            }
          },
          (error) => {
            setPreviewError(
              error instanceof Error
                ? error.message
                : "Không thể đồng bộ audio preview.",
            );
          },
        );
      }
      const playback = previewControllerRef.current.play();
      await context.resume();
      await playback;
      setPreviewStatus("playing");
    } catch (error) {
      for (const { element } of previewNodesRef.current.values()) {
        element.pause();
      }
      setPreviewStatus("paused");
      previewControllerRef.current?.pause();
      previewVideoRef.current?.pause();
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Không thể phát mixer preview.",
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
        error instanceof Error
          ? error.message
          : "Không thể tải lịch sử Video Dubbing.";
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
        error instanceof Error
          ? error.message
          : "Không thể xóa job Video Dubbing.",
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
          throw new Error(
            result.error || "Không thể tải danh sách giọng Piper.",
          );
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
        const result =
          (await response.json()) as VideoDubbingSeparationAvailability;
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
        video?.job?.autoPipeline?.status !== "running" &&
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
    video?.job?.autoPipeline?.status,
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
    setVideoPreviewReady(false);
    mixerTouchedRef.current = false;
  }, [video?.job?.id]);

  useEffect(() => {
    releasePreviewGraph();
  }, [
    video?.job?.masterGeneration?.sizeBytes,
    video?.job?.separation?.vocalsSizeBytes,
    video?.job?.separation?.instrumentalSizeBytes,
  ]);

  useEffect(() => {
    const savedSettings = video?.job?.mixerSettings;
    setMixerSettings(savedSettings || DEFAULT_MIXER_SETTINGS);
    setMixerSettingsSaved(Boolean(savedSettings));
  }, [video?.job?.id, serverMixerSettingsKey, video?.job?.mixSelection]);

  useEffect(() => {
    const job = video?.job;
    if (!job || queueRunning || autoPipelineConfigJobRef.current === job.id) {
      return;
    }
    autoPipelineConfigJobRef.current = job.id;
    setAutoPipelineExpanded(false);
    setMasterPanelExpanded(false);
    setSeparationPanelExpanded(false);
    setMixerPanelExpanded(false);
    const config = job.autoPipeline?.config;
    setAutoPipelineEnabled(config?.enabled ?? false);
    autoPipelineSavedConfigKeyRef.current = config
      ? JSON.stringify(config)
      : null;
    if (!config) {
      setAutoPipelineDemucsEnabled(false);
      setOriginalAudioVolumePercent(100);
      setMixerSettings(DEFAULT_MIXER_SETTINGS);
      setSpeedPriority("balanced");
      setMinSpeed(0.8);
      setMaxSpeed(1.5);
      return;
    }
    setAutoPipelineDemucsEnabled(config.demucsEnabled);
    setOriginalAudioVolumePercent(config.originalAudioVolumePercent);
    setMixerSettings(config.mixerSettings);
    setMixerSettingsSaved(true);
    setSpeedPriority(config.master.options.speedPriority);
    setMinSpeed(config.master.options.minSpeed);
    setMaxSpeed(config.master.options.maxSpeed);
    setSrt({
      fileName: "Phụ đề từ cấu hình Auto Pipeline",
      sizeBytes: 0,
      analysis: {
        subtitleCount: config.master.items.length,
        earliestStart: Math.min(
          ...config.master.items.map((item) => item.startTime),
        ),
        latestEnd: Math.max(...config.master.items.map((item) => item.endTime)),
        invalidBlockCount: 0,
        items: config.master.items,
      },
    });
  }, [video?.job?.id, video?.job?.autoPipeline?.config, queueRunning]);

  useEffect(() => {
    const savedModel = video?.job?.autoPipeline?.config?.master;
    if (!savedModel) return;
    const voice = voices.find(
      (candidate) =>
        candidate.modelId === savedModel.model &&
        candidate.speakerId === savedModel.speakerId,
    );
    if (voice) setSelectedVoiceId(voice.id);
  }, [video?.job?.id, video?.job?.autoPipeline?.config?.master, voices]);

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
  }, [video?.job?.id, video?.job?.status, localMixerSettingsKey]);

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
                  Boolean(job.separation?.vocalsSizeBytes) ||
                  item.outputs.vocals,
                instrumental:
                  Boolean(job.separation?.instrumentalSizeBytes) ||
                  item.outputs.instrumental,
                mixedAudio:
                  job.audioMix?.status === "completed" ||
                  item.outputs.mixedAudio,
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
        current?.fileName === file.name ? { ...current, job } : current,
      );

      const request = new XMLHttpRequest();
      uploadRef.current = request;
      request.open("PUT", `/api/video-dubbing/jobs/${job.id}/video`);
      request.setRequestHeader("Content-Type", "application/octet-stream");
      request.upload.onprogress = (event) => {
        if (
          !event.lengthComputable ||
          generation !== videoGenerationRef.current
        ) {
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
            ? {
                ...current,
                progress: 100,
                job: { ...current.job!, status: "probing" },
              }
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
        current?.fileName === file.name
          ? { ...current, error: message }
          : current,
      );
    }
  };

  const handleVideoFile = (file: File) => {
    if (!file) return;
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
        error:
          "Định dạng video không được hỗ trợ. Hãy chọn MP4, MKV, MOV, AVI hoặc WebM.",
      });
      return;
    }
    void (async () => {
      if (generation === videoGenerationRef.current) {
        await uploadVideo(file);
      }
    })();
  };

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0 || queueRunning) return;
    setVideoFiles((current) => [...current, ...files]);
  };

  const handleSrtFile = async (file: File) => {
    if (!file) return;
    const generation = ++srtGenerationRef.current;
    setSrt({ fileName: file.name, sizeBytes: file.size });

    if (!file.name.toLowerCase().endsWith(".srt")) {
      setSrt({
        fileName: file.name,
        sizeBytes: file.size,
        error: "Chỉ hỗ trợ tệp phụ đề .srt.",
      });
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

  const handleSrtFiles = async (files: File[]) => {
    if (files.length === 0 || queueRunning) return;

    const queued = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      fileName: file.name,
      sizeBytes: file.size,
    }));
    setSubtitleFiles((current) => [...current, ...queued]);

    for (const entry of queued) {
      try {
        if (!entry.file.name.toLowerCase().endsWith(".srt")) {
          throw new Error("Chỉ hỗ trợ tệp phụ đề .srt.");
        }
        const analysis = analyzeSrtContent(await entry.file.text());
        setSubtitleFiles((current) =>
          current.map((item) =>
            item.id === entry.id ? { ...item, analysis } : item,
          ),
        );
        setSrt(
          (current) =>
            current || {
              fileName: entry.fileName,
              sizeBytes: entry.sizeBytes,
              analysis,
            },
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Không thể đọc nội dung tệp SRT.";
        setSubtitleFiles((current) =>
          current.map((item) =>
            item.id === entry.id ? { ...item, error: message } : item,
          ),
        );
      }
    }
  };

  const handleSrtChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await handleSrtFiles(files);
  };

  const clearSrt = () => {
    srtGenerationRef.current++;
    setSrt(null);
    if (srtInputRef.current) srtInputRef.current.value = "";
  };

  const clearSelectedFiles = async () => {
    if (isBusy) {
      await cancelVideo();
    } else {
      clearVideo();
    }
    clearSrt();
    setVideoFiles([]);
    setSubtitleFiles([]);
    setQueueStates({});
    setFileDetailsOpen(false);
    setDetailRowIndex(null);
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
      current
        ? { ...current, error: "Đã hủy quá trình tải/kiểm tra." }
        : current,
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
  const autoPipeline = job?.autoPipeline;
  const isAutoPipelineRunning = autoPipeline?.status === "running";
  const isSeparationProcessing = separation?.status === "processing";
  const hasFinalMix = Boolean(finalMix?.sizeBytes && finalMix.sizeBytes > 44);
  const hasExportedVideo = Boolean(
    videoExport?.sizeBytes && videoExport.sizeBytes > 0,
  );
  const isMediaProcessing =
    audioMix?.status === "running" ||
    finalMix?.status === "running" ||
    videoExport?.status === "running" ||
    isSeparationProcessing ||
    isAutoPipelineRunning;
  const hasMasterAudio = Boolean(
    masterGeneration?.durationSeconds !== undefined &&
    masterGeneration.sizeBytes !== undefined,
  );
  const isFinalMixCurrent = Boolean(
    finalMix &&
    finalMix.status !== "stale" &&
    finalMix.status !== "idle" &&
    finalMix.sizeBytes &&
    JSON.stringify(finalMix.renderedSettings) === localMixerSettingsKey,
  );
  const mixerTrackAvailability: Record<VideoDubbingMixerTrack, boolean> = {
    vocals: Boolean(separation?.vocalsSizeBytes),
    instrumental: Boolean(separation?.instrumentalSizeBytes),
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
  const autoPipelineConfig: VideoDubbingAutoPipelineConfig | null = useMemo(
    () =>
      srt?.analysis?.items.length && selectedVoice
        ? {
            enabled: autoPipelineEnabled,
            master: {
              items: srt.analysis.items,
              model: selectedVoice.modelId,
              speakerId: selectedVoice.speakerId,
              options: { minSpeed, maxSpeed, speedPriority },
            },
            demucsEnabled: autoPipelineDemucsEnabled,
            mixerSettings,
            originalAudioVolumePercent,
          }
        : null,
    [
      autoPipelineEnabled,
      autoPipelineDemucsEnabled,
      maxSpeed,
      minSpeed,
      mixerSettings,
      originalAudioVolumePercent,
      selectedVoice,
      speedPriority,
      srt?.analysis?.items,
    ],
  );
  const canStartAutoPipeline = Boolean(
    job?.status === "completed" &&
    autoPipelineEnabled &&
    autoPipelineConfig &&
    !isAutoPipelineRunning &&
    !isMediaProcessing &&
    (!autoPipelineDemucsEnabled ||
      (separationAvailability?.status === "ready" &&
        Boolean(job.metadata?.audioCodec))),
  );
  const queueRows = pairVideoDubbingQueueRows(videoFiles, subtitleFiles);
  const queueRowCount = queueRows.length;
  const queueCountsMatch = hasMatchedVideoDubbingQueueInputs(queueRows);
  const queueInputsValid =
    queueCountsMatch &&
    queueRows.every(
      ({ video: file, subtitle: entry }) =>
        Boolean(
          file &&
          ACCEPTED_VIDEO_EXTENSIONS.has(
            file.name.slice(file.name.lastIndexOf(".")).toLowerCase(),
          ),
        ) &&
        Boolean(entry?.analysis?.items.length) &&
        !entry?.error,
    );
  const canStartQueue = Boolean(
    queueInputsValid &&
    autoPipelineEnabled &&
    selectedVoice &&
    !queueRunning &&
    !isAutoPipelineRunning &&
    (!autoPipelineDemucsEnabled || separationAvailability?.status === "ready"),
  );

  const uploadQueuedVideo = async (
    file: File,
    rowIndex: number,
  ): Promise<VideoDubbingJob> => {
    const createResponse = await fetch("/api/video-dubbing/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
    });
    const createResult = await createResponse.json();
    if (!createResponse.ok || !createResult.job) {
      throw new Error(createResult.error || "Không thể khởi tạo job video.");
    }

    const createdJob = createResult.job as VideoDubbingJob;
    activeJobIdRef.current = createdJob.id;
    queueCurrentJobIdRef.current = createdJob.id;
    setVideo({
      fileName: file.name,
      sizeBytes: file.size,
      progress: 0,
      job: createdJob,
    });
    setQueueStates((current) => ({
      ...current,
      [rowIndex]: {
        status: "uploading",
        jobId: createdJob.id,
        phase: "Đang tải video lên",
        progressPercent: 0,
      },
    }));

    return await new Promise<VideoDubbingJob>((resolve, reject) => {
      const request = new XMLHttpRequest();
      uploadRef.current = request;
      request.open("PUT", `/api/video-dubbing/jobs/${createdJob.id}/video`);
      request.setRequestHeader("Content-Type", "application/octet-stream");
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const progressPercent = Math.min(
          100,
          (event.loaded / event.total) * 100,
        );
        setQueueStates((current) => ({
          ...current,
          [rowIndex]: {
            ...current[rowIndex],
            status: "uploading",
            jobId: createdJob.id,
            phase: "Đang tải video lên",
            progressPercent,
          },
        }));
      };
      request.upload.onload = () => {
        setQueueStates((current) => ({
          ...current,
          [rowIndex]: {
            ...current[rowIndex],
            status: "uploading",
            jobId: createdJob.id,
            phase: "Đang kiểm tra video",
          },
        }));
      };
      request.onload = () => {
        if (uploadRef.current === request) uploadRef.current = null;
        try {
          const result = JSON.parse(request.responseText);
          if (request.status < 200 || request.status >= 300 || !result.job) {
            reject(new Error(result.error || "Không thể kiểm tra video."));
            return;
          }
          resolve(result.job as VideoDubbingJob);
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error("Máy chủ trả về phản hồi tải video không hợp lệ."),
          );
        }
      };
      request.onerror = () => {
        if (uploadRef.current === request) uploadRef.current = null;
        reject(new Error("Kết nối bị gián đoạn khi tải hoặc kiểm tra video."));
      };
      request.onabort = () => {
        if (uploadRef.current === request) uploadRef.current = null;
        reject(new Error("Đã hủy tải video."));
      };
      request.send(file);
    });
  };

  const startQueue = async () => {
    if (!canStartQueue || !selectedVoice) return;
    queueCancelRef.current = false;
    setQueueRunning(true);
    setAutoPipelineError(null);
    setQueueStates(
      Object.fromEntries(
        queueRows.map(({ index }) => [index, { status: "queued" as const }]),
      ),
    );

    try {
      for (const row of queueRows) {
        const { index } = row;
        if (queueCancelRef.current) break;
        const file = row.video;
        const subtitle = row.subtitle;
        if (!file || !subtitle?.analysis) {
          setQueueStates((current) => ({
            ...current,
            [index]: {
              status: "failed",
              phase: "Thiếu video hoặc SRT hợp lệ",
              error: "Cần ghép đủ video và phụ đề SRT hợp lệ cho hàng này.",
            },
          }));
          continue;
        }
        let currentJobId: string | undefined;
        try {
          setSrt({
            fileName: subtitle.fileName,
            sizeBytes: subtitle.sizeBytes,
            analysis: subtitle.analysis,
          });
          const uploadedJob = await uploadQueuedVideo(file, index);
          currentJobId = uploadedJob.id;
          if (queueCancelRef.current) {
            throw new Error("Đã hủy hàng đợi.");
          }
          if (uploadedJob.status !== "completed") {
            throw new Error(
              uploadedJob.error || "Video chưa vượt qua bước kiểm tra.",
            );
          }
          setVideo({
            fileName: file.name,
            sizeBytes: file.size,
            progress: 100,
            job: uploadedJob,
          });

          const config: VideoDubbingAutoPipelineConfig = {
            enabled: true,
            master: {
              items: subtitle.analysis.items,
              model: selectedVoice.modelId,
              speakerId: selectedVoice.speakerId,
              options: { minSpeed, maxSpeed, speedPriority },
            },
            demucsEnabled: autoPipelineDemucsEnabled,
            mixerSettings,
            originalAudioVolumePercent,
          };
          const startResponse = await fetch(
            `/api/video-dubbing/jobs/${uploadedJob.id}/auto-pipeline`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(config),
            },
          );
          const startResult = await startResponse.json();
          if (!startResponse.ok) {
            throw new Error(
              startResult.error || "Không thể bắt đầu Auto Pipeline.",
            );
          }

          setQueueStates((current) => ({
            ...current,
            [index]: {
              status: "processing",
              jobId: uploadedJob.id,
              phase: "Đang bắt đầu Auto Pipeline",
            },
          }));
          let completedJob: VideoDubbingJob | null = null;
          while (!completedJob) {
            const response = await fetch(
              `/api/video-dubbing/jobs/${uploadedJob.id}`,
            );
            const result = await response.json();
            if (!response.ok || !result.job) {
              throw new Error(result.error || "Không thể đọc trạng thái job.");
            }
            const latestJob = result.job as VideoDubbingJob;
            setVideo((current) =>
              current?.job?.id === latestJob.id
                ? { ...current, job: latestJob }
                : current,
            );
            const state = latestJob.autoPipeline;
            if (!state) {
              throw new Error("Job chưa có trạng thái Auto Pipeline.");
            }
            setQueueStates((current) => ({
              ...current,
              [index]: {
                status: "processing",
                jobId: latestJob.id,
                phase: state?.phase || "Đang xử lý",
                progressPercent: state?.progressPercent,
              },
            }));

            if (state?.status === "completed") {
              if (
                latestJob.videoExport?.status !== "completed" ||
                !latestJob.videoExport?.sizeBytes
              ) {
                throw new Error(
                  "Auto Pipeline chưa xác minh được file MP4 đầu ra.",
                );
              }
              completedJob = latestJob;
              break;
            }
            if (state?.status === "failed" || state?.status === "interrupted") {
              throw new Error(state.error || "Auto Pipeline không hoàn tất.");
            }
            if (state?.status === "cancelled") {
              queueCancelRef.current = true;
              setQueueStates((current) => ({
                ...current,
                [index]: {
                  status: "cancelled",
                  jobId: latestJob.id,
                  phase: "Đã hủy",
                },
              }));
              break;
            }
            if (queueCancelRef.current && state?.status === "running") {
              await fetch(
                `/api/video-dubbing/jobs/${latestJob.id}/auto-pipeline/cancel`,
                { method: "POST" },
              );
            }
            await new Promise((resolve) => window.setTimeout(resolve, 750));
          }

          if (completedJob) {
            setQueueStates((current) => ({
              ...current,
              [index]: {
                status: "completed",
                jobId: completedJob!.id,
                phase: "Hoàn tất",
                progressPercent: 100,
              },
            }));
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Không thể xử lý video.";
          setQueueStates((current) => ({
            ...current,
            [index]: {
              status: queueCancelRef.current ? "cancelled" : "failed",
              jobId: currentJobId || current[index]?.jobId,
              phase: queueCancelRef.current ? "Đã hủy" : "Thất bại",
              error: message,
            },
          }));
          if (queueCancelRef.current) break;
        } finally {
          queueCurrentJobIdRef.current = null;
        }
      }
    } finally {
      queueCurrentJobIdRef.current = null;
      setQueueRunning(false);
      void loadJobHistory();
    }
  };

  const stopQueue = async () => {
    queueCancelRef.current = true;
    if (uploadRef.current) {
      uploadRef.current.abort();
      const activeJobId = activeJobIdRef.current;
      if (activeJobId) {
        try {
          const response = await fetch(
            `/api/video-dubbing/jobs/${activeJobId}/cancel`,
            { method: "POST" },
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Không thể hủy tải video.");
          }
        } catch (error) {
          setAutoPipelineError(
            error instanceof Error ? error.message : "Không thể hủy tải video.",
          );
        }
      }
      return;
    }
    const currentJobId = queueCurrentJobIdRef.current;
    if (currentJobId) {
      try {
        const statusResponse = await fetch(
          `/api/video-dubbing/jobs/${currentJobId}`,
        );
        const statusResult = await statusResponse.json();
        if (!statusResponse.ok) {
          throw new Error(
            statusResult.error || "Không thể đọc trạng thái job.",
          );
        }
        if (statusResult.job?.autoPipeline?.status === "running") {
          const response = await fetch(
            `/api/video-dubbing/jobs/${currentJobId}/auto-pipeline/cancel`,
            { method: "POST" },
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Không thể hủy Auto Pipeline.");
          }
        }
      } catch (error) {
        setAutoPipelineError(
          error instanceof Error
            ? error.message
            : "Không thể hủy Auto Pipeline.",
        );
      }
    }
  };
  const canExportVideo = Boolean(
    job?.status === "completed" &&
    mixerSettingsSaved &&
    isFinalMixCurrent &&
    !isMasterGenerating &&
    !isMediaProcessing,
  );
  const createMaster = async () => {
    if (!job || !srt?.analysis?.items.length || !selectedVoice) return;
    setMasterError(null);
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${job.id}/master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: srt.analysis.items,
          model: selectedVoice.modelId,
          speakerId: selectedVoice.speakerId,
          options: { minSpeed, maxSpeed, speedPriority },
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu tạo TTS Master.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: {
                ...current.job,
                masterGeneration: result.masterGeneration,
              },
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
  const saveAutoPipelineConfig = async (config = autoPipelineConfig) => {
    if (!job || !config) return;
    const configKey = JSON.stringify(config);
    setAutoPipelineError(null);
    setAutoPipelineSaving(true);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/auto-pipeline/config`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: configKey,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error || "Không thể lưu cấu hình Auto Pipeline.",
        );
      }
      autoPipelineSavedConfigKeyRef.current = configKey;
      mixerTouchedRef.current = false;
      setMixerSettingsSaved(true);
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: {
                ...current.job,
                mixerSettings: result.config.mixerSettings,
                autoPipeline: {
                  ...(current.job.autoPipeline || {
                    status: "idle",
                    phase: "validating",
                    completedStages: [],
                    reusedOutputs: [],
                    artifacts: {},
                    updatedAt: Date.now(),
                  }),
                  config: result.config,
                },
              },
            }
          : current,
      );
    } catch (error) {
      setAutoPipelineError(
        error instanceof Error
          ? error.message
          : "Không thể lưu cấu hình Auto Pipeline.",
      );
    } finally {
      setAutoPipelineSaving(false);
    }
  };
  const startAutoPipeline = async () => {
    if (!job || !autoPipelineConfig) return;
    setAutoPipelineError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/auto-pipeline`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(autoPipelineConfig),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu Auto Pipeline.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: { ...current.job, autoPipeline: result.state },
            }
          : current,
      );
    } catch (error) {
      setAutoPipelineError(
        error instanceof Error
          ? error.message
          : "Không thể bắt đầu Auto Pipeline.",
      );
    }
  };
  const cancelAutoPipeline = async () => {
    if (!job) return;
    setAutoPipelineError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/auto-pipeline/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy Auto Pipeline.");
      }
      if (result.state) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                job: { ...current.job, autoPipeline: result.state },
              }
            : current,
        );
      }
    } catch (error) {
      setAutoPipelineError(
        error instanceof Error ? error.message : "Không thể hủy Auto Pipeline.",
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
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
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
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
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
  const startVideoExport = async () => {
    if (!job) return;
    setMediaError(null);
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${job.id}/export`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu xuất MP4.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: { ...current.job, videoExport: result.videoExport },
            }
          : current,
      );
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể bắt đầu xuất MP4.",
      );
    }
  };
  const cancelMediaTask = async (task: "audio-mix" | "export") => {
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
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
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
        error instanceof Error
          ? error.message
          : "Không thể bắt đầu tách audio.",
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
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
        );
      }
    } catch (error) {
      setSeparationError(
        error instanceof Error
          ? error.message
          : "Không thể hủy tác vụ tách audio.",
      );
    }
  };
  const autoPipelineConfigKey = JSON.stringify(autoPipelineConfig);
  useEffect(() => {
    if (
      !job ||
      !autoPipelineConfig ||
      isAutoPipelineRunning ||
      autoPipelineSavedConfigKeyRef.current === autoPipelineConfigKey
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => void saveAutoPipelineConfig(autoPipelineConfig),
      450,
    );
    return () => window.clearTimeout(timer);
  }, [
    job?.id,
    autoPipelineConfigKey,
    autoPipelineConfig,
    isAutoPipelineRunning,
  ]);
  const isBusy =
    !video?.error &&
    (!job || job.status === "uploading" || job.status === "probing");
  const detailVideoFile =
    detailRowIndex === null ? null : queueRows[detailRowIndex]?.video || null;
  const detailSubtitle =
    detailRowIndex === null
      ? null
      : queueRows[detailRowIndex]?.subtitle || null;
  const detailState =
    detailRowIndex === null ? null : queueStates[detailRowIndex] || null;
  const detailJobId = detailState?.jobId;
  const detailJob =
    (detailJobId && video?.job?.id === detailJobId ? video.job : null) ||
    (detailJobId
      ? jobHistory.find((item) => item.job.id === detailJobId)?.job || null
      : null);

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
              Tạo TTS Master theo timestamp bằng pipeline Đồng Bộ Phụ Đề hiện
              có.
            </p>
          </div>
        </div>
        <span className="self-start sm:self-auto px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-800 text-slate-300 border border-slate-700">
          Video Dubbing · Piper · Demucs cục bộ
        </span>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setHistoryExpanded((expanded) => !expanded)}
            aria-expanded={historyExpanded}
            aria-controls="video-dubbing-job-history"
            className="flex min-w-0 items-center gap-2 text-left"
          >
            <History className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-white">Lịch sử job</h3>
            <span className="text-xs text-slate-500">{jobHistory.length}</span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${
                historyExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => void loadJobHistory()}
            disabled={historyLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${historyLoading ? "animate-spin" : ""}`}
            />
            Làm mới
          </button>
        </div>
        {historyExpanded && (
          <div id="video-dubbing-job-history" className="space-y-3">
            {historyError && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-xs text-rose-200">
                {historyError}
              </p>
            )}
            {jobHistory.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-500">
                {historyLoading
                  ? "Đang tải lịch sử job…"
                  : "Chưa có job Video Dubbing được lưu."}
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
                                {available && (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
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
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
            <thead className="bg-slate-950/80">
              <tr className="border-b border-slate-800 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th scope="col" className="w-[36%] px-4 py-3">
                  Video nguồn
                </th>
                <th scope="col" className="w-[36%] px-4 py-3">
                  Phụ đề SRT
                </th>
                <th scope="col" className="w-[28%] px-4 py-3">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {Array.from(
                { length: Math.max(queueRowCount, 1) },
                (_, index) => {
                  const { video: file, subtitle } = queueRows[index] || {};
                  const rowState = queueStates[index];
                  const validVideo = Boolean(
                    file &&
                    ACCEPTED_VIDEO_EXTENSIONS.has(
                      file.name.slice(file.name.lastIndexOf(".")).toLowerCase(),
                    ),
                  );
                  return (
                    <tr
                      key={`${file?.name || "no-video"}-${file?.size || 0}-${file?.lastModified || 0}-${subtitle?.id || "no-srt"}-${index}`}
                    >
                      <td className="p-3">
                        <div
                          onDragEnter={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            event.dataTransfer.dropEffect = "copy";
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (!queueRunning) {
                              const droppedFiles = Array.from(
                                event.dataTransfer.files,
                              ).filter((droppedFile) =>
                                ACCEPTED_VIDEO_EXTENSIONS.has(
                                  droppedFile.name
                                    .slice(droppedFile.name.lastIndexOf("."))
                                    .toLowerCase(),
                                ),
                              );
                              if (droppedFiles.length > 0) {
                                setVideoFiles((current) => [
                                  ...current,
                                  ...droppedFiles,
                                ]);
                              }
                            }
                          }}
                          className="min-h-14"
                        >
                          <button
                            type="button"
                            disabled={queueRunning}
                            onClick={() => videoInputRef.current?.click()}
                            className="flex min-h-14 w-full items-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/50 px-3 py-2 text-left hover:border-amber-500/50 disabled:cursor-wait disabled:opacity-60"
                          >
                            <Film className="h-4 w-4 shrink-0 text-amber-400" />
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                              {file?.name || "Chọn hoặc thả video"}
                            </span>
                            {file && !validVideo && (
                              <span className="text-[11px] text-rose-300">
                                Định dạng không hỗ trợ
                              </span>
                            )}
                            {rowState?.status === "uploading" && (
                              <span className="shrink-0 text-[11px] text-amber-300">
                                {rowState.progressPercent === undefined
                                  ? rowState.phase
                                  : `${Math.round(rowState.progressPercent)}%`}
                              </span>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="p-3">
                        <div
                          onDragEnter={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            event.dataTransfer.dropEffect = "copy";
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (!queueRunning) {
                              const droppedFiles = Array.from(
                                event.dataTransfer.files,
                              ).filter((droppedFile) =>
                                droppedFile.name.toLowerCase().endsWith(".srt"),
                              );
                              void handleSrtFiles(droppedFiles);
                            }
                          }}
                          className="min-h-14"
                        >
                          <button
                            type="button"
                            disabled={queueRunning}
                            onClick={() => srtInputRef.current?.click()}
                            className="flex min-h-14 w-full items-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/50 px-3 py-2 text-left hover:border-amber-500/50 disabled:cursor-wait disabled:opacity-60"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-amber-400" />
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                              {subtitle?.fileName || "Chọn hoặc thả phụ đề"}
                            </span>
                            {subtitle?.analysis && (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            )}
                            {subtitle?.error && (
                              <span className="text-[11px] text-rose-300">
                                Lỗi SRT
                              </span>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDetailRowIndex(index);
                              setFileDetailsOpen(true);
                            }}
                            disabled={!file && !subtitle}
                            className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Details
                          </button>
                          {rowState?.status === "completed" &&
                            rowState.jobId && (
                              <a
                                href={`/api/video-dubbing/jobs/${rowState.jobId}/download`}
                                download
                                className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-950/40"
                              >
                                Tải
                              </a>
                            )}
                          {(file || subtitle) && (
                            <button
                              type="button"
                              disabled={queueRunning}
                              onClick={() => {
                                if (file) {
                                  setVideoFiles((current) =>
                                    current.filter((item) => item !== file),
                                  );
                                }
                                if (subtitle) {
                                  setSubtitleFiles((current) =>
                                    current.filter(
                                      (item) => item.id !== subtitle.id,
                                    ),
                                  );
                                }
                                setQueueStates((current) =>
                                  Object.fromEntries(
                                    Object.entries(current)
                                      .filter(([key]) => Number(key) !== index)
                                      .map(([key, value]) => [
                                        Number(key) > index
                                          ? Number(key) - 1
                                          : Number(key),
                                        value,
                                      ]),
                                  ),
                                );
                                setDetailRowIndex((current) =>
                                  current === index
                                    ? null
                                    : current !== null && current > index
                                      ? current - 1
                                      : current,
                                );
                              }}
                              className="rounded-lg border border-rose-500/25 bg-rose-950/20 px-2.5 py-1.5 text-xs font-semibold text-rose-200 hover:border-rose-400/50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Xóa
                            </button>
                          )}
                        </div>
                        {rowState && (
                          <p
                            className={`mt-1.5 text-[11px] ${
                              rowState.status === "failed"
                                ? "text-rose-300"
                                : rowState.status === "completed"
                                  ? "text-emerald-300"
                                  : "text-slate-400"
                            }`}
                          >
                            {rowState.status === "completed"
                              ? "Hoàn tất"
                              : rowState.status === "failed"
                                ? rowState.error || "Thất bại"
                                : rowState.status === "cancelled"
                                  ? "Đã hủy"
                                  : rowState.status === "queued"
                                    ? "Trong hàng đợi"
                                    : rowState.phase || "Đang xử lý"}
                            {rowState.status === "processing" &&
                              rowState.progressPercent !== undefined &&
                              ` · ${Math.round(rowState.progressPercent)}%`}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>
        <input
          ref={videoInputRef}
          type="file"
          multiple
          accept=".mp4,.mkv,.mov,.avi,.webm,video/mp4,video/x-matroska,video/quicktime,video/x-msvideo,video/webm"
          onChange={handleVideoChange}
          className="hidden"
          aria-label="Chọn một hoặc nhiều video nguồn"
        />
        <input
          ref={srtInputRef}
          type="file"
          multiple
          accept=".srt,application/x-subrip"
          onChange={(event) => void handleSrtChange(event)}
          className="hidden"
          aria-label="Chọn một hoặc nhiều phụ đề SRT"
        />
        <div className="flex flex-col gap-3 border-t border-slate-800 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            Ghép video và SRT theo cùng số thứ tự của hàng. Hàng đợi chạy tuần
            tự.
            {videoFiles.length !== subtitleFiles.length && (
              <span className="ml-1 text-amber-300">
                Cần số lượng video và SRT bằng nhau ({videoFiles.length} video,{" "}
                {subtitleFiles.length} SRT).
              </span>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            {queueRunning ? (
              <button
                type="button"
                onClick={() => void stopQueue()}
                className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-950/40"
              >
                Dừng hàng đợi
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startQueue()}
                disabled={!canStartQueue}
                className="rounded-lg bg-indigo-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-indigo-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                Bắt đầu hàng đợi
              </button>
            )}
          </div>
        </div>
        {!autoPipelineEnabled && (
          <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-500">
            Bật checkbox Auto Pipeline bên dưới để chạy hàng đợi.
          </p>
        )}
      </section>

      <div className="hidden grid-cols-1 gap-3 md:grid-cols-3">
        <input
          type="file"
          accept=".mp4,.mkv,.mov,.avi,.webm,video/mp4,video/x-matroska,video/quicktime,video/x-msvideo,video/webm"
          onChange={handleVideoChange}
          className="hidden"
          aria-label="Chọn video nguồn"
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => !isBusy && videoInputRef.current?.click()}
          onKeyDown={(event) => {
            if (!isBusy && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              videoInputRef.current?.click();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (!isBusy && file) handleVideoFile(file);
          }}
          className={`flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition-colors ${
            isBusy
              ? "cursor-wait border-amber-500/30 bg-slate-950/40"
              : "border-slate-700 bg-slate-900/80 hover:border-amber-500/50 hover:bg-slate-900"
          }`}
          aria-label="Thả video vào đây hoặc chọn video"
        >
          <Film className="h-5 w-5 shrink-0 text-amber-400" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">
              {video?.fileName || "Chọn hoặc thả video"}
            </span>
            {!video && (
              <span className="mt-1 block text-xs text-slate-500">
                MP4 · MKV · MOV · AVI · WebM
              </span>
            )}
          </span>
          {isBusy && (
            <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-amber-300" />
          )}
        </div>

        <input
          type="file"
          accept=".srt,application/x-subrip"
          onChange={(event) => void handleSrtChange(event)}
          className="hidden"
          aria-label="Chọn phụ đề SRT"
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => srtInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              srtInputRef.current?.click();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void handleSrtFile(file);
          }}
          className="flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/80 px-4 py-3 transition-colors hover:border-amber-500/50 hover:bg-slate-900"
          aria-label="Thả phụ đề SRT vào đây hoặc chọn phụ đề"
        >
          <FileText className="h-5 w-5 shrink-0 text-amber-400" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">
              {srt?.fileName || "Chọn hoặc thả phụ đề SRT"}
            </span>
            {!srt && (
              <span className="mt-1 block text-xs text-slate-500">
                Chỉ hỗ trợ .SRT
              </span>
            )}
          </span>
          {srt && !srt.error && (
            <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-400" />
          )}
        </div>

        <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
          <button
            type="button"
            onClick={() => setFileDetailsOpen(true)}
            disabled={!video && !srt}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-amber-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <HardDrive className="h-3.5 w-3.5" />
            Details
          </button>
          <button
            type="button"
            onClick={() => void clearSelectedFiles()}
            disabled={(!video && !srt) || (isBusy && !video)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:border-rose-400/50 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Xóa
          </button>
        </div>
      </div>

      <div className="hidden grid-cols-1 gap-4 xl:grid-cols-2">
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
              <span className="text-sm font-semibold">
                Chọn video từ máy tính
              </span>
              <span className="text-xs text-slate-500">
                MP4 · MKV · MOV · AVI · WebM
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-800 text-amber-300 flex items-center justify-center shrink-0">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white break-all">
                    {video.fileName}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {formatFileSize(video.sizeBytes)}
                  </p>
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
                      style={{
                        width: `${job?.status === "probing" ? 100 : video.progress}%`,
                      }}
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
                  <span
                    className={
                      job.status === "completed"
                        ? "text-emerald-300"
                        : "text-slate-300"
                    }
                  >
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
            Video được gửi đến backend cục bộ để kiểm tra bằng FFprobe; tệp
            nguồn trên máy không bị chỉnh sửa.
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
              <span className="text-xs text-slate-500">
                Chỉ hỗ trợ định dạng .SRT
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-800 text-amber-300 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white break-all">
                    {srt.fileName}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {formatFileSize(srt.sizeBytes)}
                  </p>
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
                    <p className="text-[11px] text-slate-400">
                      Subtitle hợp lệ
                    </p>
                    <p className="mt-1 text-sm font-bold text-emerald-300">
                      {srt.analysis.subtitleCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <p className="text-[11px] text-slate-400">
                      Bắt đầu sớm nhất
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {formatSecondsToSrtTime(srt.analysis.earliestStart)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <p className="text-[11px] text-slate-400">
                      Kết thúc muộn nhất
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {formatSecondsToSrtTime(srt.analysis.latestEnd)}
                    </p>
                  </div>
                  {srt.analysis.invalidBlockCount > 0 && (
                    <div className="sm:col-span-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>
                        Bỏ qua {srt.analysis.invalidBlockCount} block không hợp
                        lệ trong phần thống kê. Nội dung tệp không bị thay đổi.
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-500">
            SRT được phân tích trong trình duyệt. Khi lưu cấu hình hoặc chạy
            Auto Pipeline, các cue được gửi tới backend cục bộ và lưu trong
            metadata job để có thể tiếp tục sau khi mở lại ứng dụng; dữ liệu
            không được gửi lên cloud.
          </p>
          {job && !srt && masterGeneration?.status !== "completed" && (
            <p className="text-[11px] leading-relaxed text-amber-300">
              File SRT không được lưu trong lịch sử job. Hãy chọn lại SRT nếu
              cần tạo TTS Master cho job này.
            </p>
          )}
        </section>
      </div>

      {fileDetailsOpen && detailRowIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setFileDetailsOpen(false);
              setDetailRowIndex(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-dubbing-file-details-title"
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id="video-dubbing-file-details-title"
                className="text-lg font-bold text-white"
              >
                Thông tin Video và SRT
              </h3>
              <button
                type="button"
                onClick={() => {
                  setFileDetailsOpen(false);
                  setDetailRowIndex(null);
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Đóng details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <h4 className="text-sm font-semibold text-white">
                  Video nguồn
                </h4>
                {!detailVideoFile ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Chưa chọn video.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 break-all text-xs text-slate-300">
                      {detailVideoFile.name} ·{" "}
                      {formatFileSize(detailVideoFile.size)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {detailState?.phase ||
                        (detailJob ? statusLabel(detailJob) : "Đang chờ xử lý")}
                      {detailState?.progressPercent !== undefined &&
                        ` · ${Math.round(detailState.progressPercent)}%`}
                    </p>
                    {detailState?.error && (
                      <p className="mt-2 text-xs text-rose-300">
                        {detailState.error}
                      </p>
                    )}
                    {detailJob?.status === "completed" &&
                      detailJob.metadata && (
                        <MetadataGrid metadata={detailJob.metadata} />
                      )}
                  </>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <h4 className="text-sm font-semibold text-white">Phụ đề SRT</h4>
                {!detailSubtitle ? (
                  <p className="mt-2 text-xs text-slate-500">Chưa chọn SRT.</p>
                ) : (
                  <>
                    <p className="mt-2 break-all text-xs text-slate-300">
                      {detailSubtitle.fileName} ·{" "}
                      {formatFileSize(detailSubtitle.sizeBytes)}
                    </p>
                    {detailSubtitle.error ? (
                      <p className="mt-2 text-xs text-rose-300">
                        {detailSubtitle.error}
                      </p>
                    ) : detailSubtitle.analysis ? (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-slate-800 p-2">
                          <p className="text-[11px] text-slate-400">
                            Cue hợp lệ
                          </p>
                          <p className="mt-1 text-sm font-bold text-emerald-300">
                            {detailSubtitle.analysis.subtitleCount}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-800 p-2">
                          <p className="text-[11px] text-slate-400">Bắt đầu</p>
                          <p className="mt-1 text-sm font-bold text-white">
                            {formatSecondsToSrtTime(
                              detailSubtitle.analysis.earliestStart,
                            )}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-800 p-2">
                          <p className="text-[11px] text-slate-400">Kết thúc</p>
                          <p className="mt-1 text-sm font-bold text-white">
                            {formatSecondsToSrtTime(
                              detailSubtitle.analysis.latestEnd,
                            )}
                          </p>
                        </div>
                        {detailSubtitle.analysis.invalidBlockCount > 0 && (
                          <p className="text-xs text-amber-300 sm:col-span-3">
                            Bỏ qua {detailSubtitle.analysis.invalidBlockCount}{" "}
                            block không hợp lệ.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">
                        Đang phân tích nội dung SRT…
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setFileDetailsOpen(false);
                  setDetailRowIndex(null);
                }}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Đóng
              </button>
            </div>
          </section>
        </div>
      )}

      {(job?.status === "completed" || queueRowCount > 0) && (
        <section className="overflow-hidden rounded-2xl border border-indigo-500/25 bg-slate-900/80">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <button
              type="button"
              onClick={() => setAutoPipelineExpanded((expanded) => !expanded)}
              aria-expanded={autoPipelineExpanded}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/15 text-indigo-300">
                <RefreshCw className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-white">
                  Auto Pipeline
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  Cấu hình TTS, Demucs, Mixer và xuất MP4 theo một luồng.
                </span>
              </span>
              {autoPipelineExpanded ? (
                <ChevronDown className="ml-auto h-4 w-4 shrink-0 rotate-180 text-slate-400" />
              ) : (
                <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
              )}
            </button>
            <label
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                autoPipelineEnabled
                  ? "border-indigo-400/40 bg-indigo-950/50 text-indigo-100"
                  : "border-slate-700 bg-slate-950/60 text-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={autoPipelineEnabled}
                disabled={isAutoPipelineRunning || queueRunning}
                onChange={(event) =>
                  setAutoPipelineEnabled(event.target.checked)
                }
                className="accent-indigo-400"
                aria-label="Bật Auto Pipeline"
              />
              Bật Auto Pipeline
            </label>
          </div>

          {autoPipelineExpanded && (
            <div className="space-y-4 border-t border-slate-800 p-4 sm:p-5">
              <fieldset
                disabled={
                  !autoPipelineEnabled || isAutoPipelineRunning || queueRunning
                }
                className="space-y-4 disabled:opacity-55"
              >
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    TTS Master
                  </h4>
                  <p className="mt-1 text-xs text-slate-400">
                    Dùng Piper và căn cue phụ đề theo timestamp video.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">
                      Giọng Piper
                    </span>
                    <select
                      value={selectedVoiceId}
                      onChange={(event) =>
                        setSelectedVoiceId(event.target.value)
                      }
                      disabled={voices.length === 0}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-400 focus:outline-none disabled:opacity-50"
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
                    <span className="text-xs font-medium text-slate-300">
                      Ưu tiên tốc độ
                    </span>
                    <select
                      value={speedPriority}
                      onChange={(event) =>
                        setSpeedPriority(
                          event.target.value as
                            | "balanced"
                            | "strict"
                            | "natural",
                        )
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-400 focus:outline-none"
                    >
                      <option value="balanced">Cân bằng</option>
                      <option value="strict">Khớp timestamp</option>
                      <option value="natural">Ưu tiên tự nhiên</option>
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">
                      Tốc độ tối thiểu
                    </span>
                    <select
                      value={minSpeed}
                      onChange={(event) =>
                        setMinSpeed(Number(event.target.value))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-400 focus:outline-none"
                    >
                      {[0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3].map(
                        (speed) => (
                          <option key={speed} value={speed}>
                            {speed.toFixed(1)}×
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">
                      Tốc độ tối đa
                    </span>
                    <select
                      value={maxSpeed}
                      onChange={(event) =>
                        setMaxSpeed(Number(event.target.value))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-400 focus:outline-none"
                    >
                      {[1.1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((speed) => (
                        <option key={speed} value={speed}>
                          {speed
                            .toFixed(2)
                            .replace(/0+$/, "")
                            .replace(/\.$/, "")}
                          ×
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {voicesError && (
                  <p className="text-xs text-rose-300">{voicesError}</p>
                )}

                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-sm font-semibold text-white">Demucs</h4>
                  <label className="mt-3 flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
                    <input
                      type="checkbox"
                      checked={autoPipelineDemucsEnabled}
                      disabled={separationAvailability?.status !== "ready"}
                      onChange={(event) =>
                        setAutoPipelineDemucsEnabled(event.target.checked)
                      }
                      className="mt-0.5 accent-indigo-400"
                    />
                    <span>
                      <span className="block font-semibold text-slate-200">
                        Tự tách vocals và instrumental khi cần
                      </span>
                      <span className="mt-1 block text-slate-400">
                        {separationAvailability?.status === "ready"
                          ? `Sẵn sàng trên ${separationAvailability.device === "cuda" ? "GPU CUDA" : "CPU"}.`
                          : separationAvailability?.message ||
                            "Đang kiểm tra môi trường Demucs."}
                      </span>
                    </span>
                  </label>
                  {autoPipelineDemucsEnabled ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      Khi bật, pipeline chỉ tiếp tục sau khi cả hai track được
                      tạo và xác minh.
                    </p>
                  ) : (
                    <label className="mt-3 block max-w-xl space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
                      <span className="flex justify-between gap-2 text-slate-300">
                        <span>Audio gốc (giọng nói và nhạc chung)</span>
                        <span className="font-semibold text-white">
                          {originalAudioVolumePercent}%
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        step={1}
                        value={originalAudioVolumePercent}
                        disabled={
                          !job?.metadata?.audioCodec && videoFiles.length === 0
                        }
                        onChange={(event) =>
                          setOriginalAudioVolumePercent(
                            Number(event.target.value),
                          )
                        }
                        className="w-full accent-indigo-400 disabled:opacity-40"
                        aria-label="Âm lượng audio gốc"
                      />
                      <span className="block leading-relaxed text-slate-500">
                        {job?.metadata?.audioCodec
                          ? "Không tách nguồn thì không thể điều chỉnh riêng thoại và nhạc."
                          : job
                            ? "Video không có audio gốc."
                            : "Audio gốc sẽ được kiểm tra khi tải từng video."}
                      </span>
                    </label>
                  )}
                </div>

                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-sm font-semibold text-white">
                    Mixer Preview · 3 track
                  </h4>
                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                    {(
                      [
                        ["vocals", "Voice / Vocals"],
                        ["instrumental", "Background / Instrumental"],
                        ["ttsMaster", "TTS Master"],
                      ] as const
                    ).map(([track, label]) => {
                      const setting = mixerSettings[track];
                      const available = mixerTrackAvailability[track];
                      return (
                        <div
                          key={track}
                          className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-200">
                              {label}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {available
                                ? "Đã có track"
                                : "Sẽ dùng khi có đầu ra"}
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
                              onChange={(event) =>
                                updateMixerSetting(track, {
                                  volumePercent: Number(event.target.value),
                                })
                              }
                              className="w-full accent-indigo-400"
                              aria-label={`${label} volume`}
                            />
                          </label>
                          <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                            <input
                              type="checkbox"
                              checked={setting.muted}
                              onChange={(event) =>
                                updateMixerSetting(track, {
                                  muted: event.target.checked,
                                })
                              }
                              className="accent-indigo-400"
                            />
                            Tắt track
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Có thể lưu mức âm lượng/mute trước khi các file track tồn
                    tại; các giá trị này chỉ áp dụng khi pipeline được chạy.
                  </p>
                </div>

                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-sm font-semibold text-white">
                    Final Mix và MP4 Export
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Dùng video nguồn của job. Final Mix được render theo đúng
                    cài đặt trên; MP4 chỉ được xuất và báo hoàn tất sau khi
                    FFprobe xác minh đầu ra.
                  </p>
                </div>
              </fieldset>

              {autoPipeline && (
                <div
                  className={`rounded-xl border p-3 text-xs ${
                    autoPipeline.status === "completed"
                      ? "border-emerald-500/25 bg-emerald-950/20 text-emerald-200"
                      : autoPipeline.status === "failed" ||
                          autoPipeline.status === "interrupted"
                        ? "border-rose-500/25 bg-rose-950/20 text-rose-200"
                        : "border-indigo-500/25 bg-indigo-950/20 text-indigo-200"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {autoPipeline.status === "running"
                        ? `Đang xử lý: ${
                            {
                              validating: "kiểm tra đầu vào",
                              master: "TTS Master",
                              separation: "Demucs",
                              finalMix: "Final Mix",
                              export: "xuất MP4",
                              completed: "hoàn tất",
                            }[autoPipeline.phase]
                          }`
                        : autoPipeline.status === "completed"
                          ? "Auto Pipeline hoàn tất"
                          : autoPipeline.status === "failed"
                            ? "Auto Pipeline thất bại"
                            : autoPipeline.status === "cancelled"
                              ? "Auto Pipeline đã hủy"
                              : autoPipeline.status === "interrupted"
                                ? "Auto Pipeline bị gián đoạn"
                                : "Chưa chạy Auto Pipeline"}
                    </span>
                    {autoPipeline.status === "running" &&
                      autoPipeline.progressPercent !== undefined && (
                        <span>{autoPipeline.progressPercent}%</span>
                      )}
                  </div>
                  {autoPipeline.status === "running" && (
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"
                      role="progressbar"
                      aria-label="Tiến trình Auto Pipeline"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={autoPipeline.progressPercent}
                      aria-valuetext={
                        autoPipeline.progressPercent === undefined
                          ? "Đang xử lý; tiến trình phần trăm chưa xác định"
                          : `${autoPipeline.progressPercent}%`
                      }
                    >
                      <div
                        className={`h-full rounded-full bg-indigo-400 transition-all ${
                          autoPipeline.progressPercent === undefined
                            ? "w-1/3 animate-pulse"
                            : ""
                        }`}
                        style={
                          autoPipeline.progressPercent === undefined
                            ? undefined
                            : { width: `${autoPipeline.progressPercent}%` }
                        }
                      />
                    </div>
                  )}
                  {autoPipeline.error && (
                    <p className="mt-2 leading-relaxed">{autoPipeline.error}</p>
                  )}
                  {autoPipeline.completedStages.length > 0 && (
                    <p className="mt-2 text-slate-300">
                      Hoàn tất: {autoPipeline.completedStages.join(", ")}
                      {autoPipeline.reusedOutputs.length > 0 &&
                        ` · Tái sử dụng: ${autoPipeline.reusedOutputs.join(", ")}`}
                    </p>
                  )}
                </div>
              )}
              {autoPipelineError && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{autoPipelineError}</span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveAutoPipelineConfig()}
                  disabled={
                    !autoPipelineConfig ||
                    autoPipelineSaving ||
                    isAutoPipelineRunning
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {autoPipelineSaving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <HardDrive className="h-4 w-4" />
                  )}
                  Lưu cấu hình
                </button>
                {isAutoPipelineRunning ? (
                  <button
                    type="button"
                    onClick={() => void cancelAutoPipeline()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-2.5 text-xs font-bold text-rose-100 hover:bg-rose-950/60"
                  >
                    <X className="h-4 w-4" />
                    Hủy pipeline
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startAutoPipeline()}
                    disabled={!canStartAutoPipeline}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-400 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-indigo-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    <Play className="h-4 w-4" />
                    Bắt đầu Auto Pipeline
                  </button>
                )}
              </div>
              {!autoPipelineConfig && (
                <p className="text-[11px] leading-relaxed text-amber-300">
                  Chọn SRT có cue hợp lệ và giọng Piper để cấu hình Auto
                  Pipeline.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-5">
        <button
          type="button"
          onClick={() => setMasterPanelExpanded((expanded) => !expanded)}
          aria-expanded={masterPanelExpanded}
          aria-controls="video-dubbing-master-panel"
          className="flex w-full items-start gap-3 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center shrink-0">
            <Volume2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-white">Tạo TTS Master</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Dùng pipeline Đồng Bộ Phụ Đề hiện có: Piper tạo từng câu, căn theo
              timestamp rồi ghép WAV mono 22,050 Hz. Nếu timeline vượt video,
              phần dư cuối track sẽ được trim.
            </p>
          </div>
          <ChevronDown
            className={`mt-2 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
              masterPanelExpanded ? "rotate-180" : ""
            }`}
          />
        </button>

        {masterPanelExpanded && (
          <div id="video-dubbing-master-panel" className="space-y-5">
            {masterGeneration?.status === "generating" && (
              <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-2 text-amber-200">
                    <LoaderCircle className="w-4 h-4 animate-spin" />
                    Đang tạo TTS Master
                  </span>
                  <span className="text-slate-300">
                    {masterGeneration.completedSentences}/
                    {masterGeneration.totalSentences} câu ·{" "}
                    {Math.round(masterGeneration.progressPercent)}%
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
                  disabled={isAutoPipelineRunning}
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
            {masterGeneration?.status === "failed" &&
              masterGeneration.error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{masterGeneration.error}</span>
                </div>
              )}
            {masterGeneration?.status === "cancelled" &&
              !isMasterGenerating && (
                <p className="text-xs text-slate-400">
                  Đã hủy quá trình tạo TTS Master.
                </p>
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
                  Cần video đã kiểm tra thành công, SRT có cue hợp lệ và một
                  giọng Piper.
                </p>
              )}
            </div>

            {hasMasterAudio &&
              masterGeneration?.durationSeconds !== undefined && (
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
                      Thời lượng{" "}
                      {formatDuration(masterGeneration.durationSeconds)}
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
              Tùy chọn giọng/tốc độ chỉ áp dụng cho lần tạo mới; Master đã hoàn
              tất vẫn được giữ nguyên cho đến khi tạo Master mới hoặc bỏ job
              video.
            </p>
          </div>
        )}
      </section>

      {job &&
        (job.status === "completed" ||
          Boolean(
            separation?.vocalsSizeBytes || separation?.instrumentalSizeBytes,
          )) && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
            <button
              type="button"
              onClick={() =>
                setSeparationPanelExpanded((expanded) => !expanded)
              }
              aria-expanded={separationPanelExpanded}
              aria-controls="video-dubbing-separation-panel"
              className="flex w-full items-start gap-3 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 text-violet-300 border border-violet-500/25 flex items-center justify-center shrink-0">
                <AudioLines className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-white">
                  Tách giọng và nhạc nền
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Chạy cục bộ bằng Demucs{" "}
                  {separationAvailability?.model || "htdemucs"}. Kết quả là các
                  stem ước lượng, có thể còn lẫn giọng hoặc nhạc.
                </p>
              </div>
              <ChevronDown
                className={`mt-2 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  separationPanelExpanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {separationPanelExpanded && (
              <div id="video-dubbing-separation-panel" className="space-y-4">
                {!separationAvailability ? (
                  <p className="text-xs text-slate-400">
                    Đang kiểm tra Python, model và thiết bị…
                  </p>
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
                    <p className="mt-1 leading-relaxed">
                      {separationAvailability.message}
                    </p>
                    {separationAvailability.status === "unavailable" && (
                      <p className="mt-2 leading-relaxed">
                        Cấu hình riêng Python bằng biến
                        VIDEO_DUBBING_SEPARATION_PYTHON rồi khởi động lại ứng
                        dụng. Cần cài Demucs/PyTorch và tải model htdemucs
                        trước; nút xử lý không tự cài hoặc tải model.
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
                      disabled={isAutoPipelineRunning}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Hủy tách audio
                    </button>
                  </div>
                )}
                {separation?.status === "cancelled" && (
                  <p className="text-xs text-amber-300">
                    Tác vụ tách audio đã bị hủy.
                  </p>
                )}
                {separation?.status === "interrupted" && (
                  <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                    {separation.error ||
                      "Tác vụ tách audio bị gián đoạn; có thể chạy lại."}
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

                {(separation?.vocalsSizeBytes ||
                  separation?.instrumentalSizeBytes) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(
                      [
                        {
                          key: "vocals",
                          label: "Giọng (vocals)",
                          size: separation.vocalsSizeBytes,
                        },
                        {
                          key: "instrumental",
                          label: "Nhạc nền (instrumental)",
                          size: separation.instrumentalSizeBytes,
                        },
                      ] as const
                    ).map((track) => (
                      <div
                        key={track.key}
                        className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-200">
                            {track.label}
                          </span>
                          <span className="text-slate-400">
                            {track.size
                              ? formatFileSize(track.size)
                              : "Không có"}
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
                    Đã xác minh hai track WAV ·{" "}
                    {formatDuration(separation.durationSeconds || 0)} ·{" "}
                    {separation.sampleRate} Hz · {separation.channels} kênh. Kết
                    quả chưa được tự động đưa vào bản phối.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

      {job?.status === "completed" && (
        <section className="space-y-4 rounded-2xl border border-cyan-500/25 bg-slate-900/80 p-4 sm:p-5">
          <button
            type="button"
            onClick={() => setMixerPanelExpanded((expanded) => !expanded)}
            aria-expanded={mixerPanelExpanded}
            aria-controls="video-dubbing-mixer-panel"
            className="flex w-full items-start gap-3 text-left"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/15 text-cyan-300">
              <AudioLines className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white">
                Mixer Preview · 3 track
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Nghe đồng bộ bằng Web Audio với gain riêng cho vocals,
                instrumental và TTS Master. Mọi thay đổi chỉ áp dụng tức thời
                cho preview; chỉ nút render mới tạo file dùng khi xuất MP4.
              </p>
            </div>
            <ChevronDown
              className={`mt-2 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                mixerPanelExpanded ? "rotate-180" : ""
              }`}
            />
          </button>

          {mixerPanelExpanded && (
            <div id="video-dubbing-mixer-panel" className="space-y-4">
              <div className="space-y-3 rounded-xl border border-slate-800 bg-black/40 p-3">
                <video
                  key={job.id}
                  ref={previewVideoRef}
                  src={`/api/video-dubbing/jobs/${job.id}/source-video`}
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={() => setVideoPreviewReady(true)}
                  onError={() => {
                    setVideoPreviewReady(false);
                    setPreviewError(
                      "Trình duyệt không thể giải mã định dạng video này. Hãy dùng MP4 hoặc WebM tương thích để xem trước.",
                    );
                  }}
                  className="max-h-[min(60vh,640px)] w-full rounded-lg bg-black object-contain"
                  aria-label="Video nguồn"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void playMixerPreview()}
                    disabled={
                      !hasPreviewTrack ||
                      !videoPreviewReady ||
                      isMediaProcessing
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-950/60 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {previewStatus === "playing" ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {previewStatus === "playing" ? "Tạm dừng" : "Phát"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void restartMixerPreview()}
                    disabled={!videoPreviewReady || isMediaProcessing}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-40"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Phát lại từ đầu
                  </button>
                  <span className="text-xs tabular-nums text-slate-400">
                    {formatDuration(previewCurrentTime)} /{" "}
                    {formatDuration(job.metadata?.durationSeconds || 0)}
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
                    disabled={!videoPreviewReady}
                    className="w-full accent-cyan-400 disabled:opacity-40"
                    aria-label="Tua video và các track mixer"
                  />
                )}
                <p className="text-[10px] leading-relaxed text-slate-500">
                  Video là mốc thời gian chính; nguồn video được làm im lặng
                  trong preview. Các track chưa có hoặc chưa xác minh sẽ không
                  thể chọn.
                </p>
              </div>

              {!hasMasterAudio && (
                <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                  Cần tạo TTS Master bằng pipeline hiện có trước khi render
                  final mix. Các track vocals/instrumental có thể nghe riêng ở
                  phần tách audio phía trên.
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
                    disabled={isAutoPipelineRunning}
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
                <p className="text-xs text-amber-200">
                  Đã hủy render final mix.
                </p>
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

              <div className="space-y-4 border-t border-slate-800 pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void startVideoExport()}
                    disabled={!canExportVideo}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    {videoExport?.status === "running" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Film className="h-4 w-4" />
                    )}
                    Merge Master TTS vào Video
                  </button>
                  <span className="text-xs text-slate-400">
                    {!isFinalMixCurrent
                      ? "Cần render final mix hiện tại trước khi xuất MP4."
                      : "Video stream được giữ nguyên; audio final mix được mã hóa AAC."}
                  </span>
                </div>

                {videoExport?.status === "running" && (
                  <div className="space-y-2 rounded-xl border border-sky-500/25 bg-sky-950/20 p-3">
                    <div className="flex flex-wrap justify-between gap-3 text-xs text-sky-100">
                      <span>
                        {videoExport.phase === "validating"
                          ? "Đang xác minh MP4"
                          : "Đang xuất MP4 (copy video stream)"}
                      </span>
                      <span>
                        {videoExport.progressPercent === undefined
                          ? "Đang xử lý…"
                          : `${videoExport.progressPercent}%`}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Tiến trình xuất video MP4"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={videoExport.progressPercent}
                      className="h-2 overflow-hidden rounded-full bg-slate-800"
                    >
                      <div
                        className="h-full rounded-full bg-sky-400 transition-all"
                        style={{
                          width: `${videoExport.progressPercent ?? 30}%`,
                          ...(videoExport.progressPercent === undefined
                            ? { animation: "pulse 1.5s ease-in-out infinite" }
                            : {}),
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void cancelMediaTask("export")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-rose-500/40 hover:text-rose-200"
                    >
                      <X className="h-3.5 w-3.5" />
                      Hủy xuất video
                    </button>
                  </div>
                )}
                {videoExport?.status === "failed" && videoExport.error && (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
                    Xuất MP4 thất bại: {videoExport.error}
                  </p>
                )}
                {videoExport?.status === "cancelled" && (
                  <p className="text-xs text-amber-200">Đã hủy xuất MP4.</p>
                )}
                {videoExport?.status === "interrupted" && videoExport.error && (
                  <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                    {videoExport.error}
                  </p>
                )}

                {hasExportedVideo && job && (
                  <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-emerald-300">
                        {videoExport?.status === "completed" &&
                        isFinalMixCurrent
                          ? "MP4 đã xuất"
                          : "MP4 trước đó vẫn được giữ"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatFileSize(videoExport?.sizeBytes || 0)}
                        {videoExport?.durationSeconds !== undefined &&
                          ` · ${formatDuration(videoExport.durationSeconds)}`}
                      </span>
                    </div>
                    <video
                      key={`${job.id}-${videoExport?.sizeBytes}`}
                      controls
                      playsInline
                      preload="metadata"
                      src={`/api/video-dubbing/jobs/${job.id}/exported-video`}
                      className="max-h-[min(60vh,640px)] w-full rounded-lg bg-black"
                      aria-label="Video MP4 đã xuất"
                    />
                    <a
                      href={`/api/video-dubbing/jobs/${job.id}/download`}
                      download={`video-dubbing-${job.id}.mp4`}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-950/60"
                    >
                      Tải MP4
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs text-slate-400">
        <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
        <p>
          Tách giọng và nhạc nền chạy cục bộ bằng Demucs khi model đã sẵn sàng.
          Các track tách được chỉ để nghe thử; chưa tự động đưa vào bản phối.
          Preset chưa được hỗ trợ.
        </p>
      </div>
    </section>
  );
}
