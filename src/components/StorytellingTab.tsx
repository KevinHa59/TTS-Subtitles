import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Scissors,
  Check,
  Users,
  Search,
  Filter,
  X,
  VolumeX,
  Copy,
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

  // Popup Modal: Thiết Lập Nhân Vật & Khoảng Nghỉ
  const [showCharacterModal, setShowCharacterModal] = useState(false);

  // Popup Modal: Xuất Phụ Đề SRT (Requirement: tạo file phụ đề srt dựa vào thông tin mỗi đoạn)
  const [showSrtModal, setShowSrtModal] = useState(false);
  const [includeCharacterInSrt, setIncludeCharacterInSrt] = useState(false);

  // Raw Content Input Drawer for Quick Import
  const [rawText, setRawText] = useState("");
  const [showRawInput, setShowRawInput] = useState(false);

  // Table Filter & Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCharId, setFilterCharId] = useState<string>("all");

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
      masterAudio: undefined,
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
      const sample = `Xin chào! Tôi là ${char.name}, đọc với giọng này.`;
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

    if (p.audioUrl) {
      setPreviewingParagraphId(p.id);
      const audio = new Audio(p.audioUrl);
      previewAudioRef.current = audio;
      audio.onended = () => setPreviewingParagraphId(null);
      audio.onerror = () => setPreviewingParagraphId(null);
      await audio.play();
      return;
    }

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

  // Paragraph manipulations
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

  // Tách văn bản theo các dấu câu (, . ! ? ; : …) trong khi giữ lại dấu câu ở cuối từng câu
  const splitTextByPunctuation = (text: string): string[] => {
    if (!text || !text.trim()) return [];
    // Tách dựa trên khoảng trắng sau các dấu câu, bảo vệ các số có dấu chấm/phẩy như 5.000 hoặc 3,5
    const regex = /(?<=(?<!\d)[,.;:?!…\u2026]["'\u201d\u2019)\]]?)\s+/;
    const parts = text
      .trim()
      .split(regex)
      .map((s) => s.trim())
      .filter(Boolean);

    return parts.length > 0 ? parts : [text.trim()];
  };

  // Tách toàn bộ đoạn bởi dấu câu (Requirement: Tách toàn bộ đoạn bởi dấu câu)
  const handleSplitParagraphByPunctuation = (idx: number) => {
    if (!activeStory) return;
    const current = activeStory.paragraphs[idx];
    const sentences = splitTextByPunctuation(current.text);

    if (sentences.length <= 1) {
      showToast("Đoạn này không chứa dấu câu phù hợp để tách thêm.", "info");
      return;
    }

    const newParagraphs: StoryParagraph[] = sentences.map((sentence, sIdx) => ({
      id: sIdx === 0 ? current.id : `p_${Date.now()}_${sIdx}`,
      index: 0,
      characterId: current.characterId,
      text: sentence,
      status: "pending",
    }));

    const updated = [...activeStory.paragraphs];
    updated.splice(idx, 1, ...newParagraphs);
    const reindexed = updated.map((p, i) => ({ ...p, index: i + 1 }));

    setActiveStory({
      ...activeStory,
      paragraphs: reindexed,
      status: "idle",
      masterAudio: undefined,
    });

    showToast(`Đã tách đoạn #${idx + 1} thành ${sentences.length} câu theo dấu câu!`, "success");
  };

  // Tách toàn bộ tất cả các đoạn trong truyện theo dấu câu
  const handleSplitAllParagraphsByPunctuation = () => {
    if (!activeStory) return;
    const countBefore = activeStory.paragraphs.length;
    let anySplit = false;
    const resultParagraphs: StoryParagraph[] = [];

    activeStory.paragraphs.forEach((p) => {
      const sentences = splitTextByPunctuation(p.text);
      if (sentences.length > 1) anySplit = true;
      sentences.forEach((sentence, sIdx) => {
        resultParagraphs.push({
          id: sIdx === 0 ? p.id : `p_${Date.now()}_${resultParagraphs.length + 1}`,
          index: resultParagraphs.length + 1,
          characterId: p.characterId,
          text: sentence,
          status: "pending",
        });
      });
    });

    if (!anySplit) {
      showToast("Tất cả các đoạn đều đã là câu đơn hoặc không có dấu câu phù hợp.", "info");
      return;
    }

    setActiveStory({
      ...activeStory,
      paragraphs: resultParagraphs,
      status: "idle",
      masterAudio: undefined,
    });

    showToast(
      `Đã phân tách từ ${countBefore} đoạn thành ${resultParagraphs.length} câu dựa trên dấu câu!`,
      "success",
    );
  };

  // Định dạng timestamp chuẩn SRT: "00:01:23,456"
  const toSrtTimestamp = (sec: number): string => {
    if (isNaN(sec) || sec < 0) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    const pad = (n: number, z = 2) => String(n).padStart(z, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
  };

  // Tạo nội dung phụ đề SRT dựa vào thông tin mỗi đoạn (Requirement: tạo file phụ đề srt)
  const generateStorySrt = (withChar = includeCharacterInSrt): string => {
    if (!activeStory) return "";
    const gapSec = (activeStory.gapMs || 300) / 1000;
    let currentTime = 0;
    const blocks: string[] = [];

    activeStory.paragraphs.forEach((p, idx) => {
      const duration = p.duration || Math.max(1.0, Number((p.text.length * 0.08).toFixed(2)));
      const startTime = currentTime;
      const endTime = startTime + duration;
      currentTime = endTime + gapSec;

      const startStr = toSrtTimestamp(startTime);
      const endStr = toSrtTimestamp(endTime);

      let text = p.text;
      if (withChar) {
        const char = activeStory.characters.find((c) => c.id === p.characterId);
        if (char) {
          text = `[${char.name}]: ${p.text}`;
        }
      }

      blocks.push(`${idx + 1}\n${startStr} --> ${endStr}\n${text}\n`);
    });

    return blocks.join("\n");
  };

  const handleDownloadSrt = () => {
    if (!activeStory) return;
    const srtContent = generateStorySrt(includeCharacterInSrt);
    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `story-${activeStory.id}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Đã tải tệp phụ đề .SRT thành công!", "success");
  };

  const handleCopySrt = () => {
    const srtContent = generateStorySrt(includeCharacterInSrt);
    navigator.clipboard.writeText(srtContent).then(() => {
      showToast("Đã sao chép toàn bộ nội dung phụ đề SRT vào bộ nhớ tạm!", "success");
    });
  };

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

  // Generate story audio
  const handleGenerateAudio = async () => {
    if (!activeStory) return;
    if (activeStory.paragraphs.length === 0) {
      showToast("Vui lòng thêm ít nhất 1 đoạn văn trước khi tạo audio.", "error");
      return;
    }

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

  // Filtered paragraphs based on search and character selection
  const filteredParagraphs = useMemo(() => {
    if (!activeStory) return [];
    return activeStory.paragraphs.filter((p) => {
      const matchSearch =
        !searchQuery.trim() || p.text.toLowerCase().includes(searchQuery.toLowerCase());
      const matchChar = filterCharId === "all" || p.characterId === filterCharId;
      return matchSearch && matchChar;
    });
  }, [activeStory?.paragraphs, searchQuery, filterCharId]);

  return (
    <div className="space-y-6 pb-40">
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

      {/* ========================================================= */}
      {/* 1. TOP PANEL: KỂ TRUYỆN ĐA NHÂN VẬT & NÚT THIẾT LẬP NHÂN VẬT */}
      {/* ========================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
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

          {/* NÚT "THIẾT LẬP NHÂN VẬT" (Requirement 1: nút này ở cùng panel với Kể Truyện Đa Nhân Vật) */}
          {activeStory && (
            <button
              type="button"
              onClick={() => setShowCharacterModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-rose-500/15 hover:from-amber-500/25 hover:to-rose-500/25 border border-amber-500/30 text-amber-300 font-bold text-xs shadow-md transition-all sm:ml-2"
              title="Mở popup quản lý nhân vật, gán giọng đọc và cấu hình khoảng nghỉ"
            >
              <Users className="w-4 h-4 text-amber-400" />
              <span>Thiết Lập Nhân Vật</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono">
                {activeStory.characters.length}
              </span>
            </button>
          )}
        </div>

        {/* Quick Actions & Story Selector */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-start lg:justify-end">
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

          {/* Dọn Dẹp Audio button */}
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

      {/* ========================================================= */}
      {/* 2 & 3. DANH SÁCH ĐOẠN TRUYỆN: FULL SCREEN WIDTH & DẠNG TABLE */}
      {/* ========================================================= */}
      {activeStory && (
        <div className="w-full space-y-4">
          {/* Quick Raw Text Drawer (Dán toàn bộ truyện để chia đoạn) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span className="text-xs sm:text-sm font-bold text-white">
                  Dán Nội Dung & Tự Động Chia Đoạn
                </span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  (Dựa trên các dòng trống để chia đoạn)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowRawInput(!showRawInput)}
                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <span>{showRawInput ? "Đóng khung nhập" : "Mở khung dán văn bản"}</span>
                {showRawInput ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showRawInput && (
              <div className="space-y-3 pt-3 mt-3 border-t border-slate-800">
                <textarea
                  rows={6}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Dán toàn bộ nội dung kịch bản truyện tại đây. Giữa các đoạn hãy để 1 dòng trống..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs sm:text-sm text-slate-200 focus:outline-none font-mono leading-relaxed resize-y"
                />
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    Mẹo: Sau khi chia, bạn có thể gán từng đoạn cho các nhân vật khác nhau trong bảng bên dưới.
                  </span>
                  <button
                    type="button"
                    onClick={handleSplitFromRawText}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all shrink-0"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Tự Động Phân Chia Đoạn</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Table Toolbar: Search, Filter character, Add Paragraph, Stats */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Search Box */}
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm nội dung đoạn..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter by Character */}
              <div className="flex items-center gap-1.5 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={filterCharId}
                  onChange={(e) => setFilterCharId(e.target.value)}
                  className="bg-slate-950 border border-slate-800 focus:border-amber-500 text-xs text-slate-300 rounded-xl px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="all">Tất cả nhân vật ({activeStory.paragraphs.length})</option>
                  {activeStory.characters.map((c) => {
                    const count = activeStory.paragraphs.filter((p) => p.characterId === c.id).length;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({count} đoạn)
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Right actions: Add Paragraph, Split All & Counts */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0 justify-between md:justify-end">
              <span className="text-xs text-slate-400">
                Hiển thị: <strong className="text-amber-400 font-mono">{filteredParagraphs.length}</strong> /{" "}
                <span className="font-mono">{activeStory.paragraphs.length}</span> đoạn
              </span>

              {activeStory.masterAudio && (
                <button
                  type="button"
                  onClick={() => setShowSrtModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold transition-all shadow-sm"
                  title="Tạo và xuất file phụ đề .SRT theo timeline của các đoạn truyện"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Xuất Phụ Đề SRT</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSplitAllParagraphsByPunctuation}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 hover:text-amber-300 font-medium transition-all shadow-sm"
                title="Tự động phân tách toàn bộ các đoạn trong truyện thành từng câu dựa theo dấu câu"
              >
                <Scissors className="w-3.5 h-3.5 text-amber-400" />
                <span>Tách Tất Cả Theo Dấu Câu</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddParagraphAfter(activeStory.paragraphs.length - 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm Đoạn Mới</span>
              </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* BẢNG DANH SÁCH ĐOẠN TRUYỆN DẠNG TABLE (Requirement 3)       */}
          {/* ========================================================= */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-bold select-none">
                  <tr>
                    <th scope="col" className="py-3 px-3 w-14 text-center">
                      #
                    </th>
                    <th scope="col" className="py-3 px-3 w-56 sm:w-64">
                      Nhân Vật Đọc
                    </th>
                    <th scope="col" className="py-3 px-4 min-w-[320px]">
                      Nội Dung Đoạn Văn
                    </th>
                    <th scope="col" className="py-3 px-3 w-32 text-center">
                      Thời Lượng
                    </th>
                    <th scope="col" className="py-3 px-3 w-48 text-right">
                      Thao Tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredParagraphs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        Không tìm thấy đoạn văn nào phù hợp.
                      </td>
                    </tr>
                  ) : (
                    filteredParagraphs.map((p) => {
                      const actualIdx = activeStory.paragraphs.findIndex((item) => item.id === p.id);
                      const assignedChar =
                        activeStory.characters.find((c) => c.id === p.characterId) || activeStory.characters[0];
                      const colorConfig = getColorConfig(assignedChar?.color);
                      const isPreviewing = previewingParagraphId === p.id;
                      const isGenerating = p.status === "generating";
                      const isCompleted = p.status === "completed";

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isGenerating
                              ? "bg-amber-500/5 ring-1 ring-inset ring-amber-500/30"
                              : ""
                          }`}
                        >
                          {/* STT Column */}
                          <td className="py-3 px-3 text-center align-top">
                            <span className="inline-flex w-7 h-7 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs font-bold items-center justify-center">
                              #{p.index}
                            </span>
                          </td>

                          {/* Character Selector Column */}
                          <td className="py-3 px-3 align-top">
                            <div className="relative">
                              <select
                                value={p.characterId}
                                onChange={(e) => handleParagraphCharChange(p.id, e.target.value)}
                                className={`w-full text-xs font-bold rounded-xl px-2.5 py-1.5 pr-7 border focus:outline-none appearance-none cursor-pointer transition-all shadow-sm ${colorConfig.bg} ${colorConfig.text} ${colorConfig.border}`}
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
                                className={`w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${colorConfig.text}`}
                              />
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-slate-500">
                              <span
                                className={`w-2 h-2 rounded-full ${colorConfig.text} bg-current`}
                              />
                              <span className="truncate">
                                {assignedChar ? `${assignedChar.speed || 1.0}x tốc độ` : ""}
                              </span>
                            </div>
                          </td>

                          {/* Textarea Content Column */}
                          <td className="py-3 px-4 align-top">
                            <div className="space-y-1">
                              <textarea
                                rows={Math.max(2, Math.min(6, Math.ceil(p.text.length / 90)))}
                                value={p.text}
                                onChange={(e) => handleParagraphTextChange(p.id, e.target.value)}
                                className="w-full bg-slate-950/70 border border-slate-800 focus:border-amber-500 rounded-xl p-2.5 text-xs sm:text-sm text-slate-200 focus:outline-none leading-relaxed resize-y font-normal"
                                placeholder="Nhập nội dung đoạn truyện..."
                              />
                              <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
                                <span>
                                  {p.text.trim().split(/\s+/).filter(Boolean).length} từ · {p.text.length} ký tự
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Duration & Status Column */}
                          <td className="py-3 px-3 text-center align-top">
                            {isGenerating && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-semibold text-[11px] animate-pulse">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Đang đọc...</span>
                              </div>
                            )}

                            {isCompleted && (
                              <div className="inline-flex flex-col items-center">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold font-mono text-[11px]">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>{p.duration ? `${p.duration}s` : "Xong"}</span>
                                </span>
                              </div>
                            )}

                            {!isGenerating && !isCompleted && (
                              <span className="text-[11px] text-slate-500">Chờ xử lý</span>
                            )}
                          </td>

                          {/* Action Buttons Column */}
                          <td className="py-3 px-3 align-top text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Preview paragraph */}
                              <button
                                type="button"
                                onClick={() => handlePreviewParagraph(p)}
                                disabled={isPreviewing || isGenerating}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                                  isPreviewing
                                    ? "bg-amber-500 text-slate-950"
                                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                                }`}
                                title="Nghe thử riêng đoạn này"
                              >
                                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                                <span className="hidden sm:inline">
                                  {isPreviewing ? "Phát..." : "Nghe"}
                                </span>
                              </button>

                              {/* Tách toàn bộ đoạn bởi dấu câu (Requirement: Tách toàn bộ đoạn bởi dấu câu) */}
                              <button
                                type="button"
                                onClick={() => handleSplitParagraphByPunctuation(actualIdx)}
                                className="p-1.5 rounded-lg hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 transition-colors"
                                title="Tách toàn bộ đoạn này theo dấu câu (, . ! ? ; :)"
                              >
                                <Scissors className="w-3.5 h-3.5" />
                              </button>

                              {/* Merge next */}
                              {actualIdx < activeStory.paragraphs.length - 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleMergeNext(actualIdx)}
                                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                                  title="Gộp với đoạn kế tiếp"
                                >
                                  <Merge className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Move Up */}
                              <button
                                type="button"
                                disabled={actualIdx === 0}
                                onClick={() => handleMoveParagraph(actualIdx, "up")}
                                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                title="Di chuyển lên"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>

                              {/* Move Down */}
                              <button
                                type="button"
                                disabled={actualIdx === activeStory.paragraphs.length - 1}
                                onClick={() => handleMoveParagraph(actualIdx, "down")}
                                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                title="Di chuyển xuống"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>

                              {/* Add after */}
                              <button
                                type="button"
                                onClick={() => handleAddParagraphAfter(actualIdx)}
                                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors"
                                title="Chèn thêm đoạn ngay sau"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => handleDeleteParagraph(actualIdx)}
                                className="p-1.5 rounded-lg hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors"
                                title="Xóa đoạn này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* POPUP / MODAL: THIẾT LẬP NHÂN VẬT & KHOẢNG NGHỈ (TABLE)   */}
      {/* (Requirement 1 & 2: Quản lý nhân vật dạng TABLE trong popup) */}
      {/* ========================================================= */}
      {showCharacterModal && activeStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative text-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Thiết Lập Nhân Vật & Giọng Đọc Truyện
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cấu hình mô hình giọng Piper TTS, tốc độ đọc và khoảng nghỉ giữa các đoạn
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddCharacter}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm Nhân Vật</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCharacterModal(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Scrollable Table of Characters */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* TABLE QUẢN LÝ NHÂN VẬT (Requirement 2: dạng TABLE) */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950 shadow-inner">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                    <tr>
                      <th scope="col" className="py-3 px-3 w-28">
                        Màu Sắc
                      </th>
                      <th scope="col" className="py-3 px-3 w-44">
                        Tên Nhân Vật
                      </th>
                      <th scope="col" className="py-3 px-3">
                        Mô Hình Giọng Đọc (Piper TTS)
                      </th>
                      <th scope="col" className="py-3 px-3 w-44 text-center">
                        Tốc Độ Đọc
                      </th>
                      <th scope="col" className="py-3 px-3 w-28 text-right">
                        Thao Tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {activeStory.characters.map((char) => {
                      const colorConfig = getColorConfig(char.color);
                      const isPreviewing = previewingCharId === char.id;

                      return (
                        <tr key={char.id} className="hover:bg-slate-900/40 transition-colors">
                          {/* Color Selector */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-3.5 h-3.5 rounded-full shrink-0 ring-2 ${colorConfig.ring} bg-current ${colorConfig.text}`}
                              />
                              <select
                                value={char.color || "amber"}
                                onChange={(e) => handleUpdateCharacter(char.id, { color: e.target.value })}
                                className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-2 py-1 focus:outline-none"
                              >
                                {BADGE_COLORS.map((c) => (
                                  <option key={c.value} value={c.value}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>

                          {/* Character Name */}
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={char.name}
                              onChange={(e) => handleUpdateCharacter(char.id, { name: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1 text-xs font-bold text-white focus:outline-none"
                              placeholder="Tên nhân vật..."
                            />
                          </td>

                          {/* Voice Model Selection */}
                          <td className="py-3 px-3">
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
                          </td>

                          {/* Speed Slider */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min="0.6"
                                max="1.8"
                                step="0.05"
                                value={char.speed || 1.0}
                                onChange={(e) => handleUpdateCharacter(char.id, { speed: parseFloat(e.target.value) })}
                                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                              />
                              <span className="font-mono text-amber-400 font-bold text-xs w-10 text-right shrink-0">
                                {(char.speed || 1.0).toFixed(2)}x
                              </span>
                            </div>
                          </td>

                          {/* Action Buttons: Preview & Delete */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handlePreviewVoice(char)}
                                disabled={isPreviewing}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
                                title="Nghe thử giọng nhân vật"
                              >
                                <Volume2 className={`w-3.5 h-3.5 text-amber-400 ${isPreviewing ? "animate-pulse" : ""}`} />
                              </button>

                              {activeStory.characters.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCharacter(char.id)}
                                  className="p-1.5 rounded-lg hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 transition-colors"
                                  title="Xóa nhân vật này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* KHU VỰC THIẾT LẬP KHOẢNG NGHỈ GIỮA CÁC ĐOẠN (Requirement 1) */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-orange-400" />
                      <span>Khoảng Nghỉ Giữa Các Đoạn (Gap Silence)</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Thời gian im lặng (miligiây) được chèn vào giữa các đoạn khi ghép file Master
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="3000"
                      step="50"
                      value={activeStory.gapMs || 300}
                      onChange={(e) => setActiveStory({ ...activeStory, gapMs: parseInt(e.target.value) || 0 })}
                      className="w-20 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-2 py-1 text-xs text-amber-400 font-mono font-bold text-center focus:outline-none"
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
                  <span className="text-amber-400 font-semibold">300 ms (Mặc định chuẩn)</span>
                  <span>1000 ms (Chậm rãi)</span>
                </div>
              </div>

              {/* Bulk Assign Action */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
                <label className="text-xs font-bold text-slate-300 block">
                  Gán nhanh toàn bộ các đoạn trong truyện cho nhân vật:
                </label>
                <div className="flex flex-wrap gap-2">
                  {activeStory.characters.map((c) => {
                    const cfg = getColorConfig(c.color);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleBulkAssign(c.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-80 shadow-sm`}
                        title={`Gán toàn bộ đoạn cho ${c.name}`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/60">
              <button
                type="button"
                onClick={() => setShowCharacterModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSaveStory();
                  setShowCharacterModal(false);
                }}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all"
              >
                Lưu & Áp Dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. STICKY BOTTOM BAR: TẠO AUDIO TRUYỆN & PROGRESS BAR     */}
      {/* (Requirement 4: Sticky cố định ở đáy trang kèm Progress Bar) */}
      {/* ========================================================= */}
      {activeStory && (
        <div
          role="region"
          aria-label="Thanh điều khiển tiến độ và tạo audio truyện"
          className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 shadow-[0_-12px_40px_rgba(0,0,0,0.85)]"
        >
          <div className="max-w-[1680px] mx-auto px-3 sm:px-6 py-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 sm:gap-4">
              {/* VÙNG TRÁI: Thông tin truyện & nhân vật */}
              <div className="flex items-center justify-between lg:justify-start gap-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="leading-tight">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate max-w-[160px] sm:max-w-[220px]">
                        {activeStory.title}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {activeStory.paragraphs.length} đoạn
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span>{activeStory.characters.length} nhân vật</span>
                      <span>·</span>
                      <span>Khoảng nghỉ: {activeStory.gapMs || 300}ms</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* VÙNG GIỮA: PROGRESS BAR THỜI GIAN THỰC NHƯ TAB PHỤ ĐỀ */}
              <div className="flex-1 max-w-2xl px-1 sm:px-4">
                {activeStory.status === "running" && activeStory.progress ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-amber-400 flex items-center gap-1.5 animate-pulse">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>
                          Đang tạo đoạn #{activeStory.progress.currentParagraphIndex || 1} /{" "}
                          {activeStory.progress.total}...
                        </span>
                      </span>
                      <span className="font-mono text-white text-xs">
                        {activeStory.progress.percent}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 transition-all duration-300"
                        style={{ width: `${activeStory.progress.percent}%` }}
                      />
                    </div>
                  </div>
                ) : activeStory.masterAudio ? (
                  /* Master Player Mini Timeline Seeker when ready */
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Master Audio sẵn sàng ({formatTime(activeStory.masterAudio.duration)})</span>
                      </span>
                      <span className="font-mono text-slate-400">
                        {formatTime(masterCurrentTime)} / {formatTime(activeStory.masterAudio.duration)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={masterDuration || activeStory.masterAudio.duration || 100}
                      step="0.1"
                      value={masterCurrentTime}
                      onChange={handleMasterSeek}
                      className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                    />
                  </div>
                ) : (
                  /* Idle status */
                  <div className="flex items-center justify-center text-xs text-slate-400">
                    <span>
                      Nhấn nút <strong className="text-amber-300 font-semibold">“Tạo Audio Truyện”</strong> để bắt đầu ghép toàn bộ các đoạn.
                    </span>
                  </div>
                )}
              </div>

              {/* VÙNG PHẢI: PLAY MASTER, DOWNLOAD & NÚT TẠO CHÍNH */}
              <div className="flex items-center justify-end gap-2 shrink-0">
                {activeStory.masterAudio && (
                  <>
                    {/* Play/Pause Master Audio */}
                    <button
                      type="button"
                      onClick={handleToggleMasterPlay}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm border border-slate-700"
                      title={isPlayingMaster ? "Tạm dừng master audio" : "Phát master audio hoàn chỉnh"}
                    >
                      {isPlayingMaster ? (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-current text-amber-400" />
                          <span>Dừng</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                          <span>Nghe Master</span>
                        </>
                      )}
                    </button>

                    {/* Download Master */}
                    <a
                      href={`/api/stories/${activeStory.id}/master-audio?format=mp3&download=1`}
                      download={`story-${activeStory.id}.mp3`}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-all border border-slate-700"
                      title="Tải tệp Master MP3"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                    </a>

                    {/* Nút Tạo Phụ Đề SRT khi hoàn thành tạo audio */}
                    <button
                      type="button"
                      onClick={() => setShowSrtModal(true)}
                      className="px-3.5 py-2 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 hover:from-amber-500/30 hover:to-rose-500/30 text-amber-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm border border-amber-500/40"
                      title="Tạo và xuất file phụ đề .SRT chuẩn thời gian"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>Tạo Phụ Đề SRT</span>
                    </button>
                  </>
                )}

                {/* NÚT TẠO TOÀN BỘ AUDIO TRUYỆN (Requirement 4) */}
                <button
                  type="button"
                  disabled={activeStory.status === "running" || activeStory.paragraphs.length === 0}
                  onClick={handleGenerateAudio}
                  className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 active:scale-95 text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-xl shadow-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  {activeStory.status === "running" ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang Xử Lý...</span>
                    </>
                  ) : activeStory.masterAudio ? (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Chạy Lại Audio</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                      <span>Tạo Audio Truyện</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Hidden Audio Player for Master */}
          {activeStory.masterAudio && (
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
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* POPUP / MODAL: XUẤT PHỤ ĐỀ SRT THEO ĐOẠN TRUYỆN           */}
      {/* (Requirement: khi hoàn thành tạo audio, thêm chức năng     */}
      {/* có thể tạo file phụ đề srt dựa vào thông tin mỗi đoạn)   */}
      {/* ========================================================= */}
      {showSrtModal && activeStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative text-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Tạo & Xuất Phụ Đề SRT</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                      Khớp Timeline Audio
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Phụ đề được tính tự động dựa trên thời lượng thực tế của từng đoạn thoại và khoảng nghỉ ({activeStory.gapMs || 300}ms)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSrtModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Option: Include character name */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Hiển thị tên nhân vật trong phụ đề</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Ví dụ: [Người kể chuyện]: Ngày xửa ngày xưa...
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeCharacterInSrt}
                    onChange={(e) => setIncludeCharacterInSrt(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {/* Live SRT Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">
                    Xem trước nội dung file SRT ({activeStory.paragraphs.length} câu / đoạn):
                  </span>
                  <span className="font-mono text-[11px] text-amber-400">
                    Tổng: {activeStory.paragraphs.length} cues
                  </span>
                </div>
                <textarea
                  readOnly
                  rows={10}
                  value={generateStorySrt(includeCharacterInSrt)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 font-mono leading-relaxed resize-none focus:outline-none select-all"
                  placeholder="Đang tạo file phụ đề..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/60">
              <span className="text-[11px] text-slate-400 order-2 sm:order-1">
                Tương thích tiêu chuẩn với VLC, Premiere, CapCut, YouTube và Tab Đồng Bộ Phụ Đề.
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end order-1 sm:order-2">
                <button
                  type="button"
                  onClick={handleCopySrt}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sao Chép</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSrt}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải File .SRT</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
