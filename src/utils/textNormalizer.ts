/**
 * textNormalizer.ts
 * Tiện ích chuẩn hóa tiếng Việt, xử lý số (dấu chấm hàng nghìn, số thập phân, tiền tệ),
 * và âm thanh thông báo hoàn tất chuẩn AI Studio (Web Audio API 100% Offline).
 */

export interface PronunciationRule {
  id: string;
  from: string;
  to: string;
  active: boolean;
}

export interface NormalizationOptions {
  normalizeNumbers?: boolean;
  customRules?: PronunciationRule[];
}

export function normalizeVietnameseDollars(text: string): string {
  const scales = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];

  return text
    .replace(
      /\$\s*(\d{1,3}(?:[.,]\d{3})+)(?!\d|[.,]\d)(?:\s*USD(?=$|[^\p{L}\p{N}]))?/giu,
      (_, amount: string) => {
        const groups = amount.split(/[.,]/);
        if (groups.length > scales.length) {
          return `${amount.replace(/[.,]/g, "")} đô la`;
        }

        const parts = groups
          .map((group, index) => ({
            value: Number(group),
            scale: scales[groups.length - index - 1],
          }))
          .filter(({ value }) => value > 0)
          .map(({ value, scale }) => `${value}${scale ? ` ${scale}` : ""}`);

        return `${parts.join(" ") || "0"} đô la`;
      },
    )
    .replace(/\$\s*(\d+)(?=$|[^\p{L}\p{N}.,])/gu, "$1 đô la")
    .replace(/(\d+)\s*(?:\$|usd)(?=$|[^\p{L}\p{N}])/giu, "$1 đô la");
}

export function normalizeVietnameseUnits(text: string): string {
  const units: [string, string][] = [
    ["km", "ki-lô-mét"],
    ["cm", "xen-ti-mét"],
    ["mm", "mi-li-mét"],
    ["kg", "ki-lô-gam"],
    ["mg", "mi-li-gam"],
    ["ml", "mi-li-lít"],
    ["m", "mét"],
    ["g", "gam"],
    ["l", "lít"],
  ];

  return units.reduce(
    (result, [symbol, spoken]) =>
      result.replace(
        new RegExp(
          `(\\d+(?:[.,]\\d+)?)\\s*${symbol}(?=$|[^\\p{L}\\p{N}])`,
          "giu",
        ),
        `$1 ${spoken}`,
      ),
    text,
  );
}

/**
 * Chuẩn hóa số tiếng Việt:
 * - Dấu chấm phân cách hàng nghìn: "5.000" -> "5000", "1.250.000" -> "1250000"
 * - Dấu phẩy phân cách hàng nghìn: "5,000" -> "5000"
 * - Tiền tệ: "5.000đ", "5.000 VNĐ" -> "5000 đồng"
 * - Đô la: "100$" -> "100 đô la"
 * - Số thập phân: "3.5" -> "3 phẩy 5", "0.75" -> "0 phẩy 75"
 * - Phần trăm: "50%" -> "50 phần trăm"
 * - Viết tắt: "50k" -> "50 nghìn", "2tr" -> "2 triệu"
 */
export function normalizeVietnameseNumbers(text: string): string {
  if (!text) return "";

  let res = normalizeVietnameseDollars(text);

  // 1. Dấu chấm hàng nghìn (5.000 -> 5000, 1.250.000 -> 1250000, 50.000 -> 50000)
  // Chỉ khớp khi có đúng 3 chữ số sau dấu chấm
  res = res.replace(/\b(\d{1,3})(?:\.(\d{3}))+(?!\d)/g, (match) =>
    match.replace(/\./g, "")
  );

  // 2. Dấu phẩy hàng nghìn kiểu US/UK (5,000 -> 5000, 1,000,000 -> 1000000)
  res = res.replace(/\b(\d{1,3})(?:,(\d{3}))+(?!\d)/g, (match) =>
    match.replace(/,/g, "")
  );

  // 3. Đơn vị tiền tệ Việt Nam (5000đ, 50.000 VNĐ, 100k -> 50000 đồng)
  res = res.replace(
    /(\d+)\s*(?:đ|vnđ|vnd|đồng)(?=$|[^\p{L}\p{N}])/gui,
    "$1 đồng"
  );

  res = normalizeVietnameseUnits(res);

  // 5. Phần trăm
  res = res.replace(/(\d+)\s*%/g, "$1 phần trăm");

  // 6. Viết tắt nghìn / triệu thông dụng trong giao tiếp và phụ đề
  res = res.replace(/\b(\d+)\s*k(?=$|[^\p{L}\p{N}])/gui, "$1 nghìn");
  res = res.replace(/\b(\d+)\s*tr(?=$|[^\p{L}\p{N}])/gui, "$1 triệu");

  // 7. Số thập phân (3.5 -> 3 phẩy 5, 0.75 -> 0 phẩy 75)
  res = res.replace(/\b(\d+)\.(\d{1,2})\b/g, "$1 phẩy $2");
  res = res.replace(/\b(\d+),(\d{1,2})\b/g, "$1 phẩy $2");

  // 8. Định dạng ngày tháng năm: 20/10/2026 -> ngày 20 tháng 10 năm 2026
  res = res.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, "ngày $1 tháng $2 năm $3");

  return res;
}

/**
 * Chuẩn hóa toàn diện văn bản tiếng Việt trước khi gửi vào Piper TTS
 */
export function normalizeVietnameseText(
  input: string,
  options?: NormalizationOptions
): string {
  if (!input) return "";

  // 1. Unicode NFC
  let text = input.normalize("NFC");

  // 2. Xóa BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // 3. Quy tắc thay thế từ điển tùy chỉnh của người dùng (Custom Pronunciation Rules)
  if (options?.customRules && Array.isArray(options.customRules)) {
    for (const rule of options.customRules) {
      if (rule.active !== false && rule.from && rule.from.trim()) {
        try {
          const escaped = rule.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          text = text.replace(new RegExp(escaped, "gi"), rule.to || "");
        } catch {
          // Bỏ qua nếu regex lỗi
        }
      }
    }
  }

  // 4. Chuẩn hóa số & tiền tệ
  if (options?.normalizeNumbers !== false) {
    text = normalizeVietnameseNumbers(text);
  }

  // 5. Chuẩn hóa dấu câu Unicode sang ASCII và khoảng trắng
  return text
    .replace(/，/g, ", ")
    .replace(/。/g, ". ")
    .replace(/！/g, "! ")
    .replace(/？/g, "? ")
    .replace(/；/g, "; ")
    .replace(/：/g, ": ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, " - ")
    .replace(/([,;:?!])([^\s0-9])/g, "$1 $2")
    .replace(/\.{3,}/g, "...")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Phát âm thanh thông báo chuẩn AI Studio (Web Audio API 100% Offline).
 * Hợp âm arpeggio chuông trong trẻo, êm ái: C5 -> E5 -> G5 -> C6.
 */
export function playAiStudioCompletionChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const notes = [
      { freq: 523.25, time: 0.00, dur: 0.35, gain: 0.16 }, // C5
      { freq: 659.25, time: 0.08, dur: 0.38, gain: 0.20 }, // E5
      { freq: 783.99, time: 0.16, dur: 0.42, gain: 0.24 }, // G5
      { freq: 1046.50, time: 0.24, dur: 0.85, gain: 0.28 }, // C6
    ];

    notes.forEach(({ freq, time, dur, gain: peakGain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + time);

      // Envelope: Soft attack, exponential decay for bell chime feel
      gainNode.gain.setValueAtTime(0.0001, now + time);
      gainNode.gain.exponentialRampToValueAtTime(peakGain, now + time + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + dur + 0.05);
    });
  } catch (err) {
    console.warn("[Notification] Could not play audio chime:", err);
  }
}
