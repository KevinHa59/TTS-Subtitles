import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import express, { type Request, type Response } from "express";
import { createServer, type Server } from "http";

const PORT = Number.parseInt(process.env.FILE_TRANSFER_PORT || "39815", 10);
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_FILE_BYTES = 4 * 1024 ** 3;
const MAX_SESSION_BYTES = 16 * 1024 ** 3;
const MAX_FAILED_CODES = 10;
const RECEIVE_DIRECTORY = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "PiperTTSStudio",
  "received-files",
);
const CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface ReceivedFile {
  name: string;
  bytes: number;
  receivedAt: string;
}

interface TransferSession {
  code: string;
  expiresAt: number;
  server: Server;
  sockets: Set<import("net").Socket>;
  failedCodes: number;
  activeFile: { name: string; receivedBytes: number; totalBytes: number } | null;
  receivedBytes: number;
  receivedFiles: ReceivedFile[];
}

export interface FileTransferStatus {
  active: boolean;
  code?: string;
  expiresAt?: string;
  port: number;
  addresses: string[];
  receiveDirectory: string;
  activeFile?: TransferSession["activeFile"];
  receivedFiles: ReceivedFile[];
}

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
  let destination = path.join(RECEIVE_DIRECTORY, safeName);
  let suffix = 1;
  while (fs.existsSync(destination)) {
    destination = path.join(RECEIVE_DIRECTORY, `${parsed.name} (${suffix++})${parsed.ext}`);
  }
  return destination;
}

function statusOf(session: TransferSession | null): FileTransferStatus {
  return {
    active: Boolean(session),
    ...(session ? {
      code: session.code,
      expiresAt: new Date(session.expiresAt).toISOString(),
      activeFile: session.activeFile && { ...session.activeFile },
    } : {}),
    port: PORT,
    addresses: session ? getLanAddresses() : [],
    receiveDirectory: RECEIVE_DIRECTORY,
    receivedFiles: session ? [...session.receivedFiles] : lastReceivedFiles,
  };
}

let currentSession: TransferSession | null = null;
let lastReceivedFiles: ReceivedFile[] = [];
let pendingSessionClose: Promise<void> = Promise.resolve();

function closeSession(session: TransferSession): Promise<void> {
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

export async function startFileTransferSession(): Promise<FileTransferStatus> {
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

  fs.mkdirSync(RECEIVE_DIRECTORY, { recursive: true });
  const code = Array.from(
    { length: 8 },
    () => CODE_CHARACTERS[crypto.randomInt(CODE_CHARACTERS.length)],
  ).join("");
  const session: TransferSession = {
    code,
    expiresAt: Date.now() + SESSION_TTL_MS,
    server: createServer(),
    sockets: new Set(),
    failedCodes: 0,
    activeFile: null,
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
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "X-Transfer-Code, X-File-Name, Content-Type");
    res.setHeader("Access-Control-Max-Age", "300");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
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
    const totalBytes = Number(req.header("content-length"));
    if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0 || totalBytes > MAX_FILE_BYTES) {
      return sendJson(res, 413, { success: false, error: "File rỗng, quá lớn hoặc thiếu Content-Length (giới hạn 4 GiB)." });
    }
    if (session.receivedBytes + totalBytes > MAX_SESSION_BYTES) {
      return sendJson(res, 413, { success: false, error: "Phiên nhận đã đạt giới hạn tổng 16 GiB. Tạo phiên mới để tiếp tục." });
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
    const directory = path.resolve(RECEIVE_DIRECTORY);
    if (!path.resolve(destination).startsWith(`${directory}${path.sep}`)) {
      return sendJson(res, 400, { success: false, error: "Tên file không hợp lệ." });
    }

    session.activeFile = { name: fileName, receivedBytes: 0, totalBytes };
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

export function getFileTransferStatus(): FileTransferStatus {
  return statusOf(getCurrentSession());
}

export function getReceivedFilesDirectory(): string {
  return RECEIVE_DIRECTORY;
}
