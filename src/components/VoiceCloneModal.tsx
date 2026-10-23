import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Sparkles,
  ExternalLink,
  Download,
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
} from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"guide" | "upload" | "manage">("guide");

  // Manage tab state
  const [customVoices, setCustomVoices] = useState<CustomVoiceItem[]>([]);
  const [loadingCustom, setLoadingCustom] = useState<boolean>(false);
  const [testingVoiceId, setTestingVoiceId] = useState<string | null>(null);
  const [audioTesting, setAudioTesting] = useState<boolean>(false);
  const audioTestRef = useRef<HTMLAudioElement | null>(null);

  // Upload tab state
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch custom voices when modal opens or switch to manage tab
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

  useEffect(() => {
    if (isOpen) {
      fetchCustomVoices();
      setUploadFeedback(null);
    } else {
      if (audioTestRef.current) {
        audioTestRef.current.pause();
      }
      setTestingVoiceId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle file drop / select
  const handleFilesChosen = (files: FileList | null) => {
    if (!files) return;
    setUploadFeedback(null);

    let pickedOnnx: File | null = onnxFile;
    let pickedJson: File | null = jsonFile;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const name = f.name.toLowerCase();
      if (name.endsWith(".onnx")) {
        pickedOnnx = f;
        if (!voiceNameInput) {
          const rawName = f.name.replace(/\.onnx$/i, "").replace(/[_-]+/g, " ");
          setVoiceNameInput(rawName.charAt(0).toUpperCase() + rawName.slice(1));
        }
        if (!voiceIdInput) {
          setVoiceIdInput(f.name.replace(/\.onnx$/i, "").toLowerCase().replace(/[^a-z0-9_-]/g, "_"));
        }
      } else if (name.endsWith(".json")) {
        pickedJson = f;
      }
    }

    setOnnxFile(pickedOnnx);
    setJsonFile(pickedJson);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleFilesChosen(e.dataTransfer.files);
    }
  };

  // Upload handler
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onnxFile || !jsonFile) {
      setUploadFeedback({
        type: "error",
        message: "Vui lòng chọn cả 2 file: .onnx và .onnx.json được xuất từ Google Colab.",
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
      // Read JSON file content
      const jsonText = await jsonFile.text();

      // Read ONNX file as base64
      const onnxBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1] || result;
          resolve(base64);
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

      // Clear files
      setOnnxFile(null);
      setJsonFile(null);
      setVoiceIdInput("");
      setVoiceNameInput("");
      setDescriptionInput("");

      // Notify parent to refresh catalog
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

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "0 MB";
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <Sparkles className="w-5 h-5 font-bold" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Huấn Luyện & Clone Giọng (Google Colab)
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  GPU Miễn Phí
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Tự động cắt câu bằng Whisper AI, train mạng nơ-ron VITS và xuất mô hình Piper ONNX
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
        <div className="flex items-center px-6 border-b border-slate-800 bg-slate-950/20 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("guide")}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "guide"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>1. Hướng Dẫn & Mở Google Colab</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "upload"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>2. Nạp Giọng Vào Hệ Thống (.onnx)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("manage");
              fetchCustomVoices();
            }}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "manage"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>3. Giọng Đã Cài ({customVoices.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: GUIDE & COLAB LAUNCH */}
          {activeTab === "guide" && (
            <div className="space-y-6">
              {/* Top Banner Actions */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    File Google Colab Notebook Sẵn Sàng
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl">
                    Chạy trực tiếp trên trình duyệt, miễn phí GPU T4 của Google mà không cần cài đặt Python hay PyTorch trên máy tính của bạn.
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

              {/* 4-Step Visual Roadmap */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                      1
                    </span>
                    <h4 className="text-sm font-semibold text-white">Nạp Notebook & Bật GPU</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Mở Google Colab ➔ Chọn <strong>Upload</strong> và tải file <code>Piper_Voice_Clone_Colab.ipynb</code> lên. Trên menu chọn <strong>Runtime ➔ Change runtime type ➔ T4 GPU</strong>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                      2
                    </span>
                    <h4 className="text-sm font-semibold text-white">Nhấn Chạy Cell để mở Web UI</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Nhấn nút <strong>Play (▶️)</strong> ở ô Code. Sau 1 phút, Colab sẽ hiển thị một đường link Giao diện Web Gradio tiếng Việt ngay trong notebook hoặc mở tab mới.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                      3
                    </span>
                    <h4 className="text-sm font-semibold text-white">Upload Audio & Whisper Cắt Tự Động</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Tải lên file thu âm (MP3/WAV/M4A). Whisper AI sẽ tự động lọc tạp âm, cắt thành 50-150 câu ngắn và phiên âm tiếng Việt. Sau đó bấm <strong>Huấn luyện (Train)</strong>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                      4
                    </span>
                    <h4 className="text-sm font-semibold text-white">Xuất ONNX & Kéo Thả Vào App</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Chuyển sang <strong>Tab 3 (Xuất ONNX)</strong> trên Colab, tải về 2 file: <code>.onnx</code> và <code>.onnx.json</code>. Mang sang <strong>Tab 2 bên cạnh</strong> kéo thả vào là xong!
                  </p>
                </div>
              </div>

              {/* Tips for Best Quality */}
              <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-900/50 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <span className="font-semibold text-blue-200">Mẹo để giọng clone tự nhiên nhất:</span>
                  <p>
                    • Thời lượng audio lý tưởng: Từ <strong>15 đến 30 phút</strong> thu âm rõ tiếng, ít tiếng ồn môi trường.
                  </p>
                  <p>
                    • Không cần đọc quá nhanh, giữ nhịp thở và ngữ điệu đều đặn.
                  </p>
                  <p>
                    • Mô hình xuất ra là <strong>Piper ONNX VITS</strong> với bảng mã phoneme Tiếng Việt espeak-ng, chạy hoàn toàn offline 100% với tốc độ siêu nhanh (nhẹ chỉ ~40MB - 60MB).
                  </p>
                </div>
              </div>

              {/* Call to action to go to next tab */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveTab("upload")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20"
                >
                  <span>Đã có file? Chuyển sang Nạp Giọng Mới</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD & REGISTER MODEL */}
          {activeTab === "upload" && (
            <form onSubmit={handleUploadSubmit} className="space-y-6">
              {/* Drag and Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                  onnxFile && jsonFile
                    ? "border-emerald-500/50 bg-emerald-950/20"
                    : "border-slate-700 hover:border-amber-500/50 bg-slate-950/40 hover:bg-slate-950/70"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept=".onnx,.json"
                  onChange={(e) => handleFilesChosen(e.target.files)}
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-semibold text-white">
                  Kéo thả cặp file <span className="text-amber-400">.onnx</span> và <span className="text-amber-400">.onnx.json</span> vào đây
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Hoặc bấm vào để chọn file từ máy tính
                </p>

                {/* Status of picked files */}
                <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                  <div
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                      onnxFile
                        ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                        : "bg-slate-900 border-slate-800 text-slate-500"
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{onnxFile ? `${onnxFile.name} (${formatBytes(onnxFile.size)})` : "Chưa chọn file .onnx"}</span>
                    {onnxFile && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>

                  <div
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                      jsonFile
                        ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                        : "bg-slate-900 border-slate-800 text-slate-500"
                    }`}
                  >
                    <FileJson className="w-3.5 h-3.5" />
                    <span>{jsonFile ? `${jsonFile.name} (${formatBytes(jsonFile.size)})` : "Chưa chọn file .onnx.json"}</span>
                    {jsonFile && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                </div>
              </div>

              {/* Form Metadata Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Mã định danh giọng (ID) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={voiceIdInput}
                    onChange={(e) => setVoiceIdInput(e.target.value)}
                    placeholder="vd: giong_thuy_tien"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500">Chữ thường, không dấu, không khoảng trắng (vd: giong_anh_tuan)</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Tên hiển thị <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={voiceNameInput}
                    onChange={(e) => setVoiceNameInput(e.target.value)}
                    placeholder="vd: Thùy Tiên (Podcast)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500">Tên xuất hiện trong bảng chọn giọng của Studio</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Giới tính</label>
                  <div className="flex gap-4 pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        checked={genderInput === "female"}
                        onChange={() => setGenderInput("female")}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <span>Nữ</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        checked={genderInput === "male"}
                        onChange={() => setGenderInput("male")}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <span>Nam</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Mô tả giọng đọc</label>
                  <input
                    type="text"
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    placeholder="vd: Giọng nữ trầm ấm, truyền cảm, thích hợp đọc truyện đêm"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Feedback Alert */}
              {uploadFeedback && (
                <div
                  className={`p-3.5 rounded-xl flex items-center gap-3 text-xs ${
                    uploadFeedback.type === "success"
                      ? "bg-emerald-950/40 border border-emerald-500/40 text-emerald-300"
                      : "bg-rose-950/40 border border-rose-500/40 text-rose-300"
                  }`}
                >
                  {uploadFeedback.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span>{uploadFeedback.message}</span>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setOnnxFile(null);
                    setJsonFile(null);
                    setVoiceIdInput("");
                    setVoiceNameInput("");
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
                >
                  Xóa Lại
                </button>
                <button
                  type="submit"
                  disabled={uploading || !onnxFile || !jsonFile}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang nạp mô hình vào Studio...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Nạp Giọng Vào Hệ Thống</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: MANAGE INSTALLED CUSTOM VOICES */}
          {activeTab === "manage" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Danh Sách Giọng Đọc Tùy Chỉnh Đã Cài</h4>
                  <p className="text-xs text-slate-400">
                    Các giọng đọc này được lưu offline trong thư mục <code>models/</code> của máy chủ
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchCustomVoices}
                  disabled={loadingCustom}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingCustom ? "animate-spin" : ""}`} />
                  <span>Làm mới</span>
                </button>
              </div>

              {loadingCustom ? (
                <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
                  <span>Đang tải danh sách giọng tùy chỉnh...</span>
                </div>
              ) : customVoices.length === 0 ? (
                <div className="py-12 text-center rounded-2xl bg-slate-950/40 border border-slate-800/80 p-8 space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
                    <Headphones className="w-6 h-6" />
                  </div>
                  <h5 className="text-sm font-semibold text-slate-300">Chưa có giọng tùy chỉnh nào</h5>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Bạn có thể làm theo hướng dẫn ở Tab 1 để huấn luyện trên Google Colab, sau đó nạp file vào Tab 2 để sử dụng.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("guide")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 text-xs font-semibold transition-all"
                  >
                    <span>Xem Hướng Dẫn Huấn Luyện</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {customVoices.map((voice) => {
                    const isTesting = testingVoiceId === voice.id && audioTesting;
                    return (
                      <div
                        key={voice.id}
                        className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-white">{voice.name}</span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              {voice.gender === "female" ? "Nữ" : "Nam"}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {voice.modelId}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 truncate max-w-lg">
                            {voice.description || "Giọng đọc AI tùy chỉnh"}
                          </p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                            <span>File: {voice.onnxFile}</span>
                            <span>•</span>
                            <span>Dung lượng: {formatBytes(voice.fileSizeBytes)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                          <button
                            type="button"
                            onClick={() => handleTestVoice(voice)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                              isTesting
                                ? "bg-amber-500 text-slate-950 font-bold"
                                : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                            }`}
                          >
                            {isTesting ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-amber-400" />}
                            <span>{isTesting ? "Đang phát..." : "Nghe thử"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteVoice(voice.id, voice.name)}
                            className="p-2 text-rose-400 hover:text-rose-200 hover:bg-rose-950/50 rounded-xl transition-all"
                            title="Xóa giọng này"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Piper TTS Native VITS • 22,050 Hz Mono • 100% Offline</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
