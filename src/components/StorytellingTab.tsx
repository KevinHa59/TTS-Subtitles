import React, { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  Plus,
  Play,
  Pause,
  Download,
  Trash2,
  Edit3,
  Split,
  Merge,
  ArrowUp,
  ArrowDown,
  Volume2,
  RefreshCw,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileText,
  Save,
  RotateCcw,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Copy,
  Scissors,
  Check,
} from "lucide-react";
import { Story, StoryCharacter, StoryParagraph } from "../types/story";

interface VoiceOption {
  id: string;
  modelId: string;
  speakerId?: number;
  name: string;
  tag: string;
  gender: "female" | "male" | "neutral";
  description: string;
  sampleText: string;
  recommended: boolean;
  hasLocalFile?: boolean;
  localFilePath?: string | null;
  isLoaded?: boolean;
}

interface StorytellingTabProps {
  voices: VoiceOption[];
  onOpenCleanupModal: () => void;
}

const BADGE_COLORS: { label: string; value: string; bg: string; text: string; border: string; ring: string }[] = [
  { label: "Vàng Hổ Phách", value: "amber", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", ring: "ring-amber-500" },
  { label: "Xanh Dương", value: "blue", bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30", ring: "ring-blue-500" },
  { label: "Ngọc Lục Bảo", value: "emerald", bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", ring: "ring-emerald-500" },
  { label: "Tím Mộng Mơ", value: "purple", bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30", ring: "ring-purple-500" },
  { label: "Hồng Sen", value: "rose", bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/30", ring: "ring-rose-500" },
  { label: "Cam San Hô", value: "orange", bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30", ring: "ring-orange-500" },
  { label: "Lam Nhạt", value: "cyan", bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30", ring: "ring-cyan-500" },
];

function getColorConfig(colorName?: string) {
  return BADGE_COLORS.find((c) => c.value === colorName) || BADGE_COLORS[0];
}

export default function StorytellingTab({ voices, onOpenCleanupModal }: StorytellingTabProps) {
  // Stories List & Active Story
  const [storiesList, setStoriesList] = useState<any[]>([]);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Raw Content Input for Quick Import
  const [rawText, setRawText] = useState("");
  const [showRawInput, setShowRawInput] = useState(false);

  // Audio Playback States
  const [previewingParagraphId, setPreviewingParagraphId] = useState<string | null>(null);
  const [previewingCharId, setPreviewingCharId] = useState<string | null>(null);
  const [isPlayingMaster, setIsPlayingMaster] = useState(false);
  const [masterCurrentTime, setMasterCurrentTime] = useState(0);
  const [masterDuration, setMasterDuration] = useState(0);
  const masterAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // SSE Event Source for live generation updates
  const sseRef = useRef<EventSource | null>(null);

  // Toast / Status Message
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (text: string, type: "success" | "error" | "info" = "info") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Fetch all stories on mount
  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async (selectStoryId?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/stories");
      const data = await res.json();
      setStoriesList(data.stories || []);

      if (data.stories && data.stories.length > 0) {
        const idToLoad = selectStoryId || (activeStory ? activeStory.id : data.stories[0].id);
        loadStory(idToLoad);
      }
    } catch (err: any) {
      console.error("Lỗi tải danh sách truyện:", err);
      showToast("Không thể tải danh sách truyện từ máy chủ.", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadStory = async (storyId: string) => {
    try {
      const res = await fetch(`/api/stories/${storyId}`);
      if (!res.ok) throw new Error("Không thể tải truyện.");
      const story: Story = await res.json();
      setActiveStory(story);
      setRawText(story.rawContent || story.paragraphs.map((p) => p.text).join("\n\n"));
      // Connect SSE for this story
      connectStorySSE(story.id);
    } catch (err: any) {
      console.error("Lỗi nạp truyện:", err);
      showToast("Lỗi nạp truyện: " + err.message, "error");
    }
  };

  // Connect SSE for active story
  const connectStorySSE = (storyId: string) => {
    if (sseRef.current) {
      sseRef.current.close();
    }
    const es = new EventSource(`/api/stories/${storyId}/events`);
    sseRef.current = es;

    es.addEventListener("story_state", (e) => {
      try {
        const updated: Story = JSON.parse(e.data);
        setActiveStory((prev) => (prev && prev.id === updated.id ? updated : prev));
      } catch {}
    });

    es.addEventListener("story_progress", (e) => {
      try {
        const progress = JSON.parse(e.data);
        setActiveStory((prev) => (prev ? { ...prev, progress } : null));
      } catch {}
    });

    es.addEventListener("paragraph_start", (e) => {
      try {
        const data = JSON.parse(e.data);
        setActiveStory((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            paragraphs: prev.paragraphs.map((p) =>
              p.index === data.index ? { ...p, status: "generating" } : p
            ),
          };
        });
      } catch {}
    });

    es.addEventListener("paragraph_completed", (e) => {
      try {
        const data = JSON.parse(e.data);
        setActiveStory((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            paragraphs: prev.paragraphs.map((p) =>
              p.index === data.index
                ? { ...p, status: "completed", duration: data.duration, audioUrl: data.audioUrl }
                : p
            ),
          };
        });
      } catch {}
    });

    es.addEventListener("story_completed", (e) => {
      try {
        const updated: Story = JSON.parse(e.data);
        setActiveStory(updated);
        showToast("Tạo audio truyện thành công! Đã ghép nối master audio.", "success");
      } catch {}
    });

    es.addEventListener("story_failed", (e) => {
      try {
        const data = JSON.parse(e.data);
        setActiveStory((prev) => (prev ? { ...prev, status: "failed", error: data.error } : null));
        showToast("Lỗi tạo audio: " + data.error, "error");
      } catch {}
    });

    es.onerror = () => {
      // Reconnection handled automatically by browser EventSource
    };
  };

  useEffect(() => {
    return () => {
      if (sseRef.current) sseRef.current.close();
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      if (masterAudioRef.current) {
        masterAudioRef.current.pause();
        masterAudioRef.current = null;
      }
    };
  }, []);

  // Save story to backend
  const handleSaveStory = async () => {
    if (!activeStory) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/stories/${activeStory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeStory),
      });
      if (!res.ok) throw new Error("Lỗi khi lưu truyện.");
      const updated = await res.json();
      setActiveStory(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      showToast("Đã lưu truyện thành công!", "success");
      // Update stories list title
      setStoriesList((prev) =>
        prev.map((s) => (s.id === updated.id ? { ...s, title: updated.title, paragraphsCount: updated.paragraphs.length } : s))
      );
    } catch (err: any) {
      showToast("Lỗi lưu truyện: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // Create new blank story
  const handleCreateNewStory = async () => {
    try {
      const defaultChar: StoryCharacter = {
        id: `char_${Date.now()}`,
        name: "Người kể chuyện",
        voiceId: voices[0]?.modelId || "local:hoaimy-vietnamese-vi-medium-ljkjhi",
        speed: 1.0,
        color: "amber",
      };

      const newStory: Partial<Story> = {
        id: `story_${Date.now()}`,
        title: "Truyện Mới Chưa Đặt Tên",
        characters: [
          defaultChar,
          {
            id: `char_a_${Date.now()}`,
            name: "Nhân vật A",
            voiceId: voices[1]?.modelId || "local:doanhdoanh-vietnamese-vi-congchualong",
            speed: 1.0,
            color: "blue",
          },
        ],
        paragraphs: [
          {
            id: `p_1`,
            index: 1,
            characterId: defaultChar.id,
            text: "Nhập nội dung đoạn đầu tiên ở đây...",
            status: "pending",
          },
        ],
        gapMs: 300,
        outputFormat: "mp3",
      };

      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStory),
      });
      if (!res.ok) throw new Error("Lỗi tạo truyện mới.");
      const created: Story = await res.json();
      setActiveStory(created);
      setRawText("");
      showToast("Đã tạo truyện mới thành công!", "success");
      fetchStories(created.id);
    } catch (err: any) {
      showToast("Lỗi tạo truyện: " + err.message, "error");
    }
  };

  // Delete current story
  const handleDeleteStory = async () => {
    if (!activeStory) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa truyện "${activeStory.title}" không? Thao tác này không thể hoàn tác.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/stories/${activeStory.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Lỗi xóa truyện.");
      showToast("Đã xóa truyện thành công.", "info");
      setActiveStory(null);
      fetchStories();
    } catch (err: any) {
      showToast("Lỗi xóa truyện: " + err.message, "error");
    }
  };

  // Auto split raw text into paragraphs based on blank lines
  const handleSplitFromRawText = () => {
    if (!activeStory) return;
    if (!rawText.trim()) {
      showToast("Vui lòng nhập hoặc dán nội dung truyện trước khi chia đoạn.", "error");
      return;
    }

    // Split based on one or more blank lines: \n\s*\n+
    const rawParagraphs = rawText
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (rawParagraphs.length === 0) {
      showToast("Không tìm thấy đoạn văn nào hợp lệ.", "error");
      return;
    }

    const defaultCharId = activeStory.characters[0]?.id || "char_default";

    const newParagraphs: StoryParagraph[] = rawParagraphs.map((text, idx) => {
      // Try to preserve character assignment if existing paragraph at same index
      const existing = activeStory.paragraphs[idx];
      return {
        id: existing?.id || `p_${Date.now()}_${idx + 1}`,
        index: idx + 1,
        characterId: existing?.characterId || defaultCharId,
        text,
        status: "pending",
      };
    });

    const updated: Story = {
      ...activeStory,
      rawContent: rawText,
      paragraphs: newParagraphs,
      status: "idle",
      masterAudio: undefined, // invalidate previous master when content changes
    };

    setActiveStory(updated);
    setShowRawInput(false);
    showToast(`Đã tự động chia thành ${newParagraphs.length} đoạn dựa trên dòng trống!`, "success");
  };

  // Add new character
  const handleAddCharacter = () => {
    if (!activeStory) return;
    const colorIndex = activeStory.characters.length % BADGE_COLORS.length;
    const voiceIndex = activeStory.characters.length % voices.length;
    const newChar: StoryCharacter = {
      id: `char_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: `Nhân vật ${String.fromCharCode(65 + activeStory.characters.length)}`,
      voiceId: voices[voiceIndex]?.modelId || voices[0]?.modelId || "local:hoaimy-vietnamese-vi-medium-ljkjhi",
      speed: 1.0,
      color: BADGE_COLORS[colorIndex].value,
    };
    setActiveStory({
      ...activeStory,
      characters: [...activeStory.characters, newChar],
    });
  };

  // Update character
  const handleUpdateCharacter = (id: string, updates: Partial<StoryCharacter>) => {
    if (!activeStory) return;
    setActiveStory({
      ...activeStory,
      characters: activeStory.characters.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    });
  };

  // Delete character
  const handleDeleteCharacter = (id: string) => {
    if (!activeStory) return;
    if (activeStory.characters.length <= 1) {
      showToast("Truyện phải có ít nhất 1 nhân vật hoặc người kể chuyện.", "error");
      return;
    }
    const fallbackCharId = activeStory.characters.find((c) => c.id !== id)?.id || activeStory.characters[0].id;
    setActiveStory({
      ...activeStory,
      characters: activeStory.characters.filter((c) => c.id !== id),
      paragraphs: activeStory.paragraphs.map((p) =>
        p.characterId === id ? { ...p, characterId: fallbackCharId } : p
      ),
    });
  };

  // Preview character voice
  const handlePreviewVoice = async (char: StoryCharacter) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setPreviewingCharId(char.id);
    try {
      const sample = `Xin chào! Tôi là ${char.name}, sử dụng giọng đọc này để kể truyện cùng bạn.`;
      const res = await fetch(`/api/stories/${activeStory?.id || "temp"}/preview-paragraph`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sample,
          voiceId: char.voiceId,
          speed: char.speed,
        }),
      });
      if (!res.ok) throw new Error("Không thể tạo giọng nghe thử.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => setPreviewingCharId(null);
      audio.onerror = () => setPreviewingCharId(null);
      await audio.play();
    } catch (err: any) {
      setPreviewingCharId(null);
      showToast("Lỗi nghe thử giọng: " + err.message, "error");
    }
  };

  // Preview paragraph
  const handlePreviewParagraph = async (p: StoryParagraph) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }

    // If paragraph has generated audio already, play directly
    if (p.audioUrl) {
      setPreviewingParagraphId(p.id);
      const audio = new Audio(p.audioUrl);
      previewAudioRef.current = audio;
      audio.onended = () => setPreviewingParagraphId(null);
      audio.onerror = () => setPreviewingParagraphId(null);
      await audio.play();
      return;
    }

    // Otherwise generate on the fly
    setPreviewingParagraphId(p.id);
    const char = activeStory?.characters.find((c) => c.id === p.characterId) || activeStory?.characters[0];
    try {
      const res = await fetch(`/api/stories/${activeStory?.id}/preview-paragraph`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: p.text,
          voiceId: char?.voiceId,
          speed: char?.speed,
        }),
      });
      if (!res.ok) throw new Error("Lỗi khi đọc đoạn văn.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => setPreviewingParagraphId(null);
      audio.onerror = () => setPreviewingParagraphId(null);
      await audio.play();
    } catch (err: any) {
      setPreviewingParagraphId(null);
      showToast("Lỗi nghe thử đoạn: " + err.message, "error");
    }
  };

  // Paragraph manipulations: Split, Merge, Add, Delete, Move Up, Move Down
  const handleParagraphTextChange = (id: string, text: string) => {
    if (!activeStory) return;
    setActiveStory({
      ...activeStory,
      paragraphs: activeStory.paragraphs.map((p) =>
        p.id === id ? { ...p, text, status: "pending", audioUrl: undefined } : p
      ),
    });
  };

  const handleParagraphCharChange = (id: string, characterId: string) => {
    if (!activeStory) return;
    setActiveStory({
      ...activeStory,
      paragraphs: activeStory.paragraphs.map((p) =>
        p.id === id ? { ...p, characterId, status: "pending", audioUrl: undefined } : p
      ),
    });
  };

  const handleAddParagraphAfter = (idx: number) => {
    if (!activeStory) return;
    const defaultCharId = activeStory.characters[0]?.id || "char_default";
    const newPara: StoryParagraph = {
      id: `p_${Date.now()}_${idx + 1}`,
      index: idx + 2,
      characterId: defaultCharId,
      text: "Nhập nội dung cho đoạn mới...",
      status: "pending",
    };
    const updated = [...activeStory.paragraphs];
    updated.splice(idx + 1, 0, newPara);
    // Reindex
    const reindexed = updated.map((p, i) => ({ ...p, index: i + 1 }));
    setActiveStory({ ...activeStory, paragraphs: reindexed });
  };

  const handleDeleteParagraph = (idx: number) => {
    if (!activeStory) return;
    if (activeStory.paragraphs.length <= 1) {
      showToast("Truyện cần có ít nhất 1 đoạn văn.", "error");
      return;
    }
    const updated = activeStory.paragraphs.filter((_, i) => i !== idx);
    const reindexed = updated.map((p, i) => ({ ...p, index: i + 1 }));
    setActiveStory({ ...activeStory, paragraphs: reindexed });
  };

  const handleMoveParagraph = (idx: number, direction: "up" | "down") => {
    if (!activeStory) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= activeStory.paragraphs.length) return;
    const updated = [...activeStory.paragraphs];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    const reindexed = updated.map((p, i) => ({ ...p, index: i + 1 }));
    setActiveStory({ ...activeStory, paragraphs: reindexed });
  };

  // Merge paragraph with the next one
  const handleMergeNext = (idx: number) => {
    if (!activeStory) return;
    if (idx >= activeStory.paragraphs.length - 1) return;
    const current = activeStory.paragraphs[idx];
    const next = activeStory.paragraphs[idx + 1];
    const mergedText = `${current.text} ${next.text}`;

    const updated = [...activeStory.paragraphs];
    updated[idx] = { ...current, text: mergedText, status: "pending", audioUrl: undefined };
    updated.splice(idx + 1, 1);
    const reindexed = updated.map((p, i) => ({ ...p, index: i + 1 }));
    setActiveStory({ ...activeStory, paragraphs: reindexed });
    showToast(`Đã gộp đoạn #${idx + 1} và #${idx + 2} thành công!`, "info");
  };

  // Split paragraph in two
  const handleSplitParagraph = (idx: number) => {
    if (!activeStory) return;
    const current = activeStory.paragraphs[idx];
    const text = current.text.trim();
    if (text.length < 10) {
      showToast("Đoạn quá ngắn để tách.", "error");
      return;
    }

    // Split roughly at middle sentence or punctuation (. ? !)
    const splitMatch = text.slice(Math.floor(text.length * 0.3)).search(/[.?!]\s+/);
    let splitPos = -1;
    if (splitMatch !== -1) {
      splitPos = Math.floor(text.length * 0.3) + splitMatch + 1;
    } else {
      splitPos = Math.floor(text.length / 2);
    }

    const part1 = text.slice(0, splitPos).trim();
    const part2 = text.slice(splitPos).trim();

    const para1: StoryParagraph = { ...current, text: part1, status: "pending", audioUrl: undefined };
    const para2: StoryParagraph = {
      id: `p_${Date.now()}_split`,
      index: idx + 2,
      characterId: current.characterId,
      text: part2,
      status: "pending",
    };

    const updated = [...activeStory.paragraphs];
    updated.splice(idx, 1, para1, para2);
    const reindexed = updated.map((p, i) => ({ ...p, index: i + 1 }));
    setActiveStory({ ...activeStory, paragraphs: reindexed });
    showToast(`Đã tách đoạn #${idx + 1} thành 2 đoạn!`, "info");
  };

  // Bulk assign all paragraphs to a character
  const handleBulkAssign = (charId: string) => {
    if (!activeStory) return;
    const char = activeStory.characters.find((c) => c.id === charId);
    setActiveStory({
      ...activeStory,
      paragraphs: activeStory.paragraphs.map((p) => ({
        ...p,
        characterId: charId,
        status: "pending",
        audioUrl: undefined,
      })),
    });
    showToast(`Đã gán toàn bộ các đoạn cho: ${char?.name || "Nhân vật"}`, "info");
  };

  // Trigger story audio generation
  const handleGenerateAudio = async () => {
    if (!activeStory) return;
    if (activeStory.paragraphs.length === 0) {
      showToast("Vui lòng thêm ít nhất 1 đoạn văn trước khi tạo audio.", "error");
      return;
    }

    // Save state first
    await handleSaveStory();

    try {
      const res = await fetch(`/api/stories/${activeStory.id}/generate`, { method: "POST" });
      if (!res.ok) throw new Error("Không thể bắt đầu tạo audio.");
      showToast("Đã bắt đầu tạo audio truyện! Đang xử lý từng đoạn...", "info");
      setActiveStory((prev) =>
        prev
          ? {
              ...prev,
              status: "running",
              progress: { total: prev.paragraphs.length, completed: 0, percent: 0, currentParagraphIndex: 1 },
            }
          : null
      );
    } catch (err: any) {
      showToast("Lỗi khởi chạy tạo audio: " + err.message, "error");
    }
  };

  // Master Audio playback handlers
  const handleToggleMasterPlay = () => {
    if (!masterAudioRef.current) return;
    if (isPlayingMaster) {
      masterAudioRef.current.pause();
      setIsPlayingMaster(false);
    } else {
      masterAudioRef.current.play();
      setIsPlayingMaster(true);
    }
  };

  const handleMasterSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setMasterCurrentTime(time);
    if (masterAudioRef.current) {
      masterAudioRef.current.currentTime = time;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold backdrop-blur-md transition-all border ${
            toastMessage.type === "success"
              ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/40"
              : toastMessage.type === "error"
              ? "bg-rose-950/90 text-rose-300 border-rose-500/40"
              : "bg-slate-900/90 text-amber-300 border-amber-500/40"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : toastMessage.type === "error" ? (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-amber-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* TOP HEADER CONTROLS FOR STORYTELLING */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Kể Truyện Đa Nhân Vật
                </span>
                <span className="text-xs text-slate-400">100% Offline</span>
              </div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2 mt-0.5">
                {activeStory ? (
                  <input
                    type="text"
                    value={activeStory.title}
                    onChange={(e) => setActiveStory({ ...activeStory, title: e.target.value })}
                    className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-amber-500 focus:outline-none text-white font-bold text-base sm:text-lg transition-colors px-1"
                    title="Bấm để đổi tên truyện"
                  />
                ) : (
                  "Kể Truyện TTS"
                )}
              </h2>
            </div>
          </div>
        </div>

        {/* Quick Actions & Story Selector */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {/* Story Selector Dropdown */}
          <div className="relative">
            <select
              value={activeStory?.id || ""}
              onChange={(e) => loadStory(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs text-slate-300 rounded-xl px-3 py-2 pr-8 focus:outline-none focus:ring-1 focus:ring-amber-500 appearance-none font-medium cursor-pointer"
              title="Chọn truyện đã lưu"
            >
              {storiesList.map((s) => (
                <option key={s.id} value={s.id}>
                  📖 {s.title} ({s.paragraphsCount || 0} đoạn)
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* New Story */}
          <button
            type="button"
            onClick={handleCreateNewStory}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-white font-medium transition-all shadow-sm"
            title="Tạo truyện mới"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Truyện Mới</span>
          </button>

          {/* Save Story */}
          <button
            type="button"
            onClick={handleSaveStory}
            disabled={saving}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
              saveSuccess
                ? "bg-emerald-500 text-slate-950 border-emerald-400"
                : "bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20"
            }`}
            title="Lưu truyện vào hệ thống"
          >
            {saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Đã Lưu!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? "Đang lưu..." : "Lưu Truyện"}</span>
              </>
            )}
          </button>

          {/* Delete Story */}
          <button
            type="button"
            onClick={handleDeleteStory}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-800 text-xs text-slate-400 hover:text-rose-300 font-medium transition-all"
            title="Xóa truyện này"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Xóa</span>
          </button>

          {/* Dọn Dẹp Audio button (Requirement: Nút Dọn Dẹp Audio trên giao diện) */}
          <button
            type="button"
            onClick={onOpenCleanupModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-amber-950/40 border border-slate-700 hover:border-amber-500/40 text-xs text-amber-400 font-medium transition-all"
            title="Dọn dẹp các tệp audio tạm thời của TTS"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Dọn Dẹp Audio</span>
          </button>
        </div>
      </div>

      {activeStory && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ========================================================= */}
          {/* CỘT TRÁI: QUẢN LÝ NHÂN VẬT & GIỌNG ĐỌC + CÀI ĐẶT TRUYỆN   */}
          {/* ========================================================= */}
          <div className="lg:col-span-4 space-y-6">
            {/* Box Quản lý Nhân Vật */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold text-xs">
                    👥
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Quản Lý Nhân Vật</h3>
                    <p className="text-[11px] text-slate-400">Gán giọng đọc cho từng nhân vật</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddCharacter}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold transition-all"
                  title="Thêm nhân vật mới"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm</span>
                </button>
              </div>

              {/* Characters List */}
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {activeStory.characters.map((char) => {
                  const colorConfig = getColorConfig(char.color);
                  const isPreviewing = previewingCharId === char.id;

                  return (
                    <div
                      key={char.id}
                      className={`p-3.5 rounded-xl border bg-slate-950/70 space-y-2.5 transition-all ${colorConfig.border}`}
                    >
                      {/* Top row: Name & Color & Delete */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span
                            className={`w-3 h-3 rounded-full shrink-0 ring-2 ${colorConfig.ring} bg-current ${colorConfig.text}`}
                            title={`Màu đại diện: ${colorConfig.label}`}
                          />
                          <input
                            type="text"
                            value={char.name}
                            onChange={(e) => handleUpdateCharacter(char.id, { name: e.target.value })}
                            className="bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1 text-xs font-bold text-white w-full focus:outline-none"
                            placeholder="Tên nhân vật..."
                          />
                        </div>

                        {/* Color Selector */}
                        <div className="flex items-center gap-1">
                          <select
                            value={char.color || "amber"}
                            onChange={(e) => handleUpdateCharacter(char.id, { color: e.target.value })}
                            className="bg-slate-900 border border-slate-700 text-[10px] text-slate-300 rounded px-1.5 py-1 focus:outline-none"
                            title="Chọn màu phân biệt"
                          >
                            {BADGE_COLORS.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>

                          {activeStory.characters.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCharacter(char.id)}
                              className="p-1 rounded hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 transition-colors"
                              title="Xóa nhân vật này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Voice Model Selection */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-semibold text-slate-400">
                          Mô hình giọng đọc (Piper TTS)
                        </label>
                        <select
                          value={char.voiceId}
                          onChange={(e) => handleUpdateCharacter(char.id, { voiceId: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 text-xs text-amber-300 font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          {voices.map((v) => (
                            <option key={v.modelId} value={v.modelId}>
                              {v.name} ({v.tag})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Speed Slider & Preview Button */}
                      <div className="flex items-center justify-between gap-3 pt-1 text-[11px]">
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-slate-400 shrink-0">Tốc độ:</span>
                          <input
                            type="range"
                            min="0.6"
                            max="1.8"
                            step="0.05"
                            value={char.speed || 1.0}
                            onChange={(e) => handleUpdateCharacter(char.id, { speed: parseFloat(e.target.value) })}
                            className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                          />
                          <span className="font-mono text-amber-400 font-bold w-10 text-right">
                            {(char.speed || 1.0).toFixed(2)}x
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePreviewVoice(char)}
                          disabled={isPreviewing}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition-all shrink-0"
                          title="Nghe thử giọng nhân vật"
                        >
                          <Volume2 className={`w-3.5 h-3.5 text-amber-400 ${isPreviewing ? "animate-pulse" : ""}`} />
                          <span>{isPreviewing ? "Đang đọc..." : "Thử"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Box Cài đặt Ghép Nối & Khoảng Nghỉ */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center font-bold text-xs">
                  ⏱️
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Khoảng Nghỉ Giữa Các Đoạn</h3>
                  <p className="text-[11px] text-slate-400">Khoảng lặng chèn giữa các đoạn khi ghép master</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">Thời gian nghỉ (ms):</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="3000"
                      step="50"
                      value={activeStory.gapMs || 300}
                      onChange={(e) => setActiveStory({ ...activeStory, gapMs: parseInt(e.target.value) || 0 })}
                      className="w-20 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1 text-xs text-amber-400 font-mono font-bold text-center focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">ms</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0"
                  max="2000"
                  step="50"
                  value={activeStory.gapMs || 300}
                  onChange={(e) => setActiveStory({ ...activeStory, gapMs: parseInt(e.target.value) || 0 })}
                  className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />

                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0 ms (Liền mạch)</span>
                  <span className="text-amber-400 font-semibold">300 ms (Chuẩn)</span>
                  <span>1000 ms (Chậm rãi)</span>
                </div>
              </div>

              {/* Quick Bulk Assign Action */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-slate-300">Gán nhanh tất cả đoạn cho:</label>
                <div className="flex flex-wrap gap-1.5">
                  {activeStory.characters.map((c) => {
                    const cfg = getColorConfig(c.color);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleBulkAssign(c.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-80`}
                        title={`Gán tất cả đoạn cho ${c.name}`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* CỘT PHẢI: NỘI DUNG TRUYỆN & DANH SÁCH CÁC ĐOẠN             */}
          {/* ========================================================= */}
          <div className="lg:col-span-8 space-y-6">
            {/* Box Nhập / Phân Tách Nội Dung Thô (Có thể đóng mở) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">
                    Nội Dung Gốc & Phân Tách Tự Động ({activeStory.paragraphs.length} đoạn)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRawInput(!showRawInput)}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium"
                >
                  <span>{showRawInput ? "Ẩn khung dán" : "Dán toàn bộ văn bản truyện"}</span>
                  {showRawInput ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showRawInput && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Dán toàn bộ nội dung truyện vào đây. Hệ thống sẽ{" "}
                    <strong className="text-amber-300">tự động chia thành các đoạn dựa trên dòng trống</strong> giữa các
                    khối chữ:
                  </p>
                  <textarea
                    rows={6}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Dán toàn bộ nội dung truyện tại đây. Giữa các đoạn hãy để 1 dòng trống..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs text-slate-200 focus:outline-none font-mono leading-relaxed resize-y"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      Mẹo: Mỗi đoạn có thể gán cho một nhân vật hoặc người kể chuyện riêng biệt.
                    </span>
                    <button
                      type="button"
                      onClick={handleSplitFromRawText}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>Tự Động Phân Chia Đoạn</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Danh Sách Các Đoạn Truyện */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Danh Sách Đoạn Truyện ({activeStory.paragraphs.length})
                </h4>
                <button
                  type="button"
                  onClick={() => handleAddParagraphAfter(activeStory.paragraphs.length - 1)}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm đoạn cuối</span>
                </button>
              </div>

              <div className="space-y-3">
                {activeStory.paragraphs.map((p, idx) => {
                  const assignedChar =
                    activeStory.characters.find((c) => c.id === p.characterId) || activeStory.characters[0];
                  const colorConfig = getColorConfig(assignedChar?.color);
                  const isPreviewing = previewingParagraphId === p.id;
                  const isGenerating = p.status === "generating";
                  const isCompleted = p.status === "completed";

                  return (
                    <div
                      key={p.id}
                      className={`bg-slate-900 border rounded-2xl p-4 transition-all shadow-md space-y-3 ${
                        isGenerating
                          ? "border-amber-500/60 ring-2 ring-amber-500/20 bg-amber-500/5"
                          : "border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      {/* Top Bar of Paragraph: Index, Character Menu, Status, and Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 font-mono text-xs font-bold flex items-center justify-center">
                            #{p.index}
                          </span>

                          {/* Menu chọn Nhân Vật gán cho đoạn này (Requirement 2) */}
                          <div className="relative">
                            <select
                              value={p.characterId}
                              onChange={(e) => handleParagraphCharChange(p.id, e.target.value)}
                              className={`text-xs font-bold rounded-lg px-2.5 py-1 pr-6 border focus:outline-none appearance-none cursor-pointer transition-all ${colorConfig.bg} ${colorConfig.text} ${colorConfig.border}`}
                              title="Chọn nhân vật đọc đoạn này"
                            >
                              {activeStory.characters.map((c) => {
                                const voice = voices.find((v) => v.modelId === c.voiceId);
                                return (
                                  <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                                    👤 {c.name} ({voice ? voice.name : c.voiceId.replace(/^local:/, "")})
                                  </option>
                                );
                              })}
                            </select>
                            <ChevronDown
                              className={`w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${colorConfig.text}`}
                            />
                          </div>

                          {/* Status Badge */}
                          {isGenerating && (
                            <span className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Đang đọc...
                            </span>
                          )}
                          {isCompleted && (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3 h-3" />
                              {p.duration ? `${p.duration}s` : "Đã xong"}
                            </span>
                          )}
                        </div>

                        {/* Paragraph Tool Actions: Preview, Split, Merge, Move, Delete */}
                        <div className="flex items-center gap-1 text-slate-400">
                          {/* Preview paragraph */}
                          <button
                            type="button"
                            onClick={() => handlePreviewParagraph(p)}
                            disabled={isPreviewing || isGenerating}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                              isPreviewing
                                ? "bg-amber-500 text-slate-950 font-bold"
                                : "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                            }`}
                            title="Nghe thử riêng đoạn này"
                          >
                            <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                            <span>{isPreviewing ? "Đang phát..." : "Nghe thử"}</span>
                          </button>

                          {/* Split */}
                          <button
                            type="button"
                            onClick={() => handleSplitParagraph(idx)}
                            className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors"
                            title="Tách đoạn này thành 2 đoạn"
                          >
                            <Split className="w-3.5 h-3.5" />
                          </button>

                          {/* Merge next */}
                          {idx < activeStory.paragraphs.length - 1 && (
                            <button
                              type="button"
                              onClick={() => handleMergeNext(idx)}
                              className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors"
                              title="Gộp với đoạn kế tiếp"
                            >
                              <Merge className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Move Up */}
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveParagraph(idx, "up")}
                            className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Di chuyển lên"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          {/* Move Down */}
                          <button
                            type="button"
                            disabled={idx === activeStory.paragraphs.length - 1}
                            onClick={() => handleMoveParagraph(idx, "down")}
                            className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Di chuyển xuống"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Add after */}
                          <button
                            type="button"
                            onClick={() => handleAddParagraphAfter(idx)}
                            className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-amber-400 transition-colors"
                            title="Chèn thêm đoạn ngay sau đoạn này"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeleteParagraph(idx)}
                            className="p-1.5 rounded-lg hover:bg-rose-950/60 hover:text-rose-400 transition-colors"
                            title="Xóa đoạn này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Paragraph Textarea */}
                      <textarea
                        rows={3}
                        value={p.text}
                        onChange={(e) => handleParagraphTextChange(p.id, e.target.value)}
                        className="w-full bg-slate-950/60 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs sm:text-sm text-slate-200 focus:outline-none leading-relaxed resize-y font-normal"
                        placeholder="Nhập nội dung cho đoạn truyện..."
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ========================================================= */}
            {/* KHUNG TẠO AUDIO TRUYỆN & TIẾN TRÌNH & MASTER PLAYER      */}
            {/* ========================================================= */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <span>Tạo Toàn Bộ Audio Truyện</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Đọc tuần tự từng đoạn bằng giọng của nhân vật tương ứng và tự động ghép nối thành 1 file Master duy nhất.
                  </p>
                </div>

                {/* NÚT TẠO AUDIO TRUYỆN (Requirement: Nút Tạo Audio Truyện) */}
                <button
                  type="button"
                  onClick={handleGenerateAudio}
                  disabled={activeStory.status === "running"}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm shadow-xl transition-all ${
                    activeStory.status === "running"
                      ? "bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700"
                      : "bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-slate-950 shadow-amber-500/25 active:scale-98"
                  }`}
                >
                  {activeStory.status === "running" ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang Tạo Audio...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Tạo Audio Truyện</span>
                    </>
                  )}
                </button>
              </div>

              {/* Progress Bar during generation */}
              {activeStory.status === "running" && activeStory.progress && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-amber-400 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Đang xử lý đoạn #{activeStory.progress.currentParagraphIndex || 1} / {activeStory.progress.total}...
                    </span>
                    <span className="text-white font-mono">{activeStory.progress.percent}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-300"
                      style={{ width: `${activeStory.progress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* MASTER AUDIO PLAYER & DOWNLOAD SECTION */}
              {activeStory.masterAudio && (
                <div className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleToggleMasterPlay}
                        className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/30 transition-transform active:scale-95"
                        title={isPlayingMaster ? "Tạm dừng" : "Nghe thử Master Audio"}
                      >
                        {isPlayingMaster ? (
                          <Pause className="w-5 h-5 fill-current" />
                        ) : (
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        )}
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">Master Audio Hoàn Chỉnh</h4>
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {activeStory.masterAudio.format.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Thời lượng: {formatTime(activeStory.masterAudio.duration)} · Kích thước:{" "}
                          {(activeStory.masterAudio.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>

                    {/* Download Buttons */}
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/stories/${activeStory.id}/master-audio?format=mp3&download=1`}
                        download={`story-${activeStory.id}.mp3`}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-white transition-all shadow-sm"
                        title="Tải xuống định dạng MP3"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-400" />
                        <span>Tải MP3</span>
                      </a>
                      <a
                        href={`/api/stories/${activeStory.id}/master-audio?format=wav&download=1`}
                        download={`story-${activeStory.id}.wav`}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-white transition-all shadow-sm"
                        title="Tải xuống định dạng WAV chất lượng gốc"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-400" />
                        <span>Tải WAV</span>
                      </a>
                    </div>
                  </div>

                  {/* Audio scrubber timeline */}
                  <div className="space-y-1">
                    <input
                      type="range"
                      min="0"
                      max={masterDuration || activeStory.masterAudio.duration || 100}
                      step="0.1"
                      value={masterCurrentTime}
                      onChange={handleMasterSeek}
                      className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                    />
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>{formatTime(masterCurrentTime)}</span>
                      <span>{formatTime(masterDuration || activeStory.masterAudio.duration)}</span>
                    </div>
                  </div>

                  {/* HTML5 Audio Element for Master */}
                  <audio
                    ref={masterAudioRef}
                    src={activeStory.masterAudio.url}
                    onTimeUpdate={() => {
                      if (masterAudioRef.current) {
                        setMasterCurrentTime(masterAudioRef.current.currentTime);
                      }
                    }}
                    onLoadedMetadata={() => {
                      if (masterAudioRef.current) {
                        setMasterDuration(masterAudioRef.current.duration);
                      }
                    }}
                    onEnded={() => setIsPlayingMaster(false)}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
