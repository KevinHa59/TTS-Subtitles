import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { VideoDubbingProject } from "./src/types/videoDubbing";

const PROJECT_ID = /^vdp_[0-9a-f]{32}$/;
const MAX_PROJECTS = 500;
const MAX_PROJECT_BYTES = 32 * 1024 * 1024;

/** Durable project metadata. Media and generated artifacts remain owned by their existing job folders. */
export class VideoDubbingProjects {
  private readonly projects = new Map<string, VideoDubbingProject>();
  private readonly projectDirectories = new Map<string, string>();
  private readonly persistedSourceSrtContent = new Map<string, string>();
  private readonly updateQueues = new Map<string, Promise<void>>();
  private initialized?: Promise<void>;
  private readonly directory: string;

  constructor(storageDirectory: string) {
    this.directory = path.resolve(storageDirectory, "projects");
  }

  initialize(): Promise<void> {
    this.initialized ??= this.restore();
    return this.initialized;
  }

  async list(): Promise<VideoDubbingProject[]> {
    await this.initialize();
    return [...this.projects.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((project) => structuredClone(project));
  }

  async get(id: string): Promise<VideoDubbingProject | null> {
    await this.initialize();
    const project = PROJECT_ID.test(id) ? this.projects.get(id) : undefined;
    return project ? structuredClone(project) : null;
  }

  async create(name: unknown): Promise<VideoDubbingProject> {
    await this.initialize();
    if (this.projects.size >= MAX_PROJECTS) throw new Error("Đã đạt giới hạn số project.");
    const cleanName = this.validateName(name);
    const now = Date.now();
    const project: VideoDubbingProject = {
      id: `vdp_${randomBytes(16).toString("hex")}`,
      name: cleanName,
      jobIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const directory = path.join(this.directory, this.folderName(project.name, project.id));
    fs.mkdirSync(directory, { recursive: false });
    this.projects.set(project.id, project);
    this.projectDirectories.set(project.id, directory);
    this.persist(project);
    return structuredClone(project);
  }

  async update(id: string, input: unknown): Promise<VideoDubbingProject> {
    const previousUpdate = this.updateQueues.get(id);
    let releaseUpdate!: () => void;
    const queuedUpdate = new Promise<void>((resolve) => {
      releaseUpdate = resolve;
    });
    this.updateQueues.set(id, queuedUpdate);
    if (previousUpdate) await previousUpdate;

    try {
      return await this.applyUpdate(id, input);
    } finally {
      releaseUpdate();
      if (this.updateQueues.get(id) === queuedUpdate) {
        this.updateQueues.delete(id);
      }
    }
  }

  private async applyUpdate(id: string, input: unknown): Promise<VideoDubbingProject> {
    await this.initialize();
    const project = this.require(id);
    const previousName = project.name;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Dữ liệu project không hợp lệ.");
    const value = input as Record<string, unknown>;
    if (value.name !== undefined) project.name = this.validateName(value.name);
    if (value.logoFileName !== undefined) {
      if (value.logoFileName !== null && (typeof value.logoFileName !== "string" || !/^overlay-logo\.(png|jpe?g|webp)$/.test(value.logoFileName))) {
        throw new Error("Tên logo project không hợp lệ.");
      }
      project.logoFileName = (value.logoFileName as string | null) ?? undefined;
    }
    if (value.jobIds !== undefined) {
      if (!Array.isArray(value.jobIds) || value.jobIds.length > 500 || value.jobIds.some((item) => typeof item !== "string" || !/^vd_[0-9a-f]{32}$/.test(item))) {
        throw new Error("Danh sách job trong project không hợp lệ.");
      }
      const nextJobIds = [...new Set(value.jobIds as string[])];
      const alreadyOwned = [...this.projects.values()].find((other) => other.id !== id && other.jobIds.some((jobId) => nextJobIds.includes(jobId)));
      if (alreadyOwned) throw new Error(`Job đã thuộc project “${alreadyOwned.name}”; không thể chia sẻ job giữa hai project để tránh xóa nhầm dữ liệu.`);
      project.jobIds = nextJobIds;
    }
    if (value.activeJobId !== undefined) {
      if (value.activeJobId !== null && (typeof value.activeJobId !== "string" || !project.jobIds.includes(value.activeJobId))) throw new Error("Job đang mở phải thuộc project.");
      project.activeJobId = (value.activeJobId as string | null) ?? undefined;
    }
    if (value.srt !== undefined) {
      if (value.srt === null) project.srt = undefined;
      else {
        const srt = value.srt as Record<string, unknown>;
        if (!srt || typeof srt.fileName !== "string" || typeof srt.content !== "string" || Buffer.byteLength(srt.content, "utf8") > 16 * 1024 * 1024) throw new Error("Tệp SRT của project không hợp lệ hoặc quá lớn.");
        project.srt = { fileName: path.basename(srt.fileName).slice(0, 255), content: srt.content };
      }
    }
    if (value.sourceSrts !== undefined) {
      if (!Array.isArray(value.sourceSrts) || value.sourceSrts.length > 500) throw new Error("Danh sách SRT nguồn không hợp lệ.");
      const sourceSrts = value.sourceSrts.map((entry) => {
        if (!entry || typeof entry !== "object") throw new Error("Tệp SRT nguồn không hợp lệ.");
        const srt = entry as Record<string, unknown>;
        if (typeof srt.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(srt.id) || typeof srt.fileName !== "string" || typeof srt.content !== "string" || Buffer.byteLength(srt.content, "utf8") > 16 * 1024 * 1024) throw new Error("Tệp SRT nguồn không hợp lệ hoặc quá lớn.");
        if (srt.videoId !== undefined && (typeof srt.videoId !== "string" || !/^vd_[0-9a-f]{32}$/.test(srt.videoId))) throw new Error("Liên kết video của SRT không hợp lệ.");
        if (srt.matchByName !== undefined && typeof srt.matchByName !== "boolean") throw new Error("Cấu hình ghép tên SRT không hợp lệ.");
        return { id: srt.id, fileName: path.basename(srt.fileName).slice(0, 255), content: srt.content, ...(typeof srt.videoId === "string" ? { videoId: srt.videoId } : {}), ...(typeof srt.matchByName === "boolean" ? { matchByName: srt.matchByName } : {}) };
      });
      if (sourceSrts.reduce((total, item) => total + Buffer.byteLength(item.content, "utf8"), 0) > MAX_PROJECT_BYTES) throw new Error("Tổng dung lượng SRT của project vượt giới hạn.");
      project.sourceSrts = sourceSrts;
    }
    if (value.workspace !== undefined) {
      if (value.workspace === null) project.workspace = undefined;
      else if (!value.workspace || typeof value.workspace !== "object" || Array.isArray(value.workspace) || Buffer.byteLength(JSON.stringify(value.workspace), "utf8") > MAX_PROJECT_BYTES) throw new Error("Settings project không hợp lệ hoặc vượt giới hạn dung lượng.");
      else project.workspace = value.workspace as Record<string, unknown>;
    }
    if (project.name !== previousName) {
      try {
        await this.renameProjectDirectory(project);
      } catch (error) {
        project.name = previousName;
        throw error;
      }
    }
    project.updatedAt = Date.now();
    this.persist(project);
    return structuredClone(project);
  }

  async delete(id: string, deleteJob: (jobId: string) => Promise<boolean>): Promise<boolean> {
    await this.initialize();
    const project = this.projects.get(id);
    if (!project || !PROJECT_ID.test(id)) return false;
    // Remove only jobs explicitly owned by this project; unrelated and legacy jobs remain untouched.
    for (const jobId of project.jobIds) await deleteJob(jobId);
    this.projects.delete(id);
    await fs.promises.rm(this.projectPath(id), { recursive: true, force: true });
    this.projectDirectories.delete(id);
    return true;
  }

  getProjectDirectory(id: string): string | null {
    if (!PROJECT_ID.test(id) || !this.projects.has(id)) return null;
    return this.projectPath(id);
  }

  openProjectFolder(id: string): void {
    const directory = this.getProjectDirectory(id);
    if (!directory || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      throw new Error("Không tìm thấy thư mục project.");
    }
    const command = process.platform === "win32"
      ? "explorer.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
    const child = spawn(command, [directory], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", (error) => {
      console.error("[VideoDubbing] Không mở được thư mục project:", error);
    });
    child.unref();
  }

  getProjectJobsDirectory(id: string): string | null {
    const directory = this.getProjectDirectory(id);
    return directory ? path.join(directory, "jobs") : null;
  }

  getProjectAssetsDirectory(id: string): string | null {
    const directory = this.getProjectDirectory(id);
    return directory ? path.join(directory, "assets") : null;
  }

  private async restore(): Promise<void> {
    await fs.promises.mkdir(this.directory, { recursive: true });
    for (const entry of await fs.promises.readdir(this.directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const data = JSON.parse(await fs.promises.readFile(path.join(this.projectPath(entry.name), "project.json"), "utf8")) as VideoDubbingProject;
        if (!PROJECT_ID.test(data.id) || typeof data.name !== "string" || !Array.isArray(data.jobIds) || !Number.isFinite(data.createdAt) || !Number.isFinite(data.updatedAt) || this.projects.has(data.id)) continue;
        this.projects.set(data.id, data);
        this.projectDirectories.set(data.id, path.join(this.directory, entry.name));
        for (const sourceSrt of data.sourceSrts || []) {
          if (typeof sourceSrt.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(sourceSrt.id) && typeof sourceSrt.content === "string") {
            this.persistSourceSrtFile(data.id, sourceSrt.id, sourceSrt.content);
          }
        }
      } catch { /* Ignore invalid project metadata and leave files available for recovery. */ }
    }
  }

  private require(id: string): VideoDubbingProject {
    const project = PROJECT_ID.test(id) ? this.projects.get(id) : undefined;
    if (!project) throw new Error("Không tìm thấy project Video Dubbing.");
    return project;
  }

  private validateName(value: unknown): string {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 120) throw new Error("Tên project phải có từ 1 đến 120 ký tự.");
    return value.trim();
  }

  private projectPath(id: string): string {
    return this.projectDirectories.get(id) || path.join(this.directory, id);
  }

  private folderName(name: string, id: string): string {
    const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "project";
    return `${slug}_${id}`;
  }

  private async renameProjectDirectory(project: VideoDubbingProject): Promise<void> {
    const current = this.projectPath(project.id);
    const next = path.join(this.directory, this.folderName(project.name, project.id));
    if (path.resolve(current).toLowerCase() === path.resolve(next).toLowerCase()) return;
    await fs.promises.rename(current, next);
    this.projectDirectories.set(project.id, next);
  }

  private persist(project: VideoDubbingProject): void {
    const dir = this.projectPath(project.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const sourceSrt of project.sourceSrts || []) {
      this.persistSourceSrtFile(project.id, sourceSrt.id, sourceSrt.content);
    }
    const destination = path.join(dir, "project.json");
    const temporary = `${destination}.${randomBytes(6).toString("hex")}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(project), { encoding: "utf8", flag: "wx" });
    try { fs.renameSync(temporary, destination); }
    catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }

  private persistSourceSrtFile(projectId: string, sourceId: string, content: string): void {
    if (!PROJECT_ID.test(projectId) || !/^[a-zA-Z0-9_-]{1,100}$/.test(sourceId)) throw new Error("Đường dẫn SRT project không hợp lệ.");
    const cacheKey = `${projectId}:${sourceId}`;
    const destination = path.join(this.projectPath(projectId), "assets", "subtitles", `${sourceId}.srt`);
    if (this.persistedSourceSrtContent.get(cacheKey) === content && fs.existsSync(destination)) return;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomBytes(6).toString("hex")}.tmp`;
    fs.writeFileSync(temporary, content, { encoding: "utf8", flag: "wx" });
    try { fs.renameSync(temporary, destination); }
    catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
    this.persistedSourceSrtContent.set(cacheKey, content);
  }
}
