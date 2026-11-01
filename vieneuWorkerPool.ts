import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKER_COUNT = 4;
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

interface SynthesisRequest {
  id: number;
  text: string;
  voice: string;
  output: string;
  speed: number;
}

interface PendingRequest {
  request: SynthesisRequest;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface WorkerSlot {
  child: ChildProcessWithoutNullStreams;
  ready: Promise<void>;
  busy: boolean;
  current?: PendingRequest;
  idleTimer?: NodeJS.Timeout;
  stderrTail: string;
}

function workerCount(): number {
  const configured = Number(process.env.VIENEU_WORKERS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(8, Math.floor(configured))
    : DEFAULT_WORKER_COUNT;
}

class VieNeuWorkerPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: PendingRequest[] = [];
  private nextRequestId = 1;
  private closed = false;

  constructor() {
    process.once("exit", () => this.close());
  }

  synthesize(text: string, voice: string, output: string, speed: number): Promise<void> {
    if (this.closed) return Promise.reject(new Error("VieNeu worker pool is closed."));
    return new Promise((resolve, reject) => {
      this.queue.push({
        request: { id: this.nextRequestId++, text, voice, output, speed },
        resolve,
        reject,
      });
      this.dispatch();
    });
  }

  close(): void {
    this.closed = true;
    for (const pending of this.queue.splice(0)) {
      pending.reject(new Error("VieNeu worker pool is shutting down."));
    }
    for (const slot of this.slots) slot.child.kill();
    this.slots.length = 0;
  }

  private dispatch(): void {
    while (!this.closed && this.queue.length > 0) {
      let slot = this.slots.find((candidate) => !candidate.busy);
      if (!slot && this.slots.length < workerCount()) {
        slot = this.startWorker();
      }
      if (!slot) return;

      const pending = this.queue.shift()!;
      if (slot.idleTimer) {
        clearTimeout(slot.idleTimer);
        slot.idleTimer = undefined;
      }
      slot.busy = true;
      slot.current = pending;
      void this.run(slot, pending);
    }
  }

  private startWorker(): WorkerSlot {
    const scriptPath = path.join(__dirname, "scripts", "vieneu_worker.py");
    const virtualEnvPython = path.join(
      __dirname,
      ".venv-vieneu",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    );
    const python =
      process.env.VIENEU_PYTHON ||
      (fs.existsSync(virtualEnvPython) ? virtualEnvPython : undefined) ||
      process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const child = spawn(python, [scriptPath], {
      cwd: __dirname,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        VIENEU_MODEL_DIR: path.relative(__dirname, path.join(__dirname, "models", "vieneu")),
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const slot: WorkerSlot = { child, ready: Promise.resolve(), busy: false, stderrTail: "" };
    this.slots.push(slot);

    slot.ready = new Promise<void>((resolve, reject) => {
      let settled = false;
      const lines = readline.createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        let message: any;
        try {
          message = JSON.parse(line);
        } catch {
          console.warn(`[VieNeu worker] Ignoring unexpected stdout: ${line.slice(0, 300)}`);
          return;
        }
        if (!settled && message.ready) {
          settled = true;
          resolve();
          return;
        }
        if (slot.current && message.id === slot.current.request.id) {
          const current = slot.current;
          slot.current = undefined;
          slot.busy = false;
          if (message.ok) current.resolve();
          else current.reject(new Error(message.error || "VieNeu synthesis failed."));
          this.scheduleIdleShutdown(slot);
          this.dispatch();
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        const detail = chunk.trim();
        if (detail) {
          slot.stderrTail = `${slot.stderrTail}\n${detail}`.slice(-4000);
          console.warn(`[VieNeu worker ${child.pid ?? "starting"}] ${detail.slice(-2000)}`);
        }
      });
      child.once("error", (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
        this.failWorker(slot, error);
      });
      child.once("close", (code, signal) => {
        const detail = slot.stderrTail.trim();
        const error = new Error(
          `VieNeu worker exited (code=${code}, signal=${signal || "none"}).${detail ? ` ${detail}` : ""}`,
        );
        if (!settled) {
          settled = true;
          reject(error);
        }
        this.failWorker(slot, error);
      });
    });

    return slot;
  }

  private async run(slot: WorkerSlot, pending: PendingRequest): Promise<void> {
    try {
      await slot.ready;
      if (slot.current !== pending) return;
      slot.child.stdin.write(`${JSON.stringify(pending.request)}\n`);
    } catch (error) {
      this.failWorker(slot, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private failWorker(slot: WorkerSlot, error: Error): void {
    const index = this.slots.indexOf(slot);
    if (index >= 0) this.slots.splice(index, 1);
    const current = slot.current;
    slot.current = undefined;
    slot.busy = false;
    current?.reject(error);
    // Do not repeatedly respawn a failing interpreter while queued work remains.
    // A later synthesis request can create a fresh worker after this failure is surfaced.
    for (const pending of this.queue.splice(0)) pending.reject(error);
  }

  private scheduleIdleShutdown(slot: WorkerSlot): void {
    const configured = Number(process.env.VIENEU_WORKER_IDLE_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(configured) && configured >= 0
      ? configured
      : DEFAULT_IDLE_TIMEOUT_MS;
    if (timeoutMs === 0 || slot.busy || this.closed) return;
    slot.idleTimer = setTimeout(() => {
      if (slot.busy || this.queue.length > 0) return;
      const index = this.slots.indexOf(slot);
      if (index >= 0) this.slots.splice(index, 1);
      slot.child.kill();
    }, timeoutMs);
    slot.idleTimer.unref();
  }
}

export const vieneuWorkerPool = new VieNeuWorkerPool();
