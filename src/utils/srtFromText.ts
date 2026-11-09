import { parseSrtContent } from "./srtParser";

export interface ExtractedSrtFile {
  fileName: string;
  content: string;
}

function formatSrtTimestamp(seconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const remainingMilliseconds = totalMilliseconds % 60_000;
  const wholeSeconds = Math.floor(remainingMilliseconds / 1000);
  const milliseconds = remainingMilliseconds % 1000;
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)},${pad(milliseconds, 3)}`;
}

export function extractSrtFilesFromText(input: string): ExtractedSrtFile[] {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const marker = /^\s*([^<>:"/\\|?*\r\n]+\.srt)\s*$/i;
  const sections: Array<{ fileName: string; lines: string[] }> = [];
  let current: (typeof sections)[number] | undefined;

  for (const line of lines) {
    const match = marker.exec(line);
    if (match) {
      const fileName = match[1].trim();
      current = { fileName, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      throw new Error("Nội dung phải bắt đầu bằng tên file SRT, ví dụ: 061.srt.");
    }
  }

  if (!sections.length) {
    throw new Error("Không tìm thấy tên file .srt trong nội dung TXT.");
  }
  const names = new Set<string>();
  return sections.map(({ fileName, lines: sectionLines }) => {
    const normalizedName = fileName.toLocaleLowerCase();
    if (names.has(normalizedName)) {
      throw new Error(`Tên file bị trùng: ${fileName}`);
    }
    names.add(normalizedName);

    const content = sectionLines.join("\n").trim();
    if (!content) throw new Error(`File ${fileName} không có nội dung phụ đề.`);
    const parsed = parseSrtContent(content);
    const timestampCount =
      content.match(/^[\d:.,]+\s*-->\s*[\d:.,]+/gm)?.length || 0;
    if (!parsed.items.length || parsed.items.length !== timestampCount) {
      throw new Error(`Nội dung SRT trong ${fileName} có block không hợp lệ.`);
    }
    if (parsed.items.some((item) => item.endTime <= item.startTime)) {
      throw new Error(`File ${fileName} có thời gian kết thúc trước thời gian bắt đầu.`);
    }
    const srt = parsed.items
      .map(
        (item, index) =>
          `${index + 1}\n${formatSrtTimestamp(item.startTime)} --> ${formatSrtTimestamp(item.endTime)}\n${item.text}`,
      )
      .join("\n\n");
    return { fileName, content: `${srt}\n` };
  });
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function createSrtZip(files: ExtractedSrtFile[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = encoder.encode(file.fileName);
    const data = encoder.encode(file.content);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30 + name.length);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, checksum, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    localHeader.set(name, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.length);
    const central = new DataView(centralHeader.buffer);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint32(16, checksum, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, localOffset, true);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
  }

  const centralDirectory = concatenate(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);

  const archive = concatenate([...localParts, centralDirectory, end]);
  const archiveBuffer = new ArrayBuffer(archive.length);
  new Uint8Array(archiveBuffer).set(archive);
  return new Blob([archiveBuffer], { type: "application/zip" });
}
