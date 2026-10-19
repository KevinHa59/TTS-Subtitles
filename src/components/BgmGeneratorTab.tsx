import React, { useState, useEffect, useRef } from "react";
import {
  Music,
  Play,
  Pause,
  RotateCcw,
  Download,
  Trash2,
  Sparkles,
  Sliders,
  Volume2,
  VolumeX,
  Copy,
  Check,
  RefreshCw,
  Clock,
  Radio,
  FileAudio,
  Layers,
  Info,
  ChevronDown,
  ChevronUp,
  Headphones,
  Mic,
  Zap,
  HardDrive,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  DownloadCloud,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  BgmMood,
  BgmIntensity,
  BgmElements,
  BgmTrack,
  BgmMoodPreset,
  BgmEngineType,
  BgmSystemStatus,
  BgmModelInfo,
} from "../types/bgm";

interface VoiceOption {
  id: string;
  modelId: string;
  speakerId?: number;
  name: string;
  tag: string;
}

interface BgmGeneratorTabProps {
  voices: VoiceOption[];
}

const PRESET_MOODS: BgmMoodPreset[] = [
  {
    id: "horror",
    label: "Kinh Dị / U Ám",
    icon: "🎃",
    tag: "Horror & Dark",
    description: "Âm u, rùng rợn, drone trầm đục, ma quái cho truyện ma & kinh dị đêm khuya",
    color: "from-purple-950 to-slate-900 border-purple-800/60 text-purple-300",
    bgGradient: "bg-purple-950/30 text-purple-400 border-purple-800/50",
    samplePrompts: [
      "Tạo 1 âm thanh nền kinh dị, u ám rùng rợn cho audio kể truyện ma",
      "Tiếng gió rít trong ngôi nhà hoang đêm khuya kèm âm thanh ghê rợn",
      "Không gian tăm tối ma quái với tiếng thì thầm và drone trầm u uất",
    ],
    defaultElements: { drone: true, wind: true },
  },
  {
    id: "suspense",
    label: "Hồi Hộp / Gay Cấn",
    icon: "🔍",
    tag: "Suspense & Tension",
    description: "Nhịp tim đập dồn dập, căng thẳng, rượt đuổi nghẹt thở cho trinh thám hình sự",
    color: "from-amber-950 to-slate-900 border-amber-800/60 text-amber-300",
    bgGradient: "bg-amber-950/30 text-amber-400 border-amber-800/50",
    samplePrompts: [
      "Nhạc nền hồi hộp gay cấn, nhịp tim dồn dập trinh thám rượt đuổi",
      "Căng thẳng tột độ trước giờ hành động với tiếng tích tắc nghẹt thở",
      "Âm thanh điều tra bí ẩn trong căn hầm bí mật",
    ],
    defaultElements: { heartbeat: true, drone: true },
  },
  {
    id: "ancient",
    label: "Cổ Trang / Kiếm Hiệp",
    icon: "⛩️",
    tag: "Wuxia & Ancient",
    description: "Giai điệu sáo trúc ngũ cung, cổ phong phiêu lãng, kiếm hiệp thanh bình",
    color: "from-emerald-950 to-slate-900 border-emerald-800/60 text-emerald-300",
    bgGradient: "bg-emerald-950/30 text-emerald-400 border-emerald-800/50",
    samplePrompts: [
      "Nhạc nền kiếm hiệp cổ trang sáo trúc êm dịu phiêu lãng giang hồ",
      "Tiếng gió thoảng qua rừng trúc kèm âm hưởng đàn tranh tĩnh lặng",
      "Khung cảnh hoàng hôn trên đỉnh núi Võ Đang tiên cảnh",
    ],
    defaultElements: { wind: true, drone: true },
  },
  {
    id: "nature",
    label: "Mưa Rơi & Thiên Nhiên",
    icon: "🌧️",
    tag: "Rain & Nature",
    description: "Tiếng mưa rơi tí tách, sấm rền xa xa, suối chảy và gió ấm cúng",
    color: "from-cyan-950 to-slate-900 border-cyan-800/60 text-cyan-300",
    bgGradient: "bg-cyan-950/30 text-cyan-400 border-cyan-800/50",
    samplePrompts: [
      "Tiếng mưa rơi ban đêm tí tách ấm cúng kèm sấm rền xa thư giãn",
      "Cơn mưa rào mùa hạ trên mái tôn và tán lá cây",
      "Tiếng sóng biển vỗ bờ rì rào êm đềm lúc bình minh",
    ],
    defaultElements: { rain: true, thunder: true, wind: true },
  },
  {
    id: "fantasy",
    label: "Thần Tiên / Kỳ Ảo",
    icon: "🧚",
    tag: "Fantasy & Magic",
    description: "Chuông tiên lấp lánh, giai điệu thần thoại, phép thuật nhiệm màu",
    color: "from-pink-950 to-slate-900 border-pink-800/60 text-pink-300",
    bgGradient: "bg-pink-950/30 text-pink-400 border-pink-800/50",
    samplePrompts: [
      "Nhạc nền thần tiên kỳ ảo, chuông ngân huyền bí cho truyện cổ tích",
      "Khu rừng thần thoại lấp lánh đom đóm và phép màu",
      "Cung điện trên mây tĩnh lặng với giai điệu huyền diệu",
    ],
    defaultElements: { chimes: true, drone: true },
  },
  {
    id: "scifi",
    label: "Vũ Trụ / Viễn Tưởng",
    icon: "🌌",
    tag: "Sci-Fi & Cyberpunk",
    description: "Analog synthwave trầm lắng, không gian vũ trụ vô tận, tương lai huyền bí",
    color: "from-indigo-950 to-slate-900 border-indigo-800/60 text-indigo-300",
    bgGradient: "bg-indigo-950/30 text-indigo-400 border-indigo-800/50",
    samplePrompts: [
      "Không gian vũ trụ viễn tưởng cyberpunk synthwave bí ẩn",
      "Trạm không gian trôi nổi giữa dải ngân hà cô đơn",
      "Thành phố tương lai mưa đêm đèn neon mờ ảo",
    ],
    defaultElements: { drone: true, wind: true },
  },
  {
    id: "epic",
    label: "Hùng Tráng / Sử Thi",
    icon: "⚔️",
    tag: "Epic & Cinematic",
    description: "Trống trận dồn dập, khí thế hào hùng, kịch tính điện ảnh chiến tranh",
    color: "from-red-950 to-slate-900 border-red-800/60 text-red-300",
    bgGradient: "bg-red-950/30 text-red-400 border-red-800/50",
    samplePrompts: [
      "Nhạc nền hùng tráng chiến đấu, tiếng trống dồn hào hùng lịch sử",
      "Khúc tráng ca khởi nghĩa sử thi chấn động non sông",
      "Cuộc đụng độ nghẹt thở giữa hai chiến binh huyền thoại",
    ],
    defaultElements: { heartbeat: true, drone: true },
  },
  {
    id: "lofi",
    label: "Lofi / Đọc Sách",
    icon: "☕",
    tag: "Lofi & Study",
    description: "Ấm cúng, mộc mạc, tiếng đĩa than vinyl lách tách cho đọc sách thư thái",
    color: "from-amber-900/60 to-slate-900 border-amber-700/60 text-amber-200",
    bgGradient: "bg-amber-900/20 text-amber-300 border-amber-700/50",
    samplePrompts: [
      "Lofi chill thư giãn đọc sách với tiếng đĩa than lách tách ấm cúng",
      "Quán cà phê chiều mưa ngắm nhìn phố phường qua ô cửa kính",
      "Góc học tập đêm khuya tĩnh lặng êm đềm",
    ],
    defaultElements: { vinyl: true, drone: true },
  },
];

export default function BgmGeneratorTab({ voices }: BgmGeneratorTabProps) {
  const availableCpuThreads =
    typeof navigator === "undefined"
      ? 8
      : Math.max(1, navigator.hardwareConcurrency || 8);
  // Engine Selection State: 'procedural' (FFmpeg Synth) or 'neural' (AI Model)
  const [engine, setEngine] = useState<BgmEngineType>("procedural");
  const [selectedModelId, setSelectedModelId] = useState<string>("musicgen-small");
  const [cpuThreads, setCpuThreads] = useState<number>(
    Math.min(12, availableCpuThreads),
  );

  // System & Model Download Status
  const [systemStatus, setSystemStatus] = useState<BgmSystemStatus | null>(null);
  const [showModelManager, setShowModelManager] = useState<boolean>(false);
  const [actionInProgressModelId, setActionInProgressModelId] = useState<string | null>(null);

  // Input State
  const [prompt, setPrompt] = useState<string>(
    "Tạo 1 âm thanh nền kinh dị, u ám rùng rợn cho audio kể truyện ma",
  );
  const [selectedMood, setSelectedMood] = useState<BgmMood>("horror");
  const [duration, setDuration] = useState<number>(30); // 15, 30, 45, 60
  const [isLoop, setIsLoop] = useState<boolean>(true);
  const [intensity, setIntensity] = useState<BgmIntensity>("medium");
  const [format, setFormat] = useState<"mp3" | "wav">("mp3");
  const [elements, setElements] = useState<BgmElements>({
    rain: false,
    thunder: false,
    wind: false,
    heartbeat: false,
    chimes: false,
    waves: false,
    vinyl: false,
    drone: true,
  });

  // UI state
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<{
    percent: number;
    stage: string;
    message: string;
  }>({ percent: 0, stage: "queued", message: "Đang khởi tạo..." });
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // Active playing track
  const [activeTrack, setActiveTrack] = useState<BgmTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [trackDuration, setTrackDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [loopPlayback, setLoopPlayback] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // History list
  const [history, setHistory] = useState<BgmTrack[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);

  // Voice narration preview mix
  const [previewVoiceModelId, setPreviewVoiceModelId] = useState<string>(
    voices[0]?.modelId || "local:hoaimy-vietnamese-vi-medium-ljkjhi",
  );
  const [previewVoiceSpeakerId, setPreviewVoiceSpeakerId] = useState<number | undefined>(
    voices[0]?.speakerId,
  );
  const [previewNarrationText, setPreviewNarrationText] = useState<string>(
    "Đêm hôm ấy, gió rít từng cơn lạnh buốt qua khe cửa. Trong bóng tối, dường như có ai đó đang dõi theo...",
  );
  const [previewMixPlaying, setPreviewMixPlaying] = useState<boolean>(false);
  const [previewMixLoading, setPreviewMixLoading] = useState<boolean>(false);
  const [narrationVolume, setNarrationVolume] = useState<number>(0.9);
  const [bgmOverlayVolume, setBgmOverlayVolume] = useState<number>(0.25);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const showToast = (text: string, type: "success" | "error" | "info" = "info") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  // Fetch History and Model Status on mount
  useEffect(() => {
    fetchHistory();
    fetchModelStatus();
  }, []);

  // Poll model status when any model is downloading
  useEffect(() => {
    const isAnyDownloading = systemStatus?.models.some(
      (m) => m.status === "downloading",
    );
    if (!isAnyDownloading) return;

    const interval = setInterval(() => {
      fetchModelStatus(true);
    }, 1500);

    return () => clearInterval(interval);
  }, [systemStatus]);

  const fetchModelStatus = async (silent = false) => {
    try {
      const res = await fetch("/api/bgm/models/status");
      const data = await res.json();
      if (data.success) {
        setSystemStatus({
          ramTotalMb: data.ramTotalMb,
          ramFreeMb: data.ramFreeMb,
          ramFreePercent: data.ramFreePercent,
          models: data.models,
        });
      }
    } catch (e) {
      if (!silent) console.error("Failed to load BGM model status:", e);
    }
  };

  const handleStartDownload = async (modelId: string) => {
    try {
      setActionInProgressModelId(modelId);
      const res = await fetch(`/api/bgm/models/${modelId}/download`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          "Bắt đầu tải mô hình AI theo yêu cầu. Bạn có thể theo dõi tiến trình trực tiếp.",
          "info",
        );
        fetchModelStatus();
      } else {
        showToast(data.message || data.error || "Không thể tải mô hình.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Lỗi kết nối khi tải model.", "error");
    } finally {
      setActionInProgressModelId(null);
    }
  };

  const handleCancelDownload = async (modelId: string) => {
    try {
      setActionInProgressModelId(modelId);
      const res = await fetch(`/api/bgm/models/${modelId}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        showToast("Đã hủy quá trình tải mô hình.", "info");
        fetchModelStatus();
      }
    } catch (err: any) {
      showToast(err.message || "Lỗi khi hủy tải model.", "error");
    } finally {
      setActionInProgressModelId(null);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (
      !confirm(
        "Bạn có chắc muốn xóa file model này khỏi máy để giải phóng dung lượng ổ cứng? Khi cần bạn vẫn có thể bấm tải lại bất cứ lúc nào.",
      )
    )
      return;

    try {
      setActionInProgressModelId(modelId);
      const res = await fetch(`/api/bgm/models/${modelId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        showToast("Đã xóa mô hình và giải phóng dung lượng ổ cứng.", "success");
        fetchModelStatus();
      }
    } catch (err: any) {
      showToast(err.message || "Lỗi khi xóa model.", "error");
    } finally {
      setActionInProgressModelId(null);
    }
  };

  const fetchHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const res = await fetch("/api/bgm/history");
      const data = await res.json();
      if (data.success && Array.isArray(data.tracks)) {
        setHistory(data.tracks);
        if (data.tracks.length > 0 && !activeTrack) {
          setActiveTrack(data.tracks[0]);
        }
      }
    } catch (e) {
      console.error("Failed to load BGM history:", e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Audio Playback Listener
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setTrackDuration(audio.duration || activeTrack?.duration || 30);
    };

    const handleEnded = () => {
      if (loopPlayback) {
        audio.currentTime = 0;
        audio.play().catch((error: unknown) => {
          setIsPlaying(false);
          const detail = error instanceof Error ? `: ${error.message}` : "";
          showToast(`Không thể phát lặp audio${detail}`, "error");
        });
      } else {
        setIsPlaying(false);
      }
    };

    const handleAudioError = () => {
      setIsPlaying(false);
      showToast(
        audio.error?.message
          ? `Không thể tải hoặc giải mã audio: ${audio.error.message}`
          : "Không thể tải hoặc giải mã tệp audio.",
        "error",
      );
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleAudioError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleAudioError);
    };
  }, [activeTrack, loopPlayback]);

  // Audio Visualizer Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let step = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barCount = 48;
      const barWidth = width / barCount - 2;

      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + 2);
        let barHeight = 6;
        if (isPlaying) {
          const wave = Math.sin(step * 0.08 + i * 0.3) * 0.5 + 0.5;
          const wave2 = Math.cos(step * 0.12 - i * 0.2) * 0.5 + 0.5;
          barHeight = 6 + wave * wave2 * (height - 12) * (volume || 0.8);
        }

        const y = height / 2 - barHeight / 2;

        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (selectedMood === "horror") {
          grad.addColorStop(0, "#c084fc");
          grad.addColorStop(1, "#581c87");
        } else if (selectedMood === "nature") {
          grad.addColorStop(0, "#22d3ee");
          grad.addColorStop(1, "#0891b2");
        } else if (selectedMood === "ancient") {
          grad.addColorStop(0, "#34d399");
          grad.addColorStop(1, "#059669");
        } else {
          grad.addColorStop(0, "#fbbf24");
          grad.addColorStop(1, "#d97706");
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      step++;
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, selectedMood, volume]);

  const handleSelectMood = (preset: BgmMoodPreset) => {
    setSelectedMood(preset.id);
    setElements((prev) => ({
      ...prev,
      ...preset.defaultElements,
    }));
    // Suggest first prompt if prompt is empty or belongs to other mood
    if (!prompt.trim() || PRESET_MOODS.some((m) => m.samplePrompts.includes(prompt))) {
      setPrompt(preset.samplePrompts[0]);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast("Vui lòng nhập mô tả âm thanh nền bạn muốn tạo.", "error");
      return;
    }

    // Check if neural model is selected but not ready
    if (engine === "neural") {
      const currentModel = systemStatus?.models.find((m) => m.id === selectedModelId);
      if (currentModel?.status !== "ready") {
        setShowModelManager(true);
        showToast(
          `Mô hình "${currentModel?.name || selectedModelId}" chưa được tải về máy. Hãy bấm nút "Tải Model" bên dưới, hoặc chuyển sang chế độ "Bộ Tổng Hợp Siêu Tốc".`,
          "error",
        );
        return;
      }
    }

    try {
      setIsGenerating(true);
      setGenerationProgress({
        percent: 0,
        stage: "queued",
        message: "Đang gửi yêu cầu tạo nhạc...",
      });
      showToast(
        engine === "neural"
          ? `Đang chuẩn bị tạo audio bằng ${selectedModelId === "audioldm-soundscape" ? "AudioLDM" : "MusicGen"}...`
          : "Đang tạo nhạc nền loop 100% offline bằng Bộ Tổng Hợp Siêu Tốc...",
        "info",
      );

      const res = await fetch("/api/bgm/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          mood: selectedMood,
          duration,
          loop: isLoop,
          crossfadeSec: 1.5,
          intensity,
          format,
          elements,
          engine,
          modelId: selectedModelId,
          cpuThreads,
        }),
      });

      const responseText = await res.text();
      let data: { success?: boolean; jobId?: string; error?: string };
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          responseText.trim() || `Máy chủ trả về lỗi HTTP ${res.status}.`,
        );
      }

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || `Không thể tạo nhạc nền (HTTP ${res.status}).`,
        );
      }

      if (!data.jobId) {
        throw new Error("Máy chủ không trả về mã tiến trình tạo nhạc.");
      }

      let completedTrack: BgmTrack | undefined;
      while (!completedTrack) {
        const statusResponse = await fetch(
          `/api/bgm/generate/${encodeURIComponent(data.jobId)}`,
        );
        const statusText = await statusResponse.text();
        let statusData: {
          success?: boolean;
          error?: string;
          job?: {
            status: "queued" | "running" | "completed" | "failed";
            progress: { percent: number; stage: string; message: string };
            track?: BgmTrack;
            error?: string;
          };
        };
        try {
          statusData = JSON.parse(statusText);
        } catch {
          throw new Error(
            statusText.trim() ||
              `Không đọc được tiến trình tạo nhạc (HTTP ${statusResponse.status}).`,
          );
        }
        if (!statusResponse.ok || !statusData.success || !statusData.job) {
          throw new Error(
            statusData.error ||
              `Không thể kiểm tra tiến trình tạo nhạc (HTTP ${statusResponse.status}).`,
          );
        }

        const job = statusData.job;
        setGenerationProgress(job.progress);
        if (job.status === "failed") {
          throw new Error(job.error || job.progress.message || "Tạo nhạc thất bại.");
        }
        if (job.status === "completed") {
          if (!job.track) {
            throw new Error("Tiến trình báo hoàn tất nhưng không trả về tệp nhạc.");
          }
          completedTrack = job.track;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 750));
      }

      const newTrack = completedTrack;
      setActiveTrack(newTrack);
      setHistory((prev) => [newTrack, ...prev.filter((t) => t.id !== newTrack.id)]);

      // Auto play the generated track
      if (audioRef.current) {
        setIsPlaying(false);
        audioRef.current.src = newTrack.audioUrl;
        audioRef.current.volume = volume;
        audioRef.current.loop = loopPlayback;
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (error) {
          const detail =
            error instanceof Error ? ` (${error.message})` : "";
          showToast(
            `Đã tạo nhạc nhưng không thể tự phát audio${detail}. Hãy bấm nút Phát để thử lại.`,
            "error",
          );
          return;
        }
      }

      showToast(
        `Đã tạo thành công "${newTrack.title}" (${newTrack.duration}s loop)!`,
        "success",
      );
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Lỗi trong quá trình tạo nhạc.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTogglePlay = (track?: BgmTrack) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (track && track.id !== activeTrack?.id) {
      setActiveTrack(track);
      setIsPlaying(false);
      audio.src = track.audioUrl;
      audio.volume = isMuted ? 0 : volume;
      audio.loop = loopPlayback;
      audio.play()
        .then(() => setIsPlaying(true))
        .catch((error: unknown) => {
          const detail = error instanceof Error ? `: ${error.message}` : "";
          showToast(`Không thể phát audio${detail}`, "error");
        });
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.volume = isMuted ? 0 : volume;
      audio.loop = loopPlayback;
      audio.play()
        .then(() => setIsPlaying(true))
        .catch((error: unknown) => {
          const detail = error instanceof Error ? `: ${error.message}` : "";
          showToast(`Không thể phát audio${detail}`, "error");
        });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : newVol;
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.volume = nextMuted ? 0 : volume;
    }
  };

  const handleDeleteTrack = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa bản nhạc nền này?")) return;
    try {
      const res = await fetch(`/api/bgm/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setHistory((prev) => prev.filter((t) => t.id !== id));
        if (activeTrack?.id === id) {
          if (audioRef.current) audioRef.current.pause();
          setIsPlaying(false);
          setActiveTrack(null);
        }
        showToast("Đã xóa bản nhạc thành công.", "info");
      }
    } catch {
      showToast("Lỗi khi xóa bản nhạc.", "error");
    }
  };

  const handleCopyPrompt = (p: string, id: string) => {
    navigator.clipboard.writeText(p);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast("Đã sao chép prompt vào bộ nhớ tạm.", "info");
  };

  const handleToggleElement = (key: keyof BgmElements) => {
    setElements((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Preview Narration Mix (TTS Voice + BGM)
  const handleTestNarrationMix = async () => {
    if (!activeTrack) {
      showToast("Vui lòng chọn hoặc tạo 1 bản nhạc nền trước khi test mix.", "error");
      return;
    }

    if (previewMixPlaying) {
      if (voiceAudioRef.current) voiceAudioRef.current.pause();
      setPreviewMixPlaying(false);
      return;
    }

    try {
      setPreviewMixLoading(true);

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: previewNarrationText.trim(),
          modelId: previewVoiceModelId,
          speakerId: previewVoiceSpeakerId,
          speed: 1.0,
          quality: "high",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể tạo giọng đọc thử nghiệm.");
      }

      if (voiceAudioRef.current && audioRef.current) {
        voiceAudioRef.current.src = data.audioUrl;
        voiceAudioRef.current.volume = narrationVolume;

        // Play BGM underneath with lower volume
        audioRef.current.src = activeTrack.audioUrl;
        audioRef.current.volume = bgmOverlayVolume;
        audioRef.current.loop = true;
        await audioRef.current.play();

        // Play voice
        await voiceAudioRef.current.play();
        setPreviewMixPlaying(true);

        voiceAudioRef.current.onended = () => {
          setPreviewMixPlaying(false);
          // Restore normal volume on BGM
          if (audioRef.current) audioRef.current.volume = volume;
        };
      }
    } catch (e: any) {
      showToast(e.message || "Lỗi khi chạy thử lồng tiếng.", "error");
    } finally {
      setPreviewMixLoading(false);
    }
  };

  const formatSec = (sec: number) => {
    if (isNaN(sec) || sec < 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const activeModel = systemStatus?.models.find((m) => m.id === selectedModelId);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-24 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl border text-xs sm:text-sm font-semibold flex items-center gap-2.5 transition-all transform animate-in fade-in slide-in-from-bottom-4 ${
            toastMessage.type === "success"
              ? "bg-emerald-950/90 text-emerald-200 border-emerald-700/80 shadow-emerald-900/30"
              : toastMessage.type === "error"
                ? "bg-rose-950/90 text-rose-200 border-rose-700/80 shadow-rose-900/30"
                : "bg-amber-950/90 text-amber-200 border-amber-700/80 shadow-amber-900/30"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current animate-ping" />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Hidden audio elements */}
      <audio ref={audioRef} />
      <audio ref={voiceAudioRef} />

      {/* ========================================================= */}
      {/* HEADER BANNER: TEXT-TO-AUDIO LOOP GENERATOR (100% OFFLINE)  */}
      {/* ========================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Text-to-Audio Loop Generator (100% Offline)</span>
              <span className="w-1 h-1 rounded-full bg-amber-400" />
              <span>Tối Ưu Cho CPU &amp; RAM</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
                <Music className="w-5 h-5 text-slate-950" />
              </span>
              <span>Tạo Nhạc Nền &amp; Âm Thanh Không Gian (Loop BGM)</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Mô tả âm thanh bằng văn bản tiếng Việt (như{" "}
              <em className="text-amber-300 not-italic font-medium">
                "tạo 1 âm thanh nền kinh dị cho audio kể truyện"
              </em>
              ). Tạo nhạc nền vòng lặp mượt mà (30s - 60s seamless loop) độc lập để bạn
              tải về ghép vào truyện theo ý muốn.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 self-start md:self-center shrink-0">
            {systemStatus && (
              <div className="text-xs px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  RAM Trống:{" "}
                  <strong className="text-emerald-400">
                    {(systemStatus.ramFreeMb / 1024).toFixed(1)} GB
                  </strong>{" "}
                  / {(systemStatus.ramTotalMb / 1024).toFixed(1)} GB
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowModelManager(!showModelManager)}
              className="text-xs px-3.5 py-1.5 rounded-xl bg-purple-950/50 hover:bg-purple-900/60 border border-purple-800/60 text-purple-300 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5 text-purple-400" />
              <span>Quản lý Model AI (Tải theo yêu cầu)</span>
              {showModelManager ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ON-DEMAND AI MODEL MANAGER ACCORDION / DRAWER               */}
      {/* ========================================================= */}
      {showModelManager && (
        <div className="bg-slate-900 border border-purple-900/40 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Trung Tâm Tải Model AI Theo Yêu Cầu (On-Demand Hub)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                    Không lưu sẵn trong project
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Model chỉ được tải về máy khi bạn bấm nút dưới đây. Khi không dùng có thể xóa để trả lại dung lượng ổ cứng.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => fetchModelStatus()}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              title="Làm mới trạng thái"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Model Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {systemStatus?.models.map((model) => {
              const isDownloading = model.status === "downloading";
              const isReady = model.status === "ready";
              const hasDownloadError = model.status === "error";
              const isBusy = actionInProgressModelId === model.id;

              return (
                <div
                  key={model.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isReady
                      ? "bg-slate-950/70 border-emerald-800/40 shadow-sm"
                      : isDownloading
                        ? "bg-slate-950/90 border-purple-700/60 ring-1 ring-purple-600/40"
                          : hasDownloadError
                            ? "bg-rose-950/20 border-rose-800/50"
                          : "bg-slate-950/40 border-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white">
                          {model.name}
                        </span>
                        {isReady ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Đã Sẵn Sàng</span>
                          </span>
                        ) : isDownloading ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-bold animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Đang Tải {model.downloadProgress}%</span>
                          </span>
                        ) : hasDownloadError ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold">
                            <XCircle className="w-3 h-3" />
                            <span>Tải thất bại</span>
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                            Chưa Tải ({model.sizeFormatted})
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2">
                        {model.description}
                      </p>
                      {hasDownloadError && model.error && (
                        <p className="pt-1 text-[11px] leading-relaxed text-rose-300 break-words">
                          Lỗi tải: {model.error}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="space-y-0.5">
                      <div>
                        Dung lượng: <strong className="text-slate-200">{model.sizeFormatted}</strong>
                      </div>
                      <div>
                        Yêu cầu: <span className="text-amber-400/90">{model.ramRequired}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isReady ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDeleteModel(model.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 font-medium flex items-center gap-1 transition-colors text-xs cursor-pointer"
                          title="Xóa model khỏi máy để giải phóng ổ cứng"
                        >
                          <Trash2 className="w-3 h-3 text-rose-400" />
                          <span>Xóa Giải Phóng</span>
                        </button>
                      ) : isDownloading ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleCancelDownload(model.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-950/50 hover:bg-amber-900/60 border border-amber-800/60 text-amber-300 font-medium flex items-center gap-1 transition-colors text-xs cursor-pointer"
                        >
                          <XCircle className="w-3 h-3 text-amber-400" />
                          <span>Hủy Tải</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleStartDownload(model.id)}
                          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-purple-900/30 transition-all text-xs cursor-pointer"
                        >
                          <DownloadCloud className="w-3.5 h-3.5" />
                          <span>Tải Model AI</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Download Progress Bar */}
                  {isDownloading && (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-purple-300 font-mono">
                        <span>
                          {((model.downloadedBytes || 0) / (1024 * 1024)).toFixed(1)} MB /{" "}
                          {((model.totalBytes || 1) / (1024 * 1024)).toFixed(1)} MB
                        </span>
                        <span>
                          {model.downloadSpeedMb > 0 ? `${model.downloadSpeedMb} MB/s` : "Đang kết nối..."} ({model.downloadProgress}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 transition-all duration-300 rounded-full"
                          style={{ width: `${model.downloadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2-COLUMN MAIN LAYOUT: CREATION PANEL & PLAYER/HISTORY      */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ======================================================= */}
        {/* LEFT COLUMN (7 cols): PROMPT, PRESETS & CONTROLS         */}
        {/* ======================================================= */}
        <div className="lg:col-span-7 space-y-5">
          {/* 0. Engine Selector (Procedural vs Neural AI Model) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Chọn Động Cơ Tạo Nhạc (Generation Engine)</span>
              </span>
              <span className="text-[11px] text-slate-400">
                Linh hoạt tùy cấu hình máy
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option A: Fast Procedural Synth */}
              <button
                type="button"
                onClick={() => setEngine("procedural")}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                  engine === "procedural"
                    ? "bg-amber-500/10 border-amber-500/60 ring-2 ring-amber-400/40 text-amber-200"
                    : "bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚡</span>
                    <strong className="text-xs font-bold text-white">
                      Bộ Tổng Hợp Siêu Tốc (Procedural DSP)
                    </strong>
                  </div>
                  {engine === "procedural" && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Tức thì (&lt;0.2s), <strong>0 MB tải về</strong>, tạo không gian kinh dị, u ám, mưa rào, nhịp tim và drone trầm không tốn tài nguyên.
                </p>
                <div className="mt-2 text-[10px] text-emerald-400 font-semibold">
                  ✓ Sẵn sàng ngay · Không tốn RAM
                </div>
              </button>

              {/* Option B: Neural Deep Learning Model */}
              <button
                type="button"
                onClick={() => setEngine("neural")}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                  engine === "neural"
                    ? "bg-purple-500/10 border-purple-500/60 ring-2 ring-purple-400/40 text-purple-200"
                    : "bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🧠</span>
                    <strong className="text-xs font-bold text-white">
                      Mô Hình Deep Learning AI
                    </strong>
                  </div>
                  {engine === "neural" && (
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Chọn MusicGen cho nhạc nền hoặc AudioLDM cho soundscape/âm thanh môi trường. Chạy PyTorch trên CPU; cần cài requirements-bgm.txt.
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  {activeModel?.status === "ready" ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Đã sẵn sàng trên máy
                    </span>
                  ) : activeModel?.status === "downloading" ? (
                    <span className="text-purple-300 font-semibold flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Đang tải ({activeModel.downloadProgress}%)
                    </span>
                  ) : (
                    <span className="text-amber-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Cần tải ({activeModel?.sizeFormatted || "~2.2 GiB"})
                    </span>
                  )}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowModelManager(true);
                    }}
                    className="text-purple-400 hover:underline cursor-pointer font-bold"
                  >
                    Xem Model
                  </span>
                </div>
              </button>
            </div>
            {engine === "neural" && (
              <div className="rounded-xl border border-purple-800/50 bg-purple-950/30 p-3 space-y-3">
                <p className="text-[11px] text-purple-200/80 leading-relaxed">
                  {selectedModelId === "audioldm-soundscape"
                    ? "AudioLDM S-Full-v2 tạo soundscape từ prompt (hoạt động tốt nhất với mô tả tiếng Anh). Các đoạn tối đa 10 giây được ghép thành audio dài; CPU có thể cần nhiều thời gian. Tải đầy đủ pipeline (~1.57 GiB) trước khi dùng."
                    : "MusicGen Small tạo nhạc đa nhạc cụ. Lần chạy đầu cần kết nối mạng để lấy metadata/tokenizer; sau đó các thành phần được lưu trong models/music/musicgen-small/hf_model."}
                </p>
                <div className="space-y-1.5">
                  <label
                    htmlFor="bgm-ai-model"
                    className="block text-xs font-semibold text-slate-200"
                  >
                    Mô hình AI
                  </label>
                  <select
                    id="bgm-ai-model"
                    value={selectedModelId}
                    onChange={(event) => setSelectedModelId(event.target.value)}
                    disabled={isGenerating}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 disabled:opacity-50"
                  >
                    <option value="musicgen-small">
                      Meta MusicGen Small
                      {systemStatus?.models.find((model) => model.id === "musicgen-small")?.status === "ready"
                        ? " — sẵn sàng"
                        : " — cần tải"}
                    </option>
                    <option value="audioldm-soundscape">
                      AudioLDM Soundscape
                      {systemStatus?.models.find((model) => model.id === "audioldm-soundscape")?.status === "ready"
                        ? " — sẵn sàng"
                        : " — cần tải"}
                    </option>
                  </select>
                  {activeModel?.status !== "ready" && (
                    <button
                      type="button"
                      onClick={() => setShowModelManager(true)}
                      className="text-[11px] font-semibold text-purple-300 hover:text-purple-200 hover:underline"
                    >
                      Mở quản lý model để tải {activeModel?.name || "mô hình đã chọn"}
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="bgm-cpu-threads" className="font-semibold text-slate-200">
                      Luồng CPU cho model AI
                    </label>
                    <span className="font-mono text-purple-200">
                      {cpuThreads} / {availableCpuThreads}
                    </span>
                  </div>
                  <input
                    id="bgm-cpu-threads"
                    type="range"
                    min={1}
                    max={availableCpuThreads}
                    step={1}
                    value={cpuThreads}
                    onChange={(event) => setCpuThreads(Number(event.target.value))}
                    disabled={isGenerating}
                    className="w-full accent-purple-500 disabled:opacity-50"
                  />
                  <p className="text-[10px] leading-relaxed text-slate-400">
                    Nhiều luồng hơn có thể tăng tốc nhưng cũng làm máy nóng hoặc
                    chậm các ứng dụng khác. Mặc định dùng tối đa 12 luồng để
                    chừa tài nguyên hệ thống.
                  </p>
                </div>
                <p className="text-[10px] leading-relaxed text-slate-400">
                  RAM được PyTorch tự cấp phát theo model và quá trình tạo nhạc;
                  tăng mức RAM không tự làm inference nhanh hơn. Chỉ chỉnh CPU
                  khi cần tăng tốc.
                </p>
              </div>
            )}
          </div>

          {/* 1. Prompt Input Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <label
                htmlFor="bgm-prompt-input"
                className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2"
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Mô Tả Nhạc Nền Bạn Muốn Tạo (Prompt)</span>
              </label>
              <span className="text-[11px] text-slate-400">
                {engine === "neural" && selectedModelId === "audioldm-soundscape"
                  ? "AudioLDM hoạt động tốt nhất với mô tả tiếng Anh"
                  : "Hỗ trợ tiếng Việt và tiếng Anh"}
              </span>
            </div>

            <div className="relative">
              <textarea
                id="bgm-prompt-input"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ví dụ: tạo 1 âm thanh nền kinh dị, u ám rùng rợn cho audio kể truyện ma..."
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-amber-500 rounded-2xl p-3.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none transition-all leading-relaxed shadow-inner"
              />
              {prompt && (
                <button
                  type="button"
                  onClick={() => setPrompt("")}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 text-xs px-2 py-0.5 rounded-md hover:bg-slate-800 transition-colors"
                >
                  Xóa
                </button>
              )}
            </div>

            {/* Quick Prompts Suggestions */}
            <div className="space-y-2">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                Gợi ý mẫu câu nhanh:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_MOODS.flatMap((m) => m.samplePrompts.slice(0, 1)).map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPrompt(s)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/50 hover:text-amber-300 text-slate-400 transition-colors text-left truncate max-w-full"
                    title={s}
                  >
                    💡 {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Mood & Genre Preset Cards */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Không Gian &amp; Thể Loại Âm Thanh (Mood)</span>
              </span>
              <span className="text-[11px] text-slate-400">Chọn phong cách chủ đạo</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {PRESET_MOODS.map((m) => {
                const isSelected = selectedMood === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectMood(m)}
                    className={`p-3 rounded-2xl text-left border transition-all relative overflow-hidden flex flex-col justify-between h-28 cursor-pointer ${
                      isSelected
                        ? `bg-gradient-to-b ${m.color} ring-2 ring-amber-400 shadow-lg shadow-amber-500/10`
                        : "bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-2xl">{m.icon}</span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-white leading-tight">{m.label}</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{m.tag}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Loop Length & Options */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Thời Lượng Vòng Lặp &amp; Định Dạng</span>
              </span>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{showAdvanced ? "Thu gọn lớp âm thanh" : "Tùy chỉnh lớp âm thanh"}</span>
                {showAdvanced ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Duration Buttons */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-medium">Độ dài đoạn loop:</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {[15, 30, 45, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setDuration(sec)}
                      className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                        duration === sec
                          ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20"
                          : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Loop Crossfade Toggle */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-medium">Lặp vô tận (Seamless Loop):</span>
                <button
                  type="button"
                  onClick={() => setIsLoop(!isLoop)}
                  className={`w-full py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-2 transition-all ${
                    isLoop
                      ? "bg-emerald-950/60 border-emerald-700/80 text-emerald-300"
                      : "bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isLoop ? "text-emerald-400" : ""}`} />
                  <span>{isLoop ? "Bật Seamless Loop" : "Không lặp (Một lần)"}</span>
                </button>
              </div>

              {/* Output Audio Format */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-medium">Định dạng file:</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["mp3", "wav"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setFormat(fmt)}
                      className={`py-2 text-xs font-bold uppercase rounded-xl border transition-all ${
                        format === fmt
                          ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20"
                          : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Advanced Atmospheric Layers Toggle */}
            {showAdvanced && (
              <div className="pt-4 border-t border-slate-800/80 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-amber-400" />
                    <span>Lớp Âm Hưởng Bổ Sung (Atmospheric Layers):</span>
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">Mức năng lượng:</span>
                    {(["soft", "medium", "intense"] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setIntensity(lvl)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                          intensity === lvl
                            ? "bg-amber-500 text-slate-950 font-black"
                            : "bg-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {lvl === "soft" ? "Nhẹ" : lvl === "medium" ? "Vừa" : "Mạnh"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: "drone", label: "Sub Drone (Trầm)", icon: "🔊" },
                    { key: "wind", label: "Tiếng Gió Rít", icon: "💨" },
                    { key: "rain", label: "Mưa Rơi", icon: "🌧️" },
                    { key: "thunder", label: "Sấm Rền", icon: "⚡" },
                    { key: "heartbeat", label: "Nhịp Tim Đập", icon: "💓" },
                    { key: "chimes", label: "Chuông Tiên", icon: "🔔" },
                    { key: "waves", label: "Sóng Biển", icon: "🌊" },
                    { key: "vinyl", label: "Đĩa Than (Lofi)", icon: "📻" },
                  ].map(({ key, label, icon }) => {
                    const active = elements[key as keyof BgmElements];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleToggleElement(key as keyof BgmElements)}
                        className={`py-2 px-2.5 rounded-xl text-left border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                          active
                            ? "bg-amber-950/60 border-amber-600/70 text-amber-300"
                            : "bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span>{icon}</span>
                          <span className="truncate">{label}</span>
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            active ? "bg-amber-400" : "bg-slate-800"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Generate Button */}
            <div className="pt-2">
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleGenerate}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-slate-950 font-black text-sm sm:text-base tracking-wide flex items-center justify-center gap-3 shadow-xl shadow-amber-500/20 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin text-slate-950" />
                    <span>
                      {engine === "neural"
                        ? `${selectedModelId === "audioldm-soundscape" ? "AudioLDM" : "MusicGen"} ${generationProgress.percent}%`
                        : `Đang tạo nhạc nền (${generationProgress.percent}%)`}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-slate-950" />
                    <span>
                      Tạo Nhạc Nền Bằng {engine === "neural" ? "AI Neural Model" : "Động Cơ Siêu Tốc"} ({duration}s)
                    </span>
                  </>
                )}
              </button>
              {isGenerating && (
                <div
                  className="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-slate-300">{generationProgress.message}</span>
                    <span className="shrink-0 font-mono font-bold text-purple-300">
                      {generationProgress.percent}%
                    </span>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
                    role="progressbar"
                    aria-label="Tiến trình tạo nhạc nền"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={generationProgress.percent}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-400 to-emerald-400 transition-[width] duration-500"
                      style={{ width: `${generationProgress.percent}%` }}
                    />
                  </div>
                  {engine === "neural" && (
                    <p className="text-[10px] text-slate-500">
                      {selectedModelId === "audioldm-soundscape"
                        ? "AudioLDM đang sinh soundscape từng đoạn trên CPU; thời gian phụ thuộc độ dài audio."
                        : "Suy luận MusicGen trên CPU có thể cần vài phút; phần trăm cập nhật theo số token đã sinh."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ======================================================= */}
        {/* RIGHT COLUMN (5 cols): ACTIVE PLAYER & LOOP HISTORY      */}
        {/* ======================================================= */}
        <div className="lg:col-span-5 space-y-5">
          {/* Active Audio Player Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <FileAudio className="w-4 h-4 text-purple-400" />
                <span>Trình Phát &amp; Nghe Thử Loop</span>
              </span>
              {activeTrack && (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 font-mono">
                  {activeTrack.format.toUpperCase()} · {(activeTrack.sizeBytes / 1024).toFixed(0)} KB
                </span>
              )}
            </div>

            {activeTrack ? (
              <div className="space-y-4">
                {/* Title & Prompt Details */}
                <div>
                  <h3 className="text-base font-extrabold text-white truncate flex items-center gap-2">
                    <span>{activeTrack.title}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono font-normal">
                      {activeTrack.duration}s
                    </span>
                    {activeTrack.engine === "neural" ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40">
                        🧠 Neural
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        ⚡ Fast DSP
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 italic">
                    "{activeTrack.prompt}"
                  </p>
                </div>

                {/* Live Visualizer Canvas */}
                <div className="bg-slate-950/90 border border-slate-800/80 rounded-2xl p-3 flex flex-col items-center justify-center relative overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={70}
                    className="w-full h-[70px] rounded"
                  />
                  {!isPlaying && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                      <span className="text-[11px] text-slate-400 font-semibold tracking-wide">
                        Bấm phát để xem sóng âm thanh
                      </span>
                    </div>
                  )}
                </div>

                {/* Timeline Slider */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={trackDuration || activeTrack.duration || 30}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>{formatSec(currentTime)}</span>
                    <span className="text-emerald-400 font-bold">
                      {loopPlayback ? "🔁 Seamless Loop" : "Một lần"}
                    </span>
                    <span>{formatSec(trackDuration || activeTrack.duration)}</span>
                  </div>
                </div>

                {/* Primary Player Controls */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePlay()}
                      className="w-12 h-12 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-400/20 transition-all cursor-pointer"
                      title={isPlaying ? "Tạm dừng" : "Phát"}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (audioRef.current) {
                          audioRef.current.currentTime = 0;
                          audioRef.current.play()
                            .then(() => setIsPlaying(true))
                            .catch((error: unknown) => {
                              const detail =
                                error instanceof Error ? `: ${error.message}` : "";
                              showToast(`Không thể phát lại audio${detail}`, "error");
                            });
                        }
                      }}
                      className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                      title="Phát lại từ đầu"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setLoopPlayback(!loopPlayback)}
                      className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                        loopPlayback
                          ? "bg-emerald-950/80 border-emerald-700/80 text-emerald-300"
                          : "bg-slate-800 border-slate-700 text-slate-400"
                      }`}
                      title="Chuyển đổi lặp"
                    >
                      <span>Loop</span>
                    </button>
                  </div>

                  {/* Volume Control */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      className="text-slate-400 hover:text-slate-200 transition-colors p-1"
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-4 h-4 text-rose-400" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-16 accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Download Actions */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                  <a
                    href={activeTrack.downloadUrl}
                    download
                    className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tải Về ({activeTrack.format.toUpperCase()})</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => handleCopyPrompt(activeTrack.prompt, activeTrack.id)}
                    className="py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedId === activeTrack.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>Sao chép Prompt</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Optional Voice Narration Test Mix Box */}
                <div className="mt-4 p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Thử Nghiệm Lồng Giọng Đọc Cùng Nhạc Nền:</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Test Mix</span>
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={previewVoiceModelId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPreviewVoiceModelId(val);
                          const v = voices.find((x) => x.modelId === val);
                          if (v) setPreviewVoiceSpeakerId(v.speakerId);
                        }}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                      >
                        {voices.map((v) => (
                          <option key={v.id} value={v.modelId}>
                            {v.name} ({v.tag})
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={previewMixLoading}
                        onClick={handleTestNarrationMix}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          previewMixPlaying
                            ? "bg-rose-950/80 text-rose-300 border border-rose-800/80"
                            : "bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 hover:bg-cyan-900/60"
                        }`}
                      >
                        {previewMixLoading ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Đang tổng hợp giọng...</span>
                          </>
                        ) : previewMixPlaying ? (
                          <>
                            <Pause className="w-3 h-3 fill-current" />
                            <span>Dừng Nghe Thử</span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-3 h-3 text-cyan-400" />
                            <span>Phát Thử Mix Giọng + Nhạc</span>
                          </>
                        )}
                      </button>
                    </div>

                    <input
                      type="text"
                      value={previewNarrationText}
                      onChange={(e) => setPreviewNarrationText(e.target.value)}
                      placeholder="Câu kể mẫu để test khớp giọng..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 px-4 text-center space-y-3 bg-slate-950/60 border border-dashed border-slate-800 rounded-2xl">
                <Music className="w-10 h-10 text-slate-700 mx-auto stroke-1" />
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-400">
                    Chưa có bản nhạc nền nào đang chọn
                  </div>
                  <div className="text-xs text-slate-600 max-w-xs mx-auto">
                    Hãy bấm nút "Tạo Nhạc Nền" hoặc chọn một bản từ danh sách bên dưới để nghe thử.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* History / Created Audio Library */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Thư Viện Nhạc Nền Đã Tạo ({history.length})</span>
              </span>

              <button
                type="button"
                onClick={fetchHistory}
                disabled={isLoadingHistory}
                className="text-slate-400 hover:text-slate-200 transition-colors p-1"
                title="Làm mới danh sách"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoadingHistory ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            {history.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {history.map((t) => {
                  const isCurrent = activeTrack?.id === t.id;
                  const isCurrentPlaying = isCurrent && isPlaying;
                  return (
                    <div
                      key={t.id}
                      onClick={() => handleTogglePlay(t)}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                        isCurrent
                          ? "bg-slate-800/90 border-amber-500/60 shadow-md ring-1 ring-amber-400/20"
                          : "bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePlay(t);
                          }}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                            isCurrentPlaying
                              ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          }`}
                        >
                          {isCurrentPlaying ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>

                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{t.title}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                              {t.duration}s
                            </span>
                            {t.engine === "neural" && (
                              <span className="text-[9px] px-1.5 rounded bg-purple-500/20 text-purple-300">
                                AI
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5 italic">
                            "{t.prompt}"
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={t.downloadUrl}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 text-slate-400 hover:text-amber-400 transition-colors rounded-lg hover:bg-slate-800"
                          title="Tải về máy"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTrack(t.id);
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors rounded-lg hover:bg-slate-800"
                          title="Xóa bản nhạc"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-slate-500">
                Chưa có bản nhạc nào trong lịch sử. Hãy thử nhập prompt và tạo bản đầu tiên!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
