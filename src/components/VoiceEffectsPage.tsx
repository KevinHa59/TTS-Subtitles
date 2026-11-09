import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Play,
  Save,
  Sparkles,
  Sliders,
  Trash2,
  Volume2,
} from "lucide-react";
import * as Tone from "tone";

interface VoiceOption {
  id: string;
  modelId: string;
  name: string;
  engine?: "piper" | "vieneu";
  hasLocalFile?: boolean;
}

const EFFECT_GROUPS = [
  {
    name: "Equalizer – Điều chỉnh âm sắc",
    controls: [
      { key: "low", label: "Bass", description: "Tăng/giảm âm trầm", min: -12, max: 12, step: 1, suffix: " dB" },
      { key: "mid", label: "Mid", description: "Tăng/giảm âm trung", min: -12, max: 12, step: 1, suffix: " dB" },
      { key: "high", label: "Treble", description: "Tăng/giảm âm cao", min: -12, max: 12, step: 1, suffix: " dB" },
      { key: "lowPass", label: "Low-pass", description: "Cắt âm cao", min: 500, max: 20000, step: 100, suffix: " Hz", initial: 20000 },
      { key: "highPass", label: "High-pass", description: "Cắt âm thấp", min: 20, max: 2000, step: 10, suffix: " Hz", initial: 20 },
      { key: "bandPass", label: "Band-pass", description: "Tập trung vào một dải tần", min: 0, max: 1, step: 0.01, percent: true },
      { key: "presence", label: "Presence", description: "Làm giọng nổi bật hơn", min: -12, max: 12, step: 1, suffix: " dB" },
      { key: "air", label: "Air", description: "Tăng độ thoáng, sáng của giọng", min: -12, max: 12, step: 1, suffix: " dB" },
    ],
  },
  {
    name: "Pitch & Voice – Biến đổi giọng nói",
    controls: [
      { key: "pitchUp", label: "Pitch Up", description: "Tăng cao độ", min: 0, max: 12, step: 0.1, suffix: " st" },
      { key: "pitchDown", label: "Pitch Down", description: "Hạ cao độ", min: 0, max: 12, step: 0.1, suffix: " st" },
      { key: "formantShift", label: "Formant Shift", description: "Đổi màu giọng gần đúng bằng EQ", min: -1, max: 1, step: 0.01 },
      { key: "robot", label: "Robot", description: "Chất giọng robot", min: 0, max: 1, step: 0.01, percent: true },
      { key: "deepVoice", label: "Deep Voice", description: "Tạo giọng trầm", min: 0, max: 1, step: 0.01, percent: true },
      { key: "chipmunk", label: "Chipmunk", description: "Tạo giọng cao, hoạt hình", min: 0, max: 1, step: 0.01, percent: true },
      { key: "monster", label: "Monster", description: "Tạo chất giọng quái vật", min: 0, max: 1, step: 0.01, percent: true },
      { key: "genderShift", label: "Gender-style Shift", description: "Đổi màu giọng theo hướng nam/nữ", min: -1, max: 1, step: 0.01 },
      { key: "vocoder", label: "Vocoder", description: "Tạo chất âm điện tử gần đúng", min: 0, max: 1, step: 0.01, percent: true },
    ],
  },
  {
    name: "Spatial Effects – Không gian âm thanh",
    controls: [
      { key: "reverb", label: "Reverb", description: "Tạo tiếng vang không gian", min: 0, max: 1, step: 0.01, percent: true },
      { key: "room", label: "Room", description: "Mô phỏng phòng nhỏ", min: 0, max: 1, step: 0.01, percent: true },
      { key: "hall", label: "Hall", description: "Mô phỏng hội trường lớn", min: 0, max: 1, step: 0.01, percent: true },
      { key: "cathedral", label: "Cathedral", description: "Mô phỏng không gian nhà thờ", min: 0, max: 1, step: 0.01, percent: true },
      { key: "echo", label: "Echo", description: "Tiếng vọng lặp lại", min: 0, max: 1, step: 0.01, percent: true },
      { key: "delay", label: "Delay", description: "Độ trễ và lượng lặp", min: 0, max: 1, step: 0.01, percent: true },
      { key: "stereoWidth", label: "Stereo Width", description: "Điều chỉnh độ rộng stereo", min: 0, max: 1, step: 0.01, percent: true },
      { key: "panning", label: "Panning", description: "Dịch chuyển trái/phải", min: -1, max: 1, step: 0.01 },
      { key: "earlyReflections", label: "Early Reflections", description: "Âm phản xạ ban đầu", min: 0, max: 1, step: 0.01, percent: true },
    ],
  },
  {
    name: "Modulation – Hiệu ứng biến điệu",
    controls: [
      { key: "chorus", label: "Chorus", description: "Tạo cảm giác nhiều giọng", min: 0, max: 1, step: 0.01, percent: true },
      { key: "flanger", label: "Flanger", description: "Âm thanh kim loại, xoáy", min: 0, max: 1, step: 0.01, percent: true },
      { key: "phaser", label: "Phaser", description: "Tạo âm thanh chuyển động", min: 0, max: 1, step: 0.01, percent: true },
      { key: "tremolo", label: "Tremolo", description: "Dao động âm lượng", min: 0, max: 1, step: 0.01, percent: true },
      { key: "vibrato", label: "Vibrato", description: "Dao động cao độ", min: 0, max: 1, step: 0.01, percent: true },
      { key: "ringModulation", label: "Ring Modulation", description: "Chất âm robot/điện tử", min: 0, max: 1, step: 0.01, percent: true },
      { key: "autoPan", label: "Auto Pan", description: "Tự động di chuyển trái/phải", min: 0, max: 1, step: 0.01, percent: true },
    ],
  },
  {
    name: "Dynamics – Kiểm soát âm lượng",
    controls: [
      { key: "compressor", label: "Compressor", description: "Nén dải động", min: 0, max: 1, step: 0.01, percent: true },
      { key: "limiter", label: "Limiter", description: "Giới hạn âm lượng tối đa", min: 0, max: 1, step: 0.01, percent: true },
      { key: "expander", label: "Expander", description: "Mở rộng tương phản âm lượng (gần đúng)", min: 0, max: 1, step: 0.01, percent: true },
      { key: "gate", label: "Gate", description: "Giảm âm thanh nhỏ dưới ngưỡng", min: 0, max: 1, step: 0.01, percent: true },
      { key: "noiseReduction", label: "Noise Reduction", description: "Giảm nền yên lặng bằng noise gate", min: 0, max: 1, step: 0.01, percent: true },
      { key: "deEsser", label: "De-Esser", description: "Giảm âm xì bằng lọc dải cao", min: 0, max: 1, step: 0.01, percent: true },
      { key: "normalize", label: "Normalize", description: "Chuẩn hóa đỉnh âm lượng", min: 0, max: 1, step: 0.01, percent: true },
      { key: "autoGain", label: "Auto Gain", description: "Bù gain đầu ra", min: 0, max: 1, step: 0.01, percent: true },
    ],
  },
  {
    name: "Distortion & Texture – Biến đổi chất âm",
    controls: [
      { key: "distortion", label: "Distortion", description: "Làm méo âm", min: 0, max: 1, step: 0.01, percent: true },
      { key: "overdrive", label: "Overdrive", description: "Méo nhẹ, ấm", min: 0, max: 1, step: 0.01, percent: true },
      { key: "saturation", label: "Saturation", description: "Tạo độ dày, ấm", min: 0, max: 1, step: 0.01, percent: true },
      { key: "bitcrusher", label: "Bitcrusher", description: "Chất âm kỹ thuật số giảm bit", min: 0, max: 1, step: 0.01, percent: true },
      { key: "loFi", label: "Lo-Fi", description: "Giảm độ trung thực âm thanh", min: 0, max: 1, step: 0.01, percent: true },
      { key: "telephone", label: "Telephone", description: "Mô phỏng băng tần điện thoại", min: 0, max: 1, step: 0.01, percent: true },
      { key: "radio", label: "Radio", description: "Mô phỏng âm thanh radio", min: 0, max: 1, step: 0.01, percent: true },
      { key: "vinyl", label: "Vinyl", description: "Thêm màu âm đĩa than", min: 0, max: 1, step: 0.01, percent: true },
      { key: "staticNoise", label: "Static Noise", description: "Thêm tiếng nhiễu", min: 0, max: 1, step: 0.01, percent: true },
    ],
  },
] as const;

type EffectKey = (typeof EFFECT_GROUPS)[number]["controls"][number]["key"] | "pitch";
type VoiceEffectSettings = Record<EffectKey, number>;

const CONTROL_DEFAULTS = Object.fromEntries(
  EFFECT_GROUPS.flatMap((group) =>
    group.controls.map((control) => [control.key, "initial" in control ? control.initial : 0]),
  ),
) as Record<(typeof EFFECT_GROUPS)[number]["controls"][number]["key"], number>;

const INITIAL_SETTINGS = {
  ...CONTROL_DEFAULTS,
  pitch: -1,
  low: 1,
  high: 1,
} as VoiceEffectSettings;

interface VoiceEffectPreset {
  id: string;
  name: string;
  settings: VoiceEffectSettings;
  builtIn?: boolean;
}

interface VoiceEffectGraph {
  eq: Tone.EQ3;
  pitch: Tone.PitchShift;
  bandPassFade: Tone.CrossFade;
  lowPass: Tone.Filter;
  highPass: Tone.Filter;
  bandPass: Tone.Filter;
  presence: Tone.Filter;
  air: Tone.Filter;
  formant: Tone.Filter;
  deEsser: Tone.Filter;
  distortion: Tone.Distortion;
  bitCrusher: Tone.BitCrusher;
  chorus: Tone.Chorus;
  flanger: Tone.Chorus;
  phaser: Tone.Phaser;
  tremolo: Tone.Tremolo;
  vibrato: Tone.Vibrato;
  autoPanner: Tone.AutoPanner;
  frequencyShifter: Tone.FrequencyShifter;
  reverb: Tone.Reverb;
  delay: Tone.FeedbackDelay;
  earlyDelay: Tone.FeedbackDelay;
  widener: Tone.StereoWidener;
  panner: Tone.Panner;
  compressor: Tone.Compressor;
  limiter: Tone.Limiter;
  gate: Tone.Gate;
  noise: Tone.Noise;
  noiseGain: Tone.Gain;
}

const STORAGE_KEY = "tts-voice-effect-presets";
const SAMPLE_TEXT =
  "Xin chào! Đây là bản xem trước hiệu ứng giọng đọc tiếng Việt. Bạn có thể điều chỉnh các hiệu ứng và nghe lại ngay tại đây.";

function createSettings(overrides: Partial<VoiceEffectSettings> = {}): VoiceEffectSettings {
  return { ...INITIAL_SETTINGS, ...overrides };
}

const DEFAULT_PRESETS: VoiceEffectPreset[] = [
  {
    id: "clean",
    name: "Deep Clean",
    builtIn: true,
    settings: createSettings({ low: 1, mid: 0, high: 1, pitch: -1 }),
  },
  {
    id: "robot",
    name: "Robot",
    builtIn: true,
    settings: createSettings({ low: 0, mid: 0, high: 0, pitch: 0, robot: 0.75, reverb: 0.08, chorus: 0.2 }),
  },
  {
    id: "echo",
    name: "Vang phòng",
    builtIn: true,
    settings: createSettings({ low: 0, mid: 0, high: 0, pitch: 0, reverb: 0.55, echo: 0.28 }),
  },
  {
    id: "warm",
    name: "Ấm và dày",
    builtIn: true,
    settings: createSettings({ low: 4, mid: 1, high: -2, pitch: -2, reverb: 0.12 }),
  },
];

function readPresets(): VoiceEffectPreset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PRESETS;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Dữ liệu preset không hợp lệ");
    const valid = parsed.flatMap((preset): VoiceEffectPreset[] => {
      if (
        typeof preset?.id !== "string" ||
        typeof preset?.name !== "string" ||
        typeof preset?.settings !== "object" ||
        preset.settings === null
      ) {
        return [];
      }
      return [{
        id: preset.id,
        name: preset.name,
        settings: createSettings(preset.settings as Partial<VoiceEffectSettings>),
      }];
    });
    return [...DEFAULT_PRESETS, ...valid.filter((preset) => !preset.builtIn)];
  } catch (error) {
    console.error("Không thể đọc preset hiệu ứng đã lưu:", error);
    return DEFAULT_PRESETS;
  }
}

function EffectSlider({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  description,
  percent = false,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  percent?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between text-sm text-slate-300">
        {label}
        <span className="font-mono text-xs text-amber-300">
          {percent ? `${Math.round(value * 100)}%` : `${value > 0 && min < 0 ? "+" : ""}${Number(value.toFixed(1))}${suffix}`}
        </span>
      </span>
      <span className="block text-xs text-slate-500">{description}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-amber-400"
      />
    </label>
  );
}

function configureEffectGraph(graph: VoiceEffectGraph, settings: VoiceEffectSettings) {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  graph.eq.low.value = settings.low;
  graph.eq.mid.value = settings.mid;
  graph.eq.high.value = settings.high;
  graph.lowPass.frequency.value = Math.min(
    settings.lowPass,
    20000 - settings.telephone * 17500 - settings.radio * 12000,
  );
  graph.highPass.frequency.value = Math.max(
    settings.highPass,
    settings.telephone * 300 + settings.radio * 500,
  );
  graph.bandPass.Q.value = 1 + settings.bandPass * 16;
  graph.bandPassFade.fade.value = settings.bandPass;
  graph.presence.gain.value = settings.presence;
  graph.air.gain.value = settings.air;
  graph.formant.gain.value = clamp(
    settings.formantShift * 10 + settings.genderShift * 3,
    -12,
    12,
  );

  const pitchShift = clamp(
    settings.pitch + settings.pitchUp - settings.pitchDown -
      settings.deepVoice * 5 + settings.chipmunk * 7 -
      settings.monster * 6 + settings.genderShift * 4,
    -24,
    24,
  );
  graph.pitch.pitch = pitchShift;
  graph.pitch.wet.value = pitchShift === 0 ? 0 : 1;
  const robotAmount = Math.max(settings.robot, settings.monster * 0.6);
  const distortionAmount = clamp(
    Math.max(settings.distortion, settings.overdrive * 0.65, settings.saturation * 0.45, robotAmount * 0.8),
    0,
    1,
  );
  graph.distortion.distortion = Math.max(0.01, distortionAmount);
  graph.distortion.wet.value = distortionAmount;
  const bitCrushAmount = Math.max(settings.bitcrusher, settings.loFi * 0.7, robotAmount * 0.75);
  graph.bitCrusher.bits.value = Math.max(2, Math.round(16 - bitCrushAmount * 14));
  graph.bitCrusher.wet.value = bitCrushAmount;
  const ringAmount = Math.max(settings.vocoder, settings.ringModulation, robotAmount * 0.45);
  graph.frequencyShifter.frequency.value =
    40 + settings.vocoder * 280 + settings.ringModulation * 420 + robotAmount * 160;
  graph.frequencyShifter.wet.value = ringAmount;

  graph.chorus.wet.value = settings.chorus;
  graph.flanger.wet.value = settings.flanger;
  graph.flanger.delayTime = 1 + settings.flanger * 4;
  graph.phaser.wet.value = settings.phaser;
  graph.tremolo.depth.value = settings.tremolo;
  graph.vibrato.depth.value = settings.vibrato;
  graph.autoPanner.wet.value = settings.autoPan;

  const reverbAmount = Math.max(settings.reverb, settings.room, settings.hall, settings.cathedral);
  graph.reverb.wet.value = reverbAmount;
  graph.delay.wet.value = Math.max(settings.echo, settings.delay);
  graph.delay.delayTime.value = 0.1 + settings.delay * 0.7;
  graph.delay.feedback.value = 0.15 + Math.max(settings.echo, settings.delay) * 0.45;
  graph.earlyDelay.wet.value = settings.earlyReflections;
  graph.widener.width.value = 0.5 + settings.stereoWidth * 0.5;
  graph.panner.pan.value = settings.panning;

  const dynamicsAmount = Math.max(settings.compressor, settings.expander * 0.5);
  graph.compressor.threshold.value = -12 - dynamicsAmount * 28;
  graph.compressor.ratio.value = 1 + dynamicsAmount * 7;
  graph.limiter.threshold.value = -settings.limiter * 16;
  graph.gate.threshold =
    -100 + Math.max(settings.gate, settings.noiseReduction) * 78 + settings.expander * 8;
  graph.deEsser.gain.value = -12 * settings.deEsser;

  graph.noiseGain.gain.value = settings.vinyl * 0.012 + settings.staticNoise * 0.035;
  const noiseActive = settings.vinyl > 0 || settings.staticNoise > 0;
  if (noiseActive && graph.noise.state !== "started") graph.noise.start();
  if (!noiseActive && graph.noise.state === "started") graph.noise.stop();
}

export default function VoiceEffectsPage() {
  const [presets, setPresets] = useState<VoiceEffectPreset[]>(readPresets);
  const [selectedPresetId, setSelectedPresetId] = useState("clean");
  const [settings, setSettings] = useState<VoiceEffectSettings>(INITIAL_SETTINGS);
  const [presetName, setPresetName] = useState("");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [text, setText] = useState(SAMPLE_TEXT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState("");
  const audioUrlRef = useRef("");
  const playerRef = useRef<Tone.Player | null>(null);
  const effectNodesRef = useRef<Tone.ToneAudioNode[]>([]);
  const graphRef = useRef<VoiceEffectGraph | null>(null);
  const normalizeGainRef = useRef(0);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(presets.filter((preset) => !preset.builtIn)),
    );
  }, [presets]);

  useEffect(() => {
    let active = true;
    fetch("/api/voices")
      .then(async (response) => {
        if (!response.ok) throw new Error("Không tải được danh sách giọng đọc.");
        return response.json();
      })
      .then((data: { voices?: VoiceOption[]; defaultModel?: string }) => {
        if (!active || !Array.isArray(data.voices)) return;
        const availableVoices = data.voices.filter(
          (voice) => voice.hasLocalFile || voice.engine === "vieneu",
        );
        setVoices(availableVoices);
        const preferred =
          availableVoices.find((voice) => voice.modelId === data.defaultModel) ??
          availableVoices[0];
        if (preferred) setSelectedVoice(preferred.modelId);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Không tải được giọng đọc.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      playerRef.current?.dispose();
      if (graphRef.current?.noise.state === "started") graphRef.current.noise.stop();
      effectNodesRef.current.forEach((node) => node.dispose());
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    configureEffectGraph(graph, settings);
    if (playerRef.current) {
      playerRef.current.volume.value =
        normalizeGainRef.current * settings.normalize + settings.autoGain * 3;
    }
    const timer = window.setTimeout(() => {
      graph.reverb.decay = 0.5 + settings.room * 1.5 + settings.hall * 3 + settings.cathedral * 5;
      graph.reverb.preDelay = 0.005 + settings.earlyReflections * 0.08;
    }, 250);
    return () => window.clearTimeout(timer);
  }, [settings]);

  const stopPreview = () => {
    playerRef.current?.stop();
    playerRef.current?.dispose();
    playerRef.current = null;
    if (graphRef.current?.noise.state === "started") graphRef.current.noise.stop();
    graphRef.current = null;
    effectNodesRef.current.forEach((node) => node.dispose());
    effectNodesRef.current = [];
    setIsPlaying(false);
  };

  const handleGenerate = async (): Promise<string | null> => {
    if (!selectedVoice) {
      setError("Không tìm thấy giọng đọc tiếng Việt đã cài đặt.");
      return null;
    }
    setIsGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model: selectedVoice, speed: 1, format: "mp3" }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.audioBase64) {
        throw new Error(data.error || "Không tạo được audio xem trước.");
      }
      stopPreview();
      const binary = atob(data.audioBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: data.mimeType || "audio/mpeg" });
      const nextUrl = URL.createObjectURL(blob);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      return nextUrl;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tạo được audio xem trước.");
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlay = async () => {
    if (isPlaying) {
      stopPreview();
      return;
    }
    const sourceUrl = audioUrl || await handleGenerate();
    if (!sourceUrl) return;
    setError("");
    try {
      await Tone.start();
      stopPreview();
      const eq = new Tone.EQ3(settings.low, settings.mid, settings.high);
      const pitch = new Tone.PitchShift();
      const bandPassFade = new Tone.CrossFade();
      const lowPass = new Tone.Filter({ type: "lowpass", frequency: settings.lowPass, rolloff: -12 });
      const highPass = new Tone.Filter({ type: "highpass", frequency: settings.highPass, rolloff: -12 });
      const bandPass = new Tone.Filter({ type: "bandpass", frequency: 1400, Q: 1 });
      const presence = new Tone.Filter({ type: "peaking", frequency: 3500, Q: 0.8, gain: settings.presence });
      const air = new Tone.Filter({ type: "highshelf", frequency: 10000, gain: settings.air });
      const formant = new Tone.Filter({ type: "peaking", frequency: 1200, Q: 1.2 });
      const deEsser = new Tone.Filter({ type: "highshelf", frequency: 6500, gain: -12 * settings.deEsser });
      const distortion = new Tone.Distortion();
      const bitCrusher = new Tone.BitCrusher(16);
      const frequencyShifter = new Tone.FrequencyShifter();
      const chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.6 });
      const flanger = new Tone.Chorus({ frequency: 0.25, delayTime: 2, depth: 0.8 });
      const phaser = new Tone.Phaser({ frequency: 0.5, octaves: 3, stages: 4, baseFrequency: 700 });
      const tremolo = new Tone.Tremolo({ frequency: 4, depth: settings.tremolo });
      const vibrato = new Tone.Vibrato({ frequency: 5, depth: settings.vibrato });
      const autoPanner = new Tone.AutoPanner({ frequency: 0.25 });
      const reverb = new Tone.Reverb({
        decay: 0.5 + settings.room * 1.5 + settings.hall * 3 + settings.cathedral * 5,
        preDelay: 0.005 + settings.earlyReflections * 0.08,
      });
      const delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.25 });
      const earlyDelay = new Tone.FeedbackDelay({ delayTime: 0.035, feedback: 0.05 });
      const widener = new Tone.StereoWidener(0.5);
      const panner = new Tone.Panner(settings.panning);
      const gate = new Tone.Gate(-100, 0.1);
      const compressor = new Tone.Compressor(-24, 3);
      const limiter = new Tone.Limiter(-1);
      const noise = new Tone.Noise("pink");
      const noiseGain = new Tone.Gain(0);
      const graph: VoiceEffectGraph = {
        eq, pitch, bandPassFade, lowPass, highPass, bandPass, presence, air, formant, deEsser,
        distortion, bitCrusher, chorus, flanger, phaser, tremolo, vibrato, autoPanner,
        frequencyShifter, reverb, delay, earlyDelay, widener, panner, compressor, limiter,
        gate, noise, noiseGain,
      };
      configureEffectGraph(graph, settings);
      graphRef.current = graph;
      effectNodesRef.current = [
        eq, pitch, bandPassFade, lowPass, highPass, bandPass, presence, air, formant, deEsser,
        distortion, bitCrusher, frequencyShifter, chorus, flanger, phaser, tremolo, vibrato,
        autoPanner, reverb, delay, earlyDelay, widener, panner, gate, compressor, limiter, noise,
        noiseGain,
      ];
      chorus.start();
      flanger.start();
      tremolo.start();
      autoPanner.start();
      await reverb.ready;
      eq.connect(lowPass);
      lowPass.connect(highPass);
      highPass.connect(presence);
      presence.connect(air);
      air.connect(formant);
      formant.connect(deEsser);
      deEsser.connect(bandPassFade.a);
      deEsser.connect(bandPass);
      bandPass.connect(bandPassFade.b);
      bandPassFade.connect(pitch);
      pitch.connect(frequencyShifter);
      frequencyShifter.connect(distortion);
      distortion.connect(bitCrusher);
      bitCrusher.connect(chorus);
      chorus.connect(flanger);
      flanger.connect(phaser);
      phaser.connect(tremolo);
      tremolo.connect(vibrato);
      vibrato.connect(autoPanner);
      autoPanner.connect(reverb);
      reverb.connect(delay);
      delay.connect(earlyDelay);
      earlyDelay.connect(widener);
      widener.connect(panner);
      panner.connect(gate);
      gate.connect(compressor);
      compressor.connect(limiter);
      limiter.toDestination();
      noise.connect(noiseGain);
      noiseGain.toDestination();
      const player = new Tone.Player().connect(eq);
      if (settings.normalize > 0) {
        const audioResponse = await fetch(sourceUrl);
        if (!audioResponse.ok) throw new Error("Không thể đọc audio để chuẩn hóa.");
        const audioBytes = await audioResponse.arrayBuffer();
        const decoded = await Tone.getContext().rawContext.decodeAudioData(audioBytes.slice(0));
        let peak = 0;
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          const samples = decoded.getChannelData(channel);
          for (let index = 0; index < samples.length; index += 1) {
            peak = Math.max(peak, Math.abs(samples[index]));
          }
        }
        normalizeGainRef.current = peak > 0
          ? Math.min(12, Math.max(-12, -20 * Math.log10(peak)))
          : 0;
      } else {
        normalizeGainRef.current = 0;
      }
      player.volume.value = normalizeGainRef.current * settings.normalize + settings.autoGain * 3;
      playerRef.current = player;
      player.onstop = () => setIsPlaying(false);
      await player.load(sourceUrl);
      player.start();
      setIsPlaying(true);
    } catch (cause) {
      stopPreview();
      setError(cause instanceof Error ? cause.message : "Không thể phát audio xem trước.");
    }
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) {
      setError("Hãy nhập tên preset trước khi lưu.");
      return;
    }
    const preset = { id: crypto.randomUUID(), name, settings: { ...settings } };
    setPresets((current) => [...current, preset]);
    setSelectedPresetId(preset.id);
    setPresetName("");
    setError("");
  };

  const handleSelectPreset = (preset: VoiceEffectPreset) => {
    setSelectedPresetId(preset.id);
    setSettings({ ...preset.settings });
  };

  const handleDeletePreset = (preset: VoiceEffectPreset) => {
    if (preset.builtIn) return;
    setPresets((current) => current.filter((item) => item.id !== preset.id));
    if (selectedPresetId === preset.id) {
      handleSelectPreset(DEFAULT_PRESETS[0]);
    }
  };

  const updateSetting = (key: keyof VoiceEffectSettings, value: number) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 sm:px-6">
        <AudioLines className="h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-white sm:text-xl">Tạo preset hiệu ứng giọng</h1>
          <p className="hidden text-xs text-slate-400 sm:block">
            Chọn giọng, tinh chỉnh hiệu ứng và lưu preset trên trình duyệt này.
          </p>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(220px,42%)_minmax(0,1fr)] overflow-hidden md:grid-cols-[minmax(280px,30%)_minmax(0,1fr)] md:grid-rows-1">
        <aside className="min-h-0 overflow-y-auto overscroll-contain border-b border-slate-800 bg-slate-900/50 p-3 sm:p-4 md:border-b-0 md:border-r">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-4 text-sm font-semibold text-slate-100">Giọng đọc & tạo preview</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="voice-effect-voice" className="mb-2 block text-xs font-medium text-slate-300">
                  Giọng tiếng Việt
                </label>
                <select
                  id="voice-effect-voice"
                  value={selectedVoice}
                  onChange={(event) => setSelectedVoice(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                >
                  {voices.length === 0 && <option value="">Đang tải giọng đọc...</option>}
                  {voices.map((voice) => (
                    <option key={voice.modelId} value={voice.modelId}>{voice.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="voice-effect-text" className="mb-2 block text-xs font-medium text-slate-300">
                  Văn bản đọc thử
                </label>
                <textarea
                  id="voice-effect-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  maxLength={1000}
                  rows={5}
                  className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm leading-relaxed text-white outline-none focus:border-amber-400"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating || !selectedVoice || !text.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Volume2 className="h-4 w-4" />
                  {isGenerating ? "Đang tạo giọng..." : audioUrl ? "Tạo lại giọng mẫu" : "Tạo giọng mẫu"}
                </button>
                <button
                  type="button"
                  onClick={handlePlay}
                  disabled={isGenerating}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPlaying ? <Sparkles className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isPlaying ? "Dừng preview" : "Nghe hiệu ứng"}
                </button>
              </div>
              {audioUrl && (
                <p className="text-xs text-emerald-300">
                  Audio mẫu sẵn sàng. Thay đổi thông số bên phải rồi nghe lại để so sánh.
                </p>
              )}
              {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            </div>
          </section>

          <section className="mt-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">Preset</h2>
            <div className="space-y-2">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className={`flex items-center gap-2 rounded-xl border p-2 ${
                    selectedPresetId === preset.id
                      ? "border-amber-400/60 bg-amber-500/10"
                      : "border-slate-800 bg-slate-950/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className="flex-1 px-2 py-1 text-left text-sm font-medium text-slate-200 hover:text-white"
                  >
                    {preset.name}
                    {preset.builtIn && <span className="ml-2 text-[10px] text-slate-500">MẪU</span>}
                  </button>
                  {!preset.builtIn && (
                    <button
                      type="button"
                      onClick={() => handleDeletePreset(preset)}
                      aria-label={`Xóa preset ${preset.name}`}
                      className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
              <input
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="Tên preset mới"
                maxLength={48}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={handleSavePreset}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-amber-300"
              >
                <Save className="h-4 w-4" />
                Lưu preset hiện tại
              </button>
            </div>
          </section>
        </aside>

        <section className="min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Sliders className="h-4 w-4 text-amber-300" />
              Hiệu chỉnh âm thanh
            </h2>
            <button
              type="button"
              aria-pressed={advanced}
              onClick={() => setAdvanced((enabled) => !enabled)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                advanced
                  ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
              }`}
            >
              Nâng Cao {advanced ? "· Bật" : ""}
            </button>
          </div>

          {!advanced ? (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <h3 className="mb-4 text-sm font-semibold text-slate-200">Điều chỉnh nhanh</h3>
              <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-5">
                <EffectSlider label="Bass" description="Tăng/giảm âm trầm" value={settings.low} min={-12} max={12} step={1} suffix=" dB" onChange={(value) => updateSetting("low", value)} />
                <EffectSlider label="Mid" description="Tăng/giảm âm trung" value={settings.mid} min={-12} max={12} step={1} suffix=" dB" onChange={(value) => updateSetting("mid", value)} />
                <EffectSlider label="Treble" description="Tăng/giảm âm cao" value={settings.high} min={-12} max={12} step={1} suffix=" dB" onChange={(value) => updateSetting("high", value)} />
                <EffectSlider label="Cao / trầm" description="Điều chỉnh cao độ tổng thể" value={settings.pitch} min={-12} max={12} step={1} suffix=" st" onChange={(value) => updateSetting("pitch", value)} />
                <EffectSlider label="Robot" description="Tạo chất âm robot" value={settings.robot} min={0} max={1} step={0.01} percent onChange={(value) => updateSetting("robot", value)} />
                <EffectSlider label="Reverb" description="Tạo tiếng vang không gian" value={settings.reverb} min={0} max={1} step={0.01} percent onChange={(value) => updateSetting("reverb", value)} />
                <EffectSlider label="Echo" description="Tạo tiếng vọng lặp lại" value={settings.echo} min={0} max={0.8} step={0.01} percent onChange={(value) => updateSetting("echo", value)} />
                <EffectSlider label="Chorus" description="Tạo cảm giác nhiều giọng" value={settings.chorus} min={0} max={1} step={0.01} percent onChange={(value) => updateSetting("chorus", value)} />
              </div>
            </section>
          ) : (
            <div className="space-y-3">
              <p className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-relaxed text-sky-200/80">
                Formant, vocoder, noise reduction, expander và Auto Gain là các mô phỏng gần đúng. Normalize đo đỉnh audio mẫu để bù gain khi preview.
              </p>
              {EFFECT_GROUPS.map((group) => (
                <section key={group.name} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                  <h3 className="mb-4 text-sm font-semibold text-slate-200">{group.name}</h3>
                  <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {group.controls.map((control) => (
                      <EffectSlider
                        key={control.key}
                        label={control.label}
                        description={control.description}
                        value={settings[control.key]}
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        suffix={"suffix" in control ? control.suffix : ""}
                        percent={"percent" in control}
                        onChange={(value) => updateSetting(control.key, value)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-slate-400">
            Hiệu ứng áp dụng cho preview trong trình duyệt. Muốn dùng hiệu ứng trong file TTS, cần kết xuất audio đã xử lý thành file mới.
          </p>
        </section>
      </div>
    </div>
  );
}
