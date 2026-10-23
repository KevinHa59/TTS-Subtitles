import fs from "fs";
import path from "path";

export interface CustomVoiceMetadata {
  id: string; // e.g. "my_voice_1"
  modelId: string; // "local:my_voice_1"
  name: string; // "Giọng Đọc Chú Ba"
  gender: "female" | "male" | "neutral";
  description: string;
  sampleText: string;
  createdAt: string;
  onnxFile: string;
  jsonFile: string;
  fileSizeBytes?: number;
}

const MODELS_DIR = path.resolve("./models");
const CUSTOM_VOICES_FILE = path.join(MODELS_DIR, "custom_voices.json");

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

export function loadCustomVoices(): CustomVoiceMetadata[] {
  try {
    if (fs.existsSync(CUSTOM_VOICES_FILE)) {
      const data = fs.readFileSync(CUSTOM_VOICES_FILE, "utf-8");
      const list = JSON.parse(data);
      if (Array.isArray(list)) {
        // Filter out voices whose .onnx file does not exist
        return list.filter((v) => {
          const onnxPath = path.join(MODELS_DIR, v.onnxFile);
          return fs.existsSync(onnxPath);
        });
      }
    }
  } catch (err) {
    console.error("[CustomVoiceManager] Error reading custom_voices.json:", err);
  }
  return [];
}

export function saveCustomVoices(voices: CustomVoiceMetadata[]) {
  try {
    fs.writeFileSync(CUSTOM_VOICES_FILE, JSON.stringify(voices, null, 2), "utf-8");
  } catch (err) {
    console.error("[CustomVoiceManager] Error saving custom_voices.json:", err);
  }
}

export function scanCustomModelsOnDisk(): CustomVoiceMetadata[] {
  const existing = loadCustomVoices();
  const existingMap = new Map(existing.map((v) => [v.onnxFile.toLowerCase(), v]));

  try {
    const files = fs.readdirSync(MODELS_DIR);
    const onnxFiles = files.filter(
      (f) => f.endsWith(".onnx") && !f.startsWith(".")
    );

    let updated = false;

    for (const file of onnxFiles) {
      const jsonFile = `${file}.json`;
      const baseNameWithoutExt = file.replace(/\.onnx$/, "");
      const altJsonFile = `${baseNameWithoutExt}.onnx.json`;

      const hasJson =
        fs.existsSync(path.join(MODELS_DIR, jsonFile)) ||
        fs.existsSync(path.join(MODELS_DIR, altJsonFile));

      const actualJson = fs.existsSync(path.join(MODELS_DIR, jsonFile))
        ? jsonFile
        : altJsonFile;

      if (!existingMap.has(file.toLowerCase()) && hasJson) {
        // Detect voice info from filename or json
        let voiceName = baseNameWithoutExt
          .replace(/[_-]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        let gender: "female" | "male" | "neutral" = "female";

        if (/nam|male|man|anh|chu|bac|duy|vietthao/i.test(baseNameWithoutExt)) {
          gender = "male";
        }

        const stats = fs.statSync(path.join(MODELS_DIR, file));
        const newVoice: CustomVoiceMetadata = {
          id: `custom_${baseNameWithoutExt.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`,
          modelId: `local:${baseNameWithoutExt}`,
          name: voiceName,
          gender,
          description: "Giọng nói tùy chỉnh huấn luyện từ Google Colab",
          sampleText:
            "Xin chào! Đây là giọng đọc tùy chỉnh được huấn luyện qua Piper VITS và tải vào Studio.",
          createdAt: new Date().toISOString(),
          onnxFile: file,
          jsonFile: actualJson,
          fileSizeBytes: stats.size,
        };

        existing.push(newVoice);
        existingMap.set(file.toLowerCase(), newVoice);
        updated = true;
      }
    }

    if (updated) {
      saveCustomVoices(existing);
    }
  } catch (err) {
    console.error("[CustomVoiceManager] Error scanning models dir:", err);
  }

  return existing;
}

export function registerCustomVoice(params: {
  voiceId: string;
  name: string;
  gender: "female" | "male" | "neutral";
  description?: string;
  onnxBuffer: Buffer;
  jsonContent: string;
}): CustomVoiceMetadata {
  const cleanId = params.voiceId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
  const onnxFileName = `${cleanId}.onnx`;
  const jsonFileName = `${cleanId}.onnx.json`;

  const onnxPath = path.join(MODELS_DIR, onnxFileName);
  const jsonPath = path.join(MODELS_DIR, jsonFileName);

  fs.writeFileSync(onnxPath, params.onnxBuffer);
  fs.writeFileSync(jsonPath, params.jsonContent, "utf-8");

  const voices = loadCustomVoices().filter(
    (v) => v.id !== cleanId && v.onnxFile !== onnxFileName
  );

  const newVoice: CustomVoiceMetadata = {
    id: cleanId,
    modelId: `local:${cleanId}`,
    name: params.name.trim() || cleanId,
    gender: params.gender || "female",
    description:
      params.description?.trim() ||
      "Giọng đọc AI tùy chỉnh được huấn luyện trên Google Colab",
    sampleText: `Xin chào! Tôi là ${params.name.trim() || cleanId}. Rất hân hạnh được đọc nội dung cho bạn.`,
    createdAt: new Date().toISOString(),
    onnxFile: onnxFileName,
    jsonFile: jsonFileName,
    fileSizeBytes: params.onnxBuffer.length,
  };

  voices.push(newVoice);
  saveCustomVoices(voices);

  return newVoice;
}

export function deleteCustomVoice(id: string): boolean {
  const voices = loadCustomVoices();
  const target = voices.find((v) => v.id === id || v.modelId === id || v.modelId === `local:${id}`);
  if (!target) return false;

  try {
    const onnxPath = path.join(MODELS_DIR, target.onnxFile);
    const jsonPath = path.join(MODELS_DIR, target.jsonFile);
    if (fs.existsSync(onnxPath)) fs.unlinkSync(onnxPath);
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
  } catch (e) {
    console.error(`[CustomVoiceManager] Error deleting files for voice ${id}:`, e);
  }

  const filtered = voices.filter((v) => v.id !== target.id);
  saveCustomVoices(filtered);
  return true;
}
