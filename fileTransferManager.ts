import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import express, { type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number.parseInt(process.env.FILE_TRANSFER_PORT || "39815", 10);
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_FILE_BYTES = 4 * 1024 ** 3;
const MAX_SESSION_BYTES = 16 * 1024 ** 3;
const MAX_FAILED_CODES = 10;
const MAX_CHAT_MESSAGES = 100;
const MAX_CHAT_MESSAGE_LENGTH = 4000;
const APP_DATA_DIRECTORY = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "PiperTTSStudio",
);
const SETTINGS_FILE = path.join(APP_DATA_DIRECTORY, "file-transfer.json");
const DEFAULT_RECEIVE_DIRECTORY = path.join(APP_DATA_DIRECTORY, "received-files");
const APPROVAL_TTL_MS = 2 * 60 * 1000;
const CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface ReceivedFile {
  name: string;
  bytes: number;
  receivedAt: string;
}

interface FileTransferChatMessage {
  id: string;
  clientId: string;
  text: string;
  sentAt: string;
}

interface TransferSession {
  code: string | null;
  requiresApproval: boolean;
  expiresAt: number;
  server: Server;
  chatServer: WebSocketServer;
  sockets: Set<import("net").Socket>;
  chatClients: Set<WebSocket>;
  chatMessages: FileTransferChatMessage[];
  failedCodes: number;
  activeFile: { name: string; receivedBytes: number; totalBytes: number } | null;
  approvalRequest: {
    id: string;
    name: string;
    totalBytes: number;
    remoteAddress: string;
    expiresAt: number;
    status: "pending" | "approved" | "rejected" | "expired";
  } | null;
  receivedBytes: number;
  receivedFiles: ReceivedFile[];
}

export interface FileTransferStatus {
  active: boolean;
  code?: string;
  requiresApproval: boolean;
  expiresAt?: string;
  port: number;
  addresses: string[];
  receiveDirectory: string;
  activeFile?: TransferSession["activeFile"];
  approvalRequest?: {
    id: string;
    name: string;
    totalBytes: number;
    remoteAddress: string;
    expiresAt: string;
  } | null;
  receivedFiles: ReceivedFile[];
}

function loadReceiveDirectory(): string {
  try {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) as { receiveDirectory?: unknown };
    if (typeof saved.receiveDirectory === "string" && path.isAbsolute(saved.receiveDirectory)) {
      return path.resolve(saved.receiveDirectory);
    }
    return DEFAULT_RECEIVE_DIRECTORY;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_RECEIVE_DIRECTORY;
    throw new Error(`Không đọc được cài đặt thư mục nhận file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let receiveDirectory = loadReceiveDirectory();

function isLocalAppOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function getLanAddresses(): string[] {
  const addresses = new Set<string>();
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (
        entry.family === "IPv4" &&
        !entry.internal &&
        !entry.address.startsWith("169.254.")
      ) {
        addresses.add(entry.address);
      }
    }
  }
  return [...addresses];
}

function sanitizeFileName(input: string): string {
  const baseName = path.posix.basename(input.replaceAll("\\", "/"));
  const sanitized = baseName
    .replace(/[<>:"|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 180);
  if (
    !sanitized ||
    sanitized === "." ||
    sanitized === ".." ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitized)
  ) {
    return "received-file";
  }
  return sanitized;
}

function getUniqueDestination(fileName: string): string {
  const safeName = sanitizeFileName(fileName);
  const parsed = path.parse(safeName);
  let destination = path.join(receiveDirectory, safeName);
  let suffix = 1;
  while (fs.existsSync(destination)) {
    destination = path.join(receiveDirectory, `${parsed.name} (${suffix++})${parsed.ext}`);
  }
  return destination;
}

function statusOf(session: TransferSession | null): FileTransferStatus {
  return {
    active: Boolean(session),
    requiresApproval: session?.requiresApproval ?? false,
    ...(session ? {
      ...(session.code ? { code: session.code } : {}),
      expiresAt: new Date(session.expiresAt).toISOString(),
      activeFile: session.activeFile && { ...session.activeFile },
      approvalRequest: session.approvalRequest?.status === "pending"
        ? {
          id: session.approvalRequest.id,
          name: session.approvalRequest.name,
          totalBytes: session.approvalRequest.totalBytes,
          remoteAddress: session.approvalRequest.remoteAddress,
          expiresAt: new Date(session.approvalRequest.expiresAt).toISOString(),
        }
        : null,
    } : {}),
    port: PORT,
    addresses: session ? getLanAddresses() : [],
    receiveDirectory,
    receivedFiles: session ? [...session.receivedFiles] : lastReceivedFiles,
  };
}

let currentSession: TransferSession | null = null;
let lastReceivedFiles: ReceivedFile[] = [];
let pendingSessionClose: Promise<void> = Promise.resolve();

function closeSession(session: TransferSession): Promise<void> {
  for (const client of session.chatClients) client.terminate();
  for (const socket of session.sockets) socket.destroy();
  return new Promise((resolve) => {
    session.server.close(() => resolve());
  });
}

function scheduleSessionClose(session: TransferSession): Promise<void> {
  pendingSessionClose = pendingSessionClose.then(() => new Promise<void>((resolve, reject) => {
    setImmediate(() => {
      void closeSession(session).then(resolve, reject);
    });
  }));
  return pendingSessionClose;
}

function getCurrentSession(): TransferSession | null {
  if (currentSession && Date.now() >= currentSession.expiresAt && !currentSession.activeFile) {
    const expired = currentSession;
    currentSession = null;
    lastReceivedFiles = [...expired.receivedFiles];
    void scheduleSessionClose(expired);
  }
  return currentSession;
}

function sendJson(res: Response, status: number, body: Record<string, unknown>) {
  res.status(status).json(body);
}

export async function startFileTransferSession(requiresApproval = false): Promise<FileTransferStatus> {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
    throw new Error("FILE_TRANSFER_PORT phải là một cổng từ 1 đến 65535.");
  }
  const existing = getCurrentSession();
  if (existing?.activeFile) {
    throw new Error("Không thể thay mã khi đang nhận file.");
  }
  if (existing) {
    currentSession = null;
    await scheduleSessionClose(existing);
  }
  await pendingSessionClose;

  fs.mkdirSync(receiveDirectory, { recursive: true });
  const code = requiresApproval ? null : Array.from(
    { length: 8 },
    () => CODE_CHARACTERS[crypto.randomInt(CODE_CHARACTERS.length)],
  ).join("");
  const chatServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const session: TransferSession = {
    code,
    requiresApproval,
    expiresAt: Date.now() + SESSION_TTL_MS,
    server: createServer(),
    chatServer,
    sockets: new Set(),
    chatClients: new Set(),
    chatMessages: [],
    failedCodes: 0,
    activeFile: null,
    approvalRequest: null,
    receivedBytes: 0,
    receivedFiles: [],
  };
  const receiverApp = express();
  receiverApp.disable("x-powered-by");
  receiverApp.use((req, res, next) => {
    res.setHeader("Connection", "close");
    if (!isLocalAppOrigin(req.header("origin"))) {
      req.resume();
      return sendJson(res, 403, { success: false, error: "Chỉ cho phép kết nối từ ứng dụng trên máy gửi." });
    }
    res.setHeader("Access-Control-Allow-Origin", req.header("origin")!);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "X-Transfer-Code, X-File-Name, X-File-Size, X-Transfer-Request, Content-Type");
    res.setHeader("Access-Control-Max-Age", "300");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  receiverApp.post("/request", (req: Request, res: Response) => {
    if (currentSession !== session || !session.requiresApproval) {
      return sendJson(res, 409, { success: false, error: "Máy nhận không mở phiên yêu cầu chấp thuận." });
    }
    const totalBytes = Number(req.header("x-file-size"));
    if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0 || totalBytes > MAX_FILE_BYTES) {
      return sendJson(res, 413, { success: false, error: "Kích thước file không hợp lệ hoặc vượt giới hạn 4 GiB." });
    }
    if (session.receivedBytes + totalBytes > MAX_SESSION_BYTES) {
      return sendJson(res, 413, { success: false, error: "Phiên nhận đã đạt giới hạn tổng 16 GiB." });
    }
    if (
      session.activeFile ||
      (session.approvalRequest &&
        ["pending", "approved"].includes(session.approvalRequest.status) &&
        Date.now() < session.approvalRequest.expiresAt)
    ) {
      return sendJson(res, 409, { success: false, error: "Máy nhận đang xem xét một yêu cầu khác." });
    }
    const rawName = req.header("x-file-name") || "received-file";
    let suppliedName: string;
    try {
      suppliedName = decodeURIComponent(rawName);
    } catch {
      return sendJson(res, 400, { success: false, error: "Tên file không hợp lệ." });
    }
    session.approvalRequest = {
      id: crypto.randomBytes(24).toString("hex"),
      name: sanitizeFileName(suppliedName),
      totalBytes,
      remoteAddress: req.socket.remoteAddress?.replace(/^::ffff:/, "") || "unknown",
      expiresAt: Date.now() + APPROVAL_TTL_MS,
      status: "pending",
    };
    return sendJson(res, 202, {
      success: true,
      requestId: session.approvalRequest.id,
      expiresAt: new Date(session.approvalRequest.expiresAt).toISOString(),
    });
  });
  receiverApp.get("/request/:id", (req: Request, res: Response) => {
    if (currentSession !== session) {
      return sendJson(res, 410, { success: false, error: "Phiên nhận đã đóng hoặc hết hạn." });
    }
    const request = session.approvalRequest;
    if (!request || request.id !== req.params.id) {
      return sendJson(res, 404, { success: false, error: "Không tìm thấy yêu cầu nhận file." });
    }
    if (
      (request.status === "pending" || request.status === "approved") &&
      Date.now() >= request.expiresAt
    ) {
      request.status = "expired";
    }
    return sendJson(res, 200, { success: true, status: request.status });
  });
  receiverApp.post("/upload", async (req: Request, res: Response) => {
    if (
      currentSession !== session ||
      (Date.now() >= session.expiresAt && !session.activeFile)
    ) {
      if (currentSession === session) {
        currentSession = null;
        lastReceivedFiles = [...session.receivedFiles];
        void scheduleSessionClose(session);
      }
      return sendJson(res, 410, { success: false, error: "Phiên nhận đã hết hạn hoặc đã đóng." });
    }
    let approvalRequest: TransferSession["approvalRequest"] = null;
    if (session.requiresApproval) {
      const requestId = req.header("x-transfer-request") || "";
      approvalRequest = session.approvalRequest;
      if (
        !approvalRequest ||
        approvalRequest.id !== requestId ||
        approvalRequest.status !== "approved" ||
        Date.now() >= approvalRequest.expiresAt
      ) {
        return sendJson(res, 403, { success: false, error: "Yêu cầu gửi file chưa được máy nhận chấp thuận." });
      }
    } else {
      const suppliedCode = req.header("x-transfer-code") || "";
      if (suppliedCode !== session.code) {
        session.failedCodes += 1;
        if (session.failedCodes >= MAX_FAILED_CODES) {
          currentSession = null;
          lastReceivedFiles = [...session.receivedFiles];
          void scheduleSessionClose(session);
        }
        return sendJson(res, 403, { success: false, error: "Mã kết nối không đúng." });
      }
    }
    const totalBytes = Number(req.header("content-length"));
    if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0 || totalBytes > MAX_FILE_BYTES) {
      return sendJson(res, 413, { success: false, error: "File rỗng, quá lớn hoặc thiếu Content-Length (giới hạn 4 GiB)." });
    }
    if (session.receivedBytes + totalBytes > MAX_SESSION_BYTES) {
      return sendJson(res, 413, { success: false, error: "Phiên nhận đã đạt giới hạn tổng 16 GiB. Tạo phiên mới để tiếp tục." });
    }
    if (approvalRequest) {
      let uploadName: string;
      try {
        uploadName = sanitizeFileName(decodeURIComponent(req.header("x-file-name") || ""));
      } catch {
        return sendJson(res, 400, { success: false, error: "Tên file không hợp lệ." });
      }
      if (Number(req.header("content-length")) !== approvalRequest.totalBytes || uploadName !== approvalRequest.name) {
        return sendJson(res, 403, { success: false, error: "Thông tin file không khớp yêu cầu đã được chấp thuận." });
      }
    }
    if (session.activeFile) {
      return sendJson(res, 409, { success: false, error: "Đang nhận một file khác; hãy thử lại sau." });
    }
    let suppliedName = req.header("x-file-name") || "received-file";
    try {
      suppliedName = decodeURIComponent(suppliedName);
    } catch {
      return sendJson(res, 400, { success: false, error: "Tên file không hợp lệ." });
    }
    const fileName = sanitizeFileName(suppliedName);
    const destination = getUniqueDestination(fileName);
    const directory = path.resolve(receiveDirectory);
    const directoryPrefix = directory.endsWith(path.sep) ? directory : `${directory}${path.sep}`;
    if (!path.resolve(destination).startsWith(directoryPrefix)) {
      return sendJson(res, 400, { success: false, error: "Tên file không hợp lệ." });
    }

    session.activeFile = { name: fileName, receivedBytes: 0, totalBytes };
    if (approvalRequest) approvalRequest.status = "expired";
    const progress = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        session.activeFile!.receivedBytes += chunk.length;
        if (session.activeFile!.receivedBytes > totalBytes) {
          callback(new Error("Dữ liệu nhận vượt quá kích thước đã khai báo."));
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        req,
        progress,
        fs.createWriteStream(destination, { flags: "wx" }),
      );
      if (session.activeFile.receivedBytes !== totalBytes) {
        throw new Error("File nhận được không đầy đủ.");
      }
      session.receivedFiles.unshift({
        name: path.basename(destination),
        bytes: totalBytes,
        receivedAt: new Date().toISOString(),
      });
      session.receivedBytes += totalBytes;
      lastReceivedFiles = [...session.receivedFiles];
      return sendJson(res, 201, { success: true, name: path.basename(destination), bytes: totalBytes });
    } catch (error) {
      fs.rmSync(destination, { force: true });
      if (!res.headersSent) {
        sendJson(res, 400, {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      session.activeFile = null;
    }
  });
  session.server.on("upgrade", (request, socket, head) => {
    let requestPath = "";
    try {
      requestPath = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (currentSession !== session || Date.now() >= session.expiresAt) {
      socket.write("HTTP/1.1 410 Gone\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (
      requestPath !== "/chat" ||
      session.requiresApproval ||
      !session.code ||
      !isLocalAppOrigin(request.headers.origin)
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    chatServer.handleUpgrade(request, socket, head, (client) => {
      chatServer.emit("connection", client, request);
    });
  });
  chatServer.on("connection", (client: WebSocket) => {
    session.chatClients.add(client);
    client.once("close", () => session.chatClients.delete(client));
    client.on("error", (error) => {
      console.warn("[FileTransfer] Lỗi kết nối chat:", error.message);
    });
    let clientId: string | null = null;
    let lastMessageAt = 0;
    client.on("message", (data) => {
      let payload: { type?: unknown; code?: unknown; clientId?: unknown; text?: unknown };
      try {
        payload = JSON.parse(data.toString()) as typeof payload;
      } catch {
        client.close(1007, "Invalid message");
        return;
      }
      if (!payload || typeof payload !== "object") {
        client.close(1007, "Invalid message");
        return;
      }
      if (!clientId) {
        if (
          payload.type !== "authenticate" ||
          payload.code !== session.code ||
          typeof payload.clientId !== "string" ||
          !/^[A-Za-z0-9_-]{1,64}$/.test(payload.clientId)
        ) {
          client.close(1008, "Invalid chat code");
          return;
        }
        clientId = payload.clientId;
        client.send(JSON.stringify({ type: "authenticated" }));
        client.send(JSON.stringify({ type: "history", messages: session.chatMessages }));
        return;
      }
      if (payload.type !== "message" || typeof payload.text !== "string") {
        client.close(1008, "Invalid chat message");
        return;
      }
      const text = payload.text.trim();
      if (!text) return;
      if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
        client.send(JSON.stringify({ type: "error", error: `Tin nhắn tối đa ${MAX_CHAT_MESSAGE_LENGTH} ký tự.` }));
        return;
      }
      if (Date.now() - lastMessageAt < 150) {
        client.send(JSON.stringify({ type: "error", error: "Vui lòng đợi một chút trước khi gửi tiếp." }));
        return;
      }
      lastMessageAt = Date.now();
      const message: FileTransferChatMessage = {
        id: crypto.randomUUID(),
        clientId,
        text,
        sentAt: new Date().toISOString(),
      };
      session.chatMessages.push(message);
      if (session.chatMessages.length > MAX_CHAT_MESSAGES) session.chatMessages.shift();
      const serialized = JSON.stringify({ type: "message", message });
      for (const recipient of session.chatClients) {
        if (recipient.readyState === WebSocket.OPEN) recipient.send(serialized);
      }
    });
  });
  session.server.on("connection", (socket) => {
    session.sockets.add(socket);
    socket.once("close", () => session.sockets.delete(socket));
  });
  session.server.on("request", receiverApp);
  try {
    await new Promise<void>((resolve, reject) => {
      session.server.once("error", reject);
      session.server.listen(PORT, "0.0.0.0", () => {
        session.server.removeListener("error", reject);
        resolve();
      });
    });
  } catch (error) {
    throw new Error(
      `Không mở được cổng nhận file ${PORT}. Có thể cổng đang được dùng hoặc bị chặn: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  currentSession = session;
  return statusOf(session);
}

export async function stopFileTransferSession(): Promise<FileTransferStatus> {
  const session = getCurrentSession();
  if (!session) return statusOf(null);
  if (session.activeFile) throw new Error("Đang nhận file; hãy đợi chuyển xong rồi đóng phiên.");
  currentSession = null;
  lastReceivedFiles = [...session.receivedFiles];
  await scheduleSessionClose(session);
  return statusOf(null);
}

export function respondToFileTransferRequest(requestId: string, approved: boolean): FileTransferStatus {
  const session = getCurrentSession();
  const request = session?.approvalRequest;
  if (!session?.requiresApproval || !request || request.id !== requestId || request.status !== "pending") {
    throw new Error("Yêu cầu nhận file không còn chờ xử lý.");
  }
  if (Date.now() >= request.expiresAt) {
    request.status = "expired";
    throw new Error("Yêu cầu nhận file đã hết hạn.");
  }
  request.status = approved ? "approved" : "rejected";
  request.expiresAt = Date.now() + APPROVAL_TTL_MS;
  return statusOf(session);
}

export function setReceivedFilesDirectory(directory: unknown): FileTransferStatus {
  if (getCurrentSession()) {
    throw new Error("Hãy đóng phiên nhận file trước khi đổi thư mục lưu.");
  }
  if (typeof directory !== "string" || !directory.trim() || !path.isAbsolute(directory.trim())) {
    throw new Error("Nhập đường dẫn thư mục tuyệt đối hợp lệ.");
  }
  const nextDirectory = path.resolve(directory.trim());
  fs.mkdirSync(nextDirectory, { recursive: true });
  fs.accessSync(nextDirectory, fs.constants.W_OK);
  fs.mkdirSync(APP_DATA_DIRECTORY, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ receiveDirectory: nextDirectory }, null, 2), "utf8");
  receiveDirectory = nextDirectory;
  return statusOf(null);
}

export function getFileTransferStatus(): FileTransferStatus {
  return statusOf(getCurrentSession());
}

export function getReceivedFilesDirectory(): string {
  return receiveDirectory;
}
