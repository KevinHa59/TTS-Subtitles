import { getSystemToolsStatus, startCompileWhisperCpp, startDownloadWhisperModel, getCurrentJob } from "../systemToolsManager.js";

async function main() {
  console.log("=================================================");
  console.log("   HỆ THỐNG KHỞI TẠO CÔNG CỤ OFFLINE CHO TTS     ");
  console.log("=================================================");

  const status = getSystemToolsStatus();
  console.log(`- Trạng thái Whisper.cpp: ${status.isWhisperInstalled ? "ĐÃ CÀI ĐẶT (" + status.whisperCliPath + ")" : "CHƯA CÀI ĐẶT"}`);
  console.log("- Danh sách Mô hình Whisper GGML:");
  for (const m of status.models) {
    console.log(`  * [${m.isDownloaded ? "✓ ĐÃ CÓ" : "✗ CHƯA CÓ"}] ${m.name} (${m.sizeMb}MB / ${m.expectedSizeMb}MB)`);
  }

  if (!status.isWhisperInstalled) {
    console.log("\n[1/2] Bắt đầu tải và biên dịch Whisper.cpp...");
    await startCompileWhisperCpp();
    while (true) {
      await new Promise((r) => setTimeout(r, 1000));
      const job = getCurrentJob();
      console.log(`[Tiến trình ${job.progressPercent}%] ${job.message}`);
      if (job.status === "completed" || job.status === "error") {
        if (job.status === "error") {
          console.error("Lỗi:", job.error);
          process.exit(1);
        }
        break;
      }
    }
  }

  // Check if small or base model is downloaded
  const hasModel = status.models.some((m) => m.isDownloaded && (m.id === "small" || m.id === "base"));
  if (!hasModel) {
    console.log("\n[2/2] Bắt đầu tải mô hình whisper-small (~460MB khuyên dùng cho Tiếng Việt)...");
    await startDownloadWhisperModel("small");
    while (true) {
      await new Promise((r) => setTimeout(r, 1000));
      const job = getCurrentJob();
      console.log(`[Tiến trình ${job.progressPercent}%] ${job.message}`);
      if (job.status === "completed" || job.status === "error") {
        if (job.status === "error") {
          console.error("Lỗi:", job.error);
          process.exit(1);
        }
        break;
      }
    }
  }

  console.log("\n✅ Hoàn tất! Tất cả công cụ offline và mô hình đã sẵn sàng.");
}

main().catch(console.error);
