export interface VideoDubbingVoiceAvailability {
  id: string;
  modelId: string;
  engine?: "piper" | "vieneu";
  hasLocalFile?: boolean;
}

export function getAvailableVideoDubbingVoices<T extends VideoDubbingVoiceAvailability>(
  voices: T[],
): T[] {
  return voices.filter(
    (voice) =>
      (voice.engine === "piper" || voice.engine === "vieneu") &&
      voice.hasLocalFile !== false &&
      Boolean(voice.modelId),
  );
}
