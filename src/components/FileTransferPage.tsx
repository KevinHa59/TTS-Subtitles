import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  File,
  FolderOpen,
  LoaderCircle,
  Check,
  X,
  RefreshCw,
  Send,
  ShieldAlert,
  Square,
  Wifi,
} from "lucide-react";

interface ReceivedFile {
  name: string;
  bytes: number;
  receivedAt: string;
}

interface TransferStatus {
  active: boolean;
  code?: string;
  requiresApproval: boolean;
  expiresAt?: string;
  port: number;
  addresses: string[];
  receiveDirectory: string;
  activeFile?: { name: string; receivedBytes: number; totalBytes: number } | null;
  approvalRequest?: {
    id: string;
    name: string;
    totalBytes: number;
    remoteAddress: string;
    expiresAt: string;
  } | null;
  receivedFiles: ReceivedFile[];
}

interface UploadProgress {
  name: string;
  loaded: number;
  total: number;
  status: "waiting" | "uploading" | "done" | "error";
}

async function readJson(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Máy chủ không trả về JSON (HTTP ${response.status}).`);
  }
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body.error || "Yêu cầu không thành công.");
  }
  return body;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function uploadFile(host: string, port: number, code: string, requestId: string | null, file: File, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `http://${host}:${port}/upload`);
    if (requestId) request.setRequestHeader("X-Transfer-Request", requestId);
    else request.setRequestHeader("X-Transfer-Code", code.trim().toUpperCase());
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    request.onerror = () => reject(new Error("Không kết nối được máy nhận. Kiểm tra IP, mã, Wi-Fi và Firewall."));
    request.onabort = () => reject(new Error("Đã hủy gửi file."));
    request.onload = () => {
      let response: { success?: boolean; error?: string; name?: string };
      try {
        response = JSON.parse(request.responseText);
      } catch {
        reject(new Error(`Máy nhận trả về phản hồi không hợp lệ (HTTP ${request.status}).`));
        return;
      }
      if (request.status < 200 || request.status >= 300 || !response.success) {
        reject(new Error(response.error || `Gửi file thất bại (HTTP ${request.status}).`));
        return;
      }
      resolve();
    };
    request.send(file);
  });
}

async function waitForReceiverApproval(host: string, port: number, file: File): Promise<string> {
  const origin = `http://${host}:${port}`;
  const request = await fetch(`${origin}/request`, {
    method: "POST",
    headers: {
      "X-File-Name": encodeURIComponent(file.name),
      "X-File-Size": String(file.size),
    },
  });
  const requestBody = await readJson(request);
  const requestId = requestBody.requestId as string;
  const expiresAt = Date.now() + 2 * 60 * 1000;
  while (Date.now() < expiresAt) {
    const response = await fetch(`${origin}/request/${encodeURIComponent(requestId)}`);
    const body = await readJson(response);
    if (body.status === "approved") return requestId;
    if (body.status === "rejected") throw new Error("Máy nhận đã từ chối yêu cầu gửi file.");
    if (body.status === "expired") throw new Error("Yêu cầu chấp thuận đã hết hạn.");
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
  throw new Error("Đã hết thời gian chờ máy nhận chấp thuận.");
}

export default function FileTransferPage() {
  const [status, setStatus] = useState<TransferStatus | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("39815");
  const [code, setCode] = useState("");
  const [noCode, setNoCode] = useState(false);
  const [receiveDirectory, setReceiveDirectory] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const body = await readJson(await fetch("/api/file-transfer/status"));
      setStatus(body.status as TransferStatus);
      setReceiveDirectory((current) => current || body.status.receiveDirectory);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => { void refreshStatus(); }, 1200);
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  const startReceiver = async () => {
    setWorking(true);
    setError("");
    try {
      const body = await readJson(await fetch("/api/file-transfer/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiresApproval: noCode }),
      }));
      setStatus(body.status as TransferStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  };

  const saveReceiveDirectory = async () => {
    setWorking(true);
    setError("");
    try {
      const body = await readJson(await fetch("/api/file-transfer/directory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: receiveDirectory || status?.receiveDirectory }),
      }));
      setStatus(body.status as TransferStatus);
      setReceiveDirectory(body.status.receiveDirectory);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  };

  const respondToRequest = async (requestId: string, approved: boolean) => {
    setWorking(true);
    setError("");
    try {
      const body = await readJson(await fetch(`/api/file-transfer/requests/${encodeURIComponent(requestId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      }));
      setStatus(body.status as TransferStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  };

  const stopReceiver = async () => {
    setWorking(true);
    setError("");
    try {
      const body = await readJson(await fetch("/api/file-transfer/session", { method: "DELETE" }));
      setStatus(body.status as TransferStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Không thể truy cập clipboard; hãy sao chép thủ công.");
    }
  };

  const addFiles = (selected: FileList | File[]) => {
    const next = Array.from(selected);
    if (!next.length) return;
    setFiles((current) => [...current, ...next]);
    setProgress([]);
    setError("");
  };

  const sendFiles = async () => {
    const normalizedCode = code.trim().toUpperCase();
    const ipSuffix = host.trim();
    const normalizedHost = `192.168.1.${ipSuffix}`;
    const numericPort = Number(port);
    if (
      !/^\d{1,3}$/.test(ipSuffix) ||
      Number(ipSuffix) < 1 ||
      Number(ipSuffix) > 254
    ) {
      setError("Nhập số cuối của IP máy nhận, từ 1 đến 254.");
      return;
    }
    if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65_535) {
      setError("Cổng phải là số từ 1 đến 65535.");
      return;
    }
    if (normalizedCode && !/^[A-HJ-NP-Z2-9]{8}$/.test(normalizedCode)) {
      setError("Mã nhận gồm 8 ký tự; nhập đúng mã đang hiển thị trên máy nhận hoặc để trống nếu dùng chế độ không mã.");
      return;
    }
    if (!files.length) {
      setError("Hãy chọn ít nhất một file để gửi.");
      return;
    }
    if (files.some((file) => file.size > 4 * 1024 ** 3)) {
      setError("Mỗi file phải có dung lượng tối đa 4 GiB.");
      return;
    }

    setWorking(true);
    setError("");
    const initialProgress = files.map((file) => ({
      name: file.name,
      loaded: 0,
      total: file.size,
      status: "uploading" as const,
    }));
    setProgress(initialProgress);
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        let requestId: string | null = null;
        if (!normalizedCode) {
          setProgress((current) => current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, status: "waiting" } : item,
          ));
          requestId = await waitForReceiverApproval(normalizedHost, numericPort, file);
        }
        setProgress((current) => current.map((item, itemIndex) =>
          itemIndex === index ? { ...item, status: "uploading" } : item,
        ));
        await uploadFile(normalizedHost, numericPort, normalizedCode, requestId, file, (loaded) => {
          setProgress((current) => current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, loaded } : item,
          ));
        });
        setProgress((current) => current.map((item, itemIndex) =>
          itemIndex === index ? { ...item, loaded: file.size, status: "done" } : item,
        ));
      }
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setProgress((current) => current.map((item) =>
        item.status === "uploading" || item.status === "waiting" ? { ...item, status: "error" } : item,
      ));
    } finally {
      setWorking(false);
    }
  };

  const totalSize = files.reduce((total, file) => total + file.size, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2.5 text-cyan-300"><Wifi className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-bold text-white">Chuyển file qua mạng nội bộ</h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">Tạo mã nhận tạm thời, nhập mã cùng địa chỉ IP trên máy gửi, rồi chuyển file trực tiếp giữa hai máy.</p>
          </div>
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div>
            <h2 className="text-sm font-bold text-white">Máy này nhận file</h2>
            <p className="mt-1 text-[11px] text-slate-500">Chỉ mở cổng LAN trong lúc phiên nhận đang bật. Phiên hết hạn sau 10 phút; tối đa 16 GiB mỗi phiên.</p>
          </div>
          {!status?.active ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => void startReceiver()} disabled={working} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">
                  {working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{noCode ? "Mở Kết Nối Không Mã" : "Mở Kết Nối Nhận File"}
                </button>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={noCode} onChange={(event) => setNoCode(event.target.checked)} disabled={working} className="h-4 w-4 accent-cyan-400" />
                  Không tạo mã
                </label>
              </div>
              {noCode && <p className="text-[10px] leading-relaxed text-amber-300">Máy nhận sẽ phải chấp thuận từng yêu cầu trước khi file được truyền.</p>}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Đang nhận file</span>
                  <button type="button" onClick={() => void stopReceiver()} disabled={working || Boolean(status.activeFile)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"><Square className="h-3 w-3" />Đóng phiên</button>
                </div>
                {status.requiresApproval ? (
                  <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-200">Đang ở chế độ không mã. Mỗi file cần được chấp thuận trên máy này trước khi truyền.</p>
                ) : (
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Mã kết nối</p><p className="mt-1 font-mono text-2xl font-black tracking-[0.2em] text-white">{status.code}</p></div>
                    <button type="button" onClick={() => void copyText(status.code || "", "code")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-[10px] text-slate-200 hover:bg-slate-800"><Copy className="h-3.5 w-3.5" />{copied === "code" ? "Đã chép" : "Sao chép"}</button>
                  </div>
                )}
                <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Địa chỉ IP LAN của máy này · cổng {status.port}</p>
                  {status.addresses.length ? status.addresses.map((address) => (
                    <div key={address} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/70 px-3 py-2">
                      <code className="text-xs text-cyan-200">{address}</code>
                      <button type="button" onClick={() => void copyText(address, address)} className="rounded p-1 text-slate-400 hover:text-white" aria-label={`Sao chép IP ${address}`}><Copy className="h-3.5 w-3.5" /></button>
                    </div>
                  )) : <p className="text-[11px] text-amber-300">Không tìm thấy IP LAN. Kiểm tra kết nối Wi-Fi/Ethernet.</p>}
                  <p className="text-[10px] text-slate-500">Trên máy gửi, nhập số cuối của IP (sau 192.168.1.){status.requiresApproval ? "." : " và mã kết nối."} Nếu không kết nối được, cho phép ứng dụng qua Windows Firewall trên mạng riêng.</p>
                </div>
              </div>
              {status.approvalRequest && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-[11px] font-semibold text-amber-200">Yêu cầu nhận file</p>
                  <p className="mt-1 break-all text-[11px] text-slate-200">{status.approvalRequest.name}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{formatBytes(status.approvalRequest.totalBytes)} · IP gửi {status.approvalRequest.remoteAddress}</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void respondToRequest(status.approvalRequest!.id, true)} disabled={working || Boolean(status.activeFile)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-3 py-2 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"><Check className="h-3.5 w-3.5" />Chấp thuận</button>
                    <button type="button" onClick={() => void respondToRequest(status.approvalRequest!.id, false)} disabled={working} className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-3 py-2 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"><X className="h-3.5 w-3.5" />Từ chối</button>
                  </div>
                </div>
              )}
              {status.activeFile && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                  <div className="flex justify-between gap-3 text-[11px] text-slate-300"><span className="truncate">{status.activeFile.name}</span><span className="shrink-0">{Math.floor(status.activeFile.receivedBytes / Math.max(1, status.activeFile.totalBytes) * 100)}%</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, status.activeFile.receivedBytes / Math.max(1, status.activeFile.totalBytes) * 100)}%` }} /></div>
                  <p className="mt-1 text-right text-[10px] text-slate-500">{formatBytes(status.activeFile.receivedBytes)} / {formatBytes(status.activeFile.totalBytes)}</p>
                </div>
              )}
            </>
          )}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300"><FolderOpen className="h-3.5 w-3.5 text-cyan-300" />Thư mục lưu file nhận</div>
            <input value={receiveDirectory || status?.receiveDirectory || "%LOCALAPPDATA%\\PiperTTSStudio\\received-files"} onChange={(event) => setReceiveDirectory(event.target.value)} disabled={Boolean(status?.active) || working} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] text-white outline-none focus:border-cyan-500 disabled:opacity-50" aria-label="Đường dẫn thư mục lưu file nhận" />
            <p className="mt-1 text-[9px] text-slate-500">Nhập đường dẫn tuyệt đối trên máy nhận. Thư mục sẽ được tạo nếu chưa có; đóng phiên nhận trước khi đổi.</p>
            <button type="button" onClick={() => void saveReceiveDirectory()} disabled={Boolean(status?.active) || working || !receiveDirectory.trim()} className="mt-2 rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-semibold text-cyan-300 hover:bg-slate-800 disabled:opacity-40">Lưu thư mục</button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-slate-200">File đã nhận</h3><button type="button" onClick={() => void refreshStatus()} className="rounded p-1 text-slate-500 hover:text-white" aria-label="Làm mới"><RefreshCw className="h-3.5 w-3.5" /></button></div>
            {status?.receivedFiles.length ? status.receivedFiles.map((file, index) => (
              <div key={`${file.receivedAt}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                <span className="flex min-w-0 items-center gap-2 text-[11px] text-slate-300"><File className="h-3.5 w-3.5 shrink-0 text-emerald-300" /><span className="truncate">{file.name}</span></span>
                <span className="shrink-0 text-[10px] text-slate-500">{formatBytes(file.bytes)}</span>
              </div>
            )) : <p className="text-[10px] text-slate-600">Chưa nhận file trong phiên này.</p>}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div>
            <h2 className="text-sm font-bold text-white">Gửi file đến máy khác</h2>
            <p className="mt-1 text-[11px] text-slate-500">Nhập số cuối IPv4 LAN của máy nhận. Để trống mã nếu máy nhận đang ở chế độ không mã. File tối đa 4 GiB/file, 16 GiB/phiên.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-[10px] font-medium text-slate-400">IP máy nhận<div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 px-3 focus-within:border-cyan-500"><span className="shrink-0 text-xs text-slate-500">192.168.1.</span><input value={host} onChange={(event) => setHost(event.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="25" maxLength={3} inputMode="numeric" className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-white outline-none" /></div></label>
            <label className="space-y-1.5 text-[10px] font-medium text-slate-400">Cổng<input value={port} onChange={(event) => setPort(event.target.value)} placeholder={String(status?.port || 39815)} inputMode="numeric" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500" /></label>
            <label className="space-y-1.5 text-[10px] font-medium text-slate-400">Mã nhận · tùy chọn<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Để trống nếu không mã" maxLength={8} autoCapitalize="characters" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-xs tracking-widest text-white outline-none focus:border-cyan-500" /></label>
          </div>
          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
            className={`rounded-xl border border-dashed p-6 text-center transition-colors ${dragging ? "border-cyan-400 bg-cyan-500/10" : "border-slate-700 bg-slate-950/30"}`}
          >
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(event) => { if (event.target.files) addFiles(event.target.files); }} />
            <File className="mx-auto h-7 w-7 text-slate-500" />
            <p className="mt-2 text-xs text-slate-300">Kéo thả nhiều file vào đây</p>
            <button type="button" onClick={() => inputRef.current?.click()} className="mt-2 rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-semibold text-cyan-300 hover:bg-slate-800">Chọn file</button>
            {files.length > 0 && <p className="mt-2 text-[10px] text-slate-500">{files.length} file · {formatBytes(totalSize)}</p>}
          </div>
          {files.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {files.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/50 px-2.5 py-2 text-[10px]"><span className="truncate text-slate-300">{file.name}</span><span className="shrink-0 text-slate-500">{formatBytes(file.size)}</span></div>)}
            </div>
          )}
          {progress.length > 0 && (
            <div className="space-y-2">
              {progress.map((item, index) => {
                const percent = item.total ? Math.min(100, Math.round(item.loaded / item.total * 100)) : 0;
                return <div key={`${item.name}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate text-slate-300">{item.name}</span><span className={item.status === "done" ? "text-emerald-300" : item.status === "error" ? "text-rose-300" : "text-cyan-300"}>{item.status === "done" ? "Hoàn tất" : item.status === "error" ? "Lỗi" : item.status === "waiting" ? "Chờ chấp thuận" : `${percent}%`}</span></div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800"><div className={`h-full transition-all ${item.status === "error" ? "bg-rose-400" : item.status === "done" ? "bg-emerald-400" : "bg-cyan-400"}`} style={{ width: `${item.status === "waiting" ? 100 : percent}%`, opacity: item.status === "waiting" ? 0.35 : 1 }} /></div>
                </div>;
              })}
            </div>
          )}
          <button type="button" onClick={() => void sendFiles()} disabled={working || !files.length} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">
            {working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{working ? "Đang gửi..." : `Gửi ${files.length || ""} file`}
          </button>
          <p className="text-[10px] leading-relaxed text-amber-300/80">Chuyển trực tiếp trong mạng LAN, không qua cloud. Kết nối HTTP chưa được mã hóa; chỉ dùng trên mạng riêng đáng tin cậy, không dùng Wi-Fi công cộng. Nếu cổng bị chặn, cho phép TCP {status?.port || 39815} trên mạng Private trong Firewall.</p>
        </section>
      </div>
    </div>
  );
}
