import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Pause,
  Download,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Sliders,
  Code,
  Music,
  Trash2,
  FileText,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Square,
  FileCode,
  Radio,
  ChevronDown,
  ChevronUp,
  Settings,
  Layers,
  Terminal,
  Filter,
  Check,
  Copy,
  Info,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Eye,
  EyeOff,
  UploadCloud,
  Search,
  X,
  User,
  UserCheck,
  Bookmark,
  Save,
  BookmarkCheck,
  Edit3,
  FileJson,
  FolderInput,
  FolderOutput,
  SkipBack,
  SkipForward,
  Quote,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Bell,
  BellRing,
  BellOff,
  BookOpen,
  Plus,
} from "lucide-react";

import {
  SubtitleItem,
  TimelineJob,
  TimelineJobOptions,
  LogEntry,
} from "./types/subtitles";
import {
  PronunciationRule,
  normalizeVietnameseText,
  normalizeVietnameseNumbers,
  playAiStudioCompletionChime,
} from "./utils/textNormalizer";
import {
  parseSrtContent,
  formatSecondsToSrtTime,
  formatSecondsDisplay,
  exportToSrtString,
} from "./utils/srtParser";
import {
  SAMPLE_PROMPT_SRT,
  SAMPLE_DIALOGUE_SRT,
  SAMPLE_TEST_50_SRT,
} from "./utils/sampleData";

export interface ProjectPreset {
  id: string;
  name: string;
  isDefault?: boolean;
  voiceId: string;
  batchSizeChoice: "1" | "2" | "4" | "8" | "16" | "custom";
  customBatchSize: number;
  maxSpeed: number;
  minSpeed: number;
  speedPriority: "balanced" | "strict" | "natural";
  padSilence: boolean;
  outputFormat: "mp3" | "wav";
  normalizeNumbers?: boolean;
  soundOnComplete?: boolean;
  soundOnlyUnfocused?: boolean;
  customPronunciationRules?: PronunciationRule[];
}

const DEFAULT_PRESETS: ProjectPreset[] = [
  {
    id: "preset-balanced",
    name: "Mặc định - Cân bằng (Khuyên dùng)",
    isDefault: true,
    voiceId: "local:hoaimy-vietnamese-vi-medium-ljkjhi",
    batchSizeChoice: "4",
    customBatchSize: 4,
    maxSpeed: 1.5,
    minSpeed: 0.8,
    speedPriority: "balanced",
    padSilence: true,
    outputFormat: "mp3",
    normalizeNumbers: true,
    soundOnComplete: true,
    soundOnlyUnfocused: true,
    customPronunciationRules: [],
  },
];

interface VoiceOption {
  id: string;
  modelId: string;
  speakerId?: number;
  name: string;
  tag: string;
  gender: "female" | "male" | "neutral";
  description: string;
  sampleText: string;
  recommended: boolean;
  hasLocalFile?: boolean;
  localFilePath?: string | null;
  isLoaded?: boolean;
}

export default function App() {
  // Navigation: 'subtitles' (Phụ đề Timeline) | 'single' (Đọc văn bản đơn)
  const [activeTab, setActiveTab] = useState<"subtitles" | "single">(
    "subtitles",
  );

  // Voices
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    "local:hoaimy-vietnamese-vi-medium-ljkjhi",
  );

  // Voice Selection Panel (Modal Table) & Preview States
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);
  const [voiceSearchQuery, setVoiceSearchQuery] = useState<string>("");
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<
    "all" | "female" | "male" | "recommended"
  >("all");
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);
  const [previewLoadingVoiceId, setPreviewLoadingVoiceId] = useState<
    string | null
  >(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioCacheRef = useRef<Map<string, string>>(new Map());

  // -------------------------------------------------------------
  // SUBTITLE TIMELINE STATE
  // -------------------------------------------------------------
  const [srtRawText, setSrtRawText] = useState<string>(SAMPLE_PROMPT_SRT);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [activeJob, setActiveJob] = useState<TimelineJob | null>(null);

  // Job options
  const [batchSizeChoice, setBatchSizeChoice] = useState<
    "1" | "2" | "4" | "8" | "16" | "custom"
  >("4");
  const [customBatchSize, setCustomBatchSize] = useState<number>(6);
  const [maxSpeed, setMaxSpeed] = useState<number>(1.5);
  const [minSpeed, setMinSpeed] = useState<number>(0.8);
  const [speedPriority, setSpeedPriority] = useState<
    "balanced" | "strict" | "natural"
  >("balanced");
  const [padSilence, setPadSilence] = useState<boolean>(true);
  const [videoDurationStr, setVideoDurationStr] = useState<string>("");
  const [outputFormat, setOutputFormat] = useState<"mp3" | "wav">("mp3");
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(true);

  // Project Settings Presets (Requirement 2)
  const [projectPresets, setProjectPresets] = useState<ProjectPreset[]>(() => {
    try {
      const saved = localStorage.getItem("hoaimy_project_presets");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const customOnly = parsed.filter((p: ProjectPreset) => !p.isDefault);
          return [...DEFAULT_PRESETS, ...customOnly];
        }
      }
    } catch {}
    return DEFAULT_PRESETS;
  });
  const [selectedPresetId, setSelectedPresetId] =
    useState<string>("preset-balanced");
  const [presetFeedback, setPresetFeedback] = useState<string | null>(null);
  const [showSavePresetModal, setShowSavePresetModal] =
    useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [showPresetManagerModal, setShowPresetManagerModal] =
    useState<boolean>(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState<string>("");
  const importPresetsInputRef = useRef<HTMLInputElement | null>(null);

  // Layout expansion states (Requirement 3)
  const [isLeftPanelExpanded, setIsLeftPanelExpanded] = useState<boolean>(true);
  const [isLogsExpanded, setIsLogsExpanded] = useState<boolean>(true);
  const [showSrtEditor, setShowSrtEditor] = useState<boolean>(false);
  const [showStagesTracker, setShowStagesTracker] = useState<boolean>(true);
  const [espeakStatus, setEspeakStatus] = useState<{
    available: boolean;
    path?: string;
  } | null>(null);

  // Drag & drop state for subtitles (Requirement 1)
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isWindowDragging, setIsWindowDragging] = useState<boolean>(false);
  const [dragFeedback, setDragFeedback] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Pronunciation Normalization & Rules (Requirement 1)
  const [normalizeNumbers, setNormalizeNumbers] = useState<boolean>(true);
  const [customPronunciationRules, setCustomPronunciationRules] = useState<
    PronunciationRule[]
  >(() => {
    try {
      const saved = localStorage.getItem("pipertts_custom_pronunciation_rules");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [showPronunciationModal, setShowPronunciationModal] =
    useState<boolean>(false);
  const [newRuleFrom, setNewRuleFrom] = useState<string>("");
  const [newRuleTo, setNewRuleTo] = useState<string>("");
  const [previewTestText, setPreviewTestText] = useState<string>(
    "Giá vé là 5.000đ cho 3.5 giờ, có 50.000 người tham gia.",
  );

  // Voice sorting by name (Requirement 2)
  const [voiceSortOrder, setVoiceSortOrder] = useState<
    "none" | "asc" | "desc"
  >("none");

  // Notification sound & panel (Requirement 3)
  const [soundNotificationEnabled, setSoundNotificationEnabled] =
    useState<boolean>(true);
  const [soundOnlyWhenUnfocused, setSoundOnlyWhenUnfocused] =
    useState<boolean>(true);
  const [showCompletionBanner, setShowCompletionBanner] =
    useState<boolean>(false);
  const [lastCompletedJobInfo, setLastCompletedJobInfo] = useState<{
    id: string;
    count: number;
    duration: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveBatchSize =
    batchSizeChoice === "custom"
      ? Math.max(1, Math.min(32, customBatchSize || 4))
      : parseInt(batchSizeChoice, 10);

  // Logging & Filtering
  const [logFilter, setLogFilter] = useState<
    "ALL" | "INFO" | "SUCCESS" | "WARNING" | "ERROR"
  >("ALL");
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(true);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  // Playback state for Master Audio (Full timeline scrubbing & live sentence tracking)
  const [masterPlaying, setMasterPlaying] = useState<boolean>(false);
  const [masterCurrentTime, setMasterCurrentTime] = useState<number>(0);
  const [masterDuration, setMasterDuration] = useState<number>(0);
  const [isSeekingMaster, setIsSeekingMaster] = useState<boolean>(false);
  const [masterSeekValue, setMasterSeekValue] = useState<number>(0);
  const masterAudioRef = useRef<HTMLAudioElement | null>(null);

  // Playback state for Individual Subtitle Item
  const [playingItemIndex, setPlayingItemIndex] = useState<number | null>(null);
  const itemAudioRef = useRef<HTMLAudioElement | null>(null);

  // SSE EventSource reference
  const eventSourceRef = useRef<EventSource | null>(null);

  // Single Text TTS State (Tab 2)
  const [singleText, setSingleText] = useState<string>(
    "Xin chào! Đây là Piper TTS Studio - hệ thống tổng hợp giọng đọc tiếng Việt tự nhiên 100% Offline, hỗ trợ nhiều giọng đọc và đồng bộ timeline phụ đề.",
  );
  const [singleSpeed, setSingleSpeed] = useState<number>(1.0);
  const [singleSilence, setSingleSilence] = useState<number>(0.2);
  const [singleAudioUrl, setSingleAudioUrl] = useState<string | null>(null);
  const [singleIsLoading, setSingleIsLoading] = useState<boolean>(false);
  const [singleFormat, setSingleFormat] = useState<"mp3" | "wav">("mp3");
  const singleAudioRef = useRef<HTMLAudioElement | null>(null);

  // Modal API code
  const [showApiModal, setShowApiModal] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Load voices on mount
  useEffect(() => {
    fetch("/api/voices")
      .then((res) => res.json())
      .then((data) => {
        if (data.voices && Array.isArray(data.voices)) {
          setVoices(data.voices);
          if (data.defaultModel) setSelectedVoiceId(data.defaultModel);
        }
        if (typeof data.espeakAvailable === "boolean") {
          setEspeakStatus({
            available: data.espeakAvailable,
            path: data.espeakPath,
          });
        }
      })
      .catch((e) => console.error("Failed to load voices:", e));
  }, []);

  // Parse SRT whenever raw text changes
  useEffect(() => {
    const { items, warnings } = parseSrtContent(srtRawText);
    setSubtitles(items);
    setParseWarnings(warnings);
  }, [srtRawText]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Auto-scroll logs internally without scrolling the outer webpage viewport
  useEffect(() => {
    if (autoScrollLogs && logsContainerRef.current) {
      logsContainerRef.current.scrollTop =
        logsContainerRef.current.scrollHeight;
    }
  }, [activeJob?.logs, autoScrollLogs]);

  // Connect SSE for an active job
  const connectSSE = (jobId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/subtitles/job/${jobId}/events`);
    eventSourceRef.current = es;

    es.addEventListener("job_state", (e) => {
      const data = JSON.parse(e.data);
      setActiveJob(data);
    });

    es.addEventListener("stage_change", (e) => {
      const stage = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        const stages = prev.stages.map((s) =>
          s.id === stage.id ? { ...s, ...stage } : s,
        );
        return { ...prev, stages };
      });
    });

    es.addEventListener("sentence_start", (e) => {
      const data = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        const items = prev.items.map((it) =>
          it.index === data.index
            ? { ...it, status: "generating" as const }
            : it,
        );
        return { ...prev, items };
      });
    });

    es.addEventListener("sentence_progress", (e) => {
      const data = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        const items = prev.items.map((it) =>
          it.index === data.index ? { ...it, status: data.status } : it,
        );
        return { ...prev, items };
      });
    });

    es.addEventListener("sentence_complete", (e) => {
      const completedItem = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        const items = prev.items.map((it) =>
          it.index === completedItem.index ? { ...it, ...completedItem } : it,
        );
        return { ...prev, items };
      });
    });

    es.addEventListener("sentence_error", (e) => {
      const errorItem = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        const items = prev.items.map((it) =>
          it.index === errorItem.index ? { ...it, ...errorItem } : it,
        );
        return { ...prev, items };
      });
    });

    es.addEventListener("log", (e) => {
      const log = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        return { ...prev, logs: [...prev.logs, log] };
      });
    });

    es.addEventListener("overall_progress", (e) => {
      const progress = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        return { ...prev, overallProgress: progress };
      });
    });

    es.addEventListener("job_status", (e) => {
      const data = JSON.parse(e.data);
      setActiveJob((prev) => (prev ? { ...prev, status: data.status } : null));
    });

    es.addEventListener("job_finished", (e) => {
      const data = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: "completed",
          masterAudio: data.masterAudio,
        };
      });

      // Requirement 3: Âm thanh panel thông báo như của AI Studio khi hoàn thành xử lý phụ đề nếu app không được focus
      const isUnfocused = document.hidden || !document.hasFocus();
      if (!soundOnlyWhenUnfocused || isUnfocused) {
        if (soundNotificationEnabled) {
          playAiStudioCompletionChime();
        }
      }

      // Show completion toast banner
      setShowCompletionBanner(true);
      setLastCompletedJobInfo({
        id: data.id || "",
        count: subtitles.length,
        duration: data.masterAudio?.duration || 0,
      });

      // Browser title alert if unfocused
      if (isUnfocused) {
        const originalTitle = document.title;
        document.title = "🔔 (Đã xong!) " + originalTitle;
        const handleWindowFocus = () => {
          document.title = originalTitle;
          window.removeEventListener("focus", handleWindowFocus);
        };
        window.addEventListener("focus", handleWindowFocus);

        // Native Notification if granted
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("Piper TTS Studio", {
              body: `Đã hoàn thành xử lý ${subtitles.length} câu phụ đề! File Master Audio đã sẵn sàng.`,
              icon: "/favicon.ico",
            });
          } catch {}
        }
      }
    });

    es.onerror = () => {
      // Reconnection will automatically be attempted by browser EventSource
    };
  };

  // Create & Start processing
  const handleStartProcessing = async () => {
    if (subtitles.length === 0) return;

    // Request notification permission smoothly if enabled
    if (
      soundNotificationEnabled &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }

    let videoDur: number | undefined = undefined;
    if (videoDurationStr.trim()) {
      const parts = videoDurationStr.trim().split(":");
      if (parts.length === 3) {
        videoDur =
          parseFloat(parts[0]) * 3600 +
          parseFloat(parts[1]) * 60 +
          parseFloat(parts[2]);
      } else if (parts.length === 2) {
        videoDur = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      } else {
        videoDur = parseFloat(videoDurationStr) || undefined;
      }
    }

    try {
      const res = await fetch("/api/subtitles/job/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: subtitles,
          model: selectedVoice.modelId,
          speakerId: selectedVoice.speakerId,
          options: {
            batchSize: effectiveBatchSize,
            maxSpeed,
            minSpeed,
            speedPriority,
            padSilence,
            videoDuration: videoDur,
            outputFormat,
            normalizeNumbers,
            customReplacements: customPronunciationRules
              .filter((r) => r.active)
              .map((r) => ({ from: r.from, to: r.to })),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tạo dự án.");

      const jobId = data.jobId;
      setActiveJob(data.job);
      connectSSE(jobId);

      // Start the job
      await fetch(`/api/subtitles/job/${jobId}/start`, { method: "POST" });
    } catch (e: any) {
      console.error("Failed to start job:", e);
    }
  };

  const handlePauseJob = async () => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/pause`, { method: "POST" });
  };

  const handleResumeJob = async () => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/start`, { method: "POST" });
  };

  const handlePauseResume = async () => {
    if (!activeJob) return;
    if (activeJob.status === "running") {
      await handlePauseJob();
    } else if (activeJob.status === "paused") {
      await handleResumeJob();
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/cancel`, {
      method: "POST",
    });
  };

  const handleRetryFailed = async () => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/retry-failed`, {
      method: "POST",
    });
  };

  const handleResetJob = async () => {
    if (activeJob) {
      try {
        await fetch(`/api/subtitles/job/${activeJob.id}/cleanup`, {
          method: "POST",
        });
      } catch {}
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setActiveJob(null);
    setMasterPlaying(false);
    setMasterCurrentTime(0);
  };

  const handleRegenerateSingle = async (index: number) => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/single/${index}`, {
      method: "POST",
    });
  };

  const handlePlayItemAudio = (item: SubtitleItem) => {
    if (!activeJob) return;
    const url = `/api/subtitles/job/${activeJob.id}/item-audio/${item.index}?t=${Date.now()}`;

    // If currently playing this item, pause it
    if (playingItemIndex === item.index) {
      if (itemAudioRef.current) itemAudioRef.current.pause();
      setPlayingItemIndex(null);
      return;
    }

    // Stop master audio if playing
    if (masterAudioRef.current && masterPlaying) {
      masterAudioRef.current.pause();
      setMasterPlaying(false);
    }

    if (!itemAudioRef.current) {
      itemAudioRef.current = new Audio();
    }
    const audio = itemAudioRef.current;
    audio.pause();
    audio.src = url;
    audio.onended = () => setPlayingItemIndex(null);
    audio.onerror = () => {
      console.error("Lỗi tải file audio câu:", item.index);
      setPlayingItemIndex(null);
    };
    audio
      .play()
      .then(() => setPlayingItemIndex(item.index))
      .catch((e) => {
        console.error("Lỗi phát âm thanh câu:", e);
        setPlayingItemIndex(null);
      });
  };

  // Master Audio Timeline Scrubbing & Navigation Logic (Requirement 1 & 2)
  // Ensure audio is loaded when masterAudio becomes available
  useEffect(() => {
    if (activeJob?.masterAudio?.url && masterAudioRef.current) {
      const audio = masterAudioRef.current;
      const targetUrl = activeJob.masterAudio.url;
      if (!audio.src || !audio.src.includes(targetUrl)) {
        audio.src = targetUrl;
        audio.load();
      }
    }
  }, [activeJob?.masterAudio?.url]);

  // Determine currently active sentence in Master Audio based on playback position (Requirement 2)
  const currentMasterItem = useMemo(() => {
    if (!activeJob?.items || activeJob.items.length === 0) return null;
    const time = isSeekingMaster ? masterSeekValue : masterCurrentTime;

    // 1. Direct match: playback time is within [startTime, endTime]
    const exact = activeJob.items.find(
      (it) => time >= it.startTime - 0.05 && time <= it.endTime + 0.05,
    );
    if (exact) {
      return {
        item: exact,
        isSilenceGap: false,
        gapLabel: "",
      };
    }

    // 2. Playback is in the intro gap before the first sentence
    if (time < activeJob.items[0].startTime) {
      const waitTime = Math.max(0, activeJob.items[0].startTime - time);
      return {
        item: activeJob.items[0],
        isSilenceGap: true,
        gapLabel: `Khoảng lặng đầu video (còn ${waitTime.toFixed(1)}s tới Câu 1)`,
      };
    }

    // 3. Playback is in a silence gap between two sentences
    for (let i = 0; i < activeJob.items.length - 1; i++) {
      const prev = activeJob.items[i];
      const next = activeJob.items[i + 1];
      if (time > prev.endTime && time < next.startTime) {
        const waitTime = Math.max(0, next.startTime - time);
        return {
          item: next,
          prevItem: prev,
          isSilenceGap: true,
          gapLabel: `Khoảng lặng giữa câu ${prev.index} & ${next.index} (còn ${waitTime.toFixed(1)}s)`,
        };
      }
    }

    // 4. Playback is past the last sentence
    const last = activeJob.items[activeJob.items.length - 1];
    return {
      item: last,
      isSilenceGap: true,
      gapLabel: `Đã hoàn tất toàn bộ phụ đề (${last.index} câu)`,
    };
  }, [activeJob?.items, isSeekingMaster, masterSeekValue, masterCurrentTime]);

  const handlePlayMasterAudio = (startTime?: number) => {
    if (!activeJob?.masterAudio) return;

    // Stop item audio or voice preview if playing
    if (itemAudioRef.current && playingItemIndex !== null) {
      itemAudioRef.current.pause();
      setPlayingItemIndex(null);
    }
    if (previewAudioRef.current && previewVoiceId !== null) {
      previewAudioRef.current.pause();
      setPreviewVoiceId(null);
    }

    if (!masterAudioRef.current) {
      masterAudioRef.current = new Audio();
    }
    const audio = masterAudioRef.current;
    const targetUrl = activeJob.masterAudio.url;

    // If audio.src is not yet pointing to this master audio, set it
    if (!audio.src || !audio.src.includes(targetUrl)) {
      audio.src = targetUrl;
    }

    // If explicit startTime provided (e.g. clicked on sentence or jump button)
    if (typeof startTime === "number") {
      const maxDur = masterDuration || activeJob.masterAudio.duration || 100;
      const clamped = Math.max(0, Math.min(startTime, maxDur));
      try {
        audio.currentTime = clamped;
      } catch {}
      setMasterCurrentTime(clamped);
      setMasterSeekValue(clamped);
      audio
        .play()
        .then(() => setMasterPlaying(true))
        .catch((e) => {
          console.error("Lỗi phát master audio:", e);
          setMasterPlaying(false);
        });
      return;
    }

    if (masterPlaying) {
      audio.pause();
      setMasterPlaying(false);
    } else {
      audio
        .play()
        .then(() => setMasterPlaying(true))
        .catch((e) => {
          console.error("Lỗi phát master audio:", e);
          setMasterPlaying(false);
        });
    }
  };

  // Seek master audio to any position (Requirement 1)
  const handleSeekMaster = (targetSeconds: number, autoPlay: boolean = false) => {
    if (!activeJob?.masterAudio) return;
    const maxDur = masterDuration || activeJob.masterAudio.duration || 100;
    const clamped = Math.max(0, Math.min(targetSeconds, maxDur));
    setMasterCurrentTime(clamped);
    setMasterSeekValue(clamped);

    if (masterAudioRef.current) {
      const audio = masterAudioRef.current;
      if (!audio.src || !audio.src.includes(activeJob.masterAudio.url)) {
        audio.src = activeJob.masterAudio.url;
      }
      try {
        audio.currentTime = clamped;
      } catch (err) {
        console.warn("Could not set currentTime immediately:", err);
      }
      if (autoPlay && audio.paused) {
        audio
          .play()
          .then(() => setMasterPlaying(true))
          .catch((e) => console.error("Lỗi phát sau khi seek:", e));
      }
    }
  };

  // Jump -5s or +5s
  const handleJumpMaster = (deltaSeconds: number) => {
    const current = isSeekingMaster ? masterSeekValue : masterCurrentTime;
    handleSeekMaster(current + deltaSeconds);
  };

  // Jump to previous or next sentence
  const handleJumpToSentence = (direction: "prev" | "next") => {
    if (!activeJob?.items || activeJob.items.length === 0) return;
    const current = isSeekingMaster ? masterSeekValue : masterCurrentTime;
    const items = activeJob.items;

    let currentIndex = items.findIndex(
      (it) => current >= it.startTime - 0.1 && current <= it.endTime + 0.1,
    );
    if (currentIndex === -1) {
      currentIndex = items.findIndex((it) => it.startTime > current);
      if (currentIndex === -1) currentIndex = items.length - 1;
    }

    let targetIndex = currentIndex;
    if (direction === "prev") {
      // If already > 1.2s into current sentence, jump to start of current; otherwise jump to previous
      if (currentIndex > 0 && current > items[currentIndex].startTime + 1.2) {
        targetIndex = currentIndex;
      } else {
        targetIndex = Math.max(0, currentIndex - 1);
      }
    } else {
      targetIndex = Math.min(items.length - 1, currentIndex + 1);
    }

    const targetItem = items[targetIndex];
    if (targetItem) {
      handleSeekMaster(targetItem.startTime);
    }
  };

  // Play master audio starting from a specific sentence
  const handlePlayMasterFromSentence = (item: SubtitleItem) => {
    handlePlayMasterAudio(item.startTime);
  };

  // Scroll to sentence in Subtitles Table
  const handleScrollToSentence = (index: number) => {
    const el = document.getElementById(`subtitle-row-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Preview Voice Sample Text in Voice Selection Panel
  const handlePreviewVoice = async (voice: VoiceOption) => {
    // If currently playing this voice, stop it
    if (previewVoiceId === voice.id) {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      setPreviewVoiceId(null);
      return;
    }

    // Stop master audio or item audio if playing
    if (masterAudioRef.current && masterPlaying) {
      masterAudioRef.current.pause();
      setMasterPlaying(false);
    }
    if (itemAudioRef.current && playingItemIndex !== null) {
      itemAudioRef.current.pause();
      setPlayingItemIndex(null);
    }

    // Check cache
    const cachedUrl = previewAudioCacheRef.current.get(voice.id);
    if (cachedUrl) {
      if (!previewAudioRef.current) previewAudioRef.current = new Audio();
      const audio = previewAudioRef.current;
      audio.pause();
      audio.src = cachedUrl;
      audio.onended = () => setPreviewVoiceId(null);
      audio.onerror = () => setPreviewVoiceId(null);
      await audio
        .play()
        .catch((err) => console.error("Audio play error:", err));
      setPreviewVoiceId(voice.id);
      return;
    }

    // Synthesize sampleText via /api/tts
    setPreviewLoadingVoiceId(voice.id);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text:
            voice.sampleText ||
            `Xin chào, tôi là ${voice.name}. Rất hân hạnh được đồng hành cùng bạn.`,
          model: voice.modelId,
          speakerId: voice.speakerId,
          speed: 1.0,
          format: "mp3",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi tạo âm thanh mẫu");

      const byteCharacters = atob(data.audioBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], {
        type: data.mimeType || "audio/mpeg",
      });
      const url = URL.createObjectURL(blob);
      previewAudioCacheRef.current.set(voice.id, url);

      if (!previewAudioRef.current) previewAudioRef.current = new Audio();
      const audio = previewAudioRef.current;
      audio.pause();
      audio.src = url;
      audio.onended = () => setPreviewVoiceId(null);
      audio.onerror = () => setPreviewVoiceId(null);
      await audio
        .play()
        .catch((err) => console.error("Audio play error:", err));
      setPreviewVoiceId(voice.id);
    } catch (e: any) {
      console.error("Failed to preview voice:", e);
    } finally {
      setPreviewLoadingVoiceId(null);
    }
  };

  const handleCloseVoiceModal = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setPreviewVoiceId(null);
    setShowVoiceModal(false);
  };

  const handleSelectVoice = (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setPreviewVoiceId(null);
  };

  // Preset Handlers (Lưu & Nạp Project Settings: Giọng đọc, Timeline & Tốc độ)
  const handleApplyPreset = (presetId: string) => {
    const preset = projectPresets.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(preset.id);
    setSelectedVoiceId(preset.voiceId);
    setBatchSizeChoice(preset.batchSizeChoice);
    setCustomBatchSize(preset.customBatchSize);
    setMaxSpeed(preset.maxSpeed);
    setMinSpeed(preset.minSpeed);
    setSpeedPriority(preset.speedPriority);
    setPadSilence(preset.padSilence);
    setOutputFormat(preset.outputFormat);
    if (preset.normalizeNumbers !== undefined) {
      setNormalizeNumbers(preset.normalizeNumbers);
    }
    if (preset.soundOnComplete !== undefined) {
      setSoundNotificationEnabled(preset.soundOnComplete);
    }
    if (preset.soundOnlyUnfocused !== undefined) {
      setSoundOnlyWhenUnfocused(preset.soundOnlyUnfocused);
    }
    if (Array.isArray(preset.customPronunciationRules)) {
      setCustomPronunciationRules(preset.customPronunciationRules);
    }
    setSingleSpeed(
      Math.min(1.8, Math.max(0.6, (preset.minSpeed + preset.maxSpeed) / 2)),
    );

    setPresetFeedback(`Đã tự động điền cấu hình: "${preset.name}"`);
    setTimeout(() => setPresetFeedback(null), 3000);
  };

  const handleSaveCurrentAsPreset = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const newPreset: ProjectPreset = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      isDefault: false,
      voiceId: selectedVoiceId,
      batchSizeChoice,
      customBatchSize: effectiveBatchSize,
      maxSpeed,
      minSpeed,
      speedPriority,
      padSilence,
      outputFormat,
      normalizeNumbers,
      soundOnComplete: soundNotificationEnabled,
      soundOnlyUnfocused: soundOnlyWhenUnfocused,
      customPronunciationRules,
    };

    const updated = [...projectPresets, newPreset];
    setProjectPresets(updated);
    setSelectedPresetId(newPreset.id);
    try {
      localStorage.setItem("hoaimy_project_presets", JSON.stringify(updated));
    } catch {}

    setShowSavePresetModal(false);
    setNewPresetName("");
    setPresetFeedback(`Đã lưu cấu hình dự án: "${trimmed}"`);
    setTimeout(() => setPresetFeedback(null), 3500);
  };

  const handleUpdateCurrentPreset = () => {
    const preset = projectPresets.find((p) => p.id === selectedPresetId);
    if (!preset || preset.isDefault) return;

    const updated = projectPresets.map((p) =>
      p.id === selectedPresetId
        ? {
            ...p,
            voiceId: selectedVoiceId,
            batchSizeChoice,
            customBatchSize: effectiveBatchSize,
            maxSpeed,
            minSpeed,
            speedPriority,
            padSilence,
            outputFormat,
            normalizeNumbers,
            soundOnComplete: soundNotificationEnabled,
            soundOnlyUnfocused: soundOnlyWhenUnfocused,
            customPronunciationRules,
          }
        : p,
    );
    setProjectPresets(updated);
    try {
      localStorage.setItem("hoaimy_project_presets", JSON.stringify(updated));
    } catch {}

    setPresetFeedback(`Đã cập nhật cấu hình: "${preset.name}"`);
    setTimeout(() => setPresetFeedback(null), 3000);
  };

  const handleStartRenamePreset = (preset: ProjectPreset) => {
    setEditingPresetId(preset.id);
    setEditingPresetName(preset.name);
  };

  const handleSaveRenamePreset = (presetId: string) => {
    const trimmed = editingPresetName.trim();
    if (!trimmed) return;

    const updated = projectPresets.map((p) => {
      if (p.id === presetId) {
        return { ...p, name: trimmed, isDefault: false };
      }
      return p;
    });

    setProjectPresets(updated);
    try {
      localStorage.setItem("hoaimy_project_presets", JSON.stringify(updated));
    } catch {}

    setEditingPresetId(null);
    setEditingPresetName("");
    setPresetFeedback(`Đã đổi tên cấu hình thành "${trimmed}"`);
    setTimeout(() => setPresetFeedback(null), 3000);
  };

  const handleDeletePreset = (presetId: string) => {
    const preset = projectPresets.find((p) => p.id === presetId);
    if (!preset) return;

    const updated = projectPresets.filter((p) => p.id !== presetId);
    const finalPresets = updated.length > 0 ? updated : DEFAULT_PRESETS;
    setProjectPresets(finalPresets);
    try {
      localStorage.setItem(
        "hoaimy_project_presets",
        JSON.stringify(finalPresets),
      );
    } catch {}

    if (selectedPresetId === presetId) {
      handleApplyPreset(finalPresets[0]?.id || "preset-balanced");
    }
    setPresetFeedback(`Đã xóa cấu hình: "${preset.name}"`);
    setTimeout(() => setPresetFeedback(null), 3000);
  };

  // Export settings to JSON file named "tts_studio_project_settings.json" (Requirement 2)
  const handleExportPresets = () => {
    try {
      const exportData = {
        app: "PiperTTS_Studio",
        exportedAt: new Date().toISOString(),
        version: "2.0",
        presets: projectPresets,
        customPronunciationRules,
        normalizeNumbers,
        soundNotificationEnabled,
        soundOnlyWhenUnfocused,
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tts_studio_project_settings.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setPresetFeedback(
        'Đã xuất file "tts_studio_project_settings.json" thành công!',
      );
      setTimeout(() => setPresetFeedback(null), 3500);
    } catch (e: any) {
      console.error("Lỗi xuất cấu hình:", e);
      setPresetFeedback("Lỗi khi xuất file cấu hình!");
      setTimeout(() => setPresetFeedback(null), 3000);
    }
  };

  // Import settings from JSON file into studio (Requirement 2)
  const handleImportPresetsFile = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        let rawList: any[] = [];

        if (Array.isArray(parsed)) {
          rawList = parsed;
        } else if (parsed && Array.isArray(parsed.presets)) {
          rawList = parsed.presets;
          if (Array.isArray(parsed.customPronunciationRules)) {
            setCustomPronunciationRules((prev) => [
              ...prev,
              ...parsed.customPronunciationRules.filter(
                (r: any) => !prev.some((p) => p.from === r.from),
              ),
            ]);
          }
          if (typeof parsed.normalizeNumbers === "boolean") {
            setNormalizeNumbers(parsed.normalizeNumbers);
          }
          if (typeof parsed.soundNotificationEnabled === "boolean") {
            setSoundNotificationEnabled(parsed.soundNotificationEnabled);
          }
        } else {
          throw new Error("Định dạng file JSON không chứa mảng presets hợp lệ");
        }

        const validImported: ProjectPreset[] = [];
        for (const item of rawList) {
          if (!item.name || typeof item.name !== "string") continue;
          validImported.push({
            id:
              item.id && !projectPresets.some((p) => p.id === item.id)
                ? item.id
                : `imported-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: item.name.trim(),
            isDefault: false,
            voiceId: item.voiceId || "local:hoaimy-vietnamese-vi-medium-ljkjhi",
            batchSizeChoice: item.batchSizeChoice || "4",
            customBatchSize:
              typeof item.customBatchSize === "number"
                ? item.customBatchSize
                : 4,
            maxSpeed: typeof item.maxSpeed === "number" ? item.maxSpeed : 1.5,
            minSpeed: typeof item.minSpeed === "number" ? item.minSpeed : 0.8,
            speedPriority: item.speedPriority || "balanced",
            padSilence:
              typeof item.padSilence === "boolean" ? item.padSilence : true,
            outputFormat: item.outputFormat === "wav" ? "wav" : "mp3",
            normalizeNumbers:
              typeof item.normalizeNumbers === "boolean"
                ? item.normalizeNumbers
                : true,
            soundOnComplete:
              typeof item.soundOnComplete === "boolean"
                ? item.soundOnComplete
                : true,
            soundOnlyUnfocused:
              typeof item.soundOnlyUnfocused === "boolean"
                ? item.soundOnlyUnfocused
                : true,
            customPronunciationRules: Array.isArray(item.customPronunciationRules)
              ? item.customPronunciationRules
              : [],
          });
        }

        if (validImported.length === 0) {
          setPresetFeedback("Không tìm thấy cấu hình hợp lệ trong file JSON!");
          setTimeout(() => setPresetFeedback(null), 3500);
          return;
        }

        // Merge imported presets, handling duplicate names nicely
        const existingNames = new Set(
          projectPresets.map((p) => p.name.toLowerCase()),
        );
        const toAdd = validImported.map((item) => {
          let name = item.name;
          if (existingNames.has(name.toLowerCase())) {
            name = `${name} (Nhập)`;
          }
          existingNames.add(name.toLowerCase());
          return { ...item, name };
        });

        const updated = [...projectPresets, ...toAdd];
        setProjectPresets(updated);
        try {
          localStorage.setItem(
            "hoaimy_project_presets",
            JSON.stringify(updated),
          );
        } catch {}

        if (toAdd.length > 0) {
          handleApplyPreset(toAdd[0].id);
        }

        setPresetFeedback(
          `Đã nhập thành công ${toAdd.length} cấu hình từ JSON!`,
        );
        setTimeout(() => setPresetFeedback(null), 3500);
      } catch (err: any) {
        console.error("Import presets error:", err);
        setPresetFeedback("Lỗi: File JSON không đúng định dạng!");
        setTimeout(() => setPresetFeedback(null), 3500);
      } finally {
        if (event.target) event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const processSubtitleFile = (file: File) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".srt") && !name.endsWith(".txt")) {
      setDragFeedback(
        "Vui lòng chọn hoặc kéo thả file phụ đề có đuôi .srt hoặc .txt",
      );
      setTimeout(() => setDragFeedback(null), 4000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      let content = evt.target?.result as string;
      if (content) {
        // Strip BOM if present
        if (content.charCodeAt(0) === 0xfeff) {
          content = content.slice(1);
        }
        // Normalize to Unicode NFC
        content = content.normalize("NFC");
        setSrtRawText(content);
        setActiveJob(null);
        setUploadedFileName(file.name);
        setDragFeedback(`Đã nạp file: ${file.name}`);
        setTimeout(() => setDragFeedback(null), 3500);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  // Window-level drag & drop listener for smooth UX
  useEffect(() => {
    let dragCounter = 0;
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types?.includes("Files")) {
        setIsWindowDragging(true);
      }
    };
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };
    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsWindowDragging(false);
      }
    };
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsWindowDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processSubtitleFile(files[0]);
      }
    };

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSubtitleFile(file);
      e.target.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSubtitleFile(files[0]);
    }
  };

  // Single TTS synthesis (Tab 2)
  const handleSingleSynthesize = async () => {
    if (!singleText.trim()) return;
    setSingleIsLoading(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: singleText.trim(),
          model: selectedVoice.modelId,
          speakerId: selectedVoice.speakerId,
          speed: singleSpeed,
          sentenceSilence: singleSilence,
          format: singleFormat,
          normalizeNumbers,
          customReplacements: customPronunciationRules
            .filter((r) => r.active)
            .map((r) => ({ from: r.from, to: r.to })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const byteCharacters = atob(data.audioBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], {
        type: data.mimeType,
      });
      const url = URL.createObjectURL(blob);
      setSingleAudioUrl(url);

      setTimeout(() => {
        if (singleAudioRef.current) {
          singleAudioRef.current.src = url;
          singleAudioRef.current.play();
        }
      }, 50);
    } catch (e: any) {
      console.error(e);
    } finally {
      setSingleIsLoading(false);
    }
  };

  // Filtered logs
  const displayLogs = (activeJob?.logs || []).filter((log) => {
    if (logFilter === "ALL") return true;
    return log.level === logFilter;
  });

  const completedSentencesCount =
    activeJob?.overallProgress?.completed ??
    subtitles.filter((s) => s.status === "completed").length;
  const totalSentencesCount =
    activeJob?.overallProgress?.total ?? subtitles.length;
  const completionPercent =
    totalSentencesCount > 0
      ? Math.round((completedSentencesCount / totalSentencesCount) * 100)
      : 0;

  const selectedVoice = voices.find((v) => v.id === selectedVoiceId) ||
    voices[0] || {
      id: "local:hoaimy-vietnamese-vi-medium-ljkjhi",
      modelId: "local:hoaimy-vietnamese-vi-medium-ljkjhi",
      name: "Hoài My (Khuyên Dùng)",
      tag: "Nữ · Miền Bắc · Chuẩn & Truyền cảm (Offline)",
      gender: "female",
      description: "Giọng đọc nữ tự nhiên chuẩn miền Bắc, 100% Offline.",
      sampleText: "Xin chào, tôi là Hoài My.",
      recommended: true,
    };

  const selectedPreset =
    projectPresets.find((p) => p.id === selectedPresetId) || projectPresets[0];

  const femaleVoicesCount = voices.filter((v) => v.gender === "female").length;
  const maleVoicesCount = voices.filter((v) => v.gender === "male").length;
  const recommendedVoicesCount = voices.filter((v) => v.recommended).length;

  const filteredVoices = voices.filter((v) => {
    if (voiceGenderFilter === "recommended" && !v.recommended) return false;
    if (voiceGenderFilter === "female" && v.gender !== "female") return false;
    if (voiceGenderFilter === "male" && v.gender !== "male") return false;
    if (voiceSearchQuery.trim()) {
      const q = voiceSearchQuery.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        v.tag.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        (v.sampleText && v.sampleText.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Sorted voices for Table (Requirement 2: sort by name when clicking header)
  const sortedVoices = useMemo(() => {
    const list = [...filteredVoices];
    if (voiceSortOrder === "asc") {
      list.sort((a, b) =>
        a.name.localeCompare(b.name, "vi", { sensitivity: "base" }),
      );
    } else if (voiceSortOrder === "desc") {
      list.sort((a, b) =>
        b.name.localeCompare(a.name, "vi", { sensitivity: "base" }),
      );
    }
    return list;
  }, [filteredVoices, voiceSortOrder]);

  const handleToggleVoiceSort = () => {
    setVoiceSortOrder((prev) => {
      if (prev === "none") return "asc";
      if (prev === "asc") return "desc";
      return "none";
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Hidden Audio Elements */}
      <audio
        ref={masterAudioRef}
        preload="auto"
        onTimeUpdate={() => {
          if (masterAudioRef.current && !isSeekingMaster) {
            setMasterCurrentTime(masterAudioRef.current.currentTime);
            if (masterAudioRef.current.duration) {
              setMasterDuration(masterAudioRef.current.duration);
            }
          }
        }}
        onLoadedMetadata={() => {
          if (masterAudioRef.current && masterAudioRef.current.duration) {
            setMasterDuration(masterAudioRef.current.duration);
          }
        }}
        onDurationChange={() => {
          if (masterAudioRef.current && masterAudioRef.current.duration) {
            setMasterDuration(masterAudioRef.current.duration);
          }
        }}
        onPlay={() => setMasterPlaying(true)}
        onPause={() => setMasterPlaying(false)}
        onEnded={() => {
          setMasterPlaying(false);
          setMasterCurrentTime(0);
        }}
        onError={() => {
          console.error("Lỗi thẻ audio phát master");
          setMasterPlaying(false);
        }}
      />
      <audio
        ref={itemAudioRef}
        onEnded={() => setPlayingItemIndex(null)}
        onError={() => setPlayingItemIndex(null)}
      />
      <audio ref={singleAudioRef} />

      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white font-black text-sm tracking-tighter">
              TTS
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-base sm:text-lg text-white tracking-tight">
                  Piper TTS Studio
                </h1>
                <span className="text-xs text-amber-400 font-mono font-medium">
                  Multi-Voice & SRT
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Studio tổng hợp giọng nói & đồng bộ phụ đề đa giọng đọc tiếng Việt 100% Offline
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Tabs */}
            <div className="flex items-center p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("subtitles")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === "subtitles"
                    ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Đồng Bộ Phụ Đề (SRT)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("single")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === "single"
                    ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Đọc Đoạn Văn Nhanh
              </button>
            </div>

            <button
              onClick={() => setShowApiModal(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-lg transition-colors border border-slate-700/60"
            >
              <Code className="w-3.5 h-3.5 text-amber-400" />
              <span>Mã Nguồn</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[1680px] w-full mx-auto px-3 sm:px-6 py-6 pb-36 sm:pb-44 space-y-6">
        {/* ========================================================= */}
        {/* TAB 1: SUBTITLE TIMELINE SYNCHRONIZATION STUDIO */}
        {/* ========================================================= */}
        {activeTab === "subtitles" && (
          <div className="flex flex-col lg:flex-row items-start gap-6">
            {/* ========================================================= */}
            {/* CỘT BÊN TRÁI: TOÀN BỘ SETTINGS & DỮ LIỆU ĐẦU VÀO          */}
            {/* Có thể Expand hoặc Hide (Requirement 3)                  */}
            {/* ========================================================= */}
            {isLeftPanelExpanded ? (
              <aside className="w-full lg:w-[380px] xl:w-[410px] 2xl:w-[430px] shrink-0 space-y-4">
                {/* Panel Header & Hide Button */}
                <div className="flex items-center justify-between bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white tracking-tight">
                        Cột Cài Đặt (Settings)
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        Giọng đọc, phụ đề & tham số
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLeftPanelExpanded(false)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
                    title="Ẩn cột cài đặt để mở rộng không gian bên phải"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5 text-amber-400" />
                    <span>Ẩn Cột</span>
                  </button>
                </div>

                {/* 0. Project Settings Card (Lưu & Nạp Cấu Hình Dự Án - Requirement 2) */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Bookmark className="w-4 h-4 text-amber-400" />
                      Cấu hình Dự án
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPresetManagerModal(true)}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold bg-amber-400/10 hover:bg-amber-400/20 px-2 py-0.5 rounded border border-amber-400/30 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Mở bảng quản lý, đổi tên, xóa, xuất JSON & nhập JSON"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Quản lý</span>
                    </button>
                  </div>

                  {/* Dropdown Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <span className="font-medium">
                        Chọn cấu hình lưu sẵn:
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {selectedPreset?.isDefault ? "Mẫu chuẩn" : "Cá nhân"}
                      </span>
                    </div>
                    <select
                      value={selectedPresetId}
                      onChange={(e) => handleApplyPreset(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 hover:border-amber-500/60 rounded-xl p-2.5 text-xs text-slate-100 font-medium focus:ring-2 focus:ring-amber-500/40 focus:outline-none transition-colors cursor-pointer"
                    >
                      <optgroup label="── Cấu hình mẫu hệ thống ──">
                        {projectPresets
                          .filter((p) => p.isDefault)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </optgroup>
                      {projectPresets.some((p) => !p.isDefault) && (
                        <optgroup label="── Cấu hình cá nhân của bạn ──">
                          {projectPresets
                            .filter((p) => !p.isDefault)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                ★ {p.name}
                              </option>
                            ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Preset Summary Strip */}
                  <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl text-[11px] space-y-1 font-mono">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="truncate font-semibold text-amber-400">
                        {selectedVoice.name}
                      </span>
                      <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded text-slate-300 uppercase">
                        {outputFormat}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                      <span>
                        Tốc độ: {minSpeed.toFixed(2)}x - {maxSpeed.toFixed(2)}x
                      </span>
                      <span>Batch: {effectiveBatchSize}</span>
                      <span>
                        {speedPriority === "strict"
                          ? "Timeline"
                          : speedPriority === "natural"
                            ? "Tự nhiên"
                            : "Cân bằng"}
                      </span>
                    </div>
                  </div>

                  {/* Preset Action Buttons */}
                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSavePresetModal(true)}
                        className="flex-1 py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Lưu lại cấu hình giọng đọc, tốc độ và timeline hiện tại thành cấu hình dự án mới"
                      >
                        <Save className="w-3.5 h-3.5 text-amber-400" />
                        <span>Lưu mới...</span>
                      </button>

                      {!selectedPreset?.isDefault && (
                        <>
                          <button
                            type="button"
                            onClick={handleUpdateCurrentPreset}
                            className="py-1.5 px-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            title="Cập nhật thông số hiện tại vào cấu hình cá nhân này"
                          >
                            <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Lưu đè</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePreset(selectedPresetId)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl transition-colors cursor-pointer"
                            title="Xóa cấu hình cá nhân này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowPresetManagerModal(true)}
                      className="w-full py-1.5 px-3 bg-slate-950/70 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      title="Mở panel chỉnh sửa, đổi tên, xóa, xuất JSON (tts_studio_project_settings.json) & nhập JSON"
                    >
                      <FileJson className="w-3.5 h-3.5 text-amber-400" />
                      <span>Quản lý / Đổi tên / Xuất & Nhập JSON</span>
                    </button>
                  </div>

                  {presetFeedback && (
                    <div className="text-[11px] text-emerald-300 font-medium px-2.5 py-1 bg-emerald-500/15 rounded-xl border border-emerald-500/30 animate-in fade-in flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>{presetFeedback}</span>
                    </div>
                  )}
                </div>

                {/* 1. Voice Selection Card (Mở Panel Bảng Chọn Giọng Đọc) */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Radio className="w-4 h-4 text-amber-400" />
                      Giọng đọc chính thức
                    </span>
                    <span className="text-[11px] text-amber-400 font-medium bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 font-mono">
                      {voices.length} giọng có sẵn
                    </span>
                  </div>

                  {/* Selected Voice Showcase Box */}
                  <div className="p-3 bg-gradient-to-br from-slate-950 via-slate-950 to-amber-950/20 border border-slate-800/90 rounded-xl space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-md ${
                            selectedVoice.gender === "female"
                              ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                              : "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                          }`}
                        >
                          {selectedVoice.gender === "female" ? "Nữ" : "Nam"}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-white tracking-tight">
                              {selectedVoice.name}
                            </span>
                            {selectedVoice.recommended && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Khuyên dùng
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 block font-mono">
                            {selectedVoice.tag}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2 line-clamp-2">
                      {selectedVoice.description}
                    </p>

                    {/* Quick Preview Audio of Selected Voice */}
                    <button
                      type="button"
                      onClick={() => handlePreviewVoice(selectedVoice)}
                      disabled={previewLoadingVoiceId === selectedVoice.id}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                        previewVoiceId === selectedVoice.id
                          ? "bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-md shadow-amber-500/25"
                          : "bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700"
                      }`}
                      title="Nghe câu thoại mẫu của giọng đọc này"
                    >
                      {previewLoadingVoiceId === selectedVoice.id ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>Đang nạp âm mẫu...</span>
                        </>
                      ) : previewVoiceId === selectedVoice.id ? (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>Dừng nghe thử</span>
                          <span className="flex items-center gap-0.5 ml-1">
                            <span className="w-1 h-3 bg-slate-950 animate-pulse" />
                            <span className="w-1 h-2 bg-slate-950 animate-pulse delay-75" />
                            <span className="w-1 h-3.5 bg-slate-950 animate-pulse delay-150" />
                          </span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
                          <span>Nghe thử giọng này</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Primary Action Button: Open Voice Selection Table Panel */}
                  <button
                    type="button"
                    onClick={() => setShowVoiceModal(true)}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4 text-slate-950" />
                    <span>Mở Bảng Chọn Giọng Đọc ({voices.length} giọng)</span>
                  </button>

                  {/* eSpeak-NG Vietnamese Accent Health Status */}
                  {espeakStatus?.available ? (
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>
                        eSpeak NG: Đã kết nối (Phát âm chuẩn tiếng Việt có dấu).
                      </span>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>eSpeak NG: Chưa phát hiện trên hệ thống</span>
                      </div>
                      <p className="text-[10px] text-amber-200/90 leading-relaxed">
                        Để đọc chuẩn tiếng Việt có dấu khi chạy local, hãy chạy
                        file{" "}
                        <code className="text-white font-mono bg-slate-950 px-1 py-0.5 rounded">
                          Setup.bat
                        </code>{" "}
                        hoặc cài đặt qua lệnh{" "}
                        <code className="text-white font-mono bg-slate-950 px-1 py-0.5 rounded">
                          winget install eSpeak-NG.eSpeak-NG
                        </code>
                        .
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. Upload Subtitle & Presets Card (Requirement 1: Kéo thả phụ đề) */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-amber-400" />
                      Tải tệp phụ đề & Mẫu
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Chọn file</span>
                    </button>
                  </div>

                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer select-none group ${
                      isDragging
                        ? "border-amber-400 bg-amber-500/15 scale-[1.01] shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/40"
                        : "border-slate-700 hover:border-amber-500/60 hover:bg-slate-950/70 bg-slate-950/40"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".srt,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform ${
                          isDragging
                            ? "bg-amber-500 text-slate-950 scale-110"
                            : "bg-slate-800/80 text-amber-400 group-hover:scale-105"
                        }`}
                      >
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div className="text-xs font-semibold text-white">
                        {isDragging
                          ? "Thả file phụ đề vào đây..."
                          : "Kéo thả file .SRT hoặc .TXT vào đây"}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        hoặc{" "}
                        <span className="text-amber-400 underline font-medium">
                          bấm để duyệt file từ máy
                        </span>
                      </div>
                      {dragFeedback && (
                        <div className="mt-1 text-[11px] text-emerald-300 font-medium px-2.5 py-0.5 bg-emerald-500/15 rounded-lg border border-emerald-500/30 animate-pulse">
                          ✓ {dragFeedback}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* File status badge if loaded */}
                  {uploadedFileName && (
                    <div className="flex items-center justify-between p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="truncate text-slate-200 font-medium text-xs">
                          {uploadedFileName}
                        </span>
                      </div>
                      <span className="text-[11px] text-amber-300 font-mono font-bold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 shrink-0">
                        {subtitles.length} câu
                      </span>
                    </div>
                  )}

                  {/* Preset chips */}
                  <div className="space-y-1.5">
                    <span className="text-slate-400 text-[11px] block">
                      Dữ liệu mẫu nhanh:
                    </span>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setSrtRawText(SAMPLE_PROMPT_SRT);
                          setUploadedFileName("Mẫu Prompt (2 câu)");
                          setActiveJob(null);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700/60 cursor-pointer"
                      >
                        Prompt (2 câu)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSrtRawText(SAMPLE_DIALOGUE_SRT);
                          setUploadedFileName("Hội thoại Phim (8 câu)");
                          setActiveJob(null);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700/60 cursor-pointer"
                      >
                        Hội thoại Phim (8 câu)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSrtRawText(SAMPLE_TEST_50_SRT);
                          setUploadedFileName("Bài giảng Test (50 câu)");
                          setActiveJob(null);
                        }}
                        className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg text-xs transition-colors border border-amber-500/30 font-medium cursor-pointer"
                        title="Kiểm thử tải lớn 50 câu"
                      >
                        Bài giảng (50 câu)
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      Đã phân tích:{" "}
                      <strong className="text-white">{subtitles.length}</strong>{" "}
                      câu
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSrtEditor(!showSrtEditor)}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] font-medium"
                    >
                      {showSrtEditor ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {showSrtEditor ? "Đóng xem SRT" : "Xem & Sửa SRT thô"}
                      </span>
                    </button>
                  </div>

                  {/* Optional Raw SRT Textarea editor */}
                  {showSrtEditor && (
                    <div className="pt-2 space-y-1">
                      <textarea
                        value={srtRawText}
                        onChange={(e) => {
                          setSrtRawText(e.target.value.normalize("NFC"));
                          setActiveJob(null);
                        }}
                        rows={6}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-[11px] text-slate-200 leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="Nội dung phụ đề SRT..."
                      />
                      <span className="text-[10px] text-slate-400 block italic">
                        Tự động chuẩn hóa Unicode NFC và phân tích timeline.
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. Processing Parameters Card */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Settings className="w-4 h-4 text-amber-400" />
                      Cấu hình Timeline & Tốc độ
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
                      className="text-slate-400 hover:text-white"
                    >
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${showSettingsDrawer ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>

                  {showSettingsDrawer && (
                    <div className="space-y-4 pt-1">
                      {/* Batch Size Selector */}
                      <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-200 font-semibold flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5 text-amber-400" />
                            Batch Size:
                          </span>
                          <span className="text-amber-400 font-mono font-bold">
                            {effectiveBatchSize} câu song song
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                          {(["1", "2", "4", "8", "16", "custom"] as const).map(
                            (opt) => (
                              <button
                                key={opt}
                                type="button"
                                disabled={activeJob?.status === "running"}
                                onClick={() => setBatchSizeChoice(opt)}
                                className={`py-1 rounded-lg text-center font-medium transition-colors ${
                                  batchSizeChoice === opt
                                    ? "bg-amber-500 text-slate-950 font-bold shadow"
                                    : "text-slate-400 hover:text-white"
                                } ${activeJob?.status === "running" ? "opacity-50 cursor-not-allowed" : ""}`}
                              >
                                {opt === "1"
                                  ? "1 (Tuần tự)"
                                  : opt === "custom"
                                    ? "Tùy chỉnh"
                                    : `${opt} câu`}
                              </button>
                            ),
                          )}
                        </div>
                        {batchSizeChoice === "custom" && (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-slate-400 text-[11px]">
                              Nhập số câu:
                            </span>
                            <input
                              type="number"
                              min="1"
                              max="32"
                              value={customBatchSize}
                              onChange={(e) =>
                                setCustomBatchSize(
                                  Math.max(
                                    1,
                                    Math.min(32, parseInt(e.target.value) || 1),
                                  ),
                                )
                              }
                              className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                        )}
                      </div>

                      {/* Max Speed */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-300 font-medium">
                            Tốc độ tối đa (Max Speed):
                          </span>
                          <span className="text-amber-400 font-mono font-semibold">
                            {maxSpeed.toFixed(2)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.9"
                          max="3.0"
                          step="0.05"
                          value={maxSpeed}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            setMaxSpeed(value);
                            setMinSpeed((current) => Math.min(current, value));
                          }}
                          className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                        />
                        <span className="text-[10px] text-slate-400 block">
                          Giới hạn tăng tốc tối đa (0.9x - 3.0x)
                        </span>
                      </div>

                      {/* Min Speed */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-300 font-medium">
                            Tốc độ tối thiểu (Min Speed):
                          </span>
                          <span className="text-amber-400 font-mono font-semibold">
                            {minSpeed.toFixed(2)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.6"
                          max="1.5"
                          step="0.05"
                          value={minSpeed}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            setMinSpeed(value);
                            setMaxSpeed((current) => Math.max(current, value));
                          }}
                          className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                        />
                        <span className="text-[10px] text-slate-400 block">
                          Giới hạn giảm tốc khi câu ngắn (0.6x - 1.5x)
                        </span>
                      </div>

                      {/* Priority */}
                      <div className="space-y-1.5">
                        <span className="text-slate-300 font-medium block">
                          Mức độ ưu tiên:
                        </span>
                        <select
                          value={speedPriority}
                          onChange={(e) =>
                            setSpeedPriority(e.target.value as any)
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200"
                        >
                          <option value="balanced">
                            Cân bằng (Khuyên dùng)
                          </option>
                          <option value="natural">
                            Ưu tiên Giọng Tự Nhiên (Max 1.15x)
                          </option>
                          <option value="strict">
                            Ưu tiên Khớp Timeline Tuyệt Đối
                          </option>
                        </select>
                      </div>

                      {/* Target Video Duration & Format */}
                      <div className="space-y-1.5">
                        <span className="text-slate-300 font-medium block">
                          Thời lượng video (Tùy chọn):
                        </span>
                        <input
                          type="text"
                          placeholder="00:05:00 hoặc số giây"
                          value={videoDurationStr}
                          onChange={(e) => setVideoDurationStr(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 placeholder:text-slate-600 font-mono"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                        <span className="text-slate-400">
                          Định dạng file xuất:
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOutputFormat("mp3")}
                            className={`px-2.5 py-1 rounded text-xs font-semibold ${
                              outputFormat === "mp3"
                                ? "bg-amber-500 text-slate-950 font-bold"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            MP3
                          </button>
                          <button
                            type="button"
                            onClick={() => setOutputFormat("wav")}
                            className={`px-2.5 py-1 rounded text-xs font-semibold ${
                              outputFormat === "wav"
                                ? "bg-amber-500 text-slate-950 font-bold"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            WAV
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Pronunciation & Text Normalizer Card (Requirement 1) */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-amber-400" />
                      Chuẩn Hóa & Sửa Phát Âm
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPronunciationModal(true)}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold bg-amber-400/10 hover:bg-amber-400/20 px-2 py-0.5 rounded border border-amber-400/30 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Mở từ điển tùy chỉnh phát âm và hướng dẫn phụ âm R"
                    >
                      <Sliders className="w-3 h-3" />
                      <span>Từ điển ({customPronunciationRules.length})</span>
                    </button>
                  </div>

                  {/* Toggle: Sửa số có chấm hàng nghìn */}
                  <label className="flex items-start gap-2.5 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={normalizeNumbers}
                      onChange={(e) => setNormalizeNumbers(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500 accent-amber-500"
                    />
                    <div className="space-y-0.5">
                      <span className="text-slate-200 font-semibold block text-[11px]">
                        Tự động sửa số có dấu chấm (5.000 ➔ 5000)
                      </span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Sửa lỗi &ldquo;5.000&rdquo; bị đọc thành &ldquo;5 không không không&rdquo;, đọc đúng &ldquo;năm nghìn&rdquo;, số thập phân (3.5 ➔ 3 phẩy 5) và tiền tệ (5.000đ ➔ 5000 đồng).
                      </p>
                    </div>
                  </label>

                  {/* Quick Pronunciation Note on Hoài My & letter R */}
                  <div className="p-2.5 bg-slate-950/50 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                    <div className="flex items-center justify-between text-slate-300 font-medium">
                      <span>Phát âm chữ &ldquo;R&rdquo; (Giọng Hoài My):</span>
                      <span className="text-[10px] text-amber-400">Giọng Bắc</span>
                    </div>
                    <p className="text-[10px] leading-relaxed">
                      Giọng Hoài My nói tiếng Hà Nội nên các âm &ldquo;r/d/gi&rdquo; tự nhiên đồng âm. Để đọc chuẩn &ldquo;R&rdquo; rung uốn lưỡi, hãy chọn giọng <strong>Việt Thảo (Miền Nam)</strong> hoặc mở <strong>Từ điển</strong> để thay thế.
                    </p>
                  </div>
                </div>

                {/* 5. Notification Sound & Panel Card (Requirement 3) */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <BellRing className="w-4 h-4 text-amber-400" />
                      Âm Báo Hoàn Thành (AI Studio)
                    </span>
                    <button
                      type="button"
                      onClick={() => playAiStudioCompletionChime()}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Bấm để nghe thử âm thanh chuông hoàn thành AI Studio"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>Nghe thử âm báo</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center justify-between p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                      <span className="text-slate-300 font-medium text-[11px]">
                        Phát chuông khi xử lý xong phụ đề
                      </span>
                      <input
                        type="checkbox"
                        checked={soundNotificationEnabled}
                        onChange={(e) =>
                          setSoundNotificationEnabled(e.target.checked)
                        }
                        className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 accent-amber-500"
                      />
                    </label>

                    {soundNotificationEnabled && (
                      <label className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
                        <div className="space-y-0.5">
                          <span className="text-slate-300 font-medium block text-[11px]">
                            Chỉ phát khi không focus (ở tab khác)
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            Tự động nhắc bạn quay lại khi phụ đề đã tạo xong
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={soundOnlyWhenUnfocused}
                          onChange={(e) =>
                            setSoundOnlyWhenUnfocused(e.target.checked)
                          }
                          className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 accent-amber-500"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Subtitle Warnings list if any */}
                {parseWarnings.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span>{parseWarnings.length} cảnh báo về timestamp:</span>
                    </div>
                    <div className="max-h-24 overflow-y-auto pl-4 list-disc space-y-0.5 text-amber-200/90 text-[11px]">
                      {parseWarnings.map((w, idx) => (
                        <div key={idx}>• {w}</div>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            ) : (
              /* Collapsed Rail Toggle Button for Desktop */
              <div className="hidden lg:flex flex-col items-center shrink-0">
                <button
                  type="button"
                  onClick={() => setIsLeftPanelExpanded(true)}
                  className="sticky top-20 p-3 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-800 rounded-2xl flex flex-col items-center gap-2 shadow-xl hover:border-amber-500/40 transition-all cursor-pointer group"
                  title="Mở rộng Cột Cài Đặt (Settings)"
                >
                  <PanelLeftOpen className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[11px] font-bold [writing-mode:vertical-lr] tracking-wider uppercase text-slate-300 group-hover:text-amber-300 py-1">
                    Mở Cài Đặt (Settings)
                  </span>
                </button>
              </div>
            )}

            {/* ========================================================= */}
            {/* CỘT BÊN PHẢI: WORKSTATION & RESULTS                       */}
            {/* 1. Tiến độ xử lý tổng thể                                 */}
            {/* 2. File Audio Hoàn Chỉnh Đồng Bộ Timeline                 */}
            {/* 3. Bảng Phân Tích Phụ Đề & Trạng Thái Từng Câu (Scroll)   */}
            {/* 4. Live Logs (Có thể Expand hoặc Close)                   */}
            {/* ========================================================= */}
            <section className="flex-1 min-w-0 w-full space-y-6">
              {/* Workspace Top Toolbar with Left Panel Toggle */}
              <div className="flex items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl px-4 py-2.5 shadow-md">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLeftPanelExpanded(!isLeftPanelExpanded)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                    title={
                      isLeftPanelExpanded
                        ? "Ẩn cột cài đặt bên trái"
                        : "Mở rộng cột cài đặt bên trái"
                    }
                  >
                    {isLeftPanelExpanded ? (
                      <>
                        <PanelLeftClose className="w-3.5 h-3.5 text-amber-400" />
                        <span>Ẩn Cột Cài Đặt</span>
                      </>
                    ) : (
                      <>
                        <PanelLeftOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>Hiện Cài Đặt (Settings & Phụ Đề)</span>
                      </>
                    )}
                  </button>
                  <span className="text-xs text-slate-400 hidden sm:inline">
                    Không gian làm việc đồng bộ Timeline
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                    Phụ đề:{" "}
                    <strong className="text-amber-400">
                      {subtitles.length}
                    </strong>{" "}
                    câu
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowVoiceModal(true)}
                    className="bg-slate-950 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-800 hover:border-amber-500/40 hidden sm:inline-flex items-center gap-1.5 transition-colors cursor-pointer group"
                    title="Bấm để mở bảng chọn giọng đọc"
                  >
                    <span className="text-slate-400">Giọng:</span>
                    <strong className="text-slate-200 group-hover:text-amber-300 transition-colors">
                      {selectedVoice.name}
                    </strong>
                    <span className="text-[10px] text-amber-400 bg-amber-500/15 px-1.5 py-0.2 rounded border border-amber-500/30">
                      Đổi
                    </span>
                  </button>
                </div>
              </div>

              {/* ------------------------------------------------------- */}
              {/* 1. CHI TIẾT TIẾN TRÌNH XỬ LÝ & 9 GIAI ĐOẠN              */}
              {/* (Tiến độ tổng thể, % và nút xử lý đã tách vào thanh dock đáy) */}
              {/* ------------------------------------------------------- */}
              <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-white">
                        Chi Tiết Xử Lý & Đo Lường Timeline
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          activeJob?.status === "running"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse"
                            : activeJob?.status === "completed"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : activeJob?.status === "paused"
                                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                : "bg-slate-800 text-slate-300 border border-slate-700"
                        }`}
                      >
                        {activeJob?.status === "running" &&
                          "Đang chạy song song"}
                        {activeJob?.status === "completed" && "Đã hoàn thành"}
                        {activeJob?.status === "paused" && "Đang tạm dừng"}
                        {(!activeJob || activeJob?.status === "idle") &&
                          "Chờ bắt đầu"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Thanh tiến độ, % hoàn thành và nút bắt đầu xử lý được ghim
                      cố định ở thanh đáy màn hình (Sticky Bottom Bar).
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                    <span>
                      Batch:{" "}
                      <strong className="text-amber-400">
                        {activeJob?.options.batchSize ?? effectiveBatchSize}{" "}
                        câu/đợt
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Batch & Concurrency Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 text-xs font-mono">
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">
                      Tổng số câu:
                    </span>
                    <span className="text-base font-bold text-white">
                      {subtitles.length}
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">
                      Batch Song Song:
                    </span>
                    <span className="text-sm font-bold text-amber-400">
                      {activeJob?.options.batchSize ?? effectiveBatchSize}{" "}
                      câu/đợt
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-emerald-400 text-[10px] block">
                      Đã hoàn thành:
                    </span>
                    <span className="text-base font-bold text-emerald-400">
                      {activeJob?.overallProgress.completed ?? 0}
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-amber-400 text-[10px] block">
                      Đang xử lý:
                    </span>
                    <span className="text-base font-bold text-amber-400">
                      {activeJob?.overallProgress.running ?? 0}
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">
                      Đang chờ (Queued):
                    </span>
                    <span className="text-base font-bold text-slate-300">
                      {activeJob?.overallProgress.queued ?? subtitles.length}
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-rose-400 text-[10px] block">
                      Bị lỗi:
                    </span>
                    <span className="text-base font-bold text-rose-400">
                      {activeJob?.overallProgress.failed ?? 0}
                    </span>
                  </div>
                </div>

                {/* Elapsed Time, Speed & ETA */}
                {activeJob && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono pt-1">
                    <span>
                      Thời gian đã chạy:{" "}
                      {(activeJob.overallProgress.elapsedMs / 1000).toFixed(1)}s
                    </span>
                    {activeJob.overallProgress.speedItemsPerSec !==
                      undefined && (
                      <span className="text-slate-300">
                        Tốc độ xử lý: ~
                        {activeJob.overallProgress.speedItemsPerSec} câu/giây
                      </span>
                    )}
                    {activeJob.overallProgress.estimatedRemainingMs !==
                      undefined && (
                      <span className="text-amber-400">
                        Thời gian còn lại ước tính: ~
                        {(
                          activeJob.overallProgress.estimatedRemainingMs / 1000
                        ).toFixed(0)}
                        s
                      </span>
                    )}
                  </div>
                )}

                {/* 9 Stages Visual Tracker (Collapsible) */}
                <div className="pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                      Tiến trình 9 giai đoạn xử lý:
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowStagesTracker(!showStagesTracker)}
                      className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1"
                    >
                      <span>
                        {showStagesTracker ? "Thu gọn" : "Chi tiết 9 bước"}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${showStagesTracker ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>

                  {showStagesTracker && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      {(
                        activeJob?.stages || [
                          {
                            id: 1,
                            name: "Upload và phân tích file phụ đề",
                            status: "completed",
                          },
                          {
                            id: 2,
                            name: "Khởi tạo PiperTTS và tải mô hình giọng đọc",
                            status: "pending",
                          },
                          {
                            id: 3,
                            name: "Tạo audio TTS cho từng câu",
                            status: "pending",
                          },
                          {
                            id: 4,
                            name: "Đo thời lượng audio thực tế",
                            status: "pending",
                          },
                          {
                            id: 5,
                            name: "Tự động điều chỉnh tốc độ đọc (atempo)",
                            status: "pending",
                          },
                          {
                            id: 6,
                            name: "Chuẩn hóa định dạng audio",
                            status: "pending",
                          },
                          {
                            id: 7,
                            name: "Ghép audio theo timeline & khoảng lặng",
                            status: "pending",
                          },
                          {
                            id: 8,
                            name: "Xuất file WAV/MP3 hoàn chỉnh",
                            status: "pending",
                          },
                          {
                            id: 9,
                            name: "Hoàn tất và cho phép tải xuống",
                            status: "pending",
                          },
                        ]
                      ).map((st) => (
                        <div
                          key={st.id}
                          className={`p-2.5 rounded-xl border flex items-center gap-2 transition-colors ${
                            st.status === "completed"
                              ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                              : st.status === "running"
                                ? "bg-amber-950/30 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/10"
                                : st.status === "failed"
                                  ? "bg-rose-950/20 border-rose-500/40 text-rose-300"
                                  : "bg-slate-950/40 border-slate-800/70 text-slate-400"
                          }`}
                        >
                          <div className="shrink-0">
                            {st.status === "completed" && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            )}
                            {st.status === "running" && (
                              <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                            )}
                            {st.status === "failed" && (
                              <AlertTriangle className="w-4 h-4 text-rose-400" />
                            )}
                            {st.status === "pending" && (
                              <Clock className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium truncate">
                              {st.id}. {st.name}
                            </div>
                            {st.detail && (
                              <div className="text-[10px] text-slate-400 truncate">
                                {st.detail}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ------------------------------------------------------- */}
              {/* 2. FILE AUDIO HOÀN CHỈNH ĐỒNG BỘ TIMELINE (MASTER AUDIO)*/}
              {/* ------------------------------------------------------- */}
              {activeJob?.masterAudio && (
                <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border-2 border-amber-500/40 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-amber-500/30">
                        <Music className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white">
                            File Audio Hoàn Chỉnh Đồng Bộ Timeline
                          </h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Timeline Ready
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Tổng thời lượng:{" "}
                          <strong className="text-white">
                            {activeJob.masterAudio.duration.toFixed(2)}s
                          </strong>{" "}
                          · Định dạng:{" "}
                          {activeJob.masterAudio.format.toUpperCase()} · Dung
                          lượng:{" "}
                          {(activeJob.masterAudio.sizeBytes / 1024).toFixed(1)}{" "}
                          KB
                        </p>
                      </div>
                    </div>

                    {/* Master Download Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/api/subtitles/job/${activeJob.id}/master-audio?download=1&format=mp3`}
                        className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-transform active:scale-95"
                      >
                        <Download className="w-4 h-4" />
                        <span>Tải Master MP3</span>
                      </a>
                      <a
                        href={`/api/subtitles/job/${activeJob.id}/master-audio?download=1&format=wav`}
                        className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl border border-slate-700 flex items-center gap-1 transition-colors"
                        title="Tải WAV không nén"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-400" />
                        <span>WAV</span>
                      </a>
                      <button
                        type="button"
                        onClick={handleResetJob}
                        className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Dọn dẹp tệp tạm và làm mới"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Dọn Dẹp & Làm Mới</span>
                      </button>
                    </div>
                  </div>

                  {/* Master Audio Scrubbing Player & Live Sentence Display (Requirement 1 & 2) */}
                  <div className="bg-slate-950/90 rounded-2xl p-4 sm:p-5 border border-slate-800 space-y-4 shadow-xl">
                    {/* Top Row: Playback Controls + Scrubbing Slider */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Nav & Play Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 self-center sm:self-auto">
                        <button
                          type="button"
                          onClick={() => handleJumpToSentence("prev")}
                          className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 transition-colors cursor-pointer"
                          title="Nhảy về câu trước (⏮)"
                        >
                          <SkipBack className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleJumpMaster(-5)}
                          className="px-2.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 text-xs font-mono font-bold transition-colors cursor-pointer"
                          title="Tua lùi 5 giây (⏪ -5s)"
                        >
                          -5s
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePlayMasterAudio()}
                          className="w-12 h-12 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30 transition-transform active:scale-95 cursor-pointer font-bold"
                          title={masterPlaying ? "Tạm dừng" : "Phát Master Audio"}
                        >
                          {masterPlaying ? (
                            <Pause className="w-6 h-6 fill-current" />
                          ) : (
                            <Play className="w-6 h-6 fill-current ml-0.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleJumpMaster(5)}
                          className="px-2.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 text-xs font-mono font-bold transition-colors cursor-pointer"
                          title="Tua tới 5 giây (+5s ⏩)"
                        >
                          +5s
                        </button>
                        <button
                          type="button"
                          onClick={() => handleJumpToSentence("next")}
                          className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 transition-colors cursor-pointer"
                          title="Nhảy sang câu sau (⏭)"
                        >
                          <SkipForward className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Scrubbing Track (Requirement 1: Kéo tới bất kỳ vị trí nào để nghe) */}
                      <div className="flex-1 w-full space-y-1.5">
                        <div className="relative flex items-center">
                          <input
                            type="range"
                            min="0"
                            max={
                              masterDuration ||
                              activeJob.masterAudio.duration ||
                              100
                            }
                            step="0.05"
                            value={
                              isSeekingMaster
                                ? masterSeekValue
                                : masterCurrentTime
                            }
                            onPointerDown={() => setIsSeekingMaster(true)}
                            onTouchStart={() => setIsSeekingMaster(true)}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setMasterSeekValue(val);
                              setMasterCurrentTime(val);
                              if (masterAudioRef.current) {
                                const audio = masterAudioRef.current;
                                const masterUrl = activeJob?.masterAudio?.url;
                                if (
                                  masterUrl &&
                                  (!audio.src || !audio.src.includes(masterUrl))
                                ) {
                                  audio.src = masterUrl;
                                }
                                try {
                                  audio.currentTime = val;
                                } catch {}
                              }
                            }}
                            onPointerUp={(e) => {
                              setIsSeekingMaster(false);
                              const val = parseFloat(e.currentTarget.value);
                              handleSeekMaster(val);
                            }}
                            onTouchEnd={() => {
                              setIsSeekingMaster(false);
                              handleSeekMaster(masterSeekValue);
                            }}
                            className="w-full accent-amber-500 h-2.5 bg-slate-800 hover:bg-slate-750 rounded-lg cursor-pointer transition-all"
                            title="Kéo hoặc nhấn vào thanh timeline để nghe ở bất kỳ vị trí nào"
                          />
                        </div>
                        <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                          <span className="text-amber-400 font-bold">
                            {formatSecondsDisplay(
                              isSeekingMaster
                                ? masterSeekValue
                                : masterCurrentTime,
                            )}
                          </span>
                          <span className="text-slate-500 text-[11px] hidden sm:inline">
                            💡 Kéo hoặc bấm thanh để tua tới bất kỳ vị trí nào
                          </span>
                          <span className="text-slate-300 font-semibold">
                            {formatSecondsDisplay(
                              masterDuration || activeJob.masterAudio.duration,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Requirement 2: Hiển thị câu số mấy và nội dung câu đang phát */}
                    {currentMasterItem?.item && (
                      <div className="border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-amber-500/5 rounded-xl p-3.5 sm:p-4 shadow-inner space-y-2">
                        {/* Subtitle Status & Meta Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                              <Quote className="w-3.5 h-3.5 text-amber-400" />
                              <span>
                                Câu {currentMasterItem.item.index} /{" "}
                                {activeJob.items.length}
                              </span>
                            </span>

                            {currentMasterItem.isSilenceGap ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                                {currentMasterItem.gapLabel}
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 animate-pulse">
                                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Đang đọc</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5 text-xs font-mono text-slate-400">
                            <span className="text-slate-300">
                              [
                              {formatSecondsToSrtTime(
                                currentMasterItem.item.startTime,
                              )}{" "}
                              ➔{" "}
                              {formatSecondsToSrtTime(
                                currentMasterItem.item.endTime,
                              )}
                              ]
                            </span>
                            {currentMasterItem.item.appliedSpeed && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px] font-bold border border-amber-500/20">
                                {currentMasterItem.item.appliedSpeed.toFixed(2)}
                                x
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                handleSeekMaster(
                                  currentMasterItem.item.startTime,
                                  true,
                                )
                              }
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 text-[11px] font-semibold border border-slate-700 transition-colors cursor-pointer"
                              title="Nghe lại câu này từ đầu"
                            >
                              ↺ Phát lại câu
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleScrollToSentence(
                                  currentMasterItem.item.index,
                                )
                              }
                              className="text-amber-400 hover:text-amber-300 underline text-[11px] cursor-pointer"
                              title="Cuộn danh sách câu bên dưới đến câu này"
                            >
                              Xem trong bảng ⬇
                            </button>
                          </div>
                        </div>

                        {/* Sentence Text Display */}
                        <div className="pl-3 border-l-4 border-amber-500 bg-black/40 py-2.5 px-3 rounded-r-lg">
                          <p className="text-sm sm:text-base font-semibold text-white tracking-wide leading-relaxed select-text">
                            "{currentMasterItem.item.text}"
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------- */}
              {/* 3. BẢNG PHÂN TÍCH PHỤ ĐỀ & TRẠNG THÁI TỪNG CÂU          */}
              {/* Scroll view + Nghe thử từng câu (Requirement 1 & 2)     */}
              {/* ------------------------------------------------------- */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">
                        Bảng Phân Tích Phụ Đề & Trạng Thái Từng Câu
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20">
                        Scroll View
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Theo dõi thời lượng gốc, điều chỉnh tốc độ riêng và nghe
                      thử từng câu sau khi hoàn thành (Cuộn để xem tất cả câu)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-300 font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                      Tổng số:{" "}
                      <strong className="text-amber-400">
                        {activeJob?.items
                          ? activeJob.items.length
                          : subtitles.length}
                      </strong>{" "}
                      câu
                    </span>
                  </div>
                </div>

                {/* Subtitles Table with Scroll View (Requirement 1 & 2) */}
                <div className="overflow-x-auto overflow-y-auto max-h-[480px] rounded-xl border border-slate-800 scrollbar-thin shadow-inner bg-slate-950/40">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-20 bg-slate-950 shadow-md">
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] font-mono">
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3 w-36">Timeline</th>
                        <th className="py-2.5 px-3 min-w-[200px]">
                          Lời thoại (Tiếng Việt)
                        </th>
                        <th className="py-2.5 px-3 w-20 text-right">
                          Mục tiêu
                        </th>
                        <th className="py-2.5 px-3 w-20 text-right">TTS gốc</th>
                        <th className="py-2.5 px-3 w-20 text-center">Tốc độ</th>
                        <th className="py-2.5 px-3 w-20 text-right">
                          Độ dài cuối
                        </th>
                        <th className="py-2.5 px-3 w-28 text-center">
                          Trạng thái
                        </th>
                        <th className="py-2.5 px-3 w-24 text-center">
                          Nghe thử
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {(activeJob?.items || subtitles).map((item) => {
                        const isCurrentActiveSentence =
                          activeJob?.masterAudio &&
                          currentMasterItem?.item?.index === item.index &&
                          !currentMasterItem.isSilenceGap;

                        return (
                          <tr
                            key={item.index}
                            id={`subtitle-row-${item.index}`}
                            className={`transition-colors ${
                              isCurrentActiveSentence
                                ? "bg-amber-500/20 border-l-4 border-l-amber-400 font-semibold ring-1 ring-amber-500/40 shadow-inner"
                                : item.warning
                                ? "bg-amber-500/5 hover:bg-slate-800/40"
                                : item.status === "failed"
                                ? "bg-rose-500/5 hover:bg-slate-800/40"
                                : "hover:bg-slate-800/30"
                            }`}
                          >
                            {/* Index */}
                            <td className="py-2.5 px-3 text-center font-mono">
                              {isCurrentActiveSentence ? (
                                <span className="inline-flex items-center justify-center gap-1 text-amber-400 font-bold">
                                  <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                                  <span>{item.index}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400">
                                  {item.index}
                                </span>
                              )}
                            </td>

                          {/* Timeline */}
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                            <div>{formatSecondsToSrtTime(item.startTime)}</div>
                            <div className="text-slate-400 text-[10px]">
                              ➔ {formatSecondsToSrtTime(item.endTime)}
                            </div>
                          </td>

                          {/* Text & Warning */}
                          <td className="py-2.5 px-3">
                            <p className="text-slate-200 font-medium leading-relaxed">
                              {item.text}
                            </p>
                            {item.warning && (
                              <p className="text-[10px] text-amber-400/90 mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>{item.warning}</span>
                              </p>
                            )}
                            {item.error && (
                              <p className="text-[10px] text-rose-400 mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>{item.error}</span>
                              </p>
                            )}
                          </td>

                          {/* Target Duration */}
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            {item.targetDuration.toFixed(2)}s
                          </td>

                          {/* Original Duration */}
                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                            {item.originalDuration
                              ? `${item.originalDuration.toFixed(2)}s`
                              : "—"}
                          </td>

                          {/* Applied Speed */}
                          <td className="py-2.5 px-3 text-center font-mono">
                            {item.appliedSpeed ? (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  item.appliedSpeed > 1.2
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    : "bg-slate-800 text-slate-300"
                                }`}
                              >
                                {item.appliedSpeed.toFixed(2)}x
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>

                          {/* Final Duration */}
                          <td className="py-2.5 px-3 text-right font-mono text-slate-200 font-semibold">
                            {item.finalDuration
                              ? `${item.finalDuration.toFixed(2)}s`
                              : "—"}
                          </td>

                          {/* Status Badge */}
                          <td className="py-2.5 px-3 text-center">
                            {item.status === "completed" && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Hoàn thành</span>
                              </span>
                            )}
                            {item.status === "generating" && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 animate-pulse">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Đang tạo...</span>
                              </span>
                            )}
                            {item.status === "adjusting" && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400">
                                <Sliders className="w-3 h-3" />
                                <span>Chỉnh tốc độ</span>
                              </span>
                            )}
                            {item.status === "failed" && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Thất bại</span>
                              </span>
                            )}
                            {item.status === "pending" && (
                              <span className="text-[11px] text-slate-400">
                                Chờ xử lý
                              </span>
                            )}
                          </td>

                          {/* Audio Preview (Single Item & Master Timeline Jump) */}
                          <td className="py-2.5 px-3 text-center">
                            {activeJob && item.status === "completed" ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handlePlayItemAudio(item)}
                                  className={`inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                    playingItemIndex === item.index
                                      ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30 scale-105 ring-2 ring-amber-400/50"
                                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-amber-500/40"
                                  }`}
                                  title={
                                    playingItemIndex === item.index
                                      ? "Dừng phát câu lẻ"
                                      : "Nghe thử câu thoại lẻ này"
                                  }
                                >
                                  {playingItemIndex === item.index ? (
                                    <>
                                      <Pause className="w-3.5 h-3.5 fill-current text-slate-950" />
                                      <span>Dừng</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-3.5 h-3.5 fill-current text-amber-400 ml-0.5" />
                                      <span>Nghe</span>
                                    </>
                                  )}
                                </button>

                                {activeJob.masterAudio && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handlePlayMasterFromSentence(item)
                                    }
                                    className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                      isCurrentActiveSentence && masterPlaying
                                        ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md scale-105"
                                        : "bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border-slate-700"
                                    }`}
                                    title={`Tua Master Audio tới câu ${item.index} (${formatSecondsDisplay(item.startTime)}) và phát`}
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-600 font-mono text-[11px]">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ------------------------------------------------------- */}
              {/* 4. LIVE LOGS (Có thể Expand hoặc Close)                 */}
              {/* Requirement 3 & 4                                       */}
              {/* ------------------------------------------------------- */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs">
                {/* Logs Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-900/50 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Terminal className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-white">Live Logs</span>
                    {totalSentencesCount > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 shadow-sm">
                        <span>Hoàn thành:</span>
                        <strong className="text-amber-200">
                          {completedSentencesCount}/{totalSentencesCount}
                        </strong>
                        <span>câu</span>
                        <span className="text-[10px] text-amber-400/80">
                          ({completionPercent}%)
                        </span>
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      ({displayLogs.length} sự kiện)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Filter tabs (Only visible when expanded) */}
                    {isLogsExpanded && (
                      <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[11px]">
                        {(
                          [
                            "ALL",
                            "INFO",
                            "SUCCESS",
                            "WARNING",
                            "ERROR",
                          ] as const
                        ).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setLogFilter(lvl)}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                              logFilter === lvl
                                ? "bg-amber-500 text-slate-950 font-bold"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Actions when expanded */}
                    {isLogsExpanded && activeJob && (
                      <a
                        href={`/api/subtitles/job/${activeJob.id}/logs/download`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 text-[11px] transition-colors"
                        title="Xuất nhật ký thành file TXT"
                      >
                        <Download className="w-3 h-3 text-amber-400" />
                        <span>Tải Logs (.txt)</span>
                      </a>
                    )}

                    {isLogsExpanded && (
                      <button
                        type="button"
                        onClick={() => {
                          if (activeJob)
                            setActiveJob({ ...activeJob, logs: [] });
                        }}
                        className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-800 cursor-pointer"
                        title="Xóa nhật ký trên màn hình"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}

                    {/* Expand / Close Toggle Button (Requirement 3) */}
                    <button
                      type="button"
                      onClick={() => setIsLogsExpanded(!isLogsExpanded)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold rounded-lg border border-slate-700 text-xs transition-colors cursor-pointer"
                      title={
                        isLogsExpanded
                          ? "Đóng / Thu gọn Live Logs"
                          : "Mở rộng khung Live Logs"
                      }
                    >
                      {isLogsExpanded ? (
                        <>
                          <Minimize2 className="w-3.5 h-3.5" />
                          <span>Thu Gọn Logs</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>Mở Rộng Logs</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Collapsed Preview Strip (When Closed) */}
                {!isLogsExpanded ? (
                  <div className="px-4 py-2 bg-slate-950/90 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-900">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-amber-400 font-semibold">
                        [Logs đang đóng]
                      </span>
                      {displayLogs.length > 0 ? (
                        <span className="truncate text-slate-300">
                          Mới nhất:{" "}
                          {displayLogs[displayLogs.length - 1].message}
                        </span>
                      ) : (
                        <span>Chưa có log phát sinh.</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsLogsExpanded(true)}
                      className="text-amber-400 hover:underline shrink-0 ml-2 font-medium cursor-pointer"
                    >
                      Mở để xem chi tiết →
                    </button>
                  </div>
                ) : (
                  /* Expanded Logs Stream Window (Scrollable internally without moving viewport) */
                  <div
                    ref={logsContainerRef}
                    className="h-60 overflow-y-auto space-y-1.5 p-4 select-text text-[11px] scrollbar-thin"
                  >
                    {displayLogs.length === 0 ? (
                      <div className="text-slate-500 py-8 text-center italic">
                        Chưa có nhật ký hoạt động. Nhấn "Bắt đầu xử lý" để theo
                        dõi các sự kiện theo thời gian thực.
                      </div>
                    ) : (
                      displayLogs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-start gap-2 leading-relaxed"
                        >
                          <span className="text-slate-500 shrink-0">
                            [{log.timestamp}]
                          </span>
                          <span
                            className={`px-1 py-0.2 rounded font-bold shrink-0 text-[10px] ${
                              log.level === "SUCCESS"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : log.level === "WARNING"
                                  ? "bg-amber-500/20 text-amber-400"
                                  : log.level === "ERROR"
                                    ? "bg-rose-500/20 text-rose-400"
                                    : "bg-sky-500/20 text-sky-400"
                            }`}
                          >
                            [{log.level}]
                          </span>
                          <span
                            className={`${
                              log.level === "ERROR"
                                ? "text-rose-300 font-semibold"
                                : log.level === "WARNING"
                                  ? "text-amber-200"
                                  : log.level === "SUCCESS"
                                    ? "text-emerald-200"
                                    : "text-slate-300"
                            }`}
                          >
                            {log.message}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: SINGLE TEXT TTS STUDIO (Preserves previous feature) */}
        {/* ========================================================= */}
        {activeTab === "single" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                  Chuyển văn bản nhanh (Single TTS)
                </h2>
                <span className="text-xs text-slate-400">
                  {singleText.length} ký tự
                </span>
              </div>

              {/* Voice & Project Settings in Tab 2 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[11px] shrink-0 ${
                      selectedVoice.gender === "female"
                        ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                        : "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                    }`}
                  >
                    {selectedVoice.gender === "female" ? "Nữ" : "Nam"}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white">
                        {selectedVoice.name}
                      </span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/15 px-1.5 py-0.2 rounded border border-emerald-500/30 font-medium">
                        Offline 100%
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {selectedVoice.tag}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                    <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <select
                      value={selectedPresetId}
                      onChange={(e) => handleApplyPreset(e.target.value)}
                      className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer max-w-[150px] sm:max-w-[200px] truncate"
                      title="Nạp cấu hình dự án (giọng + tốc độ)"
                    >
                      {projectPresets.map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          className="bg-slate-900 text-white"
                        >
                          {p.isDefault ? "" : "★ "}
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowPresetManagerModal(true)}
                      className="p-1 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded transition-colors cursor-pointer"
                      title="Quản lý cấu hình (Đổi tên, Xóa, Xuất/Nhập JSON)"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowVoiceModal(true)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold rounded-lg border border-slate-700 hover:border-amber-500/40 transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Đổi giọng đọc ({voices.length})</span>
                  </button>
                </div>
              </div>

              <textarea
                value={singleText}
                onChange={(e) => setSingleText(e.target.value)}
                rows={5}
                placeholder="Nhập văn bản tiếng Việt..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 leading-relaxed"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Tốc độ đọc:</span>
                    <span className="text-amber-400 font-mono">
                      {singleSpeed.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.8"
                    step="0.05"
                    value={singleSpeed}
                    onChange={(e) => setSingleSpeed(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Nghỉ ngắt câu:</span>
                    <span className="text-amber-400 font-mono">
                      {singleSilence.toFixed(2)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={singleSilence}
                    onChange={(e) =>
                      setSingleSilence(parseFloat(e.target.value))
                    }
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={singleIsLoading || !singleText.trim()}
                onClick={handleSingleSynthesize}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
              >
                {singleIsLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang tạo âm thanh...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>
                      Tạo Giọng Đọc {selectedVoice.name} (
                      {singleFormat.toUpperCase()})
                    </span>
                  </>
                )}
              </button>

              {singleAudioUrl && (
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <audio controls src={singleAudioUrl} className="h-8 w-64" />
                  <a
                    href={singleAudioUrl}
                    download={`hoaimy-${Date.now()}.${singleFormat}`}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải {singleFormat.toUpperCase()}</span>
                  </a>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 text-xs text-slate-400">
              <h3 className="text-sm font-semibold text-white flex items-center justify-between">
                <span>Về Piper TTS Studio:</span>
                <span className="text-[11px] font-mono text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  {selectedVoice.name}
                </span>
              </h3>
              <p className="leading-relaxed">
                Piper TTS Studio chạy <span className="text-amber-300 font-semibold">100% Offline</span> với mô hình ONNX nội suy âm thanh chất lượng cao. Đang kích hoạt giọng <strong className="text-white">{selectedVoice.name}</strong> ({selectedVoice.gender === "female" ? "Nữ" : "Nam"}, {selectedVoice.tag || "Tiếng Việt"}).
              </p>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] space-y-1">
                <div className="text-slate-300 font-medium">
                  Khả năng tự động đồng bộ:
                </div>
                <p>
                  Khi dùng chế độ Phụ đề SRT, hệ thống tự động đo thời lượng câu
                  và co giãn tốc độ (atempo) để khớp thời điểm bắt đầu và kết
                  thúc của từng cảnh video.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* MODAL: BẢNG DANH SÁCH GIỌNG ĐỌC (VOICE SELECTION TABLE)   */}
      {/* Độ rộng max screen width để hiển thị đầy đủ tất cả các cột*/}
      {/* ========================================================= */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-[96vw] xl:max-w-7xl 2xl:max-w-[1440px] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative">
            {/* Modal Header (Compact) */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5 border-b border-slate-800 bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-500/20 shrink-0">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                      Bảng Chọn Giọng Đọc Tiếng Việt
                    </h2>
                    <span className="px-2 py-0.2 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {voices.length} giọng Piper TTS
                    </span>
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      100% Offline
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 hidden sm:block">
                    Nghe thử giọng mẫu và chọn giọng phù hợp cho dự án phụ đề &
                    lồng tiếng
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseVoiceModal}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 border border-slate-700/60"
                title="Đóng bảng chọn giọng đọc (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Toolbar: Search input & Filter pills (Compact) */}
            <div className="px-4 py-2.5 sm:px-5 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
              {/* Search input */}
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={voiceSearchQuery}
                  onChange={(e) => setVoiceSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên giọng (Hoài My, Ban Mai...), tags..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all font-medium"
                />
                {voiceSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setVoiceSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer p-0.5"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Gender / Filter pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                <button
                  type="button"
                  onClick={() => setVoiceGenderFilter("all")}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer text-xs ${
                    voiceGenderFilter === "all"
                      ? "bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/20"
                      : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60"
                  }`}
                >
                  Tất cả ({voices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceGenderFilter("female")}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 text-xs ${
                    voiceGenderFilter === "female"
                      ? "bg-rose-500 text-white font-bold shadow-sm shadow-rose-500/20"
                      : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span>Nữ ({femaleVoicesCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceGenderFilter("male")}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 text-xs ${
                    voiceGenderFilter === "male"
                      ? "bg-sky-500 text-slate-950 font-bold shadow-sm shadow-sky-500/20"
                      : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  <span>Nam ({maleVoicesCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceGenderFilter("recommended")}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 text-xs ${
                    voiceGenderFilter === "recommended"
                      ? "bg-amber-400 text-slate-950 font-bold shadow-sm shadow-amber-400/20"
                      : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60"
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Khuyên dùng ({recommendedVoicesCount})</span>
                </button>
              </div>
            </div>

            {/* Table Area (Compact single-line rows: Hiển thị 12-16 giọng cùng lúc, chỉ Tên, Giới tính, Tags, Nghe thử, Chọn dùng) */}
            <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[70vh] p-1 sm:p-3 bg-slate-950/40 scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-20 bg-slate-950 shadow-sm">
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] font-mono">
                    <th
                      onClick={handleToggleVoiceSort}
                      className="py-2.5 px-4 sm:w-[38%] min-w-[200px] cursor-pointer hover:text-amber-300 transition-colors select-none group"
                      title="Nhấn để sắp xếp danh sách giọng theo Tên (A-Z hoặc Z-A)"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-300 group-hover:text-amber-300">
                          Tên giọng đọc
                        </span>
                        {voiceSortOrder === "asc" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                            <ArrowUp className="w-3 h-3" />
                            <span>A ➔ Z</span>
                          </span>
                        ) : voiceSortOrder === "desc" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                            <ArrowDown className="w-3 h-3" />
                            <span>Z ➔ A</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 group-hover:text-amber-400 transition-colors text-[10px]">
                            <ArrowUpDown className="w-3 h-3" />
                            <span className="hidden sm:inline">Sắp xếp</span>
                          </span>
                        )}
                      </div>
                    </th>
                    <th className="py-2.5 px-4 w-28 text-center">Giới tính</th>
                    <th className="py-2.5 px-4 sm:w-[28%] min-w-[150px]">
                      Tags / Phân loại
                    </th>
                    <th className="py-2.5 px-4 w-32 text-center">Nghe thử</th>
                    <th className="py-2.5 px-4 w-32 text-center">Chọn dùng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sortedVoices.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-slate-500 italic"
                      >
                        Không tìm thấy giọng đọc nào phù hợp với bộ lọc tìm
                        kiếm.
                      </td>
                    </tr>
                  ) : (
                    sortedVoices.map((v) => {
                      const isCurrent = v.id === selectedVoiceId;
                      const isPreviewing = previewVoiceId === v.id;
                      const isLoadingPreview = previewLoadingVoiceId === v.id;

                      return (
                        <tr
                          key={v.id}
                          className={`hover:bg-slate-800/50 transition-colors h-10 ${
                            isCurrent ? "bg-amber-500/10" : ""
                          }`}
                        >
                          {/* 1. Cột Tên: Tên + Badges (Bỏ hoàn toàn description, ID và text) */}
                          <td className="py-1.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-semibold text-xs sm:text-[13px] truncate max-w-[340px] sm:max-w-none ${
                                  isCurrent
                                    ? "text-amber-300 font-bold"
                                    : "text-slate-100"
                                }`}
                              >
                                {v.name}
                              </span>
                              {v.recommended && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                                  Khuyên dùng
                                </span>
                              )}
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                                  <Check className="w-2.5 h-2.5" />
                                  Đang chọn
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. Cột Giới tính (Gọn gàng) */}
                          <td className="py-1.5 px-4 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                                v.gender === "female"
                                  ? "bg-rose-500/15 text-rose-300 border border-rose-500/25"
                                  : "bg-sky-500/15 text-sky-300 border border-sky-500/25"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  v.gender === "female"
                                    ? "bg-rose-400"
                                    : "bg-sky-400"
                                }`}
                              />
                              <span>
                                {v.gender === "female" ? "Nữ" : "Nam"}
                              </span>
                            </span>
                          </td>

                          {/* 3. Cột Tag (Gọn gàng, bỏ ID) */}
                          <td className="py-1.5 px-4 whitespace-nowrap">
                            <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-900 text-slate-300 border border-slate-800">
                              {v.tag}
                            </span>
                          </td>

                          {/* 4. Cột Nghe thử (Bỏ câu text) */}
                          <td className="py-1.5 px-4 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handlePreviewVoice(v)}
                              disabled={isLoadingPreview}
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                isPreviewing
                                  ? "bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/30 ring-1 ring-amber-400"
                                  : "bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-amber-500/40"
                              }`}
                              title={
                                isPreviewing
                                  ? "Dừng phát"
                                  : "Nghe thử câu thoại mẫu"
                              }
                            >
                              {isLoadingPreview ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                                  <span>Đang tạo...</span>
                                </>
                              ) : isPreviewing ? (
                                <>
                                  <Pause className="w-3 h-3 fill-current text-slate-950" />
                                  <span>Dừng</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3 fill-current text-amber-400 ml-0.5" />
                                  <span>Nghe thử</span>
                                </>
                              )}
                            </button>
                          </td>

                          {/* 5. Cột Chọn dùng */}
                          <td className="py-1.5 px-4 text-center whitespace-nowrap">
                            {isCurrent ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
                                <Check className="w-3 h-3" />
                                <span>Đang Dùng</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSelectVoice(v.id)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all cursor-pointer shadow-sm shadow-amber-500/20 active:scale-95"
                              >
                                <UserCheck className="w-3 h-3" />
                                <span>Chọn dùng</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer (Compact) */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2.5 sm:px-5 bg-slate-950/80 border-t border-slate-800 shrink-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Giọng đang chọn:</span>
                <span className="font-bold text-amber-400">
                  {selectedVoice.name}
                </span>
                <span className="text-slate-500 font-mono">
                  ({selectedVoice.tag})
                </span>
              </div>

              <button
                type="button"
                onClick={handleCloseVoiceModal}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer border border-slate-700"
              >
                Xác nhận & Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: LƯU CẤU HÌNH DỰ ÁN (PROJECT SETTINGS PRESETS)      */}
      {/* Tự động điền giọng đọc, cấu hình timeline & tốc độ        */}
      {/* ========================================================= */}
      {showSavePresetModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center font-bold">
                  <Bookmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Lưu Cấu Hình Dự Án Mới
                  </h3>
                  <p className="text-xs text-slate-400">
                    Lưu lại giọng đọc, tốc độ & timeline để tự động điền lần sau
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSavePresetModal(false);
                  setNewPresetName("");
                }}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Đóng modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveCurrentAsPreset(newPresetName);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Đặt tên cấu hình dự án:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Ví dụ: Phim Hành Động 1.35x, Truyện Ma Đêm Khuya..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none transition-all font-medium"
                />
              </div>

              {/* Preview of current settings that will be saved */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Thông số sẽ lưu vào cấu hình này:</span>
                  <span className="text-[10px] text-amber-400 font-mono">
                    Tự động nạp
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px] font-mono">
                  <div className="flex items-center justify-between text-slate-200">
                    <span className="text-slate-400">Giọng đọc:</span>
                    <span className="font-bold text-amber-400 truncate max-w-[200px]">
                      {selectedVoice.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-200">
                    <span className="text-slate-400">Dải tốc độ:</span>
                    <span className="text-emerald-400 font-bold">
                      {minSpeed.toFixed(2)}x - {maxSpeed.toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-200">
                    <span className="text-slate-400">Ưu tiên timeline:</span>
                    <span className="text-slate-300">
                      {speedPriority === "strict"
                        ? "Ép chặt timeline"
                        : speedPriority === "natural"
                          ? "Tự nhiên"
                          : "Cân bằng"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-200">
                    <span className="text-slate-400">Đệm khoảng lặng:</span>
                    <span className="text-slate-300">
                      {padSilence ? "Bật đệm" : "Tắt"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-200">
                    <span className="text-slate-400">Xử lý song song:</span>
                    <span className="text-slate-300">
                      Batch {effectiveBatchSize} câu/lần
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-200">
                    <span className="text-slate-400">Định dạng file:</span>
                    <span className="text-slate-300 uppercase">
                      {outputFormat}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSavePresetModal(false);
                    setNewPresetName("");
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={!newPresetName.trim()}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-amber-500/20 flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu Cấu Hình Dự Án</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PANEL EDIT & QUẢN LÝ CẤU HÌNH DỰ ÁN (Requirement 2)*/}
      {/* Đổi tên, xóa, xuất tts_studio_project_settings.json, nhập */}
      {/* ========================================================= */}
      {showPresetManagerModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 p-4 sm:p-6 border-b border-slate-800 bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center font-bold shrink-0">
                  <Bookmark className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                    <span>Quản Lý & Chỉnh Sửa Cấu Hình Dự Án</span>
                    <span className="text-[11px] font-mono bg-slate-800 px-2 py-0.5 rounded text-amber-300 border border-slate-700">
                      {projectPresets.length} cấu hình
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Đổi tên, xóa cấu hình, xuất file JSON hoặc nhập cấu hình vào
                    Studio
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPresetManagerModal(false);
                  setEditingPresetId(null);
                }}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Đóng (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Action Bar: Export & Import JSON (Requirement 2) */}
            <div className="px-4 py-3 sm:px-6 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Export JSON Button */}
                <button
                  type="button"
                  onClick={handleExportPresets}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 hover:border-amber-500/40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm group"
                  title="Xuất cấu hình thành tệp JSON tên 'tts_studio_project_settings.json'"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span>Xuất File JSON (tts_studio_project_settings.json)</span>
                </button>

                {/* Import JSON Button */}
                <button
                  type="button"
                  onClick={() => importPresetsInputRef.current?.click()}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 hover:border-slate-600 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm group"
                  title="Tải tệp JSON cấu hình từ máy tính vào studio"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-300 group-hover:scale-110 transition-transform" />
                  <span>Nhập File JSON Vào Studio...</span>
                </button>
                <input
                  ref={importPresetsInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportPresetsFile}
                  className="hidden"
                />
              </div>

              {/* Add New Preset from Current Settings */}
              <button
                type="button"
                onClick={() => {
                  setShowPresetManagerModal(false);
                  setShowSavePresetModal(true);
                }}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/20"
              >
                <Save className="w-3.5 h-3.5" />
                <span>+ Lưu cấu hình hiện tại</span>
              </button>
            </div>

            {/* Presets List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 max-h-[62vh]">
              <div className="space-y-2.5">
                {projectPresets.map((preset) => {
                  const isSelected = preset.id === selectedPresetId;
                  const isEditing = editingPresetId === preset.id;
                  const voice = voices.find((v) => v.id === preset.voiceId);

                  return (
                    <div
                      key={preset.id}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? "bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30"
                          : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Left: Name or inline edit */}
                        <div className="flex-1 min-w-0 space-y-1">
                          {isEditing ? (
                            <div className="flex items-center gap-2 max-w-lg">
                              <input
                                type="text"
                                autoFocus
                                value={editingPresetName}
                                onChange={(e) =>
                                  setEditingPresetName(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    handleSaveRenamePreset(preset.id);
                                  if (e.key === "Escape")
                                    setEditingPresetId(null);
                                }}
                                className="flex-1 bg-slate-900 border border-amber-500 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                                placeholder="Nhập tên mới..."
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleSaveRenamePreset(preset.id)
                                }
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shadow-sm"
                              >
                                Lưu
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingPresetId(null)}
                                className="px-2.5 py-1.5 bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs cursor-pointer"
                              >
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white text-xs sm:text-sm">
                                {preset.name}
                              </span>
                              {preset.isDefault ? (
                                <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                  Mẫu chuẩn hệ thống
                                </span>
                              ) : (
                                <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Cá nhân
                                </span>
                              )}
                              {isSelected && (
                                <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                  <Check className="w-2.5 h-2.5" />
                                  Đang kích hoạt
                                </span>
                              )}
                            </div>
                          )}

                          {/* Details Strip */}
                          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 flex-wrap pt-0.5">
                            <span className="text-amber-400 font-semibold truncate max-w-[200px]">
                              {voice?.name || preset.voiceId}
                            </span>
                            <span>·</span>
                            <span className="text-emerald-400 font-semibold">
                              {preset.minSpeed.toFixed(2)}x -{" "}
                              {preset.maxSpeed.toFixed(2)}x
                            </span>
                            <span>·</span>
                            <span>
                              {preset.speedPriority === "strict"
                                ? "Ép timeline"
                                : preset.speedPriority === "natural"
                                  ? "Tự nhiên"
                                  : "Cân bằng"}
                            </span>
                            <span>·</span>
                            <span>
                              {preset.padSilence ? "Đệm silence" : "Không đệm"}
                            </span>
                            <span>·</span>
                            <span>
                              Batch{" "}
                              {preset.customBatchSize || preset.batchSizeChoice}
                            </span>
                            <span>·</span>
                            <span className="uppercase text-slate-300 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800">
                              {preset.outputFormat}
                            </span>
                          </div>
                        </div>

                        {/* Right: Actions (Dùng, Đổi tên, Xóa) */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {!isSelected ? (
                            <button
                              type="button"
                              onClick={() => {
                                handleApplyPreset(preset.id);
                              }}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 hover:border-amber-500/40 transition-colors cursor-pointer flex items-center gap-1"
                              title="Tự động nạp thông số cấu hình này vào Studio"
                            >
                              <Check className="w-3 h-3 text-amber-400" />
                              <span>Nạp cấu hình này</span>
                            </button>
                          ) : (
                            <span className="px-3 py-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>Đang chọn</span>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleStartRenamePreset(preset)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors border border-slate-700 cursor-pointer"
                            title="Đổi tên cấu hình này"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeletePreset(preset.id)}
                            className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 rounded-xl transition-colors cursor-pointer"
                            title="Xóa cấu hình này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:px-6 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <div className="flex items-center gap-2">
                <span>File xuất mặc định:</span>
                <code className="text-amber-400 font-mono text-[11px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                  tts_studio_project_settings.json
                </code>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPresetManagerModal(false);
                  setEditingPresetId(null);
                }}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer border border-slate-700"
              >
                Xong & Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Code Snippet Modal */}
      {showApiModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-white text-base">
                  Mã nguồn tích hợp Piper TTS Studio
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowApiModal(false)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Mã nguồn Node.js TypeScript nạp trực tiếp mô hình giọng đọc đã chọn với PiperTTS:
            </p>

            <div className="relative bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs text-emerald-300 overflow-x-auto">
              <pre>{`import { PiperNativeTTS } from "pipertts";

// Khởi tạo và nạp mô hình PiperTTS tiếng Việt 100% Offline (Không cần mạng)
const tts = await PiperNativeTTS.load({
  modelPath: "./models/vietnamese-voice-model.onnx",
  espeakBinary: "espeak-ng",
});

// Chuyển đổi văn bản thành giọng nói
const { audio, sampleRate } = await tts.synthesize("Xin chào! Đây là Piper TTS Studio tiếng Việt.", {
  outputFormat: "wav",
  sentenceSilence: 0.2,
  lengthScale: 1.0,
});`}</pre>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `import { PiperNativeTTS } from "pipertts";\n\n// Nạp mô hình 100% Offline không cần internet\nconst tts = await PiperNativeTTS.load({\n  modelPath: "./models/vietnamese-voice-model.onnx",\n  espeakBinary: "espeak-ng",\n});\n\nconst { audio } = await tts.synthesize("Xin chào! Đây là Piper TTS Studio tiếng Việt.");`,
                  );
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="absolute top-3 right-3 p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Đã chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao chép</span>
                  </>
                )}
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowApiModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* FLOATING AI STUDIO COMPLETION PANEL (Requirement 3)       */}
      {/* Xuất hiện khi hoàn tất xử lý phụ đề                       */}
      {/* ========================================================= */}
      {showCompletionBanner && (
        <aside
          role="status"
          aria-live="polite"
          aria-label="Thông báo hoàn tất xử lý phụ đề"
          className="fixed top-20 right-4 sm:right-6 z-50 max-w-sm sm:max-w-md w-full bg-slate-900/95 backdrop-blur-xl border border-amber-500/50 rounded-2xl p-4 shadow-2xl shadow-black/80 space-y-3 animate-in fade-in slide-in-from-top-3 duration-300 ring-1 ring-amber-500/20"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                <CheckCircle2 className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                  <span>Hoàn tất xử lý phụ đề!</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    100%
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Đã tạo xong {lastCompletedJobInfo?.count || subtitles.length}{" "}
                  câu thoại. File Master Audio đã sẵn sàng.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCompletionBanner(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                handlePlayMasterAudio();
                setShowCompletionBanner(false);
              }}
              className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Nghe Master Audio ngay</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCompletionBanner(false)}
              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
            >
              Đóng
            </button>
          </div>
        </aside>
      )}

      {/* ========================================================= */}
      {/* MODAL: BỘ CHUẨN HÓA PHÁT ÂM & TỪ ĐIỂN TIẾNG VIỆT (Req 1)  */}
      {/* Sửa số có dấu chấm (5.000), chữ R, từ viết tắt            */}
      {/* ========================================================= */}
      {showPronunciationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
            {/* Header */}
            <div className="p-4 sm:px-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Bộ Chuẩn Hóa Phát Âm & Từ Điển Tiếng Việt
                  </h3>
                  <p className="text-xs text-slate-400">
                    Sửa phát âm số có dấu chấm, tiền tệ, phụ âm & từ ngữ tùy
                    chỉnh
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPronunciationModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
              {/* Card 1: Số có chấm & tiền tệ */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    1. Tự động sửa số có dấu chấm hàng nghìn
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Đã tích hợp
                  </span>
                </div>
                <p className="text-slate-400 leading-relaxed text-xs">
                  Khi người dùng viết{" "}
                  <code className="text-amber-400 font-mono bg-slate-900 px-1 py-0.5 rounded">
                    5.000
                  </code>
                  , eSpeak-NG thường ngắt dấu chấm và phát âm thành{" "}
                  <em>&ldquo;5 không không không&rdquo;</em>. Bộ chuẩn hóa tự
                  động biến đổi thành{" "}
                  <code className="text-emerald-400 font-mono bg-slate-900 px-1 py-0.5 rounded">
                    5000
                  </code>{" "}
                  để Piper phát âm chuẩn <strong>&ldquo;năm nghìn&rdquo;</strong>
                  .
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                  <div className="p-2 bg-slate-900/80 rounded border border-slate-800 text-slate-300">
                    <span className="text-rose-400 line-through">5.000</span> ➔{" "}
                    <span className="text-emerald-400 font-bold">5000</span>{" "}
                    (năm nghìn)
                  </div>
                  <div className="p-2 bg-slate-900/80 rounded border border-slate-800 text-slate-300">
                    <span className="text-rose-400 line-through">5.000đ</span> ➔{" "}
                    <span className="text-emerald-400 font-bold">
                      5000 đồng
                    </span>
                  </div>
                  <div className="p-2 bg-slate-900/80 rounded border border-slate-800 text-slate-300">
                    <span className="text-rose-400 line-through">3.5</span> ➔{" "}
                    <span className="text-emerald-400 font-bold">3 phẩy 5</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Phát âm chữ R của giọng Hoài My */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-amber-400" />
                    2. Về giọng Hoài My và phụ âm &ldquo;R&rdquo;
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Đặc trưng thổ ngữ
                  </span>
                </div>
                <p className="text-slate-400 leading-relaxed text-xs">
                  Giọng Hoài My và các giọng nữ/nam miền Bắc được huấn luyện từ
                  người bản xứ Hà Nội. Trong tiếng Bắc, phụ âm{" "}
                  <strong>r</strong>, <strong>d</strong>, <strong>gi</strong>{" "}
                  đồng âm /z/ (ví dụ <em>&ldquo;ra vào&rdquo;</em> đọc là{" "}
                  <em>&ldquo;da vào&rdquo;</em>, <em>&ldquo;rất tốt&rdquo;</em>{" "}
                  đọc là <em>&ldquo;dất tốt&rdquo;</em>).
                </p>
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-200 text-xs">
                  💡 <strong>Gợi ý:</strong> Nếu bạn cần phát âm chuẩn chữ{" "}
                  <strong>&ldquo;R&rdquo;</strong> uốn lưỡi / rung rõ ràng
                  (không đọc thành &ldquo;d&rdquo;), hãy chọn giọng{" "}
                  <strong>Việt Thảo (Miền Nam)</strong> hoặc{" "}
                  <strong>CSA Voice</strong> trong danh sách giọng!
                </div>
              </div>

              {/* Card 3: Từ điển quy tắc thay thế tùy chỉnh */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">
                    3. Quy tắc từ điển thay thế tùy chỉnh (
                    {customPronunciationRules.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Tự động lưu vào cấu hình dự án
                  </span>
                </div>

                {/* Form thêm quy tắc */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center gap-2">
                  <input
                    type="text"
                    value={newRuleFrom}
                    onChange={(e) => setNewRuleFrom(e.target.value)}
                    placeholder="Từ gốc (vd: 5.000, AI, USA...)"
                    className="w-full sm:flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-mono focus:ring-1 focus:ring-amber-500"
                  />
                  <span className="text-slate-500 font-bold shrink-0">➔</span>
                  <input
                    type="text"
                    value={newRuleTo}
                    onChange={(e) => setNewRuleTo(e.target.value)}
                    placeholder="Thay bằng (vd: năm nghìn, trí tuệ nhân tạo, Mỹ...)"
                    className="w-full sm:flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-mono focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newRuleFrom.trim()) return;
                      setCustomPronunciationRules((prev) => [
                        ...prev,
                        {
                          id: `rule-${Date.now()}`,
                          from: newRuleFrom.trim(),
                          to: newRuleTo.trim(),
                          active: true,
                        },
                      ]);
                      setNewRuleFrom("");
                      setNewRuleTo("");
                    }}
                    className="w-full sm:w-auto px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm</span>
                  </button>
                </div>

                {/* Danh sách quy tắc */}
                {customPronunciationRules.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {customPronunciationRules.map((r) => (
                      <div
                        key={r.id}
                        className="p-2 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between gap-2 text-xs font-mono"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={r.active}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setCustomPronunciationRules((prev) =>
                                prev.map((item) =>
                                  item.id === r.id
                                    ? { ...item, active: checked }
                                    : item,
                                ),
                              );
                            }}
                            className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 accent-amber-500"
                          />
                          <span
                            className={
                              r.active
                                ? "text-amber-300 font-semibold"
                                : "text-slate-500 line-through"
                            }
                          >
                            &ldquo;{r.from}&rdquo;
                          </span>
                          <span className="text-slate-500">➔</span>
                          <span
                            className={
                              r.active
                                ? "text-emerald-300"
                                : "text-slate-500"
                            }
                          >
                            &ldquo;{r.to}&rdquo;
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomPronunciationRules((prev) =>
                              prev.filter((item) => item.id !== r.id),
                            );
                          }}
                          className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                          title="Xóa quy tắc này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 italic text-[11px]">
                    Chưa có quy tắc thay thế thủ công nào. Bạn có thể thêm bất
                    kỳ từ ngữ nào muốn đổi cách đọc ở trên.
                  </p>
                )}
              </div>

              {/* Live Preview Test Box */}
              <div className="p-3.5 bg-slate-950/90 rounded-xl border border-slate-800 space-y-2">
                <span className="font-bold text-slate-300 text-xs block">
                  🔍 Thử nghiệm xem trước kết quả chuẩn hóa:
                </span>
                <input
                  type="text"
                  value={previewTestText}
                  onChange={(e) => setPreviewTestText(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-mono"
                  placeholder="Nhập câu thử nghiệm (vd: 5.000đ, 3.5kg...)"
                />
                <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 font-mono text-xs text-emerald-300">
                  <span className="text-slate-500 text-[10px] block mb-0.5">
                    Kết quả sau khi chuẩn hóa trước khi đưa vào PiperTTS:
                  </span>
                  {normalizeVietnameseText(previewTestText, {
                    normalizeNumbers,
                    customRules: customPronunciationRules.filter(
                      (r) => r.active,
                    ),
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPronunciationModal(false)}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl cursor-pointer shadow"
              >
                Lưu & Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 mt-12 mb-20 bg-slate-950/80 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>Piper TTS Studio</span>
            <span>·</span>
            <span>Đa giọng đọc tiếng Việt</span>
            <span>·</span>
            <span>Đồng bộ phụ đề Timeline SRT</span>
            <span>·</span>
            <span>Xuất MP3 & WAV hoàn chỉnh</span>
          </div>
          <div>
            Hỗ trợ tiếng Việt tự nhiên với chuẩn ngữ âm espeak-ng & FFmpeg
            atempo
          </div>
        </div>
      </footer>

      {/* ========================================================= */}
      {/* FULL-SCREEN DRAG & DROP OVERLAY (Requirement 1)            */}
      {/* Kéo thả phụ đề vào bất kỳ đâu trên màn hình               */}
      {/* ========================================================= */}
      {isWindowDragging && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsWindowDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsWindowDragging(false);
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
              processSubtitleFile(files[0]);
            }
          }}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md border-4 border-dashed border-amber-400 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-150 p-6 select-none"
        >
          <div className="w-20 h-20 rounded-3xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-2xl shadow-amber-500/50 scale-110 animate-bounce">
            <UploadCloud className="w-10 h-10" />
          </div>
          <div className="text-center space-y-1.5">
            <h3 className="text-2xl font-black text-white">
              Thả tệp phụ đề vào đây
            </h3>
            <p className="text-sm text-amber-300 font-medium">
              Hỗ trợ tệp phụ đề .SRT hoặc .TXT tiếng Việt
            </p>
            <p className="text-xs text-slate-400">
              Hệ thống sẽ tự động phân tích và đồng bộ timeline ngay lập tức
            </p>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STICKY BOTTOM BAR (Requirement 2)                          */}
      {/* Thanh dock luôn ghim đáy màn hình như Navbar dưới đáy     */}
      {/* Tách riêng: Progress bar, % hoàn thành & Nút bắt đầu xử lý*/}
      {/* ========================================================= */}
      {activeTab === "subtitles" && (
        <div
          role="region"
          aria-label="Thanh điều khiển tiến độ và xử lý phụ đề"
          className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 shadow-[0_-12px_40px_rgba(0,0,0,0.85)]"
        >
          <div className="max-w-[1680px] mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
              {/* Vùng Trái: Thông tin Giọng đọc & Phụ đề & Trạng thái */}
              <div className="flex items-center justify-between md:justify-start gap-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center shrink-0">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div className="leading-tight">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowVoiceModal(true)}
                        className="text-xs font-bold text-white hover:text-amber-300 truncate max-w-[150px] sm:max-w-[220px] transition-colors cursor-pointer text-left flex items-center gap-1.5 group"
                        title="Bấm để mở bảng chọn giọng đọc"
                      >
                        <span className="truncate group-hover:underline">
                          {selectedVoice.name}
                        </span>
                        <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/15 px-1.5 py-0.2 rounded border border-amber-500/30 group-hover:bg-amber-500/25 shrink-0">
                          Đổi giọng
                        </span>
                      </button>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          activeJob?.status === "running"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse"
                            : activeJob?.status === "completed"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : activeJob?.status === "paused"
                                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                : "bg-slate-800 text-slate-300 border border-slate-700"
                        }`}
                      >
                        {activeJob?.status === "running" &&
                          "Đang chạy song song"}
                        {activeJob?.status === "completed" && "Hoàn thành 100%"}
                        {activeJob?.status === "paused" && "Đang tạm dừng"}
                        {(!activeJob || activeJob?.status === "idle") &&
                          "Sẵn sàng"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                      <span className="text-amber-400 font-semibold">
                        {subtitles.length} câu
                      </span>
                      <span>·</span>
                      <span>
                        Batch{" "}
                        {activeJob?.options.batchSize ?? effectiveBatchSize}{" "}
                        câu/đợt
                      </span>
                      {uploadedFileName && (
                        <>
                          <span>·</span>
                          <span
                            className="truncate max-w-[120px] text-slate-300 hidden sm:inline"
                            title={uploadedFileName}
                          >
                            {uploadedFileName}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Vùng Giữa: Progress Bar & Phần Trăm Hoàn Thành (Requirement 2) */}
              <div className="flex-1 min-w-0 max-w-2xl mx-auto w-full space-y-1.5 px-0 md:px-4">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-extrabold text-amber-400">
                      {completionPercent}%
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      ({completedSentencesCount}/{totalSentencesCount} câu hoàn
                      tất)
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {activeJob?.status === "running" && (
                      <span className="text-amber-400 font-medium">
                        {activeJob.overallProgress.estimatedRemainingMs !==
                        undefined
                          ? `Còn ~${(activeJob.overallProgress.estimatedRemainingMs / 1000).toFixed(0)}s`
                          : `Đã chạy ${(activeJob.overallProgress.elapsedMs / 1000).toFixed(1)}s`}
                      </span>
                    )}
                    {activeJob?.status === "completed" && (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Master audio sẵn sàng
                      </span>
                    )}
                    {(!activeJob || activeJob?.status === "idle") && (
                      <span className="text-slate-400">Chờ bắt đầu xử lý</span>
                    )}
                  </div>
                </div>

                {/* Thanh Tiến Độ Hoàn Thành (Progress Bar) */}
                <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700/80 shadow-inner relative">
                  <div
                    className={`h-full rounded-full transition-all duration-300 relative ${
                      activeJob?.status === "completed"
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.5)]"
                        : "bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 shadow-[0_0_14px_rgba(245,158,11,0.5)]"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(0, completionPercent))}%`,
                    }}
                  >
                    {activeJob?.status === "running" && (
                      <div className="absolute inset-0 bg-white/25 animate-pulse" />
                    )}
                  </div>
                </div>
              </div>

              {/* Vùng Phải: Nút Bắt Đầu Xử Lý & Các Điều Khiển Phụ (Requirement 2) */}
              <div className="flex items-center justify-end gap-2 shrink-0">
                {activeJob?.status === "running" ? (
                  <>
                    <button
                      type="button"
                      onClick={handlePauseResume}
                      className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Tạm dừng tiến trình"
                    >
                      <Pause className="w-4 h-4 text-amber-400" />
                      <span className="hidden sm:inline">Tạm dừng</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelJob}
                      className="px-3 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Hủy bỏ tiến trình"
                    >
                      <Square className="w-3.5 h-3.5 text-rose-400 fill-current" />
                      <span className="hidden sm:inline">Hủy</span>
                    </button>
                    <div className="px-4 py-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm">
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                      <span>Đang xử lý ({completionPercent}%)</span>
                    </div>
                  </>
                ) : activeJob?.status === "paused" ? (
                  <>
                    <button
                      type="button"
                      onClick={handlePauseResume}
                      className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-colors cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Tiếp tục</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelJob}
                      className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 text-rose-400" />
                      <span>Hủy</span>
                    </button>
                  </>
                ) : (
                  <>
                    {activeJob?.status === "completed" &&
                      activeJob.masterAudio && (
                        <div className="flex items-center gap-2">
                          {masterPlaying && currentMasterItem?.item && (
                            <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono font-medium max-w-[240px] truncate">
                              <Volume2 className="w-3.5 h-3.5 animate-pulse shrink-0" />
                              <span className="truncate">
                                Câu {currentMasterItem.item.index}:{" "}
                                {currentMasterItem.item.text}
                              </span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePlayMasterAudio()}
                            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                            title="Nghe file master hoàn chỉnh"
                          >
                            {masterPlaying ? (
                              <>
                                <Pause className="w-4 h-4 fill-current" />
                                <span>
                                  Dừng (
                                  {formatSecondsDisplay(masterCurrentTime)})
                                </span>
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 fill-current text-emerald-400" />
                                <span>Nghe Master</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                    {/* Nút Bắt Đầu Xử Lý Chính */}
                    <button
                      type="button"
                      disabled={subtitles.length === 0}
                      onClick={handleStartProcessing}
                      className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-95 text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-xl shadow-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all cursor-pointer"
                    >
                      {activeJob?.status === "completed" ? (
                        <>
                          <RotateCcw className="w-4 h-4" />
                          <span>Chạy Lại ({subtitles.length} câu)</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                          <span>Bắt Đầu Xử Lý ({subtitles.length} câu)</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
