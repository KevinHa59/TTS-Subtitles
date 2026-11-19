import { Check, Code, Copy } from "lucide-react";

export default function ApiModal({
  copiedCode,
  setCopiedCode,
  setShowApiModal,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-white text-base">
              Mã nguồn tích hợp Piper TTS Studio
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowApiModal(false)}
            className="text-slate-400 hover:text-white text-lg p-1"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Mã nguồn Node.js TypeScript nạp trực tiếp mô hình giọng đọc đã chọn
          với PiperTTS:
        </p>

        <div className="relative bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs text-emerald-300 overflow-x-auto">
          <pre>{`import { PiperNativeTTS } from "pipertts";

// Khởi tạo và nạp mô hình PiperTTS tiếng Việt 100% Offline (Không cần mạng)
const tts = await PiperNativeTTS.load({
  modelPath: "./models/vietnamese-voice-model.onnx",
  espeakBinary: "espeak-ng",
});

// Chuyển đổi văn bản thành giọng nói
const { audio, sampleRate } = await tts.synthesize("Xin chào! Đây là Piper TTS Studio tiếng Việt.", {
  outputFormat: "wav",
  sentenceSilence: 0.2,
  lengthScale: 1.0,
});`}</pre>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(
                `import { PiperNativeTTS } from "pipertts";\n\n// Nạp mô hình 100% Offline không cần internet\nconst tts = await PiperNativeTTS.load({\n  modelPath: "./models/vietnamese-voice-model.onnx",\n  espeakBinary: "espeak-ng",\n});\n\nconst { audio } = await tts.synthesize("Xin chào! Đây là Piper TTS Studio tiếng Việt.");`,
              );
              setCopiedCode(true);
              setTimeout(() => setCopiedCode(false), 2000);
            }}
            className="absolute top-3 right-3 p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Đã chép</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Sao chép</span>
              </>
            )}
          </button>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShowApiModal(false)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
