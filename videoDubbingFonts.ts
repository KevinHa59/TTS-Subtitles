import fs from "node:fs";
import path from "node:path";

export const DEFAULT_SUBTITLE_FONT_FAMILIES = [
  "Arial",
  "Arial Black",
  "Verdana",
  "Tahoma",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Trebuchet MS",
] as const;

export interface SubtitleFontFace {
  family: string;
  subfamily: string;
  weight: number;
  style: "normal" | "italic";
  fileName: string;
  url: string;
}

function decodeName(buffer: Buffer, platform: number): string {
  if ((platform === 0 || platform === 3) && buffer.length % 2 === 0) {
    const littleEndian = Buffer.from(buffer);
    littleEndian.swap16();
    return littleEndian.toString("utf16le").replace(/\0/g, "").trim();
  }
  return buffer.toString("latin1").replace(/\0/g, "").trim();
}

function parseFontMetadata(buffer: Buffer): {
  family: string;
  subfamily: string;
  weight: number;
  style: "normal" | "italic";
} | null {
  if (buffer.length < 12) return null;
  const tableCount = buffer.readUInt16BE(4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < tableCount; index++) {
    const record = 12 + index * 16;
    if (record + 16 > buffer.length) return null;
    const tag = buffer.toString("ascii", record, record + 4);
    const offset = buffer.readUInt32BE(record + 8);
    const length = buffer.readUInt32BE(record + 12);
    if (offset + length <= buffer.length) tables.set(tag, { offset, length });
  }
  const nameTable = tables.get("name");
  if (!nameTable || nameTable.length < 6) return null;
  const count = buffer.readUInt16BE(nameTable.offset + 2);
  const stringsOffset = buffer.readUInt16BE(nameTable.offset + 4);
  const names = new Map<number, Array<{ value: string; priority: number }>>();
  for (let index = 0; index < count; index++) {
    const record = nameTable.offset + 6 + index * 12;
    if (record + 12 > nameTable.offset + nameTable.length) break;
    const platform = buffer.readUInt16BE(record);
    const language = buffer.readUInt16BE(record + 4);
    const nameId = buffer.readUInt16BE(record + 6);
    const length = buffer.readUInt16BE(record + 8);
    const offset = buffer.readUInt16BE(record + 10);
    const start = nameTable.offset + stringsOffset + offset;
    if (start + length > nameTable.offset + nameTable.length) continue;
    const value = decodeName(buffer.subarray(start, start + length), platform);
    if (!value) continue;
    const priority = (platform === 3 ? 0 : platform === 0 ? 1 : 2) +
      (language === 0x0409 || language === 0 ? 0 : 10);
    const records = names.get(nameId) ?? [];
    records.push({ value, priority });
    names.set(nameId, records);
  }
  const firstName = (...ids: number[]) => {
    for (const id of ids) {
      const matches = names.get(id)?.sort((a, b) => a.priority - b.priority);
      if (matches?.[0]?.value) return matches[0].value;
    }
    return "";
  };
  const family = firstName(16, 1);
  const subfamily = firstName(17, 2) || "Regular";
  if (!family) return null;
  const os2 = tables.get("OS/2");
  const tableWeight = os2 && os2.length >= 6
    ? buffer.readUInt16BE(os2.offset + 4)
    : 0;
  const weightFromName = /thin/i.test(subfamily) ? 100
    : /extra.?light|ultra.?light/i.test(subfamily) ? 200
      : /(^|\s)light/i.test(subfamily) ? 300
        : /semi.?bold|demi.?bold/i.test(subfamily) ? 600
          : /extra.?bold|ultra.?bold/i.test(subfamily) ? 800
            : /black|heavy/i.test(subfamily) ? 900
              : /bold/i.test(subfamily) ? 700
                : /medium/i.test(subfamily) ? 500
                  : /regular|normal|book/i.test(subfamily) ? 400
                    : null;
  const weight = tableWeight >= 1 && tableWeight <= 1000
    ? tableWeight
    : weightFromName ?? 400;
  const style = /italic|oblique/i.test(subfamily) ? "italic" : "normal";
  return { family, subfamily, weight, style };
}

function getFontDirectory(): string {
  return path.resolve(process.cwd(), "public", "assets", "fonts");
}

export function quoteCssFontFamily(family: string): string {
  const escaped = Array.from(family, (character) => {
    if (/^[a-zA-Z0-9 _-]$/.test(character)) return character;
    return `\\${character.codePointAt(0)!.toString(16)} `;
  }).join("");
  return `"${escaped}"`;
}

export function getSubtitleFontFaces(): SubtitleFontFace[] {
  const directory = getFontDirectory();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /\.(ttf|otf)$/i.test(entry.name))
    .flatMap((entry) => {
      try {
        const metadata = parseFontMetadata(fs.readFileSync(path.join(directory, entry.name)));
        if (!metadata) return [];
        return [{
          ...metadata,
          fileName: entry.name,
          url: `/assets/fonts/${encodeURIComponent(entry.name)}`,
        }];
      } catch {
        return [];
      }
    })
    .sort((first, second) =>
      first.family.localeCompare(second.family, "vi", { sensitivity: "base" }) ||
      first.weight - second.weight ||
      first.fileName.localeCompare(second.fileName, "vi", { sensitivity: "base" }),
    );
}

export function getSupportedSubtitleFontFamilies(): Set<string> {
  return new Set([
    ...DEFAULT_SUBTITLE_FONT_FAMILIES,
    ...getSubtitleFontFaces().map((face) => face.family),
  ]);
}

export function createSubtitleFontFaceCss(familyName: string): string {
  const directory = getFontDirectory();
  return getSubtitleFontFaces().filter((face) => face.family === familyName).flatMap((face) => {
    try {
      const contents = fs.readFileSync(path.join(directory, face.fileName));
      const mime = face.fileName.toLowerCase().endsWith(".otf")
        ? "font/otf"
        : "font/ttf";
      const family = quoteCssFontFamily(face.family);
      return [`@font-face{font-family:${family};src:url(data:${mime};base64,${contents.toString("base64")}) format("${mime === "font/otf" ? "opentype" : "truetype"}");font-style:${face.style};font-weight:${face.weight};font-display:block}`];
    } catch {
      return [];
    }
  }).join("\n");
}
