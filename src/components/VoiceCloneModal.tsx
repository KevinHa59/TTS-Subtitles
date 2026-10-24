import React, { useState, useEffect, useRef } from "react";
import {
  X,
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
  Plus,
  Settings,
  HardDrive,
  GitBranch,
  Terminal,
  ShieldCheck,
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

interface DatasetPreparationJob {
  id: string;
  status: "processing" | "completed" | "failed";
  progressPercent: number;
  message: string;
  dataset?: DatasetInfo;
  error?: string;
}

interface WhisperModelItem {
  id: string;
  name: string;
  sizeMb: number;
  available: boolean;
}

interface VoiceCloneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVoiceInstalled: () => void;
}

export default function VoiceCloneModal({
  isOpen,
  onClose,
  onVoiceInstalled,
}: VoiceCloneModalProps) {
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
  const [availableModels, setAvailableModels] = useState<WhisperModelItem[]>([]);
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
    } catch {}
    setSystemStatus((prev) =>
      prev
        ? {
            ...prev,
            activeJob: {
              id: "idle",
              type: "idle",
              status: "idle",
              progressPercent: 0,
              message: "Hệ thống sẵn sàng",
              logs: [],
              startTime: Date.now(),
            },
          }
        : prev
    );
    setToolsFeedback(null);
  };

  // Handle System Whisper.cpp Initialization
  const handleInitWhisper = async (forceRebuild = false) => {
    setIsOperatingTools(true);
    setToolsFeedback(null);
    setSystemStatus((prev) => {
      const activeJob: SystemJob = {
        id: `compile_${Date.now()}`,
        type: "compile_whisper",
        target: "whisper.cpp",
        status: "running",
        progressPercent: 5,
        message: "[5%] Đang chuẩn bị biên dịch Whisper.cpp...",
        logs: ["Khởi tạo tiến trình biên dịch..."],
      };
      return prev
        ? { ...prev, activeJob }
        : {
            isWhisperInstalled: false,
            whisperCliPath: null,
            modelsDir: "",
            models: [],
            activeJob,
          };
    });

    try {
      const res = await fetch("/api/system/init-whisper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRebuild }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể khởi tạo Whisper.cpp.");
      }
      await fetchSystemToolsStatus();
    } catch (err: any) {
      setToolsFeedback({
        type: "error",
        message: err.message || "Lỗi khởi tạo Whisper.cpp.",
      });
    } finally {
      setIsOperatingTools(false);
    }
  };

  // Handle Download Whisper Model directly in system
  const handleDownloadModel = async (modelId: string) => {
    setIsOperatingTools(true);
    setToolsFeedback(null);
    setSystemStatus((prev) => {
      const activeJob: SystemJob = {
        id: `download_${modelId}_${Date.now()}`,
        type: "download_model",
        target: modelId,
        status: "running",
        progressPercent: 1,
        message: `[1%] Đang bắt đầu tải mô hình ${modelId}...`,
        logs: [`Đang kết nối tải mô hình ${modelId}...`],
      };
      return prev ? { ...prev, activeJob } : prev;
    });

    try {
      const res = await fetch("/api/system/download-whisper-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể tải mô hình.");
      }
      await fetchSystemToolsStatus();
    } catch (err: any) {
      setToolsFeedback({
        type: "error",
        message: err.message || "Lỗi khi tải mô hình.",
      });
    } finally {
      setIsOperatingTools(false);
    }
  };

  // Handle Delete Whisper Model directly to free space
  const handleDeleteModel = async (modelId: string, modelName: string) => {
    if (!confirm(`Bạn có chắc muốn xóa mô hình "${modelName}" khỏi hệ thống để giải phóng dung lượng ổ đĩa?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/system/whisper-model/${modelId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể xóa mô hình.");
      }
      setToolsFeedback({
        type: "success",
        message: `Đã xóa mô hình ${modelName} thành công.`,
      });
      await fetchSystemToolsStatus();
      await fetchDatasetsAndModels();
    } catch (err: any) {
      alert(`Lỗi khi xóa: ${err.message}`);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCustomVoices();
      fetchDatasetsAndModels();
      fetchSystemToolsStatus();
      setDatasetFeedback(null);
      setUploadFeedback(null);
      setToolsFeedback(null);
    } else {
      if (audioTestRef.current) audioTestRef.current.pause();
      if (clipAudioRef.current) clipAudioRef.current.pause();
      setTestingVoiceId(null);
      setPlayingClipId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!currentDataset) {
      setMetadataDraft("");
      setMetadataFeedback(null);
      return;
    }
    setMetadataDraft(
      currentDataset.clips.map((clip) => `${clip.id}|${clip.text}`).join("\n")
    );
    setMetadataFeedback(null);
  }, [currentDataset?.id, currentDataset?.clips]);

  // Continuous polling while modal is open to keep status & progress fresh in real-time
  useEffect(() => {
    if (!isOpen) return;

    fetchSystemToolsStatus();
    fetchDatasetsAndModels();

    const interval = setInterval(() => {
      fetchSystemToolsStatus();
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  // File chosen for Dataset
  const handleDatasetAudioChosen = (file: File) => {
    setAudioFile(file);
    setDatasetFeedback(null);
    const rawName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    if (!datasetVoiceName || datasetVoiceName === "giong_moi") {
      setDatasetVoiceName(rawName);
    }
  };

  // Start Offline Dataset Preparation via Whisper.cpp
  const handleStartPrepareDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile) {
      setDatasetFeedback({
        type: "error",
        message: "Vui lòng chọn hoặc kéo thả file âm thanh (MP3, WAV, M4A) của bạn.",
      });
      return;
    }

    setIsProcessingDataset(true);
    setDatasetFeedback({
      type: "info",
      message: `Đang cắt lát và phiên âm bằng Whisper.cpp (${whisperModel}) hoàn toàn offline... Vui lòng đợi trong giây lát.`,
    });

    try {
      const uploadParams = new URLSearchParams({
        originalFilename: audioFile.name,
        voiceName: datasetVoiceName,
        whisperModel,
        minDuration: String(minDuration),
        maxDuration: String(maxDuration),
      });
      const res = await fetch(`/api/dataset/prepare-upload?${uploadParams}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: audioFile,
      });

      const startData = await res.json();
      if (!res.ok || !startData.success || !startData.jobId) {
        throw new Error(startData.error || "Không thể bắt đầu xử lý âm thanh.");
      }

      let job: DatasetPreparationJob;
      do {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const statusRes = await fetch(
          `/api/dataset/prepare/${encodeURIComponent(startData.jobId)}`
        );
        const statusData = await statusRes.json();
        if (!statusRes.ok || !statusData.success) {
          throw new Error(statusData.error || "Không thể đọc tiến độ xử lý âm thanh.");
        }

        job = statusData.job as DatasetPreparationJob;
        setDatasetFeedback({
          type: job.status === "failed" ? "error" : "info",
          message: `${job.message} (${job.progressPercent}%).`,
        });
      } while (job.status === "processing");

      if (job.status === "failed") {
        throw new Error(job.error || job.message);
      }
      const dataset = job.dataset;
      if (!dataset) {
        throw new Error("Tác vụ hoàn tất nhưng không trả về bộ dữ liệu.");
      }

      setCurrentDataset(dataset);
      setSavedDatasets((prev) => [dataset, ...prev.filter((d) => d.id !== dataset.id)]);
      setDatasetFeedback({
        type: "success",
        message: `Hoàn tất! Đã trích xuất ${dataset.totalClips} câu thoại (${dataset.totalDurationSec}s) chuẩn định dạng Piper.`,
      });
    } catch (err: any) {
      setDatasetFeedback({
        type: "error",
        message: err.message || "Lỗi khi chạy Whisper.cpp trên máy chủ.",
      });
    } finally {
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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <Sparkles className="w-5 h-5 font-bold" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Huấn Luyện & Clone Giọng Nói
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Whisper.cpp Offline + Colab GPU
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Xử lý âm thanh và chỉnh sửa văn bản offline 100% tại chỗ ➔ Huấn luyện VITS trên Colab trong vài phút ➔ Nạp file ONNX
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-slate-800 bg-slate-950/40 gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("dataset")}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all ${
              activeTab === "dataset"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Scissors className="w-4 h-4 text-amber-500" />
            <span>1. Chuẩn Bị Dữ Liệu Offline</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("tools");
              fetchSystemToolsStatus();
            }}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all ${
              activeTab === "tools"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Settings className="w-4 h-4 text-sky-400" />
            <span>Quản Lý Công Cụ & Models (Hệ Thống)</span>
            {systemStatus?.activeJob?.status === "running" ? (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            ) : systemStatus && (!systemStatus.isWhisperInstalled || !systemStatus.models.some((m) => m.isDownloaded)) ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Init
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("guide")}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all ${
              activeTab === "guide"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-4 h-4 text-orange-400" />
            <span>2. Huấn Luyện (Google Colab 1-Click)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all ${
              activeTab === "upload"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <UploadCloud className="w-4 h-4 text-sky-400" />
            <span>3. Nạp Giọng Vào Hệ Thống (.onnx)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("manage");
              fetchCustomVoices();
            }}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all ${
              activeTab === "manage"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>4. Giọng Đã Cài ({customVoices.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      title="Đóng thông báo"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Real-time Progress Bar */}
              <div className="w-full bg-slate-900/90 rounded-full h-3 overflow-hidden border border-slate-700/80 mb-2.5">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    systemStatus.activeJob.status === "completed"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : systemStatus.activeJob.status === "error"
                      ? "bg-red-500"
                      : "bg-gradient-to-r from-sky-500 via-indigo-500 to-amber-500"
                  }`}
                  style={{ width: `${Math.max(5, systemStatus.activeJob.progressPercent)}%` }}
                />
              </div>

              {/* Streaming Logs */}
              {systemStatus.activeJob.logs.length > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-[11px] text-slate-400 max-h-24 overflow-y-auto space-y-1">
                  {systemStatus.activeJob.logs.slice(-4).map((log, idx) => (
                    <p key={idx} className="flex items-center gap-1.5 truncate">
                      <span className="text-sky-500 font-bold">›</span>
                      <span>{log}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 1: OFFLINE DATASET PREPARATION                             */}
          {/* ============================================================== */}
          {activeTab === "dataset" && (
            <div className="space-y-6">
              {/* Highlight Info Box */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
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
                <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/10 animate-pulse">
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
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shrink-0 transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isOperatingTools ? "animate-spin" : ""}`} />
                    <span>Khởi Tạo 1-Click Ngay</span>
                  </button>
                </div>
              )}

              {/* Upload & Configuration Form */}
              <form onSubmit={handleStartPrepareDataset} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* File Upload Box */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      File Âm Thanh Thu Âm Giọng Nói (MP3 / WAV / M4A / FLAC):
                    </label>
                    <div
                      onClick={() => audioInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-700 hover:border-amber-500/50 bg-slate-950/40 rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-slate-950/70"
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
                        <div className="flex items-center gap-3 text-amber-400">
                          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                          <div className="text-left">
                            <p className="text-xs font-bold text-white">{audioFile.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {(audioFile.size / (1024 * 1024)).toFixed(2)} MB • Sẵn sàng xử lý
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Mic className="w-8 h-8 text-amber-400/80 mx-auto" />
                          <p className="text-xs font-semibold text-slate-200">
                            Bấm để chọn file hoặc kéo thả file âm thanh vào đây
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Khuyên dùng file dài từ 3 phút đến 15 phút âm thanh rõ ràng, ít tạp âm
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Settings Box */}
                  <div className="space-y-3 p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Tên Giọng / Voice ID:
                      </label>
                      <input
                        type="text"
                        value={datasetVoiceName}
                        onChange={(e) => setDatasetVoiceName(e.target.value)}
                        placeholder="VD: hoang_nam, lan_anh"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-semibold text-slate-400">
                          Mô hình Whisper AI:
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab("tools");
                            fetchSystemToolsStatus();
                          }}
                          className="text-[10px] text-amber-400 hover:underline flex items-center gap-1"
                        >
                          <Settings className="w-3 h-3" />
                          <span>Quản lý mô hình</span>
                        </button>
                      </div>
                      <select
                        value={whisperModel}
                        onChange={(e) => setWhisperModel(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                      >
                        {systemStatus?.models ? (
                          systemStatus.models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.isDownloaded ? `${m.sizeMb}MB - ✓ Sẵn sàng` : `${m.expectedSizeMb}MB - ✗ Chưa tải`})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="small">Whisper Small (460MB - Khuyên dùng Tiếng Việt)</option>
                            <option value="base">Whisper Base (140MB - Siêu nhanh)</option>
                            <option value="large-v3-turbo">Whisper Large-v3-turbo (1.5GB - Tối tân nhất)</option>
                            <option value="medium">Whisper Medium (1.5GB - Chuẩn xác)</option>
                          </>
                        )}
                      </select>
                      {systemStatus && !systemStatus.models.find((m) => m.id === whisperModel)?.isDownloaded && (
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                          <span>Chưa có file mô hình này trên máy.</span>
                          <button
                            type="button"
                            onClick={() => handleDownloadModel(whisperModel)}
                            disabled={isOperatingTools || systemStatus?.activeJob?.status === "running"}
                            className="font-bold underline hover:text-amber-300"
                          >
                            Tải về ngay
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Độ dài tối thiểu:
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="5"
                          value={minDuration}
                          onChange={(e) => setMinDuration(parseFloat(e.target.value) || 1.0)}
                          className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Độ dài tối đa:
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="5"
                          max="20"
                          value={maxDuration}
                          onChange={(e) => setMaxDuration(parseFloat(e.target.value) || 12.0)}
                          className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-slate-400">
                    {savedDatasets.length > 0 && (
                      <span>Đã lưu {savedDatasets.length} bộ dữ liệu trên máy tính này.</span>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={isProcessingDataset || !audioFile}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20"
                  >
                    {isProcessingDataset ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Đang Cắt & Phiên Âm Bằng Whisper.cpp...</span>
                      </>
                    ) : (
                      <>
                        <Scissors className="w-4 h-4" />
                        <span>Bắt Đầu Cắt & Phiên Âm Offline</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Feedback Alert */}
              {datasetFeedback && (
                <div
                  className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
                    datasetFeedback.type === "success"
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                      : datasetFeedback.type === "error"
                      ? "bg-red-500/10 border border-red-500/30 text-red-300"
                      : "bg-amber-500/10 border border-amber-500/30 text-amber-300 animate-pulse"
                  }`}
                >
                  {datasetFeedback.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  {datasetFeedback.type === "error" && <AlertTriangle className="w-4 h-4 shrink-0" />}
                  {datasetFeedback.type === "info" && <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />}
                  <span>{datasetFeedback.message}</span>
                </div>
              )}

              {/* Dataset Inspector & Editor */}
              {currentDataset && (
                <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-4">
                  {/* Dataset Header Bar */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <FileArchive className="w-4 h-4 text-amber-400" />
                          Bộ Dữ Liệu: {currentDataset.voiceName}
                        </h3>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {currentDataset.totalClips} câu
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                          {currentDataset.totalDurationSec}s âm thanh
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        File gốc: {currentDataset.originalAudioFilename} • Mô hình: {currentDataset.whisperModelUsed}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <a
                        href={`/api/dataset/${currentDataset.id}/export-zip`}
                        download={`${currentDataset.id}_dataset.zip`}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20"
                      >
                        <Download className="w-4 h-4" />
                        <span>Tải Gói Dataset (.zip) Lên Colab</span>
                      </a>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white">Metadata phụ đề (LJSpeech)</h4>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Mỗi dòng theo dạng <code>clip_0001|nội dung câu thoại</code>. Bạn có thể copy gửi AI, dán bản đã sửa vào đây rồi lưu.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleCopyMetadata}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Sao chép metadata
                        </button>
                        <button
                          type="button"
                          onClick={handleReloadMetadata}
                          disabled={!hasUnsavedMetadata}
                          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Nạp lại bản đã lưu
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveMetadata}
                          disabled={!hasUnsavedMetadata || metadataSaving}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" />
                          {metadataSaving ? "Đang lưu..." : "Lưu metadata"}
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
                      rows={Math.min(24, Math.max(8, currentDataset.clips.length))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs leading-5 text-slate-200 focus:border-amber-500 focus:outline-none"
                    />
                    {metadataFeedback && (
                      <p className={`text-[11px] ${
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
                        Có thay đổi chưa lưu. Khi lưu, metadata phải giữ đủ và không trùng ID clip hiện có.
                      </p>
                    )}
                  </div>

                  {/* Sliced Audio Table */}
                  <div className="overflow-x-auto max-h-[380px] rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900/90 text-slate-400 sticky top-0 z-10 backdrop-blur-md">
                        <tr>
                          <th className="py-2.5 px-3 w-16 text-center">Nghe</th>
                          <th className="py-2.5 px-3 w-24">ID</th>
                          <th className="py-2.5 px-3 w-20">Thời lượng</th>
                          <th className="py-2.5 px-3">Văn Bản Tiếng Việt (Bấm Để Chỉnh Sửa)</th>
                          <th className="py-2.5 px-3 w-20 text-center">Xóa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                        {currentDataset.clips.map((clip) => {
                          const isPlaying = playingClipId === clip.id;
                          const isEditing = editingClipId === clip.id;

                          return (
                            <tr key={clip.id} className="hover:bg-slate-900/50 transition-colors">
                              {/* Audio Play Button */}
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handlePlayClip(clip)}
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                                    isPlaying
                                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 animate-pulse"
                                      : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                                  }`}
                                  title="Nghe thử câu này"
                                >
                                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                                </button>
                              </td>

                              {/* Clip ID */}
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-400">
                                {clip.id}
                              </td>

                              {/* Duration */}
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-300">
                                {clip.durationSec}s
                              </td>

                              {/* Text Edit Cell */}
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
                                      className="p-1 rounded bg-amber-500 text-slate-950 hover:bg-amber-400"
                                      title="Lưu sửa đổi"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingClipId(null)}
                                      className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
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
                                    title="Nhấp đúp hoặc bấm để sửa chữ nhận diện sai"
                                  >
                                    <span className="text-slate-200">{clip.text}</span>
                                    <Edit2 className="w-3 h-3 text-slate-500 group-hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                                  </div>
                                )}
                              </td>

                              {/* Delete Button */}
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteClip(clip.id)}
                                  className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
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

                  {/* Switch dataset footer */}
                  {savedDatasets.length > 1 && (
                    <div className="flex items-center gap-2 pt-2 text-xs text-slate-400">
                      <span>Bộ dữ liệu khác:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {savedDatasets.map((ds) => (
                          <button
                            key={ds.id}
                            type="button"
                            onClick={() => setCurrentDataset(ds)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                              currentDataset.id === ds.id
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                            }`}
                          >
                            {ds.voiceName} ({ds.totalClips} câu)
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
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
              <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-4">
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
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-sky-500/20 disabled:opacity-50"
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
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-all border border-slate-800 hover:border-red-500/30"
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
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
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
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2 text-xs">
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
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700"
                  >
                    <Download className="w-4 h-4 text-amber-400" />
                    <span>Tải File .ipynb</span>
                  </a>
                  <a
                    href="https://colab.research.google.com/#create=true"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Mở Google Colab</span>
                  </a>
                </div>
              </div>

              {/* 3-Step Clear Visual Workflow */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
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

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
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

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
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
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2">
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
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-300">
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
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20"
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
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
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
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-all border border-amber-500/30"
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
                        className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all space-y-3"
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
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
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
      </div>
    </div>
  );
}
