import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  ExternalLink,
  Download,
  Copy,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Trash2,
  FileCode,
  FileJson,
  Cpu,
  RefreshCw,
  Info,
  Layers,
  ArrowRight,
  Headphones,
  Scissors,
  Mic,
  FileArchive,
  Check,
  Edit2,
  Save,
  Volume2,
  Settings,
  HardDrive,
  GitBranch,
  ShieldCheck,
  X,
} from "lucide-react";

interface SystemModelItem {
  id: string;
  name: string;
  filename: string;
  sizeMb: number;
  expectedSizeMb: number;
  isDownloaded: boolean;
  description: string;
}

interface SystemJob {
  id: string;
  type: "download_model" | "compile_whisper" | "idle";
  target?: string;
  status: "running" | "completed" | "error" | "idle";
  progressPercent: number;
  downloadedMb?: number;
  totalMb?: number;
  speedMbS?: number;
  message: string;
  logs: string[];
  error?: string;
}

interface SystemToolsStatus {
  isWhisperInstalled: boolean;
  whisperCliPath: string | null;
  modelsDir: string;
  models: SystemModelItem[];
  activeJob: SystemJob;
}

interface CustomVoiceItem {
  id: string;
  modelId: string;
  name: string;
  gender: "female" | "male" | "neutral";
  description: string;
  sampleText: string;
  onnxFile: string;
  jsonFile: string;
  fileSizeBytes?: number;
  createdAt?: string;
}

interface DatasetClip {
  id: string;
  filename: string;
  text: string;
  startMs: number;
  endMs: number;
  durationSec: number;
}

interface DatasetInfo {
  id: string;
  voiceName: string;
  createdAt: string;
  originalAudioFilename: string;
  whisperModelUsed: string;
  totalClips: number;
  totalDurationSec: number;
  clips: DatasetClip[];
}

interface WhisperModelItem {
  id: string;
  name: string;
  sizeMb: number;
  available: boolean;
}

interface VoiceClonePageProps {
  onVoiceInstalled: () => void;
}

export default function VoiceClonePage({ onVoiceInstalled }: VoiceClonePageProps) {
  const [activeTab, setActiveTab] = useState<"dataset" | "tools" | "guide" | "upload" | "manage">("dataset");

  // === SYSTEM TOOLS & MODELS STATE ===
  const [systemStatus, setSystemStatus] = useState<SystemToolsStatus | null>(null);
  const [isOperatingTools, setIsOperatingTools] = useState<boolean>(false);
  const [toolsFeedback, setToolsFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // === TAB 1: DATASET PREPARATION STATE ===
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [datasetVoiceName, setDatasetVoiceName] = useState<string>("giong_moi");
  const [whisperModel, setWhisperModel] = useState<string>("small");
  const [minDuration, setMinDuration] = useState<number>(1.0);
  const [maxDuration, setMaxDuration] = useState<number>(12.0);
  const [, setAvailableModels] = useState<WhisperModelItem[]>([]);
  const [isProcessingDataset, setIsProcessingDataset] = useState<boolean>(false);
  const [datasetFeedback, setDatasetFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Active dataset inspecting/editing
  const [currentDataset, setCurrentDataset] = useState<DatasetInfo | null>(null);
  const [savedDatasets, setSavedDatasets] = useState<DatasetInfo[]>([]);
  const [metadataDraft, setMetadataDraft] = useState<string>("");
  const [metadataSaving, setMetadataSaving] = useState<boolean>(false);
  const [metadataFeedback, setMetadataFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [editingClipText, setEditingClipText] = useState<string>("");
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const clipAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  // === TAB 3: CUSTOM VOICES UPLOAD STATE ===
  const [onnxFile, setOnnxFile] = useState<File | null>(null);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [voiceIdInput, setVoiceIdInput] = useState<string>("");
  const [voiceNameInput, setVoiceNameInput] = useState<string>("");
  const [genderInput, setGenderInput] = useState<"female" | "male">("female");
  const [descriptionInput, setDescriptionInput] = useState<string>("");
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const modelFileInputRef = useRef<HTMLInputElement | null>(null);

  // === TAB 4: MANAGE VOICES STATE ===
  const [customVoices, setCustomVoices] = useState<CustomVoiceItem[]>([]);
  const [loadingCustom, setLoadingCustom] = useState<boolean>(false);
  const [testingVoiceId, setTestingVoiceId] = useState<string | null>(null);
  const [audioTesting, setAudioTesting] = useState<boolean>(false);
  const audioTestRef = useRef<HTMLAudioElement | null>(null);

  const savedMetadata = currentDataset
    ? currentDataset.clips.map((clip) => `${clip.id}|${clip.text}`).join("\n")
    : "";
  const hasUnsavedMetadata = metadataDraft !== savedMetadata;

  // Load custom voices
  const fetchCustomVoices = async () => {
    setLoadingCustom(true);
    try {
      const res = await fetch("/api/models/custom");
      const data = await res.json();
      if (data.success && Array.isArray(data.customVoices)) {
        setCustomVoices(data.customVoices);
      }
    } catch (err) {
      console.error("Error fetching custom voices:", err);
    } finally {
      setLoadingCustom(false);
    }
  };

  // Load system tools status
  const fetchSystemToolsStatus = async () => {
    try {
      const res = await fetch("/api/system/tools-status");
      const data = await res.json();
      if (data.success) {
        setSystemStatus(data);
      }
    } catch (err) {
      console.error("Error fetching system tools status:", err);
    }
  };

  // Load datasets list and whisper models
  const fetchDatasetsAndModels = async () => {
    try {
      const [dsRes, mdRes] = await Promise.all([
        fetch("/api/dataset/list"),
        fetch("/api/dataset/models"),
      ]);
      const dsData = await dsRes.json();
      const mdData = await mdRes.json();

      if (dsData.success && Array.isArray(dsData.datasets)) {
        setSavedDatasets(dsData.datasets);
        if (dsData.datasets.length > 0 && !currentDataset) {
          setCurrentDataset(dsData.datasets[0]);
        }
      }
      if (mdData.success && Array.isArray(mdData.models)) {
        setAvailableModels(mdData.models);
      }
    } catch (err) {
      console.error("Error fetching datasets or models:", err);
    }
  };

  // Handle Dismiss active job banner
  const handleDismissJob = async () => {
    try {
      await fetch("/api/system/reset-job", { method: "POST" });
      fetchSystemToolsStatus();
    } catch {}
  };

  // Poll system tools active job if running
  useEffect(() => {
    fetchSystemToolsStatus();
    fetchDatasetsAndModels();
    fetchCustomVoices();
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (systemStatus?.activeJob && systemStatus.activeJob.status === "running") {
      interval = setInterval(() => {
        fetchSystemToolsStatus();
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [systemStatus?.activeJob?.status]);

  useEffect(() => {
    if (currentDataset) {
      setMetadataDraft(currentDataset.clips.map((clip) => `${clip.id}|${clip.text}`).join("\n"));
      setMetadataFeedback(null);
    } else {
      setMetadataDraft("");
      setMetadataFeedback(null);
    }
  }, [currentDataset]);

  // Clean voice name from audio file
  const handleDatasetAudioChosen = (file: File) => {
    setAudioFile(file);
    const rawName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    if (!datasetVoiceName || datasetVoiceName === "giong_moi") {
      setDatasetVoiceName(rawName.slice(0, 20));
    }
  };

  // Action: Download Whisper GGML model
  const handleDownloadModel = async (modelId: string) => {
    setIsOperatingTools(true);
    setToolsFeedback({
      type: "info",
      message: `Đang gửi yêu cầu tải mô hình ${modelId} về máy...`,
    });

    try {
      const res = await fetch("/api/system/download-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể tải mô hình.");
      }
      setToolsFeedback({
        type: "info",
        message: data.message || `Đang tải mô hình ${modelId}... Bạn có thể theo dõi tiến trình bên dưới.`,
      });
      fetchSystemToolsStatus();
    } catch (err: any) {
      setToolsFeedback({
        type: "error",
        message: err.message || "Lỗi khi bắt đầu tải mô hình.",
      });
    } finally {
      setIsOperatingTools(false);
    }
  };

  // Action: Compile Whisper.cpp
  const handleInitWhisper = async (forceRecompile: boolean = false) => {
    setIsOperatingTools(true);
    setToolsFeedback({
      type: "info",
      message: forceRecompile
        ? "Đang biên dịch lại Whisper.cpp..."
        : "Đang khởi tạo mã nguồn và biên dịch Whisper.cpp...",
    });

    try {
      const res = await fetch("/api/system/init-whisper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRecompile }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể biên dịch Whisper.cpp.");
      }
      setToolsFeedback({
        type: "info",
        message: data.message || "Đang tiến hành biên dịch Whisper.cpp... Tiến trình sẽ cập nhật tự động.",
      });
      fetchSystemToolsStatus();
    } catch (err: any) {
      setToolsFeedback({
        type: "error",
        message: err.message || "Lỗi khi khởi chạy biên dịch Whisper.cpp.",
      });
    } finally {
      setIsOperatingTools(false);
    }
  };

  // Action: Delete GGML model
  const handleDeleteModel = async (modelId: string, modelName: string) => {
    if (!confirm(`Bạn có chắc muốn xóa file mô hình "${modelName}" để giải phóng dung lượng?`)) return;

    try {
      const res = await fetch(`/api/system/models/${modelId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể xóa file mô hình.");
      }
      setToolsFeedback({
        type: "success",
        message: `Đã xóa file mô hình ${modelName}.`,
      });
      fetchSystemToolsStatus();
    } catch (err: any) {
      setToolsFeedback({
        type: "error",
        message: err.message || "Lỗi khi xóa file mô hình.",
      });
    }
  };

  // Submit audio for offline slicing & transcribing
  const handleStartPrepareDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile) {
      setDatasetFeedback({
        type: "error",
        message: "Vui lòng chọn một file âm thanh thu âm giọng đọc trước.",
      });
      return;
    }

    setIsProcessingDataset(true);
    setDatasetFeedback({
      type: "info",
      message: "Đang tải file âm thanh lên và bắt đầu cắt lát offline...",
    });

    try {
      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("voiceName", datasetVoiceName.trim());
      formData.append("whisperModel", whisperModel);
      formData.append("minDuration", minDuration.toString());
      formData.append("maxDuration", maxDuration.toString());

      const res = await fetch("/api/dataset/prepare", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể khởi động quá trình xử lý dataset.");
      }

      const jobId = data.jobId;
      setDatasetFeedback({
        type: "info",
        message: `Đang cắt lát và phiên âm bằng Whisper.cpp (${whisperModel}) hoàn toàn offline... Vui lòng đợi trong giây lát.`,
      });

      // Poll progress until finished
      const pollTimer = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/dataset/status/${jobId}`);
          const pollData = await pollRes.json();
          if (pollData.success && pollData.job) {
            setDatasetFeedback({
              type: "info",
              message: pollData.job.message || "Đang xử lý âm thanh...",
            });

            if (pollData.job.status === "completed") {
              clearInterval(pollTimer);
              setIsProcessingDataset(false);
              setDatasetFeedback({
                type: "success",
                message: `Cắt và phiên âm hoàn tất! Tạo được ${pollData.job.dataset.totalClips} câu (${pollData.job.dataset.totalDurationSec} giây).`,
              });
              setCurrentDataset(pollData.job.dataset);
              fetchDatasetsAndModels();
            } else if (pollData.job.status === "failed") {
              clearInterval(pollTimer);
              setIsProcessingDataset(false);
              setDatasetFeedback({
                type: "error",
                message: pollData.job.error || "Quá trình xử lý âm thanh thất bại.",
              });
            }
          }
        } catch {
          // ignore transient poll error
        }
      }, 1500);
    } catch (err: any) {
      setDatasetFeedback({
        type: "error",
        message: err.message || "Lỗi khi chạy Whisper.cpp trên máy chủ.",
      });
      setIsProcessingDataset(false);
    }
  };

  // Play clip preview
  const handlePlayClip = (clip: DatasetClip) => {
    if (!currentDataset) return;

    if (playingClipId === clip.id) {
      if (clipAudioRef.current) clipAudioRef.current.pause();
      setPlayingClipId(null);
      return;
    }

    setPlayingClipId(clip.id);
    const audioUrl = `/api/dataset/${currentDataset.id}/audio/${clip.filename}`;
    if (!clipAudioRef.current) {
      clipAudioRef.current = new Audio();
    }
    clipAudioRef.current.src = audioUrl;
    clipAudioRef.current.onended = () => {
      setPlayingClipId(null);
    };
    clipAudioRef.current.play().catch((err) => {
      console.error("Lỗi phát audio:", err);
      setPlayingClipId(null);
    });
  };

  // Update text of a clip
  const handleSaveClipText = async (clipId: string) => {
    if (!currentDataset) return;
    try {
      const res = await fetch(`/api/dataset/${currentDataset.id}/clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId, text: editingClipText }),
      });
      const data = await res.json();
      if (data.success && data.dataset) {
        setCurrentDataset(data.dataset);
        setEditingClipId(null);
      }
    } catch {
      alert("Lỗi khi lưu văn bản câu thoại.");
    }
  };

  const handleReloadMetadata = () => {
    setMetadataDraft(savedMetadata);
    setMetadataFeedback({ type: "info", message: "Đã nạp lại metadata đang lưu." });
  };

  const handleCopyMetadata = async () => {
    try {
      await navigator.clipboard.writeText(savedMetadata);
      setMetadataFeedback({
        type: "success",
        message: "Đã sao chép metadata hiện tại. Bạn có thể gửi nội dung này cho AI để chỉnh sửa.",
      });
    } catch (err) {
      setMetadataFeedback({
        type: "error",
        message: err instanceof Error
          ? `Không thể sao chép metadata: ${err.message}`
          : "Không thể sao chép metadata. Hãy chọn và copy nội dung trong ô bên dưới.",
      });
    }
  };

  const handleSaveMetadata = async () => {
    if (!currentDataset || metadataSaving) return;

    setMetadataSaving(true);
    setMetadataFeedback(null);
    try {
      const res = await fetch(`/api/dataset/${encodeURIComponent(currentDataset.id)}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: metadataDraft }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.dataset) {
        throw new Error(data.error || "Không thể lưu metadata.");
      }

      setCurrentDataset(data.dataset);
      setSavedDatasets((prev) =>
        prev.map((dataset) => dataset.id === data.dataset.id ? data.dataset : dataset)
      );
      setMetadataDraft(data.dataset.clips.map((clip: DatasetClip) => `${clip.id}|${clip.text}`).join("\n"));
      setMetadataFeedback({
        type: "success",
        message: `Đã lưu metadata cho ${data.dataset.totalClips} câu. ID và các file audio được giữ nguyên.`,
      });
    } catch (err) {
      setMetadataFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Lỗi không xác định khi lưu metadata.",
      });
    } finally {
      setMetadataSaving(false);
    }
  };

  // Delete clip
  const handleDeleteClip = async (clipId: string) => {
    if (!currentDataset) return;
    if (!confirm("Bạn có chắc muốn xóa câu thoại này khỏi bộ dữ liệu?")) return;

    try {
      const res = await fetch(`/api/dataset/${currentDataset.id}/clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId, shouldDelete: true }),
      });
      const data = await res.json();
      if (data.success && data.dataset) {
        setCurrentDataset(data.dataset);
      }
    } catch {
      alert("Lỗi khi xóa câu thoại.");
    }
  };

  // Delete dataset
  const handleDeleteDataset = async (datasetId: string) => {
    if (!confirm("Bạn có chắc muốn xóa toàn bộ bộ dữ liệu này?")) return;
    try {
      await fetch(`/api/dataset/${datasetId}`, { method: "DELETE" });
      setSavedDatasets((prev) => prev.filter((d) => d.id !== datasetId));
      if (currentDataset?.id === datasetId) {
        setCurrentDataset(null);
      }
    } catch {
      alert("Lỗi khi xóa dataset.");
    }
  };

  // Upload ONNX and JSON
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onnxFile || !jsonFile) {
      setUploadFeedback({
        type: "error",
        message: "Vui lòng chọn cả 2 file: .onnx và .onnx.json xuất từ Google Colab.",
      });
      return;
    }

    const cleanId = voiceIdInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    if (!cleanId) {
      setUploadFeedback({
        type: "error",
        message: "Vui lòng nhập mã định danh giọng nói.",
      });
      return;
    }

    setUploading(true);
    setUploadFeedback(null);

    try {
      const jsonText = await jsonFile.text();
      const reader = new FileReader();
      const onnxBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] || result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(onnxFile);
      });

      const res = await fetch("/api/models/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: cleanId,
          name: voiceNameInput.trim() || cleanId,
          gender: genderInput,
          description: descriptionInput.trim(),
          onnxBase64,
          jsonContent: jsonText,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể nạp giọng mới vào hệ thống.");
      }

      setUploadFeedback({
        type: "success",
        message: `Đã nạp thành công giọng "${data.voice.name}"! Giọng đã sẵn sàng trong tất cả các tính năng.`,
      });

      setOnnxFile(null);
      setJsonFile(null);
      setVoiceIdInput("");
      setVoiceNameInput("");
      setDescriptionInput("");

      onVoiceInstalled();
      fetchCustomVoices();
      setActiveTab("manage");
    } catch (err: any) {
      setUploadFeedback({
        type: "error",
        message: err.message || "Lỗi khi tải file mô hình lên máy chủ.",
      });
    } finally {
      setUploading(false);
    }
  };

  // Test synthesize sample for custom voice
  const handleTestVoice = async (voice: CustomVoiceItem) => {
    if (testingVoiceId === voice.id && audioTesting) {
      if (audioTestRef.current) audioTestRef.current.pause();
      setTestingVoiceId(null);
      setAudioTesting(false);
      return;
    }

    setTestingVoiceId(voice.id);
    setAudioTesting(true);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: voice.sampleText || "Xin chào! Đây là giọng đọc tùy chỉnh được huấn luyện qua Piper VITS trên Google Colab.",
          model: voice.modelId,
          speed: 1.0,
          format: "mp3",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể phát âm thử giọng này.");
      }

      const audioSrc = `data:${data.mimeType};base64,${data.audioBase64}`;
      if (!audioTestRef.current) {
        audioTestRef.current = new Audio();
      }
      audioTestRef.current.src = audioSrc;
      audioTestRef.current.onended = () => {
        setTestingVoiceId(null);
        setAudioTesting(false);
      };
      await audioTestRef.current.play();
    } catch (err: any) {
      alert(`Lỗi phát thử: ${err.message}`);
      setTestingVoiceId(null);
      setAudioTesting(false);
    }
  };

  // Delete custom voice
  const handleDeleteVoice = async (id: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa giọng đọc "${name}" khỏi máy chủ?`)) return;

    try {
      const res = await fetch(`/api/models/custom/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể xóa giọng.");
      }
      fetchCustomVoices();
      onVoiceInstalled();
    } catch (err: any) {
      alert(`Lỗi khi xóa: ${err.message}`);
    }
  };

  return (
    <div className="w-full max-w-[1680px] mx-auto px-3 sm:px-6 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/25 shrink-0">
            <Sparkles className="w-6 h-6 text-slate-950 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Huấn Luyện & Clone Giọng Nói
              </h2>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Whisper.cpp Offline + Colab GPU
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
              Xử lý âm thanh và chỉnh sửa văn bản offline 100% tại chỗ ➔ Huấn luyện VITS trên Colab trong vài phút ➔ Nạp file ONNX
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto shrink-0">
          <a
            href="https://colab.research.google.com/#create=true"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-amber-400" />
            <span>Mở Google Colab</span>
          </a>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center px-2 border-b border-slate-800 bg-slate-950/40 rounded-2xl p-1 gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("dataset")}
          className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === "dataset"
              ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
              : "text-slate-400 hover:text-white hover:bg-slate-900/60"
          }`}
        >
          <Scissors className="w-4 h-4" />
          <span>1. Chuẩn Bị Dữ Liệu Offline</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("tools");
            fetchSystemToolsStatus();
          }}
          className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === "tools"
              ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
              : "text-slate-400 hover:text-white hover:bg-slate-900/60"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Quản Lý Công Cụ & Models (Hệ Thống)</span>
          {systemStatus?.activeJob?.status === "running" ? (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          ) : systemStatus && (!systemStatus.isWhisperInstalled || !systemStatus.models.some((m) => m.isDownloaded)) ? (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Init
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("guide")}
          className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === "guide"
              ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
              : "text-slate-400 hover:text-white hover:bg-slate-900/60"
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>2. Huấn Luyện (Google Colab 1-Click)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("upload")}
          className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === "upload"
              ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
              : "text-slate-400 hover:text-white hover:bg-slate-900/60"
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>3. Nạp Giọng Vào Hệ Thống (.onnx)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("manage");
            fetchCustomVoices();
          }}
          className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === "manage"
              ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
              : "text-slate-400 hover:text-white hover:bg-slate-900/60"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>4. Giọng Đã Cài ({customVoices.length})</span>
        </button>
      </div>

      {/* Universal Active Job Progress Card (Visible in all tabs) */}
      {systemStatus?.activeJob && systemStatus.activeJob.status !== "idle" && (
        <div
          className={`p-4 rounded-2xl border transition-all ${
            systemStatus.activeJob.status === "running"
              ? "bg-sky-950/70 border-sky-500/50 shadow-xl shadow-sky-500/15"
              : systemStatus.activeJob.status === "completed"
              ? "bg-emerald-950/60 border-emerald-500/40 shadow-xl shadow-emerald-500/10"
              : "bg-red-950/60 border-red-500/40"
          }`}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5">
              {systemStatus.activeJob.status === "running" ? (
                <RefreshCw className="w-5 h-5 text-sky-400 animate-spin" />
              ) : systemStatus.activeJob.status === "completed" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              )}
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  {systemStatus.activeJob.type === "compile_whisper"
                    ? "Biên Dịch Whisper.cpp (whisper-cli)"
                    : "Tải Mô Hình Whisper AI"}
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                      systemStatus.activeJob.status === "running"
                        ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse"
                        : systemStatus.activeJob.status === "completed"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-red-500/20 text-red-300 border border-red-500/30"
                    }`}
                  >
                    {systemStatus.activeJob.status === "running"
                      ? `Tiến trình: ${systemStatus.activeJob.progressPercent}%`
                      : systemStatus.activeJob.status === "completed"
                      ? "Hoàn tất 100%"
                      : "Gặp lỗi"}
                  </span>
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5 font-medium">
                  {systemStatus.activeJob.message}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold font-mono text-sky-300">
                {systemStatus.activeJob.progressPercent}%
              </span>
              {systemStatus.activeJob.status !== "running" && (
                <button
                  type="button"
                  onClick={handleDismissJob}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Ẩn thông báo này"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/60 mb-2">
            <div
              className={`h-full transition-all duration-300 ${
                systemStatus.activeJob.status === "running"
                  ? "bg-gradient-to-r from-sky-500 to-indigo-500"
                  : systemStatus.activeJob.status === "completed"
                  ? "bg-emerald-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${systemStatus.activeJob.progressPercent}%` }}
            />
          </div>

          {systemStatus.activeJob.logs && systemStatus.activeJob.logs.length > 0 && (
            <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/80 max-h-24 overflow-y-auto font-mono text-[10px] text-slate-400 space-y-0.5">
              {systemStatus.activeJob.logs.slice(-5).map((log, i) => (
                <p key={i} className="truncate">
                  {log}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 1: OFFLINE DATASET PREPARATION                             */}
      {/* Chia làm 2 cột:                                                */}
      {/* - Cột nhỏ bên trái: Upload audio, settings, nút bắt đầu        */}
      {/* - Cột bên phải: Dữ liệu âm thanh sau khi cắt và phiên âm xong  */}
      {/* ============================================================== */}
      {activeTab === "dataset" && (
        <div className="space-y-6">
          {/* Highlight Info Box */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-white">
                Xử Lý Hoàn Toàn Offline Trên Máy Này (Không Lo Chờ Biên Dịch Trên Colab):
              </div>
              <p>
                Whisper.cpp được tích hợp sẵn trực tiếp trong hệ thống TTS. Bạn chỉ cần tải file thu âm (MP3, WAV, M4A) lên, máy tính sẽ tự động cắt chuẩn 22,050Hz Mono PCM và phiên âm tiếng Việt. Bạn có thể nghe thử từng câu và chỉnh sửa câu chữ ngay tại đây trước khi xuất gói <code>.zip</code> để đưa lên Colab huấn luyện.
              </p>
            </div>
          </div>

          {/* System Tools Check Banner */}
          {systemStatus && !systemStatus.isWhisperInstalled && (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/10 animate-pulse">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-white">Chưa khởi tạo bộ thực thi Whisper.cpp trên hệ thống</h4>
                  <p className="text-[11px] text-slate-300">
                    Hệ thống cần biên dịch <code>whisper-cli</code> để xử lý âm thanh offline. Toàn bộ file này được loại trừ khỏi Git để giữ dự án siêu nhẹ.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleInitWhisper(false)}
                disabled={isOperatingTools || systemStatus?.activeJob?.status === "running"}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shrink-0 transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isOperatingTools ? "animate-spin" : ""}`} />
                <span>Khởi Tạo 1-Click Ngay</span>
              </button>
            </div>
          )}

          {/* 2-COLUMN MAIN WORKSPACE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ============================================================== */}
            {/* CỘT NHỎ BÊN TRÁI: Thêm file âm thanh, settings, nút bắt đầu     */}
            {/* ============================================================== */}
            <div className="lg:col-span-4 xl:col-span-4 space-y-4">
              <form onSubmit={handleStartPrepareDataset} className="space-y-4">
                {/* 1. File Upload Box */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 shadow-md">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Mic className="w-4 h-4 text-amber-400" />
                      <span>File Âm Thanh Thu Âm</span>
                    </label>
                    {audioFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setAudioFile(null);
                          if (audioInputRef.current) audioInputRef.current.value = "";
                        }}
                        className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center gap-0.5 transition-colors cursor-pointer"
                        title="Bỏ chọn file hiện tại"
                      >
                        <X className="w-3 h-3" />
                        <span>Hủy</span>
                      </button>
                    )}
                  </div>

                  <div
                    onClick={() => audioInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700/80 hover:border-amber-500/60 bg-slate-900/60 hover:bg-slate-900/90 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all"
                  >
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleDatasetAudioChosen(e.target.files[0]);
                        }
                      }}
                    />
                    {audioFile ? (
                      <div className="space-y-1 text-center">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                        <p className="text-xs font-bold text-white truncate max-w-[220px]">
                          {audioFile.name}
                        </p>
                        <p className="text-[11px] text-amber-300 font-mono">
                          {(audioFile.size / (1024 * 1024)).toFixed(2)} MB • Sẵn sàng
                        </p>
                        <span className="text-[10px] text-slate-400 underline block pt-1">
                          Bấm để chọn file khác
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto">
                          <UploadCloud className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-semibold text-slate-200">
                          Chọn file hoặc kéo thả
                        </p>
                        <p className="text-[10px] text-slate-400">
                          MP3, WAV, M4A, FLAC (3 - 15 phút)
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Settings Box */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3.5 shadow-md">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5 pb-1 border-b border-slate-800">
                    <Settings className="w-4 h-4 text-sky-400" />
                    <span>Cấu Hình Tách & Phiên Âm</span>
                  </div>

                  {/* Voice Name / Voice ID */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Tên Giọng / Voice ID:
                    </label>
                    <input
                      type="text"
                      value={datasetVoiceName}
                      onChange={(e) => setDatasetVoiceName(e.target.value)}
                      placeholder="VD: hoang_nam, lan_anh"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono"
                      required
                    />
                  </div>

                  {/* Whisper Model Select */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-300">
                        Mô hình Whisper AI:
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("tools");
                          fetchSystemToolsStatus();
                        }}
                        className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Quản lý</span>
                      </button>
                    </div>
                    <select
                      value={whisperModel}
                      onChange={(e) => setWhisperModel(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    >
                      {systemStatus?.models ? (
                        systemStatus.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.isDownloaded ? `✓ ${m.sizeMb}MB` : `✗ Chưa tải`})
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="small">Whisper Small (460MB - Khuyên dùng)</option>
                          <option value="base">Whisper Base (140MB - Nhanh)</option>
                          <option value="large-v3-turbo">Whisper Large-v3-turbo (1.5GB - Tối tân)</option>
                          <option value="medium">Whisper Medium (1.5GB)</option>
                        </>
                      )}
                    </select>
                    {systemStatus && !systemStatus.models.find((m) => m.id === whisperModel)?.isDownloaded && (
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                        <span>Chưa có file mô hình này.</span>
                        <button
                          type="button"
                          onClick={() => handleDownloadModel(whisperModel)}
                          disabled={isOperatingTools || systemStatus?.activeJob?.status === "running"}
                          className="font-bold underline hover:text-amber-300 cursor-pointer"
                        >
                          Tải về ngay
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Min / Max Durations */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Độ dài tối thiểu:
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="5"
                          value={minDuration}
                          onChange={(e) => setMinDuration(parseFloat(e.target.value) || 1.0)}
                          className="w-full pl-2.5 pr-6 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                        />
                        <span className="absolute right-2 top-1.5 text-[10px] text-slate-500">s</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Độ dài tối đa:
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          min="5"
                          max="20"
                          value={maxDuration}
                          onChange={(e) => setMaxDuration(parseFloat(e.target.value) || 12.0)}
                          className="w-full pl-2.5 pr-6 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                        />
                        <span className="absolute right-2 top-1.5 text-[10px] text-slate-500">s</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Nút Bắt Đầu Action Button */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 shadow-md">
                  <button
                    type="submit"
                    disabled={isProcessingDataset || !audioFile}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-black transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isProcessingDataset ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                        <span>Đang Cắt & Phiên Âm Offline...</span>
                      </>
                    ) : (
                      <>
                        <Scissors className="w-4 h-4 fill-current" />
                        <span>Bắt Đầu Cắt & Phiên Âm Offline</span>
                      </>
                    )}
                  </button>

                  {datasetFeedback && (
                    <div
                      className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                        datasetFeedback.type === "success"
                          ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                          : datasetFeedback.type === "error"
                          ? "bg-red-500/15 border border-red-500/30 text-red-300"
                          : "bg-amber-500/15 border border-amber-500/30 text-amber-300 animate-pulse"
                      }`}
                    >
                      {datasetFeedback.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                      {datasetFeedback.type === "error" && <AlertTriangle className="w-4 h-4 shrink-0" />}
                      {datasetFeedback.type === "info" && <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />}
                      <span className="leading-tight">{datasetFeedback.message}</span>
                    </div>
                  )}
                </div>

                {/* 4. Switch Saved Datasets */}
                {savedDatasets.length > 0 && (
                  <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/80 space-y-2.5 shadow-md">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <FileArchive className="w-3.5 h-3.5 text-amber-400" />
                        <span>Bộ Dữ Liệu Đã Lưu ({savedDatasets.length})</span>
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {savedDatasets.map((ds) => (
                        <div
                          key={ds.id}
                          onClick={() => setCurrentDataset(ds)}
                          className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                            currentDataset?.id === ds.id
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
                              : "bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900 hover:border-slate-700"
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-bold truncate">{ds.voiceName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {ds.totalClips} câu • {ds.totalDurationSec}s
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {currentDataset?.id === ds.id && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950">
                                Đang xem
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDataset(ds.id);
                              }}
                              className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors cursor-pointer"
                              title="Xóa bộ dữ liệu này"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* ============================================================== */}
            {/* CỘT LỚN BÊN PHẢI: Dữ liệu âm thanh sau khi cắt và phiên âm      */}
            {/* ============================================================== */}
            <div className="lg:col-span-8 xl:col-span-8 space-y-4">
              {currentDataset ? (
                <div className="space-y-4">
                  {/* Header Bar của Dataset hiện tại */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <FileArchive className="w-5 h-5 text-amber-400" />
                          <span>{currentDataset.voiceName}</span>
                        </h3>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          {currentDataset.totalClips} câu đã cắt
                        </span>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          {currentDataset.totalDurationSec}s âm thanh
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        File gốc: <span className="text-slate-300 font-medium">{currentDataset.originalAudioFilename}</span> • Mô hình: <span className="text-slate-300 font-mono">{currentDataset.whisperModelUsed}</span>
                      </p>
                    </div>

                    <a
                      href={`/api/dataset/${currentDataset.id}/export-zip`}
                      download={`${currentDataset.id}_dataset.zip`}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 shrink-0 whitespace-nowrap cursor-pointer"
                      title="Tải tệp .zip chứa wavs/ và metadata.csv để đưa lên Colab"
                    >
                      <Download className="w-4 h-4" />
                      <span>Tải Gói Dataset (.zip) Lên Colab</span>
                    </a>
                  </div>

                  {/* Sliced Audio Clips Table */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <Headphones className="w-4 h-4 text-amber-400" />
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                          Danh Sách Câu Thoại Sau Khi Cắt ({currentDataset.clips.length} câu)
                        </h4>
                      </div>
                      <span className="text-[11px] text-slate-400 hidden sm:inline">
                        Nhấp vào văn bản để chỉnh sửa câu chữ phiên âm
                      </span>
                    </div>

                    <div className="overflow-x-auto max-h-[460px] rounded-xl border border-slate-800/90">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-900/95 text-slate-400 sticky top-0 z-10 backdrop-blur-md">
                          <tr>
                            <th className="py-2.5 px-3 w-14 text-center">Nghe</th>
                            <th className="py-2.5 px-3 w-24">Mã Clip</th>
                            <th className="py-2.5 px-3 w-20">Thời lượng</th>
                            <th className="py-2.5 px-3">Văn Bản Tiếng Việt (Bấm Để Sửa)</th>
                            <th className="py-2.5 px-3 w-14 text-center">Xóa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 bg-slate-950/50">
                          {currentDataset.clips.map((clip) => {
                            const isPlaying = playingClipId === clip.id;
                            const isEditing = editingClipId === clip.id;

                            return (
                              <tr key={clip.id} className="hover:bg-slate-900/50 transition-colors">
                                <td className="py-2 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handlePlayClip(clip)}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                                      isPlaying
                                        ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 animate-pulse"
                                        : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                                    }`}
                                    title="Nghe thử câu này"
                                  >
                                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                                  </button>
                                </td>

                                <td className="py-2 px-3 font-mono text-[11px] text-slate-400">
                                  {clip.id}
                                </td>

                                <td className="py-2 px-3 font-mono text-[11px] text-slate-300">
                                  {clip.durationSec}s
                                </td>

                                <td className="py-2 px-3">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        value={editingClipText}
                                        onChange={(e) => setEditingClipText(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleSaveClipText(clip.id);
                                          if (e.key === "Escape") setEditingClipId(null);
                                        }}
                                        autoFocus
                                        className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-slate-900 border border-amber-500 text-white focus:outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleSaveClipText(clip.id)}
                                        className="p-1 rounded bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer"
                                        title="Lưu sửa đổi"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingClipId(null)}
                                        className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                                        title="Hủy"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      onClick={() => {
                                        setEditingClipId(clip.id);
                                        setEditingClipText(clip.text);
                                      }}
                                      className="group flex items-center justify-between cursor-pointer py-1 px-1.5 rounded hover:bg-slate-800/60"
                                      title="Nhấp vào để sửa chữ phiên âm"
                                    >
                                      <span className="text-slate-200">{clip.text}</span>
                                      <Edit2 className="w-3 h-3 text-slate-500 group-hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                                    </div>
                                  )}
                                </td>

                                <td className="py-2 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteClip(clip.id)}
                                    className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                                    title="Xóa câu này"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* LJSpeech Metadata Editor */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3 shadow-lg">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-slate-800">
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                          <FileCode className="w-4 h-4 text-sky-400" />
                          <span>Metadata Toàn Bộ Phụ Đề (metadata.csv / LJSpeech)</span>
                        </h4>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          Mỗi dòng theo định dạng <code>clip_xxxx|nội dung câu thoại</code>. Bạn có thể copy gửi AI chỉnh sửa lỗi chính tả rồi dán lưu lại.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleCopyMetadata}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <Copy className="h-3.5 w-3.5 text-amber-400" />
                          <span>Sao chép</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleReloadMetadata}
                          disabled={!hasUnsavedMetadata}
                          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          Nạp lại
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveMetadata}
                          disabled={!hasUnsavedMetadata || metadataSaving}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <Save className="h-3.5 w-3.5" />
                          <span>{metadataSaving ? "Đang lưu..." : "Lưu metadata"}</span>
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={metadataDraft}
                      onChange={(e) => {
                        setMetadataDraft(e.target.value);
                        setMetadataFeedback(null);
                      }}
                      aria-label="Metadata phụ đề theo định dạng ID|nội dung"
                      spellCheck={false}
                      rows={Math.min(18, Math.max(6, currentDataset.clips.length))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 font-mono text-xs leading-5 text-slate-200 focus:border-amber-500 focus:outline-none"
                    />

                    {metadataFeedback && (
                      <p className={`text-[11px] font-medium ${
                        metadataFeedback.type === "error"
                          ? "text-red-300"
                          : metadataFeedback.type === "success"
                            ? "text-emerald-300"
                            : "text-sky-300"
                      }`}>
                        {metadataFeedback.message}
                      </p>
                    )}
                    {hasUnsavedMetadata && (
                      <p className="text-[11px] text-amber-300">
                        ⚠️ Có thay đổi chưa lưu trong metadata.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* Empty State for Right Column */
                <div className="p-10 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center space-y-4 flex flex-col items-center justify-center min-h-[420px]">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shadow-lg">
                    <Scissors className="w-8 h-8" />
                  </div>
                  <div className="max-w-md space-y-2">
                    <h3 className="text-base font-bold text-white">
                      Dữ Liệu Âm Thanh Sau Khi Cắt Sẽ Hiển Thị Tại Đây
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Chọn file âm thanh thu âm và bấm <strong>&ldquo;Bắt Đầu Cắt & Phiên Âm Offline&rdquo;</strong> ở cột bên trái. Whisper.cpp sẽ tự động tách câu, xuất audio chuẩn 22,050Hz Mono và phiên âm tiếng Việt.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-lg w-full pt-2 text-left">
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px]">
                      <span className="text-amber-400 font-bold block mb-0.5">1. Cắt chuẩn VITS</span>
                      <span className="text-slate-400">Tự động chuẩn hóa 22,050Hz 16-bit Mono PCM.</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px]">
                      <span className="text-sky-400 font-bold block mb-0.5">2. Phiên âm tự động</span>
                      <span className="text-slate-400">Whisper.cpp chuyển tiếng nói thành chữ tiếng Việt.</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px]">
                      <span className="text-emerald-400 font-bold block mb-0.5">3. Chỉnh sửa & Tải zip</span>
                      <span className="text-slate-400">Nghe lại từng câu, sửa lỗi chữ và xuất zip lên Colab.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB: TOOLS & MODELS MANAGEMENT (OFFLINE SYSTEM)               */}
      {/* ============================================================== */}
      {activeTab === "tools" && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-transparent border border-sky-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-sky-400" />
                Quản Lý Công Cụ & Mô Hình Trực Tiếp Trên Hệ Thống
              </h3>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Tất cả các tệp nhị phân nặng gồm <code>tools/whisper.cpp</code>, bộ thực thi và mô hình <code>.bin</code> (&gt;1.5GB) được vận hành trực tiếp trên máy của bạn và đã được loại trừ khỏi Git trong <code>.gitignore</code>. Bạn có thể thoải mái tải mô hình hoặc xóa giải phóng dung lượng bất cứ lúc nào mà Git repository vẫn luôn nhẹ (&lt;500KB) và sync tức thì!
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={fetchSystemToolsStatus}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                <span>Làm mới trạng thái</span>
              </button>
            </div>
          </div>

          {/* Tools Feedback Alert */}
          {toolsFeedback && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
                toolsFeedback.type === "success"
                  ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                  : toolsFeedback.type === "error"
                  ? "bg-red-500/10 border border-red-500/30 text-red-300"
                  : "bg-sky-500/10 border border-sky-500/30 text-sky-300 animate-pulse"
              }`}
            >
              {toolsFeedback.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {toolsFeedback.type === "error" && <AlertTriangle className="w-4 h-4 shrink-0" />}
              {toolsFeedback.type === "info" && <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />}
              <span>{toolsFeedback.message}</span>
            </div>
          )}

          {/* SECTION 1: WHISPER.CPP CORE ENGINE */}
          <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-4 shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-sky-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    Bộ Thực Thi Whisper.cpp (whisper-cli)
                    {systemStatus?.isWhisperInstalled ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        ✓ Đã Cài Đặt
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        Chưa Khởi Tạo
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {systemStatus?.isWhisperInstalled
                      ? `Đường dẫn: ${systemStatus.whisperCliPath}`
                      : "Chưa có file thực thi. Cần khởi tạo để cắt lát âm thanh và phiên âm offline."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleInitWhisper(!!systemStatus?.isWhisperInstalled)}
                disabled={isOperatingTools || systemStatus?.activeJob?.status === "running"}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isOperatingTools ? "animate-spin" : ""}`} />
                <span>
                  {systemStatus?.isWhisperInstalled
                    ? "Biên dịch lại Whisper.cpp"
                    : "Khởi tạo Whisper.cpp (1-Click)"}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Vị trí mã nguồn:</span>
                <span className="font-mono text-slate-200 mt-0.5 block truncate">
                  tools/whisper.cpp
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Trạng thái Git Sync:</span>
                <span className="text-emerald-400 mt-0.5 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Đã loại trừ khỏi Git (.gitignore)
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Mô hình đã cài:</span>
                <span className="text-sky-400 font-bold mt-0.5 block">
                  {systemStatus?.models.filter((m) => m.isDownloaded).length || 0} /{" "}
                  {systemStatus?.models.length || 4} mô hình
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: WHISPER GGML MODELS CATALOG */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  Kho Mô Hình Whisper AI (GGML Binary Models)
                </h4>
                <p className="text-xs text-slate-400">
                  Tải về máy để dùng hoàn toàn offline hoặc xóa để giải phóng dung lượng ổ đĩa.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {systemStatus?.models.map((model) => (
                <div
                  key={model.id}
                  className={`p-4 rounded-2xl border transition-all space-y-3 ${
                    model.isDownloaded
                      ? "bg-slate-950/80 border-emerald-500/30 shadow-lg shadow-emerald-500/5"
                      : "bg-slate-950/40 border-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-bold text-white">{model.name}</h5>
                        {model.isDownloaded ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Đã có ({model.sizeMb}MB)
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                            Chưa tải (~{model.expectedSizeMb}MB)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {model.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                    <span className="text-slate-500 font-mono text-[11px]">
                      {model.filename}
                    </span>

                    <div className="flex items-center gap-2">
                      {model.isDownloaded ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteModel(model.id, model.name)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-all border border-slate-800 hover:border-red-500/30 cursor-pointer"
                          title="Xóa mô hình để giải phóng dung lượng đĩa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Xóa giải phóng đĩa</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDownloadModel(model.id)}
                          disabled={isOperatingTools || systemStatus?.activeJob?.status === "running"}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Tải về máy ({model.expectedSizeMb}MB)</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 3: GIT SYNC & CLI GUIDE */}
          <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <GitBranch className="w-4 h-4 text-emerald-400" />
              <span>Cách Thức Hoạt Động Cùng Git & Lệnh Khởi Tạo Terminal:</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Khi bạn đưa dự án này lên GitHub hoặc máy tính mới, chỉ cần chạy lệnh sau trên terminal để tự động tải và biên dịch Whisper.cpp:
            </p>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-[11px] text-amber-300 flex items-center justify-between">
              <code>npm run init:tools</code>
              <span className="text-[10px] text-slate-400">hoặc dùng trực tiếp giao diện Web này</span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: GUIDE & COLAB LAUNCH                                    */}
      {/* ============================================================== */}
      {activeTab === "guide" && (
        <div className="space-y-6">
          {/* Banner Top */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Huấn Luyện 1-Click Trên Google Colab (GPU T4 Miễn Phí)
              </h3>
              <p className="text-xs text-slate-300 mt-1 max-w-xl">
                Notebook đã được tinh giản tối đa: <strong>không cần biên dịch Whisper.cpp</strong> và <strong>không cần tải model 1.5GB</strong> nữa. Khởi động trong 30 giây!
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
              <a
                href="/api/colab/notebook"
                download="Piper_Voice_Clone_Colab.ipynb"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700 cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Tải File .ipynb</span>
              </a>
              <a
                href="https://colab.research.google.com/#create=true"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Mở Google Colab</span>
              </a>
            </div>
          </div>

          {/* 3-Step Clear Visual Workflow */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                  1
                </span>
                <h4 className="text-sm font-semibold text-white">Nạp .ipynb & Bật GPU</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Mở Google Colab ➔ Chọn tab <strong>Upload</strong> và tải file <code>Piper_Voice_Clone_Colab.ipynb</code> lên. Trên menu chọn <strong>Runtime ➔ Change runtime type ➔ T4 GPU</strong>.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                  2
                </span>
                <h4 className="text-sm font-semibold text-white">Bấm Play Bước 1 & Bước 2</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Bấm nút <strong>Play (▶️)</strong> ở ô Bước 1 (khoảng 30 giây để nạp Piper) và Bước 2 để mở giao diện Web Gradio ngay trong Colab.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                  3
                </span>
                <h4 className="text-sm font-semibold text-white">Nạp dataset.zip & Xuất ONNX</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Kéo thả file <code>dataset.zip</code> (từ Tab 1) vào Colab, bấm <strong>Bắt đầu huấn luyện</strong>. Sau vài phút, bấm <strong>Xuất ONNX</strong> và tải 2 file về!
              </p>
            </div>
          </div>

          {/* Tips for Best Results */}
          <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Mẹo Huấn Luyện Cho Chất Lượng Tốt Nhất:
            </h4>
            <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
              <li>
                <strong>Dữ liệu âm thanh:</strong> Nên có từ 30 đến 100 câu thoại rõ chữ, không có nhạc nền hoặc tiếng quạt.
              </li>
              <li>
                <strong>Số epochs:</strong> Với mô hình gốc Tiếng Việt có sẵn, chỉ cần 20 - 30 epochs (khoảng 5 - 10 phút trên GPU T4) là mô hình đã bắt chước được chất giọng và ngữ điệu rất tốt.
              </li>
              <li>
                <strong>Kích thước file:</strong> File <code>.onnx</code> xuất ra nặng khoảng 50MB–80MB, chạy cực nhanh và mượt mà trên mọi máy tính cục bộ.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: UPLOAD TRAINED ONNX MODEL                               */}
      {/* ============================================================== */}
      {activeTab === "upload" && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 text-xs text-slate-300">
            <p>
              Sau khi huấn luyện trên Google Colab xong, bạn tải về 2 file: <code>&lt;tên_giọng&gt;.onnx</code> và <code>&lt;tên_giọng&gt;.onnx.json</code>. Kéo thả cả 2 file vào khung bên dưới để nạp vào hệ thống.
            </p>
          </div>

          <form onSubmit={handleUploadSubmit} className="space-y-5">
            {/* Drag and Drop Zone */}
            <div
              onClick={() => modelFileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) {
                  const files = e.dataTransfer.files;
                  for (let i = 0; i < files.length; i++) {
                    const f = files[i];
                    if (f.name.endsWith(".onnx")) setOnnxFile(f);
                    if (f.name.endsWith(".json")) setJsonFile(f);
                  }
                }
              }}
              className="border-2 border-dashed border-slate-700 hover:border-amber-500/50 bg-slate-950/40 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-slate-950/70"
            >
              <input
                ref={modelFileInputRef}
                type="file"
                multiple
                accept=".onnx,.json"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    const files = e.target.files;
                    for (let i = 0; i < files.length; i++) {
                      const f = files[i];
                      if (f.name.endsWith(".onnx")) {
                        setOnnxFile(f);
                        if (!voiceNameInput) {
                          const raw = f.name.replace(/\.onnx$/i, "").replace(/[_-]/g, " ");
                          setVoiceNameInput(raw.charAt(0).toUpperCase() + raw.slice(1));
                          setVoiceIdInput(f.name.replace(/\.onnx$/i, "").toLowerCase());
                        }
                      }
                      if (f.name.endsWith(".json")) setJsonFile(f);
                    }
                  }
                }}
              />

              <div className="flex items-center gap-6 mb-3">
                <div
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    onnxFile
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                      : "bg-slate-900 border-slate-800 text-slate-400"
                  }`}
                >
                  <FileCode className="w-6 h-6" />
                  <span className="text-[11px] font-semibold">
                    {onnxFile ? onnxFile.name : "File .onnx"}
                  </span>
                </div>

                <div
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    jsonFile
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                      : "bg-slate-900 border-slate-800 text-slate-400"
                  }`}
                >
                  <FileJson className="w-6 h-6" />
                  <span className="text-[11px] font-semibold">
                    {jsonFile ? jsonFile.name : "File .onnx.json"}
                  </span>
                </div>
              </div>

              <p className="text-xs font-semibold text-slate-200">
                Kéo thả cả 2 file <code>.onnx</code> và <code>.onnx.json</code> vào đây
              </p>
              <p className="text-[11px] text-slate-500 mt-1">hoặc nhấp chuột để chọn từ máy tính</p>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tên Hiển Thị Của Giọng:
                </label>
                <input
                  type="text"
                  value={voiceNameInput}
                  onChange={(e) => setVoiceNameInput(e.target.value)}
                  placeholder="VD: Hoàng Nam (Clone), Lan Anh Voice"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mã Định Danh (Voice ID):
                </label>
                <input
                  type="text"
                  value={voiceIdInput}
                  onChange={(e) => setVoiceIdInput(e.target.value)}
                  placeholder="VD: hoang_nam_voice"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Giới Tính:
                </label>
                <select
                  value={genderInput}
                  onChange={(e) => setGenderInput(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="female">Nữ (Female)</option>
                  <option value="male">Nam (Male)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mô Tả / Ghi Chú:
                </label>
                <input
                  type="text"
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  placeholder="VD: Giọng đọc ấm áp, truyền cảm hứng"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Upload Feedback */}
            {uploadFeedback && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
                  uploadFeedback.type === "success"
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                    : "bg-red-500/10 border border-red-500/30 text-red-300"
                }`}
              >
                {uploadFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{uploadFeedback.message}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={uploading || !onnxFile || !jsonFile}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang Nạp Mô Hình Vào Hệ Thống...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Nạp Giọng Vào Hệ Thống</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: MANAGE INSTALLED VOICES                                 */}
      {/* ============================================================== */}
      {activeTab === "manage" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <p className="text-xs text-slate-400">
              Danh sách giọng đọc tùy chỉnh đã được cài đặt và lưu trữ trong thư mục <code>models/</code> của máy chủ.
            </p>
            <button
              type="button"
              onClick={fetchCustomVoices}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Làm mới danh sách"
            >
              <RefreshCw className={`w-4 h-4 ${loadingCustom ? "animate-spin" : ""}`} />
            </button>
          </div>

          {customVoices.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-950/40 border border-slate-800 space-y-3">
              <Layers className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">Chưa có giọng tùy chỉnh nào</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Hãy chuẩn bị dữ liệu ở Tab 1, đưa lên Google Colab huấn luyện ở Tab 2, sau đó nạp file .onnx ở Tab 3.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("dataset")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-all border border-amber-500/30 cursor-pointer"
              >
                <span>Chuẩn bị dữ liệu ngay</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customVoices.map((voice) => {
                const isTesting = testingVoiceId === voice.id && audioTesting;

                return (
                  <div
                    key={voice.id}
                    className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{voice.name}</h4>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              voice.gender === "female"
                                ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                : "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                            }`}
                          >
                            {voice.gender === "female" ? "Nữ" : "Nam"}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                          ID: {voice.modelId}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteVoice(voice.id, voice.name)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Xóa giọng này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {voice.description && (
                      <p className="text-xs text-slate-400">{voice.description}</p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px]">
                      <span className="text-slate-500 font-mono">
                        {voice.fileSizeBytes ? `${(voice.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB` : "ONNX"}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleTestVoice(voice)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isTesting
                            ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30"
                            : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                        }`}
                      >
                        {isTesting ? (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span>Dừng Thử</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>Phát Âm Thử</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
