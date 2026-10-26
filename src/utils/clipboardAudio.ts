/**
 * Utility to copy audio (from URL or Blob) to the user's clipboard.
 * Supports native binary audio ClipboardItem where supported, with smooth
 * rich-text / Data URL fallback for browsers that restrict binary audio types.
 */
export async function copyAudioToClipboard(
  audioSource: string | Blob
): Promise<{ success: boolean; message: string }> {
  try {
    let blob: Blob;
    if (typeof audioSource === "string") {
      const fullUrl =
        audioSource.startsWith("http") ||
        audioSource.startsWith("blob:") ||
        audioSource.startsWith("data:")
          ? audioSource
          : `${window.location.origin}${audioSource.startsWith("/") ? "" : "/"}${audioSource}`;

      const res = await fetch(fullUrl);
      if (!res.ok) {
        throw new Error("Không thể nạp tệp audio để sao chép.");
      }
      blob = await res.blob();
    } else {
      blob = audioSource;
    }

    const mime =
      blob.type ||
      (typeof audioSource === "string" && audioSource.includes(".mp3")
        ? "audio/mpeg"
        : "audio/wav");

    // 1. Direct binary ClipboardItem attempt
    if (navigator.clipboard && typeof navigator.clipboard.write === "function") {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            [mime]: blob,
          }),
        ]);
        return { success: true, message: "Đã sao chép tệp audio vào clipboard!" };
      } catch {
        // Try audio/wav as standard clipboard format
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              "audio/wav": blob,
            }),
          ]);
          return { success: true, message: "Đã sao chép tệp audio vào clipboard!" };
        } catch {
          // Fallback for browsers that only permit text/html or text/plain
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const htmlSnippet = `<audio controls src="${dataUrl}"></audio>`;
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                "text/html": new Blob([htmlSnippet], { type: "text/html" }),
                "text/plain": new Blob([dataUrl], { type: "text/plain" }),
              }),
            ]);
            return {
              success: true,
              message: "Đã sao chép audio (Data URL/HTML) vào clipboard!",
            };
          } catch {
            await navigator.clipboard.writeText(dataUrl);
            return {
              success: true,
              message: "Đã sao chép link Data URL audio vào clipboard!",
            };
          }
        }
      }
    }

    throw new Error("Trình duyệt không hỗ trợ Clipboard API.");
  } catch (err: any) {
    console.error("[copyAudioToClipboard]", err);
    return {
      success: false,
      message: err?.message || "Không thể sao chép audio vào clipboard.",
    };
  }
}
