export function parseSubtitleTranslations(
  expectedCues: Array<{ id: string }>,
  translations: unknown[],
): Map<string, string> {
  const result = new Map<string, string>();
  const expectedIds = new Set(expectedCues.map((cue) => cue.id));
  for (const item of translations) {
    if (!item || typeof item !== "object") continue;
    const value = item as { id?: unknown; translation?: unknown };
    if (
      typeof value.id === "string"
      && expectedIds.has(value.id)
      && !result.has(value.id)
      && typeof value.translation === "string"
      && value.translation.trim()
    ) {
      result.set(value.id, value.translation.trim());
    }
  }
  for (const cue of expectedCues) {
    if (!result.has(cue.id)) {
      throw new Error(`Qwen không trả về bản dịch hợp lệ cho phụ đề ${cue.id}. Hãy thử dịch lại.`);
    }
  }
  return result;
}
