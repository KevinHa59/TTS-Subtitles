import fs from "node:fs";

export function getPcmWavDurationMs(filePath: string): number {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const fileSize = fs.fstatSync(descriptor).size;
    const riffHeader = Buffer.alloc(12);
    if (
      fileSize < riffHeader.length ||
      fs.readSync(descriptor, riffHeader, 0, riffHeader.length, 0) !==
        riffHeader.length ||
      riffHeader.toString("ascii", 0, 4) !== "RIFF" ||
      riffHeader.toString("ascii", 8, 12) !== "WAVE"
    ) {
      return 0;
    }

    let audioFormat = 0;
    let channels = 0;
    let sampleRate = 0;
    let byteRate = 0;
    let bitsPerSample = 0;
    let offset = 12;
    while (offset + 8 <= fileSize) {
      const chunkHeader = Buffer.alloc(8);
      if (
        fs.readSync(descriptor, chunkHeader, 0, chunkHeader.length, offset) !==
        chunkHeader.length
      ) {
        return 0;
      }
      const chunkSize = chunkHeader.readUInt32LE(4);
      const chunkDataOffset = offset + chunkHeader.length;
      if (chunkDataOffset + chunkSize > fileSize) return 0;

      if (chunkHeader.toString("ascii", 0, 4) === "fmt ") {
        if (chunkSize < 16) return 0;
        const format = Buffer.alloc(16);
        if (
          fs.readSync(descriptor, format, 0, format.length, chunkDataOffset) !==
          format.length
        ) {
          return 0;
        }
        audioFormat = format.readUInt16LE(0);
        channels = format.readUInt16LE(2);
        sampleRate = format.readUInt32LE(4);
        byteRate = format.readUInt32LE(8);
        bitsPerSample = format.readUInt16LE(14);
      } else if (chunkHeader.toString("ascii", 0, 4) === "data") {
        if (
          audioFormat !== 1 ||
          channels !== 1 ||
          sampleRate !== 22050 ||
          bitsPerSample !== 16 ||
          byteRate !== 44100 ||
          chunkSize === 0
        ) {
          return 0;
        }
        return (chunkSize / byteRate) * 1000;
      }

      offset = chunkDataOffset + chunkSize + (chunkSize % 2);
    }
    return 0;
  } finally {
    fs.closeSync(descriptor);
  }
}

export function isValidPiperPcmWav(filePath: string): boolean {
  if (!fs.existsSync(filePath) || getPcmWavDurationMs(filePath) <= 0) {
    return false;
  }

  const descriptor = fs.openSync(filePath, "r");
  try {
    const fileSize = fs.fstatSync(descriptor).size;
    let offset = 12;
    while (offset + 8 <= fileSize) {
      const header = Buffer.alloc(8);
      if (
        fs.readSync(descriptor, header, 0, header.length, offset) !==
        header.length
      ) {
        return false;
      }
      const chunkSize = header.readUInt32LE(4);
      const dataOffset = offset + 8;
      if (header.toString("ascii", 0, 4) === "data") {
        const alignedSize = Math.min(chunkSize - (chunkSize % 2), chunkSize);
        let readOffset = dataOffset;
        while (readOffset < dataOffset + alignedSize) {
          const remaining = Math.min(65536, dataOffset + alignedSize - readOffset);
          const buffer = Buffer.alloc(remaining - (remaining % 2));
          if (fs.readSync(descriptor, buffer, 0, buffer.length, readOffset) !== buffer.length) {
            return false;
          }
          for (let i = 0; i < buffer.length; i += 2) {
            if (buffer.readInt16LE(i) !== 0) return true;
          }
          readOffset += buffer.length;
        }
        return false;
      }
      offset = dataOffset + chunkSize + (chunkSize % 2);
    }
    return false;
  } finally {
    fs.closeSync(descriptor);
  }
}
