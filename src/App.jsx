import { useEffect, useMemo, useRef, useState } from "react";
import { playAiStudioCompletionChime } from "./utils/textNormalizer";
import { parseSrtContent } from "./utils/srtParser";
import { SAMPLE_PROMPT_SRT } from "./utils/sampleData";
import AudioCleanupModal from "./components/AudioCleanupModal";
import SubtitleTranslationSetupModal from "./components/SubtitleTranslationSetupModal";
import { copyAudioToClipboard } from "./utils/clipboardAudio";
import { useTheme } from "./context/ThemeContext";
import ApiModal from "./components/App/ApiModal";
import CompletionBanner from "./components/App/CompletionBanner";
import { DEFAULT_PRESETS } from "./components/App/constants";
import Content from "./components/App/Content";
import DragOverlay from "./components/App/DragOverlay";
import Navbar from "./components/App/Navbar";
import PresetManagerModal from "./components/App/PresetManagerModal";
import ProcessingControlBar from "./components/App/ProcessingControlBar";
import PronunciationModal from "./components/App/PronunciationModal";
import SavePresetModal from "./components/App/SavePresetModal";
import ThemeModal from "./components/App/ThemeModal";
import VoiceModal from "./components/App/VoiceModal";

export default function App() {
  const getInitialTab = () => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path === "/video-dubbing") return "video-dubbing";
      if (path === "/subtitle-ocr") return "subtitle-ocr";
      if (path === "/subtitle-editor") return "subtitle-editor";
      if (path === "/srt-from-text") return "srt-from-text";
      if (path === "/join-split-video") return "join-split-video";
      if (path === "/voice-effects") return "voice-effects";
      if (path === "/file-transfer") return "file-transfer";
      if (path === "/voice-clone") return "voice-clone";
      if (path === "/story") return "story";
      if (path === "/bgm") return "bgm";
      if (path === "/single") return "single";
      if (path === "/theme-playground") return "theme-playground";
      if (path === "/voice-blend") return "voice-blend";
    }
    return "subtitles";
  };
  const { theme, setTheme, themes } = useTheme();
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [showAudioCleanupModal, setShowAudioCleanupModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const navRef = useRef(null);
  const handleNavigateTab = (tab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const path =
        tab === "subtitle-ocr"
          ? "/subtitle-ocr"
          : tab === "subtitle-editor"
            ? "/subtitle-editor"
            : tab === "srt-from-text"
              ? "/srt-from-text"
              : tab === "join-split-video"
                ? "/join-split-video"
                : tab === "voice-effects"
                  ? "/voice-effects"
                  : tab === "file-transfer"
                    ? "/file-transfer"
                    : tab === "video-dubbing"
                      ? "/video-dubbing"
                      : tab === "voice-clone"
                        ? "/voice-clone"
                        : tab === "story"
                          ? "/story"
                          : tab === "bgm"
                            ? "/bgm"
                            : tab === "single"
                              ? "/single"
                              : tab === "theme-playground"
                                ? "/theme-playground"
                                : tab === "voice-blend"
                                  ? "/voice-blend"
                                  : "/";
      if (window.location.pathname !== path) {
        window.history.pushState({}, "", path);
      }
    }
  };
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === "/subtitle-ocr") setActiveTab("subtitle-ocr");
      else if (path === "/subtitle-editor") setActiveTab("subtitle-editor");
      else if (path === "/srt-from-text") setActiveTab("srt-from-text");
      else if (path === "/join-split-video") setActiveTab("join-split-video");
      else if (path === "/voice-effects") setActiveTab("voice-effects");
      else if (path === "/video-dubbing") setActiveTab("video-dubbing");
      else if (path === "/voice-clone") setActiveTab("voice-clone");
      else if (path === "/story") setActiveTab("story");
      else if (path === "/bgm") setActiveTab("bgm");
      else if (path === "/single") setActiveTab("single");
      else if (path === "/theme-playground") setActiveTab("theme-playground");
      else if (path === "/voice-blend") setActiveTab("voice-blend");
      else setActiveTab("subtitles");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  useEffect(() => {
    const handlePointerDown = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setNavMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setNavMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  // Voices
  const [voices, setVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(
    "local:hoaimy-vietnamese-vi-medium-ljkjhi",
  );
  // Voice Selection Panel (Modal Table) & Preview States
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceSearchQuery, setVoiceSearchQuery] = useState("");
  const [voiceGenderFilter, setVoiceGenderFilter] = useState("all");
  const [previewVoiceId, setPreviewVoiceId] = useState(null);
  const [previewLoadingVoiceId, setPreviewLoadingVoiceId] = useState(null);
  const previewAudioRef = useRef(null);
  const previewAudioCacheRef = useRef(new Map());
  // -------------------------------------------------------------
  // SUBTITLE TIMELINE STATE
  // -------------------------------------------------------------
  const [srtRawText, setSrtRawText] = useState(SAMPLE_PROMPT_SRT);
  const [subtitles, setSubtitles] = useState([]);
  const [parseWarnings, setParseWarnings] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  // Job options
  const [batchSizeChoice, setBatchSizeChoice] = useState("4");
  const [customBatchSize, setCustomBatchSize] = useState(6);
  const [maxSpeed, setMaxSpeed] = useState(1.5);
  const [minSpeed, setMinSpeed] = useState(0.8);
  const [speedPriority, setSpeedPriority] = useState("balanced");
  const [padSilence, setPadSilence] = useState(true);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [videoDurationStr, setVideoDurationStr] = useState("");
  const [outputFormat, setOutputFormat] = useState("mp3");
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(true);
  // Project Settings Presets (Requirement 2)
  const [projectPresets, setProjectPresets] = useState(() => {
    try {
      const saved = localStorage.getItem("hoaimy_project_presets");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const customOnly = parsed.filter((p) => !p.isDefault);
          return [...DEFAULT_PRESETS, ...customOnly];
        }
      }
    } catch {}
    return DEFAULT_PRESETS;
  });
  const [selectedPresetId, setSelectedPresetId] = useState("preset-balanced");
  const [presetFeedback, setPresetFeedback] = useState(null);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [showPresetManagerModal, setShowPresetManagerModal] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [editingPresetName, setEditingPresetName] = useState("");
  const importPresetsInputRef = useRef(null);
  // Layout expansion states (Requirement 3)
  const [isLeftPanelExpanded, setIsLeftPanelExpanded] = useState(true);
  const [isLogsExpanded, setIsLogsExpanded] = useState(true);
  const [showSrtEditor, setShowSrtEditor] = useState(false);
  const [showStagesTracker, setShowStagesTracker] = useState(true);
  const [espeakStatus, setEspeakStatus] = useState(null);
  // Drag & drop state for subtitles (Requirement 1)
  const [isDragging, setIsDragging] = useState(false);
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const [dragFeedback, setDragFeedback] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  // Pronunciation Normalization & Rules (Requirement 1)
  const [normalizeNumbers, setNormalizeNumbers] = useState(true);
  const [customPronunciationRules, setCustomPronunciationRules] = useState(
    () => {
      try {
        const saved = localStorage.getItem(
          "pipertts_custom_pronunciation_rules",
        );
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
      return [];
    },
  );
  const [showPronunciationModal, setShowPronunciationModal] = useState(false);
  const [newRuleFrom, setNewRuleFrom] = useState("");
  const [newRuleTo, setNewRuleTo] = useState("");
  const [previewTestText, setPreviewTestText] = useState(
    "Giá vé là 5.000đ cho 3.5 giờ, có 50.000 người tham gia.",
  );
  // Voice sorting by name (Requirement 2)
  const [voiceSortOrder, setVoiceSortOrder] = useState("none");
  // Notification sound & panel (Requirement 3)
  const [soundNotificationEnabled, setSoundNotificationEnabled] =
    useState(true);
  const [soundOnlyWhenUnfocused, setSoundOnlyWhenUnfocused] = useState(true);
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);
  const [lastCompletedJobInfo, setLastCompletedJobInfo] = useState(null);
  const fileInputRef = useRef(null);
  const effectiveBatchSize =
    batchSizeChoice === "custom"
      ? Math.max(1, Math.min(32, customBatchSize || 4))
      : parseInt(batchSizeChoice, 10);
  // Logging & Filtering
  const [logFilter, setLogFilter] = useState("ALL");
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const logsContainerRef = useRef(null);
  // Playback state for Master Audio (Full timeline scrubbing & live sentence tracking)
  const [masterPlaying, setMasterPlaying] = useState(false);
  const [masterCurrentTime, setMasterCurrentTime] = useState(0);
  const [masterDuration, setMasterDuration] = useState(0);
  const [isSeekingMaster, setIsSeekingMaster] = useState(false);
  const [masterSeekValue, setMasterSeekValue] = useState(0);
  const masterAudioRef = useRef(null);
  // Playback state for Individual Subtitle Item
  const [playingItemIndex, setPlayingItemIndex] = useState(null);
  const itemAudioRef = useRef(null);
  // SSE EventSource reference
  const eventSourceRef = useRef(null);
  // Single Text TTS State (Tab 2)
  const [singleText, setSingleText] = useState(
    "Xin chào! Đây là Piper TTS Studio - hệ thống tổng hợp giọng đọc tiếng Việt tự nhiên 100% Offline, hỗ trợ nhiều giọng đọc và đồng bộ timeline phụ đề.",
  );
  const [singleSpeed, setSingleSpeed] = useState(1.0);
  const [singleSilence, setSingleSilence] = useState(0.2);
  const [singleAudioUrl, setSingleAudioUrl] = useState(null);
  const [singleIsLoading, setSingleIsLoading] = useState(false);
  const [singleFormat, setSingleFormat] = useState("mp3");
  const singleAudioRef = useRef(null);
  // Modal API code
  const [showApiModal, setShowApiModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  // Clipboard Audio states
  const [copiedMasterAudio, setCopiedMasterAudio] = useState(false);
  const [copiedSingleAudio, setCopiedSingleAudio] = useState(false);
  const [copiedSentenceIndex, setCopiedSentenceIndex] = useState(null);
  const handleCopyMasterAudio = async () => {
    if (!activeJob?.id) return;
    const url = `/api/subtitles/job/${activeJob.id}/master-audio?format=mp3`;
    const res = await copyAudioToClipboard(url);
    if (res.success) {
      setCopiedMasterAudio(true);
      setTimeout(() => setCopiedMasterAudio(false), 2500);
    } else {
      alert(res.message);
    }
  };
  const handleCopySentenceAudio = async (item) => {
    if (!activeJob?.id) return;
    const url = `/api/subtitles/job/${activeJob.id}/item-audio/${item.index}`;
    const res = await copyAudioToClipboard(url);
    if (res.success) {
      setCopiedSentenceIndex(item.index);
      setTimeout(() => setCopiedSentenceIndex(null), 2500);
    } else {
      alert(res.message);
    }
  };
  const handleCopySingleAudio = async () => {
    if (!singleAudioUrl) return;
    const res = await copyAudioToClipboard(singleAudioUrl);
    if (res.success) {
      setCopiedSingleAudio(true);
      setTimeout(() => setCopiedSingleAudio(false), 2500);
    } else {
      alert(res.message);
    }
  };
  // Load voices
  const loadVoices = () => {
    fetch("/api/voices")
      .then((res) => res.json())
      .then((data) => {
        if (data.voices && Array.isArray(data.voices)) {
          setVoices(data.voices);
          if (data.defaultModel && !selectedVoiceId)
            setSelectedVoiceId(data.defaultModel);
        }
        if (typeof data.espeakAvailable === "boolean") {
          setEspeakStatus({
            available: data.espeakAvailable,
            path: data.espeakPath,
          });
        }
      })
      .catch((e) => console.error("Failed to load voices:", e));
  };
  useEffect(() => {
    loadVoices();
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
  const connectSSE = (jobId) => {
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
          it.index === data.index ? { ...it, status: "generating" } : it,
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
    let videoDur = undefined;
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
            trimStartMs,
            trimEndMs,
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
    } catch (e) {
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
  const handleRegenerateSingle = async (index) => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/single/${index}`, {
      method: "POST",
    });
  };
  const handlePlayItemAudio = (item) => {
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
  const handlePlayMasterAudio = (startTime) => {
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
  const handleSeekMaster = (targetSeconds, autoPlay = false) => {
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
  const handleJumpMaster = (deltaSeconds) => {
    const current = isSeekingMaster ? masterSeekValue : masterCurrentTime;
    handleSeekMaster(current + deltaSeconds);
  };
  // Jump to previous or next sentence
  const handleJumpToSentence = (direction) => {
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
  const handlePlayMasterFromSentence = (item) => {
    handlePlayMasterAudio(item.startTime);
  };
  // Scroll to sentence in Subtitles Table
  const handleScrollToSentence = (index) => {
    const el = document.getElementById(`subtitle-row-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  // Preview Voice Sample Text in Voice Selection Panel
  const handlePreviewVoice = async (voice) => {
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
    } catch (e) {
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
  const handleSelectVoice = (voiceId) => {
    setSelectedVoiceId(voiceId);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setPreviewVoiceId(null);
  };
  // Preset Handlers (Lưu & Nạp Project Settings: Giọng đọc, Timeline & Tốc độ)
  const handleApplyPreset = (presetId) => {
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
    setTrimStartMs(preset.trimStartMs ?? 0);
    setTrimEndMs(preset.trimEndMs ?? 0);
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
  const handleSaveCurrentAsPreset = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newPreset = {
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
      trimStartMs,
      trimEndMs,
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
            trimStartMs,
            trimEndMs,
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
  const handleStartRenamePreset = (preset) => {
    setEditingPresetId(preset.id);
    setEditingPresetName(preset.name);
  };
  const handleSaveRenamePreset = (presetId) => {
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
  const handleDeletePreset = (presetId) => {
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
    } catch (e) {
      console.error("Lỗi xuất cấu hình:", e);
      setPresetFeedback("Lỗi khi xuất file cấu hình!");
      setTimeout(() => setPresetFeedback(null), 3000);
    }
  };
  // Import settings from JSON file into studio (Requirement 2)
  const handleImportPresetsFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        const parsed = JSON.parse(text);
        let rawList = [];
        if (Array.isArray(parsed)) {
          rawList = parsed;
        } else if (parsed && Array.isArray(parsed.presets)) {
          rawList = parsed.presets;
          if (Array.isArray(parsed.customPronunciationRules)) {
            setCustomPronunciationRules((prev) => [
              ...prev,
              ...parsed.customPronunciationRules.filter(
                (r) => !prev.some((p) => p.from === r.from),
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
        const validImported = [];
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
            trimStartMs:
              typeof item.trimStartMs === "number" ? item.trimStartMs : 0,
            trimEndMs: typeof item.trimEndMs === "number" ? item.trimEndMs : 0,
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
            customPronunciationRules: Array.isArray(
              item.customPronunciationRules,
            )
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
      } catch (err) {
        console.error("Import presets error:", err);
        setPresetFeedback("Lỗi: File JSON không đúng định dạng!");
        setTimeout(() => setPresetFeedback(null), 3500);
      } finally {
        if (event.target) event.target.value = "";
      }
    };
    reader.readAsText(file);
  };
  const processSubtitleFile = (file) => {
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
      let content = evt.target?.result;
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
    const handleWindowDragEnter = (e) => {
      if (activeTab !== "subtitles") {
        dragCounter = 0;
        setIsWindowDragging(false);
        return;
      }
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types?.includes("Files")) {
        setIsWindowDragging(true);
      }
    };
    const handleWindowDragOver = (e) => {
      if (activeTab !== "subtitles") {
        if (activeTab === "video-dubbing") e.preventDefault();
        return;
      }
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };
    const handleWindowDragLeave = (e) => {
      if (activeTab !== "subtitles") return;
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsWindowDragging(false);
      }
    };
    const handleWindowDrop = (e) => {
      e.preventDefault();
      dragCounter = 0;
      setIsWindowDragging(false);
      if (activeTab !== "subtitles") return;
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
  }, [activeTab]);
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processSubtitleFile(file);
      e.target.value = "";
    }
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e) => {
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
    } catch (e) {
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
  const vieneuVoicesCount = voices.filter(
    (v) => v.id.startsWith("vieneu:") || v.engine === "vieneu",
  ).length;
  const piperVoicesCount = voices.filter(
    (v) => !v.id.startsWith("vieneu:") && v.engine !== "vieneu",
  ).length;
  const filteredVoices = voices.filter((v) => {
    if (voiceGenderFilter === "recommended" && !v.recommended) return false;
    if (voiceGenderFilter === "female" && v.gender !== "female") return false;
    if (voiceGenderFilter === "male" && v.gender !== "male") return false;
    if (
      voiceGenderFilter === "vieneu" &&
      !v.id.startsWith("vieneu:") &&
      v.engine !== "vieneu"
    )
      return false;
    if (
      voiceGenderFilter === "piper" &&
      (v.id.startsWith("vieneu:") || v.engine === "vieneu")
    )
      return false;
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
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans select-none selection:bg-amber-500/30 selection:text-amber-200">
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

      {/* Navbar - nút nổi góc trên bên phải (không chiếm layout) */}
      <Navbar
        activeTab={activeTab}
        handleNavigateTab={handleNavigateTab}
        navRef={navRef}
        navMenuOpen={navMenuOpen}
        setNavMenuOpen={setNavMenuOpen}
        setShowApiModal={setShowApiModal}
        setShowAudioCleanupModal={setShowAudioCleanupModal}
        setShowSetupModal={setShowSetupModal}
        setShowThemeModal={setShowThemeModal}
        theme={theme}
        themes={themes}
      />

      {/* Main Container - Full docked desktop workstation shell */}
      <Content
        activeJob={activeJob}
        activeTab={activeTab}
        batchSizeChoice={batchSizeChoice}
        completedSentencesCount={completedSentencesCount}
        completionPercent={completionPercent}
        copiedMasterAudio={copiedMasterAudio}
        copiedSentenceIndex={copiedSentenceIndex}
        copiedSingleAudio={copiedSingleAudio}
        currentMasterItem={currentMasterItem}
        customBatchSize={customBatchSize}
        customPronunciationRules={customPronunciationRules}
        displayLogs={displayLogs}
        dragFeedback={dragFeedback}
        effectiveBatchSize={effectiveBatchSize}
        espeakStatus={espeakStatus}
        fileInputRef={fileInputRef}
        handleApplyPreset={handleApplyPreset}
        handleCopyMasterAudio={handleCopyMasterAudio}
        handleCopySentenceAudio={handleCopySentenceAudio}
        handleCopySingleAudio={handleCopySingleAudio}
        handleDeletePreset={handleDeletePreset}
        handleDragLeave={handleDragLeave}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        handleFileUpload={handleFileUpload}
        handleJumpMaster={handleJumpMaster}
        handleJumpToSentence={handleJumpToSentence}
        handlePlayItemAudio={handlePlayItemAudio}
        handlePlayMasterAudio={handlePlayMasterAudio}
        handlePlayMasterFromSentence={handlePlayMasterFromSentence}
        handlePreviewVoice={handlePreviewVoice}
        handleResetJob={handleResetJob}
        handleScrollToSentence={handleScrollToSentence}
        handleSeekMaster={handleSeekMaster}
        handleSingleSynthesize={handleSingleSynthesize}
        handleUpdateCurrentPreset={handleUpdateCurrentPreset}
        isDragging={isDragging}
        isLeftPanelExpanded={isLeftPanelExpanded}
        isLogsExpanded={isLogsExpanded}
        isSeekingMaster={isSeekingMaster}
        loadVoices={loadVoices}
        logFilter={logFilter}
        logsContainerRef={logsContainerRef}
        masterAudioRef={masterAudioRef}
        masterCurrentTime={masterCurrentTime}
        masterDuration={masterDuration}
        masterPlaying={masterPlaying}
        masterSeekValue={masterSeekValue}
        maxSpeed={maxSpeed}
        minSpeed={minSpeed}
        normalizeNumbers={normalizeNumbers}
        outputFormat={outputFormat}
        parseWarnings={parseWarnings}
        playingItemIndex={playingItemIndex}
        presetFeedback={presetFeedback}
        previewLoadingVoiceId={previewLoadingVoiceId}
        previewVoiceId={previewVoiceId}
        projectPresets={projectPresets}
        selectedPreset={selectedPreset}
        selectedPresetId={selectedPresetId}
        selectedVoice={selectedVoice}
        setActiveJob={setActiveJob}
        setBatchSizeChoice={setBatchSizeChoice}
        setCustomBatchSize={setCustomBatchSize}
        setIsLeftPanelExpanded={setIsLeftPanelExpanded}
        setIsLogsExpanded={setIsLogsExpanded}
        setIsSeekingMaster={setIsSeekingMaster}
        setLogFilter={setLogFilter}
        setMasterCurrentTime={setMasterCurrentTime}
        setMasterSeekValue={setMasterSeekValue}
        setMaxSpeed={setMaxSpeed}
        setMinSpeed={setMinSpeed}
        setNormalizeNumbers={setNormalizeNumbers}
        setOutputFormat={setOutputFormat}
        setShowAudioCleanupModal={setShowAudioCleanupModal}
        setShowPresetManagerModal={setShowPresetManagerModal}
        setShowPronunciationModal={setShowPronunciationModal}
        setShowSavePresetModal={setShowSavePresetModal}
        setShowSettingsDrawer={setShowSettingsDrawer}
        setShowSetupModal={setShowSetupModal}
        setShowSrtEditor={setShowSrtEditor}
        setShowStagesTracker={setShowStagesTracker}
        setShowVoiceModal={setShowVoiceModal}
        setSingleSilence={setSingleSilence}
        setSingleSpeed={setSingleSpeed}
        setSingleText={setSingleText}
        setSoundNotificationEnabled={setSoundNotificationEnabled}
        setSoundOnlyWhenUnfocused={setSoundOnlyWhenUnfocused}
        setSpeedPriority={setSpeedPriority}
        setSrtRawText={setSrtRawText}
        setTrimEndMs={setTrimEndMs}
        setTrimStartMs={setTrimStartMs}
        setUploadedFileName={setUploadedFileName}
        setVideoDurationStr={setVideoDurationStr}
        showSettingsDrawer={showSettingsDrawer}
        showSrtEditor={showSrtEditor}
        showStagesTracker={showStagesTracker}
        singleAudioUrl={singleAudioUrl}
        singleFormat={singleFormat}
        singleIsLoading={singleIsLoading}
        singleSilence={singleSilence}
        singleSpeed={singleSpeed}
        singleText={singleText}
        soundNotificationEnabled={soundNotificationEnabled}
        soundOnlyWhenUnfocused={soundOnlyWhenUnfocused}
        speedPriority={speedPriority}
        srtRawText={srtRawText}
        subtitles={subtitles}
        totalSentencesCount={totalSentencesCount}
        trimEndMs={trimEndMs}
        trimStartMs={trimStartMs}
        uploadedFileName={uploadedFileName}
        videoDurationStr={videoDurationStr}
        voices={voices}
      />

      {/* ========================================================= */}
      {/* MODAL: BẢNG DANH SÁCH GIỌNG ĐỌC (VOICE SELECTION TABLE)   */}
      {/* Độ rộng max screen width để hiển thị đầy đủ tất cả các cột*/}
      {/* ========================================================= */}
      {showVoiceModal && (
        <VoiceModal
          femaleVoicesCount={femaleVoicesCount}
          handleCloseVoiceModal={handleCloseVoiceModal}
          handlePreviewVoice={handlePreviewVoice}
          handleSelectVoice={handleSelectVoice}
          handleToggleVoiceSort={handleToggleVoiceSort}
          maleVoicesCount={maleVoicesCount}
          piperVoicesCount={piperVoicesCount}
          previewLoadingVoiceId={previewLoadingVoiceId}
          previewVoiceId={previewVoiceId}
          recommendedVoicesCount={recommendedVoicesCount}
          selectedVoice={selectedVoice}
          selectedVoiceId={selectedVoiceId}
          setVoiceGenderFilter={setVoiceGenderFilter}
          setVoiceSearchQuery={setVoiceSearchQuery}
          sortedVoices={sortedVoices}
          vieneuVoicesCount={vieneuVoicesCount}
          voiceGenderFilter={voiceGenderFilter}
          voiceSearchQuery={voiceSearchQuery}
          voiceSortOrder={voiceSortOrder}
          voices={voices}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL: LƯU CẤU HÌNH DỰ ÁN (PROJECT SETTINGS PRESETS)      */}
      {/* Tự động điền giọng đọc, cấu hình timeline & tốc độ        */}
      {/* ========================================================= */}
      {showSavePresetModal && (
        <SavePresetModal
          effectiveBatchSize={effectiveBatchSize}
          handleSaveCurrentAsPreset={handleSaveCurrentAsPreset}
          maxSpeed={maxSpeed}
          minSpeed={minSpeed}
          newPresetName={newPresetName}
          outputFormat={outputFormat}
          padSilence={padSilence}
          selectedVoice={selectedVoice}
          setNewPresetName={setNewPresetName}
          setShowSavePresetModal={setShowSavePresetModal}
          speedPriority={speedPriority}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL: PANEL EDIT & QUẢN LÝ CẤU HÌNH DỰ ÁN (Requirement 2)*/}
      {/* Đổi tên, xóa, xuất tts_studio_project_settings.json, nhập */}
      {/* ========================================================= */}
      {showPresetManagerModal && (
        <PresetManagerModal
          editingPresetId={editingPresetId}
          editingPresetName={editingPresetName}
          handleApplyPreset={handleApplyPreset}
          handleDeletePreset={handleDeletePreset}
          handleExportPresets={handleExportPresets}
          handleImportPresetsFile={handleImportPresetsFile}
          handleSaveRenamePreset={handleSaveRenamePreset}
          handleStartRenamePreset={handleStartRenamePreset}
          importPresetsInputRef={importPresetsInputRef}
          projectPresets={projectPresets}
          selectedPresetId={selectedPresetId}
          setEditingPresetId={setEditingPresetId}
          setEditingPresetName={setEditingPresetName}
          setShowPresetManagerModal={setShowPresetManagerModal}
          setShowSavePresetModal={setShowSavePresetModal}
          voices={voices}
        />
      )}

      {/* Code Snippet Modal */}
      {showApiModal && (
        <ApiModal
          copiedCode={copiedCode}
          setCopiedCode={setCopiedCode}
          setShowApiModal={setShowApiModal}
        />
      )}

      <SubtitleTranslationSetupModal
        open={showSetupModal}
        onClose={() => setShowSetupModal(false)}
      />

      {/* ========================================================= */}
      {/* FLOATING AI STUDIO COMPLETION PANEL (Requirement 3)       */}
      {/* Xuất hiện khi hoàn tất xử lý phụ đề                       */}
      {/* ========================================================= */}
      {showCompletionBanner && (
        <CompletionBanner
          handlePlayMasterAudio={handlePlayMasterAudio}
          lastCompletedJobInfo={lastCompletedJobInfo}
          setShowCompletionBanner={setShowCompletionBanner}
          subtitles={subtitles}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL: BỘ CHUẨN HÓA PHÁT ÂM & TỪ ĐIỂN TIẾNG VIỆT (Req 1)  */}
      {/* Sửa số có dấu chấm (5.000), chữ R, từ viết tắt            */}
      {/* ========================================================= */}
      {showPronunciationModal && (
        <PronunciationModal
          customPronunciationRules={customPronunciationRules}
          newRuleFrom={newRuleFrom}
          newRuleTo={newRuleTo}
          normalizeNumbers={normalizeNumbers}
          previewTestText={previewTestText}
          setCustomPronunciationRules={setCustomPronunciationRules}
          setNewRuleFrom={setNewRuleFrom}
          setNewRuleTo={setNewRuleTo}
          setPreviewTestText={setPreviewTestText}
          setShowPronunciationModal={setShowPronunciationModal}
        />
      )}

      {/* Footer (hidden for desktop app layout) */}
      <footer className="hidden" />

      {/* ========================================================= */}
      {/* FULL-SCREEN DRAG & DROP OVERLAY (Requirement 1)            */}
      {/* Kéo thả phụ đề vào bất kỳ đâu trên màn hình               */}
      {/* ========================================================= */}
      {activeTab === "subtitles" && isWindowDragging && (
        <DragOverlay
          processSubtitleFile={processSubtitleFile}
          setIsWindowDragging={setIsWindowDragging}
        />
      )}

      {/* ========================================================= */}
      {/* STICKY BOTTOM BAR (Requirement 2)                          */}
      {/* Thanh dock luôn ghim đáy màn hình như Navbar dưới đáy     */}
      {/* Tách riêng: Progress bar, % hoàn thành & Nút bắt đầu xử lý*/}
      {/* ========================================================= */}
      {activeTab === "subtitles" && (
        <ProcessingControlBar
          activeJob={activeJob}
          completedSentencesCount={completedSentencesCount}
          completionPercent={completionPercent}
          currentMasterItem={currentMasterItem}
          effectiveBatchSize={effectiveBatchSize}
          handleCancelJob={handleCancelJob}
          handlePauseResume={handlePauseResume}
          handlePlayMasterAudio={handlePlayMasterAudio}
          handleStartProcessing={handleStartProcessing}
          masterCurrentTime={masterCurrentTime}
          masterPlaying={masterPlaying}
          selectedVoice={selectedVoice}
          setShowVoiceModal={setShowVoiceModal}
          subtitles={subtitles}
          totalSentencesCount={totalSentencesCount}
          uploadedFileName={uploadedFileName}
        />
      )}

      {/* Audio Cleanup Modal (Requirement: Dọn Dẹp Audio) */}
      <AudioCleanupModal
        isOpen={showAudioCleanupModal}
        onClose={() => setShowAudioCleanupModal(false)}
        onCleaned={() => {
          if (activeJob) {
            setActiveJob((prev) =>
              prev
                ? {
                    ...prev,
                    masterAudio: undefined,
                    items: prev.items.map((i) => ({
                      ...i,
                      audioUrl: undefined,
                    })),
                  }
                : null,
            );
          }
        }}
      />

      {/* Theme Selector Modal */}
      {showThemeModal && (
        <ThemeModal
          setShowThemeModal={setShowThemeModal}
          setTheme={setTheme}
          theme={theme}
          themes={themes}
        />
      )}
    </div>
  );
}
