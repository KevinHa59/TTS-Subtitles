import { useRef, useState, type DragEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileArchive,
  FileText,
  FileUp,
  LoaderCircle,
  Type,
} from "lucide-react";
import {
  createSrtZip,
  extractSrtFilesFromText,
  type ExtractedSrtFile,
} from "../utils/srtFromText";

type InputTab = "upload" | "text";

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SrtFromTextPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<InputTab>("upload");
  const [fileName, setFileName] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [files, setFiles] = useState<ExtractedSrtFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);

  const loadFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".txt")) {
      setError("Vui lòng chọn file có định dạng .txt.");
      return;
    }
    setError(null);
    setFiles([]);
    setProcessing(true);
    try {
      setSourceText(await file.text());
      setFileName(file.name);
      setActiveTab("upload");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? `Không thể đọc file TXT: ${loadError.message}`
          : "Không thể đọc file TXT.",
      );
    } finally {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const extract = () => {
    setError(null);
    setFiles([]);
    setProcessing(true);
    try {
      setFiles(extractSrtFilesFromText(sourceText));
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "Không thể trích xuất các file SRT.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const downloadAll = () => {
    if (!files.length) return;
    triggerDownload(createSrtZip(files), "subtitles.zip");
  };

  const downloadOne = (file: ExtractedSrtFile) => {
    triggerDownload(
      new Blob([file.content], { type: "application/x-subrip;charset=utf-8" }),
      file.fileName,
    );
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-3 sm:px-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">SRT from Text</h1>
            <p className="text-sm text-slate-400">
              Tách một văn bản có nhiều nhóm phụ đề thành các file SRT riêng.
            </p>
          </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
        <div role="tablist" aria-label="Nguồn văn bản" className="flex border-b border-slate-800 p-2">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "upload"}
            onClick={() => setActiveTab("upload")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
              activeTab === "upload"
                ? "bg-cyan-400 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <FileUp className="h-4 w-4" />
            Upload
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "text"}
            onClick={() => setActiveTab("text")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
              activeTab === "text"
                ? "bg-cyan-400 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Type className="h-4 w-4" />
            Nhập văn bản
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          {activeTab === "upload" ? (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragging(false);
                }
              }}
              onDrop={handleDrop}
              className={`flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors ${
                dragging
                  ? "border-cyan-300 bg-cyan-400/10"
                  : "border-slate-700 bg-slate-950/40"
              }`}
            >
              <FileUp className="mb-3 h-9 w-9 text-cyan-300" />
              <p className="font-semibold text-white">
                Kéo thả file TXT vào đây
              </p>
              <p className="mt-1 text-xs text-slate-400">
                hoặc chọn file trên máy · hỗ trợ một file .txt
              </p>
              {fileName && (
                <p className="mt-3 text-xs text-cyan-200">{fileName}</p>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={processing}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
              >
                {processing ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                Browse TXT
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                onChange={(event) => void loadFile(event.target.files?.[0])}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="srt-from-text-input" className="text-sm font-medium text-slate-200">
                Dán nội dung có tên file và các block phụ đề SRT
              </label>
              <textarea
                id="srt-from-text-input"
                value={sourceText}
                onChange={(event) => {
                  setSourceText(event.target.value);
                  setFiles([]);
                  setError(null);
                  setFileName("");
                }}
                rows={16}
                spellCheck={false}
                placeholder={"061.srt\n\n1\n00:00:00,208 --> 00:00:01,292\nNội dung phụ đề\n\n062.srt\n\n1\n00:00:01,875 --> 00:00:03,041\nNội dung phụ đề tiếp theo"}
                className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none"
              />
            </div>
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs leading-relaxed text-slate-400">
            Mỗi nhóm bắt đầu bằng tên file như <code className="text-cyan-200">061.srt</code>,
            sau đó là nội dung SRT. Có thể đặt nhiều nhóm nối tiếp nhau; số thứ tự
            phụ đề trong mỗi file sẽ được chuẩn hóa bắt đầu từ 1.
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {sourceText.trim()
                ? `${sourceText.length.toLocaleString()} ký tự${fileName ? ` · ${fileName}` : ""}`
                : "Chưa có nội dung đầu vào"}
            </p>
            <button
              type="button"
              onClick={extract}
              disabled={!sourceText.trim() || processing}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {processing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Trích xuất SRT
            </button>
          </div>
        </div>
      </section>

      {files.length > 0 && (
        <section className="space-y-4 rounded-2xl border border-emerald-500/20 bg-slate-900/70 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-white">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                Đã tạo {files.length} file SRT
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Tải từng file riêng hoặc tải tất cả trong một file ZIP.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadAll}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-300"
            >
              <FileArchive className="h-4 w-4" />
              <Download className="h-4 w-4" />
              Tải tất cả (.zip)
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {files.map((file) => (
              <article
                key={file.fileName}
                className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3"
              >
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-cyan-100">
                    {file.fileName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {(file.content.match(/^[\d:.,]+\s*-->\s*[\d:.,]+/gm) || []).length} câu phụ đề
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadOne(file)}
                  aria-label={`Tải ${file.fileName}`}
                  className="shrink-0 rounded-lg border border-slate-700 p-2 text-slate-200 hover:border-cyan-400/50 hover:text-cyan-100"
                >
                  <Download className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
