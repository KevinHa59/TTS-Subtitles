import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import type {
  VideoDubbingMasterEditClip,
  VideoDubbingMasterEditState,
} from "./src/types/videoDubbing";
import { VideoDubbingManager } from "./videoDubbingManager";

interface PcmWav {
  buffer: Buffer;
  sampleRate: number;
  channels: number;
  dataOffset: number;
  dataLength: number;
  duration: number;
}

function readPcmWav(filePath: string): PcmWav {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("TTS Master không phải tệp WAV hợp lệ.");
  }
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkStart + chunkSize > buffer.length) break;
    if (chunkId === "fmt " && chunkSize >= 16) {
      format = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    } else if (chunkId === "data") {
      dataOffset = chunkStart;
      dataLength = chunkSize;
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }
  if (format !== 1 || bitsPerSample !== 16 || channels < 1 || sampleRate < 1 || dataOffset < 0) {
    throw new Error("TTS Master phải dùng PCM 16-bit để tách và gộp.");
  }
  const frameSize = channels * 2;
  dataLength -= dataLength % frameSize;
  return {
    buffer,
    sampleRate,
    channels,
    dataOffset,
    dataLength,
    duration: dataLength / frameSize / sampleRate,
  };
}

function createPcmWav(data: Buffer, sampleRate: number, channels: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export class VideoDubbingMasterEditCoordinator {
  private readonly activeJobs = new Set<string>();

  constructor(private readonly manager: VideoDubbingManager) {}

  isBusy(jobId: string): boolean {
    return this.activeJobs.has(jobId);
  }

  split(jobId: string): VideoDubbingMasterEditState {
    const job = this.manager.getJob(jobId);
    const masterPath = this.manager.getMasterAudioPath(jobId);
    const directory = this.manager.getJobDirectory(jobId);
    if (!job || !masterPath || !directory) throw new Error("TTS Master chưa được tạo.");
    if (this.activeJobs.has(jobId)) throw new Error("TTS Master đang được xử lý.");
    const segments = job.masterEditSegments;
    if (!segments?.length) {
      throw new Error(
        "TTS Master này chưa có metadata thời lượng từng câu. Hãy tạo lại TTS Master một lần trước khi tách.",
      );
    }
    const wav = readPcmWav(masterPath);
    const frameSize = wav.channels * 2;
    const samples = wav.buffer.subarray(wav.dataOffset, wav.dataOffset + wav.dataLength);
    const paddingFrames = Math.round(wav.sampleRate * 0.06);
    const threshold = 500;
    const clips: VideoDubbingMasterEditClip[] = [];
    const clipDirectory = path.join(directory, "tts-master-clips");
    const operationId = randomBytes(6).toString("hex");
    const temporaryDirectory = `${clipDirectory}.${operationId}.tmp`;
    const backupDirectory = `${clipDirectory}.${operationId}.bak`;
    fs.mkdirSync(temporaryDirectory, { recursive: false });
    try {
      for (const [index, segment] of segments.entries()) {
        const from = Math.max(0, Math.floor(segment.startTime * wav.sampleRate));
        const to = Math.min(
          Math.floor(wav.duration * wav.sampleRate),
          Math.ceil((segment.startTime + segment.durationSeconds) * wav.sampleRate),
        );
        if (to <= from) continue;
        let first = -1;
        let last = -1;
        for (let frame = from; frame < to; frame += 1) {
          let peak = 0;
          for (let channel = 0; channel < wav.channels; channel += 1) {
            peak = Math.max(
              peak,
              Math.abs(samples.readInt16LE(frame * frameSize + channel * 2)),
            );
          }
          if (peak >= threshold) {
            if (first < 0) first = frame;
            last = frame;
          }
        }
        if (first < 0) continue;
        first = Math.max(from, first - paddingFrames);
        last = Math.min(to - 1, last + paddingFrames);
        const id = randomBytes(12).toString("hex");
        const fileName = `${id}.wav`;
        const clipData = samples.subarray(first * frameSize, (last + 1) * frameSize);
        fs.writeFileSync(
          path.join(temporaryDirectory, fileName),
          createPcmWav(clipData, wav.sampleRate, wav.channels),
        );
        clips.push({
          id,
          fileName,
          startTime: segment.startTime + (first - from) / wav.sampleRate,
          durationSeconds: (last + 1 - first) / wav.sampleRate,
          text: segment.text || `Câu ${index + 1}`,
        });
      }
      if (!clips.length) throw new Error("Không tìm thấy đoạn thoại có âm thanh trong TTS Master.");
      const hadPreviousDirectory = fs.existsSync(clipDirectory);
      if (hadPreviousDirectory) fs.renameSync(clipDirectory, backupDirectory);
      try {
        fs.renameSync(temporaryDirectory, clipDirectory);
      } catch (error) {
        if (hadPreviousDirectory && fs.existsSync(backupDirectory)) {
          fs.renameSync(backupDirectory, clipDirectory);
        }
        throw error;
      }
      if (hadPreviousDirectory) {
        try {
          fs.rmSync(backupDirectory, { recursive: true, force: true });
        } catch (error) {
          console.error("[VideoDubbing] Không thể dọn clip chỉnh sửa cũ:", error);
        }
      }
    } catch (error) {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }
    const state: VideoDubbingMasterEditState = {
      status: "ready",
      durationSeconds: wav.duration,
      clips,
      updatedAt: Date.now(),
    };
    this.manager.setMasterEditState(jobId, state);
    return state;
  }

  createPreviewWav(jobId: string): Buffer {
    const job = this.manager.getJob(jobId);
    if (!job?.masterEdit || !this.manager.getJobDirectory(jobId)) {
      throw new Error("Chưa tách TTS Master để tạo preview.");
    }
    return this.composeEditedMaster(jobId);
  }

  private composeEditedMaster(jobId: string): Buffer {
    const job = this.manager.getJob(jobId);
    const edit = job?.masterEdit;
    const directory = this.manager.getJobDirectory(jobId);
    const originalPath = this.manager.getMasterAudioPath(jobId);
    if (!job || !edit || !directory || !originalPath) {
      throw new Error("Chưa tách TTS Master để tạo audio chỉnh sửa.");
    }
    const wav = readPcmWav(originalPath);
    const frameSize = wav.channels * 2;
    const sourceClipDirectory = path.join(directory, "tts-master-clips");
    const maxDuration = job.metadata?.durationSeconds || wav.duration;
    const outputDuration = Math.max(
      edit.durationSeconds,
      ...edit.clips.map((clip) => clip.startTime + clip.durationSeconds),
    );
    if (outputDuration > maxDuration + 1 / wav.sampleRate) {
      throw new Error("Có clip nằm ngoài thời lượng video.");
    }
    const output = Buffer.alloc(
      Math.ceil(outputDuration * wav.sampleRate) * frameSize,
    );
    for (const clip of edit.clips) {
      if (clip.startTime + clip.durationSeconds > maxDuration + 1 / wav.sampleRate) {
        throw new Error(`Clip "${clip.text}" vượt quá thời lượng video.`);
      }
      if (!/^[a-f0-9]{24}\.wav$/.test(clip.fileName)) {
        throw new Error("Tên tệp clip không hợp lệ.");
      }
      const clipWav = readPcmWav(path.join(sourceClipDirectory, clip.fileName));
      if (clipWav.sampleRate !== wav.sampleRate || clipWav.channels !== wav.channels) {
        throw new Error("Định dạng clip không khớp với TTS Master.");
      }
      const clipData = clipWav.buffer.subarray(
        clipWav.dataOffset,
        clipWav.dataOffset + clipWav.dataLength,
      );
      const offset = Math.round(clip.startTime * wav.sampleRate) * frameSize;
      if (offset + clipData.length > output.length) {
        throw new Error(`Clip "${clip.text}" vượt quá giới hạn timeline.`);
      }
      for (let byteOffset = 0; byteOffset + 1 < clipData.length; byteOffset += 2) {
        const mixed =
          output.readInt16LE(offset + byteOffset) + clipData.readInt16LE(byteOffset);
        output.writeInt16LE(Math.max(-32768, Math.min(32767, mixed)), offset + byteOffset);
      }
    }
    return output;
  }

  updateClips(jobId: string, input: unknown): VideoDubbingMasterEditState {
    const job = this.manager.getJob(jobId);
    const current = job?.masterEdit;
    if (!current || current.status === "merging") throw new Error("Chưa tách TTS Master để chỉnh sửa.");
    if (!Array.isArray(input) || input.length !== current.clips.length) {
      throw new Error("Danh sách vị trí clip không hợp lệ.");
    }
    const positions = new Map<string, number>();
    for (const item of input) {
      if (
        !item ||
        typeof item.id !== "string" ||
        !Number.isFinite(item.startTime) ||
        item.startTime < 0
      ) {
        throw new Error("Vị trí clip không hợp lệ.");
      }
      positions.set(item.id, item.startTime);
    }
    if (positions.size !== current.clips.length || current.clips.some((clip) => !positions.has(clip.id))) {
      throw new Error("Danh sách clip không khớp với TTS Master.");
    }
    const maxDuration = job.metadata?.durationSeconds || current.durationSeconds;
    if (
      current.clips.some(
        (clip) =>
          positions.get(clip.id)! + clip.durationSeconds >
          maxDuration + 0.001,
      )
    ) {
      throw new Error("Clip không thể vượt quá thời lượng video.");
    }
    const updated = {
      ...current,
      status: "ready" as const,
      error: undefined,
      updatedAt: Date.now(),
      clips: current.clips.map((clip) => ({
        ...clip,
        startTime: positions.get(clip.id)!,
      })),
    };
    this.manager.setMasterEditState(jobId, updated);
    return updated;
  }

  merge(jobId: string): VideoDubbingMasterEditState {
    const job = this.manager.getJob(jobId);
    const current = job?.masterEdit;
    const directory = this.manager.getJobDirectory(jobId);
    if (!job || !current || !directory) throw new Error("Chưa tách TTS Master để gộp.");
    if (this.activeJobs.has(jobId)) throw new Error("TTS Master đang được xử lý.");
    const originalPath = this.manager.getMasterAudioPath(jobId);
    if (!originalPath) throw new Error("TTS Master gốc không còn khả dụng.");
    const temporaryPath = path.join(
      directory,
      `.tts-master-edit-${randomBytes(8).toString("hex")}.tmp.wav`,
    );
    this.activeJobs.add(jobId);
    this.manager.setMasterEditState(jobId, {
      ...current,
      status: "merging",
      error: undefined,
      updatedAt: Date.now(),
    });
    try {
      const wav = readPcmWav(originalPath);
      const output = this.composeEditedMaster(jobId);
      fs.writeFileSync(temporaryPath, createPcmWav(output, wav.sampleRate, wav.channels));
      const verified = readPcmWav(temporaryPath);
      if (verified.dataLength !== output.length || verified.duration <= 0) {
        throw new Error("Không thể xác minh TTS Master mới sau khi gộp.");
      }
      this.manager.completeMasterGeneration(
        jobId,
        temporaryPath,
        verified.duration,
        current.clips.map((clip) => ({
          startTime: clip.startTime,
          durationSeconds: clip.durationSeconds,
          text: clip.text,
        })),
      );
      return {
        status: "ready",
        durationSeconds: verified.duration,
        clips: [],
        updatedAt: Date.now(),
      };
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      const message = error instanceof Error ? error.message : "Không thể gộp TTS Master.";
      this.manager.setMasterEditState(jobId, {
        ...current,
        status: "failed",
        error: message,
        updatedAt: Date.now(),
      });
      throw error;
    } finally {
      this.activeJobs.delete(jobId);
    }
  }
}
