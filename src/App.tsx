import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Download,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Sliders,
  Code,
  Music,
  Trash2,
  FileText,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Square,
  FileCode,
  Radio,
  ChevronDown,
  ChevronUp,
  Settings,
  Layers,
  Terminal,
  Filter,
  Check,
  Copy,
  Info
} from 'lucide-react';

import { SubtitleItem, TimelineJob, TimelineJobOptions, LogEntry } from './types/subtitles';
import {
  parseSrtContent,
  formatSecondsToSrtTime,
  formatSecondsDisplay,
  exportToSrtString,
} from './utils/srtParser';
import {
  SAMPLE_PROMPT_SRT,
  SAMPLE_DIALOGUE_SRT,
  SAMPLE_TEST_50_SRT,
} from './utils/sampleData';

interface VoiceOption {
  id: string;
  name: string;
  tag: string;
  gender: 'female' | 'male';
  description: string;
  sampleText: string;
  recommended: boolean;
}

export default function App() {
  // Navigation: 'subtitles' (Phụ đề Timeline) | 'single' (Đọc văn bản đơn)
  const [activeTab, setActiveTab] = useState<'subtitles' | 'single'>('subtitles');

  // Voices
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    'hub:hoaimy-vietnamese-vi-medium-ljkjhi'
  );

  // -------------------------------------------------------------
  // SUBTITLE TIMELINE STATE
  // -------------------------------------------------------------
  const [srtRawText, setSrtRawText] = useState<string>(SAMPLE_PROMPT_SRT);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [activeJob, setActiveJob] = useState<TimelineJob | null>(null);

  // Job options
  const [batchSizeChoice, setBatchSizeChoice] = useState<'1' | '2' | '4' | '8' | '16' | 'custom'>('4');
  const [customBatchSize, setCustomBatchSize] = useState<number>(6);
  const [maxSpeed, setMaxSpeed] = useState<number>(1.5);
  const [minSpeed, setMinSpeed] = useState<number>(0.8);
  const [speedPriority, setSpeedPriority] = useState<'balanced' | 'strict' | 'natural'>('balanced');
  const [padSilence, setPadSilence] = useState<boolean>(true);
  const [videoDurationStr, setVideoDurationStr] = useState<string>('');
  const [outputFormat, setOutputFormat] = useState<'mp3' | 'wav'>('mp3');
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);

  const effectiveBatchSize =
    batchSizeChoice === 'custom'
      ? Math.max(1, Math.min(32, customBatchSize || 4))
      : parseInt(batchSizeChoice, 10);

  // Logging & Filtering
  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'>('ALL');
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(true);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Playback state for Master Audio
  const [masterPlaying, setMasterPlaying] = useState<boolean>(false);
  const [masterCurrentTime, setMasterCurrentTime] = useState<number>(0);
  const [masterDuration, setMasterDuration] = useState<number>(0);
  const masterAudioRef = useRef<HTMLAudioElement | null>(null);

  // Playback state for Individual Subtitle Item
  const [playingItemIndex, setPlayingItemIndex] = useState<number | null>(null);
  const itemAudioRef = useRef<HTMLAudioElement | null>(null);

  // SSE EventSource reference
  const eventSourceRef = useRef<EventSource | null>(null);

  // Single Text TTS State (Tab 2)
  const [singleText, setSingleText] = useState<string>(
    'Xin chào! Tôi là Hoài My. Đây là giọng đọc tiếng Việt tự nhiên được phát triển từ công nghệ Piper TTS.'
  );
  const [singleSpeed, setSingleSpeed] = useState<number>(1.0);
  const [singleSilence, setSingleSilence] = useState<number>(0.2);
  const [singleAudioUrl, setSingleAudioUrl] = useState<string | null>(null);
  const [singleIsLoading, setSingleIsLoading] = useState<boolean>(false);
  const [singleFormat, setSingleFormat] = useState<'mp3' | 'wav'>('mp3');
  const singleAudioRef = useRef<HTMLAudioElement | null>(null);

  // Modal API code
  const [showApiModal, setShowApiModal] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Load voices on mount
  useEffect(() => {
    fetch('/api/voices')
      .then((res) => res.json())
      .then((data) => {
        if (data.voices && Array.isArray(data.voices)) {
          setVoices(data.voices);
          if (data.defaultModel) setSelectedVoiceId(data.defaultModel);
        }
      })
      .catch((e) => console.error('Failed to load voices:', e));
  }, []);

  // Parse SRT whenever raw text changes
  useEffect(() => {
    const { items, warnings } = parseSrtContent(srtRawText);
    setSubtitles(items);
    setParseWarnings(warnings);
  }, [srtRawText]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScrollLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeJob?.logs, autoScrollLogs]);

  // Connect SSE for an active job
  const connectSSE = (jobId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/subtitles/job/${jobId}/events`);
    eventSourceRef.current = es;

    es.addEventListener('job_state', (e) => {
      const data = JSON.parse(e.data);
      setActiveJob(data);
    });

    es.addEventListener('stage_change', (e) => {
      const stage = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        const stages = prev.stages.map((s) => (s.id === stage.id ? { ...s, ...stage } : s));
        return { ...prev, stages };
      });
    });

    es.addEventListener('sentence_start', (e) => {
      const data = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        const items = prev.items.map((it) =>
          it.index === data.index ? { ...it, status: 'generating' as const } : it
        );
        return { ...prev, items };
      });
    });

    es.addEventListener('sentence_progress', (e) => {
      const data = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        const items = prev.items.map((it) =>
          it.index === data.index ? { ...it, status: data.status } : it
        );
        return { ...prev, items };
      });
    });

    es.addEventListener('sentence_complete', (e) => {
      const completedItem = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        const items = prev.items.map((it) =>
          it.index === completedItem.index ? { ...it, ...completedItem } : it
        );
        return { ...prev, items };
      });
    });

    es.addEventListener('sentence_error', (e) => {
      const errorItem = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        const items = prev.items.map((it) =>
          it.index === errorItem.index ? { ...it, ...errorItem } : it
        );
        return { ...prev, items };
      });
    });

    es.addEventListener('log', (e) => {
      const log = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        return { ...prev, logs: [...prev.logs, log] };
      });
    });

    es.addEventListener('overall_progress', (e) => {
      const progress = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        return { ...prev, overallProgress: progress };
      });
    });

    es.addEventListener('job_status', (e) => {
      const data = JSON.parse(e.data);
      setActiveJob((prev) => (prev ? { ...prev, status: data.status } : null));
    });

    es.addEventListener('job_finished', (e) => {
      const data = JSON.parse(e.data);
      setActiveJob((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: 'completed',
          masterAudio: data.masterAudio,
        };
      });
    });

    es.onerror = () => {
      // Reconnection will automatically be attempted by browser EventSource
    };
  };

  // Create & Start processing
  const handleStartProcessing = async () => {
    if (subtitles.length === 0) return;

    let videoDur: number | undefined = undefined;
    if (videoDurationStr.trim()) {
      const parts = videoDurationStr.trim().split(':');
      if (parts.length === 3) {
        videoDur = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      } else if (parts.length === 2) {
        videoDur = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      } else {
        videoDur = parseFloat(videoDurationStr) || undefined;
      }
    }

    try {
      const res = await fetch('/api/subtitles/job/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: subtitles,
          model: selectedVoiceId,
          options: {
            batchSize: effectiveBatchSize,
            maxSpeed,
            minSpeed,
            speedPriority,
            padSilence,
            videoDuration: videoDur,
            outputFormat,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể tạo dự án.');

      const jobId = data.jobId;
      setActiveJob(data.job);
      connectSSE(jobId);

      // Start the job
      await fetch(`/api/subtitles/job/${jobId}/start`, { method: 'POST' });
    } catch (e: any) {
      console.error('Failed to start job:', e);
    }
  };

  const handlePauseJob = async () => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/pause`, { method: 'POST' });
  };

  const handleResumeJob = async () => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/start`, { method: 'POST' });
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/cancel`, { method: 'POST' });
  };

  const handleRetryFailed = async () => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/retry-failed`, { method: 'POST' });
  };

  const handleRegenerateSingle = async (index: number) => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/single/${index}`, { method: 'POST' });
  };

  const handlePlayItemAudio = (item: SubtitleItem) => {
    if (!activeJob || !itemAudioRef.current) return;
    const url = `/api/subtitles/job/${activeJob.id}/item-audio/${item.index}?t=${Date.now()}`;

    if (playingItemIndex === item.index) {
      itemAudioRef.current.pause();
      setPlayingItemIndex(null);
    } else {
      itemAudioRef.current.src = url;
      itemAudioRef.current.play().then(() => setPlayingItemIndex(item.index));
    }
  };

  const handlePlayMasterAudio = () => {
    if (!masterAudioRef.current || !activeJob?.masterAudio) return;
    if (masterPlaying) {
      masterAudioRef.current.pause();
      setMasterPlaying(false);
    } else {
      masterAudioRef.current.src = activeJob.masterAudio.url;
      masterAudioRef.current.play().then(() => setMasterPlaying(true));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setSrtRawText(content);
        setActiveJob(null);
      }
    };
    reader.readAsText(file);
  };

  // Single TTS synthesis (Tab 2)
  const handleSingleSynthesize = async () => {
    if (!singleText.trim()) return;
    setSingleIsLoading(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: singleText.trim(),
          model: selectedVoiceId,
          speed: singleSpeed,
          sentenceSilence: singleSilence,
          format: singleFormat,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const byteCharacters = atob(data.audioBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: data.mimeType });
      const url = URL.createObjectURL(blob);
      setSingleAudioUrl(url);

      setTimeout(() => {
        if (singleAudioRef.current) {
          singleAudioRef.current.src = url;
          singleAudioRef.current.play();
        }
      }, 50);
    } catch (e: any) {
      console.error(e);
    } finally {
      setSingleIsLoading(false);
    }
  };

  // Filtered logs
  const displayLogs = (activeJob?.logs || []).filter((log) => {
    if (logFilter === 'ALL') return true;
    return log.level === logFilter;
  });

  const selectedVoice =
    voices.find((v) => v.id === selectedVoiceId) ||
    voices[0] || {
      id: 'hub:hoaimy-vietnamese-vi-medium-ljkjhi',
      name: 'Hoài My',
      tag: 'Nữ · Miền Bắc',
    };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Hidden Audio Elements */}
      <audio
        ref={masterAudioRef}
        onTimeUpdate={() => {
          if (masterAudioRef.current) {
            setMasterCurrentTime(masterAudioRef.current.currentTime);
            setMasterDuration(masterAudioRef.current.duration || 0);
          }
        }}
        onEnded={() => setMasterPlaying(false)}
      />
      <audio
        ref={itemAudioRef}
        onEnded={() => setPlayingItemIndex(null)}
        onError={() => setPlayingItemIndex(null)}
      />
      <audio ref={singleAudioRef} />

      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white font-bold text-lg tracking-tight">
              HM
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-base sm:text-lg text-white tracking-tight">
                  Hoài My Piper TTS Studio
                </h1>
                <span className="text-xs text-amber-400 font-mono font-medium">Timeline Sync</span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Đồng bộ phụ đề SRT sang Audio TTS khớp Timestamp chuẩn giọng Hoài My
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Tabs */}
            <div className="flex items-center p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('subtitles')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'subtitles'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Đồng Bộ Phụ Đề (SRT)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('single')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'single'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Đọc Đoạn Văn Nhanh
              </button>
            </div>

            <button
              onClick={() => setShowApiModal(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-lg transition-colors border border-slate-700/60"
            >
              <Code className="w-3.5 h-3.5 text-amber-400" />
              <span>Mã Nguồn</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* ========================================================= */}
        {/* TAB 1: SUBTITLE TIMELINE SYNCHRONIZATION STUDIO */}
        {/* ========================================================= */}
        {activeTab === 'subtitles' && (
          <div className="space-y-6">
            {/* Top Toolbar: Voice Selector & SRT Upload */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Voice Card */}
              <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Radio className="w-4 h-4 text-amber-400" />
                      Giọng đọc chính thức
                    </span>
                    <span className="text-[11px] text-amber-400 font-medium bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                      VITS Hoài My
                    </span>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedVoiceId}
                      onChange={(e) => setSelectedVoiceId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 appearance-none font-medium cursor-pointer"
                    >
                      {voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.tag})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>Engine: Piper ONNX Native</span>
                  <span className="text-amber-400 font-mono">22.05 kHz · mono</span>
                </div>
              </div>

              {/* Upload & Presets Card */}
              <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-amber-400" />
                    Tải tệp phụ đề hoặc chọn mẫu
                  </span>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium rounded-lg border border-amber-400/30 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Tải file .SRT / .TXT</span>
                    <input
                      type="file"
                      accept=".srt,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Preset Chips */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-slate-400 text-[11px]">Dữ liệu mẫu:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSrtRawText(SAMPLE_PROMPT_SRT);
                      setActiveJob(null);
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700/60"
                  >
                    Mẫu Prompt (2 câu)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSrtRawText(SAMPLE_DIALOGUE_SRT);
                      setActiveJob(null);
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700/60"
                  >
                    Hội thoại Phim (8 câu)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSrtRawText(SAMPLE_TEST_50_SRT);
                      setActiveJob(null);
                    }}
                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg text-xs transition-colors border border-amber-500/30 font-medium"
                    title="Kiểm thử tải lớn 50 câu theo Yêu cầu 9.H"
                  >
                    Bài giảng Công nghệ (50 câu - Test tải)
                  </button>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Đã phân tích: <strong className="text-white">{subtitles.length}</strong> câu phụ đề
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
                    className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Cấu hình tốc độ đọc & thời lượng</span>
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${showSettingsDrawer ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Config Drawer (Expandable) */}
            {showSettingsDrawer && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                {/* Batch Size Selector (Requirement 1 & 2) */}
                <div className="md:col-span-4 p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-amber-400" />
                        Số câu mỗi batch (Batch Size / Concurrency):
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {subtitles.length > 0
                          ? `Tổng ${subtitles.length} câu chia thành ${Math.ceil(subtitles.length / effectiveBatchSize)} batch (${effectiveBatchSize} câu song song/batch)`
                          : 'Chọn số lượng câu được thực thi đồng thời trong mỗi đợt'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 flex-wrap">
                      {(['1', '2', '4', '8', '16', 'custom'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={activeJob?.status === 'running'}
                          onClick={() => setBatchSizeChoice(opt)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                            batchSizeChoice === opt
                              ? 'bg-amber-500 text-slate-950 font-bold shadow'
                              : 'text-slate-400 hover:text-white'
                          } ${activeJob?.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {opt === '1' ? '1 (Tuần tự)' : opt === 'custom' ? 'Tùy chỉnh' : `${opt} câu`}
                        </button>
                      ))}
                    </div>
                  </div>
                  {batchSizeChoice === 'custom' && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-slate-300 text-xs">Nhập số câu mỗi batch:</span>
                      <input
                        type="number"
                        min="1"
                        max="32"
                        value={customBatchSize}
                        onChange={(e) => setCustomBatchSize(Math.max(1, Math.min(32, parseInt(e.target.value) || 1)))}
                        className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-amber-500"
                      />
                      <span className="text-[10px] text-slate-400">(Khuyến nghị 2 - 8 câu tùy năng lực CPU)</span>
                    </div>
                  )}
                </div>

                {/* Max Speed */}
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">Tốc độ tối đa (Max Speed):</span>
                    <span className="text-amber-400 font-mono font-semibold">{maxSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1.1"
                    max="2.0"
                    step="0.05"
                    value={maxSpeed}
                    onChange={(e) => setMaxSpeed(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400">Giới hạn tăng tốc tránh méo giọng (1.5x khuyên dùng)</span>
                </div>

                {/* Min Speed */}
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">Tốc độ tối thiểu (Min Speed):</span>
                    <span className="text-amber-400 font-mono font-semibold">{minSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.0"
                    step="0.05"
                    value={minSpeed}
                    onChange={(e) => setMinSpeed(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400">Tốc độ chậm nhất khi câu ngắn</span>
                </div>

                {/* Priority */}
                <div className="space-y-1.5">
                  <span className="text-slate-300 font-medium block">Mức độ ưu tiên:</span>
                  <select
                    value={speedPriority}
                    onChange={(e) => setSpeedPriority(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200"
                  >
                    <option value="balanced">Cân bằng (Khuyên dùng)</option>
                    <option value="natural">Ưu tiên Giọng Tự Nhiên (Max 1.15x)</option>
                    <option value="strict">Ưu tiên Khớp Timeline</option>
                  </select>
                  <span className="text-[10px] text-slate-400">Chiến lược xử lý khi câu vượt thời lượng</span>
                </div>

                {/* Target Video Duration & Format */}
                <div className="space-y-1.5">
                  <span className="text-slate-300 font-medium block">Thời lượng video (Tùy chọn):</span>
                  <input
                    type="text"
                    placeholder="00:05:00 hoặc giây"
                    value={videoDurationStr}
                    onChange={(e) => setVideoDurationStr(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 placeholder:text-slate-600"
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400">Định dạng file:</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOutputFormat('mp3')}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          outputFormat === 'mp3' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        MP3
                      </button>
                      <button
                        type="button"
                        onClick={() => setOutputFormat('wav')}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          outputFormat === 'wav' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        WAV
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Warnings list if any subtitle validation issues detected */}
            {parseWarnings.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Phát hiện {parseWarnings.length} cảnh báo về timestamp phụ đề:</span>
                </div>
                <div className="max-h-20 overflow-y-auto pl-5 list-disc space-y-0.5 text-amber-200/90">
                  {parseWarnings.map((w, idx) => (
                    <div key={idx}>• {w}</div>
                  ))}
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* REAL-TIME PROGRESS & STAGES TRACKER (Requirement 9.A & 9.B) */}
            {/* ========================================================= */}
            <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5">
              {/* Overall Progress Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-white">
                      Tiến độ xử lý tổng thể:
                    </h2>
                    <span className="text-xl font-bold font-mono text-amber-400">
                      {activeJob?.overallProgress.percent ?? 0}%
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      ({activeJob?.overallProgress.completed ?? 0}/{subtitles.length} câu hoàn tất)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {activeJob?.status === 'running' && 'Đang đồng bộ giọng đọc Hoài My theo timeline...'}
                    {activeJob?.status === 'completed' && 'Hoàn thành tất cả các câu và đã ghép file master!'}
                    {activeJob?.status === 'paused' && 'Đang tạm dừng.'}
                    {activeJob?.status === 'idle' && 'Sẵn sàng bắt đầu xử lý.'}
                  </p>
                </div>

                {/* Control Action Buttons (Requirement 9.F) */}
                <div className="flex items-center gap-2 flex-wrap">
                  {(!activeJob || activeJob.status === 'idle' || activeJob.status === 'completed') && (
                    <button
                      type="button"
                      onClick={handleStartProcessing}
                      disabled={subtitles.length === 0}
                      className="px-4 py-2 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-transform active:scale-95 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4 text-slate-950" />
                      <span>{activeJob?.status === 'completed' ? 'Chạy Lại Toàn Bộ' : 'Bắt Đầu Xử Lý'}</span>
                    </button>
                  )}

                  {activeJob?.status === 'running' && (
                    <>
                      <button
                        type="button"
                        onClick={handlePauseJob}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span>Tạm Dừng</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelJob}
                        className="px-3 py-2 bg-slate-800 hover:bg-rose-950 text-rose-400 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5"
                      >
                        <Square className="w-3.5 h-3.5" />
                        <span>Hủy Bỏ</span>
                      </button>
                    </>
                  )}

                  {activeJob?.status === 'paused' && (
                    <button
                      type="button"
                      onClick={handleResumeJob}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Tiếp Tục</span>
                    </button>
                  )}

                  {activeJob && (activeJob.overallProgress.failed > 0 || activeJob.items.some((i) => i.status === 'failed')) && (
                    <button
                      type="button"
                      onClick={handleRetryFailed}
                      className="px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-medium text-xs rounded-xl border border-rose-500/40 flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Thử Lại Câu Lỗi ({activeJob.overallProgress.failed})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar (0% to 100%) */}
              <div className="space-y-1.5">
                <div className="w-full bg-slate-800/80 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700/60">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${activeJob?.overallProgress.percent ?? 0}%` }}
                  />
                </div>

                {/* Enhanced Batch & Concurrency Metrics Strip (Requirement 4) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 text-xs font-mono">
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Tổng số câu:</span>
                    <span className="text-base font-bold text-white">{subtitles.length}</span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Batch Size (Song song):</span>
                    <span className="text-sm font-bold text-amber-400">
                      {activeJob?.options.batchSize ?? effectiveBatchSize} câu/batch
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      ({activeJob?.overallProgress.totalBatches ?? Math.ceil(subtitles.length / effectiveBatchSize)} batches)
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-emerald-400 text-[10px] block">Đã hoàn thành:</span>
                    <span className="text-base font-bold text-emerald-400">
                      {activeJob?.overallProgress.completed ?? 0}
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-amber-400 text-[10px] block">Đang xử lý:</span>
                    <span className="text-base font-bold text-amber-400">
                      {activeJob?.overallProgress.running ?? 0}
                    </span>
                    {activeJob?.overallProgress.currentBatch ? (
                      <span className="text-[10px] text-amber-300/80 block">
                        Batch #{activeJob.overallProgress.currentBatch}
                      </span>
                    ) : null}
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Đang chờ (Queued):</span>
                    <span className="text-base font-bold text-slate-300">
                      {activeJob?.overallProgress.queued ?? subtitles.length}
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-rose-400 text-[10px] block">Bị lỗi:</span>
                    <span className="text-base font-bold text-rose-400">
                      {activeJob?.overallProgress.failed ?? 0}
                    </span>
                  </div>
                </div>

                {/* Elapsed Time, Speed & ETA */}
                {activeJob && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono pt-1">
                    <span>
                      Thời gian đã chạy: {(activeJob.overallProgress.elapsedMs / 1000).toFixed(1)}s
                    </span>
                    {activeJob.overallProgress.speedItemsPerSec !== undefined && (
                      <span className="text-slate-300">
                        Tốc độ xử lý: ~{activeJob.overallProgress.speedItemsPerSec} câu/giây
                      </span>
                    )}
                    {activeJob.overallProgress.estimatedRemainingMs !== undefined && (
                      <span className="text-amber-400">
                        Thời gian còn lại ước tính: ~{(activeJob.overallProgress.estimatedRemainingMs / 1000).toFixed(0)}s
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 9 Stages Visual Tracker (Requirement 9.B) */}
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block mb-2">
                  Tiến trình qua 9 giai đoạn:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {(activeJob?.stages || [
                    { id: 1, name: 'Upload và phân tích file phụ đề', status: 'completed' },
                    { id: 2, name: 'Khởi tạo PiperTTS và tải model Hoài My', status: 'pending' },
                    { id: 3, name: 'Tạo audio TTS cho từng câu', status: 'pending' },
                    { id: 4, name: 'Đo thời lượng audio thực tế', status: 'pending' },
                    { id: 5, name: 'Tự động điều chỉnh tốc độ đọc (atempo)', status: 'pending' },
                    { id: 6, name: 'Chuẩn hóa định dạng audio', status: 'pending' },
                    { id: 7, name: 'Ghép audio theo timeline & khoảng lặng', status: 'pending' },
                    { id: 8, name: 'Xuất file WAV/MP3 hoàn chỉnh', status: 'pending' },
                    { id: 9, name: 'Hoàn tất và cho phép tải xuống', status: 'pending' },
                  ]).map((st) => (
                    <div
                      key={st.id}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 transition-colors ${
                        st.status === 'completed'
                          ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                          : st.status === 'running'
                          ? 'bg-amber-950/30 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/10'
                          : st.status === 'failed'
                          ? 'bg-rose-950/20 border-rose-500/40 text-rose-300'
                          : 'bg-slate-950/40 border-slate-800/70 text-slate-400'
                      }`}
                    >
                      <div className="shrink-0">
                        {st.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {st.status === 'running' && <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />}
                        {st.status === 'failed' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
                        {st.status === 'pending' && <Clock className="w-4 h-4 text-slate-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium truncate">
                          {st.id}. {st.name}
                        </div>
                        {st.detail && (
                          <div className="text-[10px] text-slate-400 truncate">{st.detail}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* MASTER AUDIO WORKSTATION (Requirement 4 & 5) */}
            {/* ========================================================= */}
            {activeJob?.masterAudio && (
              <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border-2 border-amber-500/40 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-amber-500/30">
                      <Music className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-white">
                          File Audio Hoàn Chỉnh Đồng Bộ Timeline
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Timeline Ready
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Tổng thời lượng: <strong className="text-white">{activeJob.masterAudio.duration.toFixed(2)}s</strong> ·
                        Định dạng: {activeJob.masterAudio.format.toUpperCase()} ·
                        Dung lượng: {(activeJob.masterAudio.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>

                  {/* Master Download Buttons */}
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/subtitles/job/${activeJob.id}/master-audio?download=1&format=mp3`}
                      className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-transform active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      <span>Tải Xuống Master MP3</span>
                    </a>
                    <a
                      href={`/api/subtitles/job/${activeJob.id}/master-audio?download=1&format=wav`}
                      className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl border border-slate-700 flex items-center gap-1 transition-colors"
                      title="Tải WAV không nén"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>WAV</span>
                    </a>
                  </div>
                </div>

                {/* Master Audio Player Controls */}
                <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handlePlayMasterAudio}
                    className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md"
                  >
                    {masterPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                  </button>

                  <div className="flex-1 space-y-1">
                    <input
                      type="range"
                      min="0"
                      max={masterDuration || activeJob.masterAudio.duration}
                      step="0.05"
                      value={masterCurrentTime}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setMasterCurrentTime(val);
                        if (masterAudioRef.current) masterAudioRef.current.currentTime = val;
                      }}
                      className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                    />
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>{formatSecondsDisplay(masterCurrentTime)}</span>
                      <span>{formatSecondsDisplay(masterDuration || activeJob.masterAudio.duration)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* SUBTITLE TIMELINE TABLE (Requirement 6 & 9.D) */}
            {/* ========================================================= */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Bảng Phân Tích Phụ Đề & Trạng Thái Từng Câu
                  </h3>
                  <p className="text-xs text-slate-400">
                    Theo dõi thời lượng gốc, điều chỉnh tốc độ đọc riêng từng câu và nghe thử độc lập
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {activeJob?.items ? activeJob.items.length : subtitles.length} câu thoại
                </span>
              </div>

              {/* Subtitles Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] font-mono">
                      <th className="py-2.5 px-3 w-12 text-center">#</th>
                      <th className="py-2.5 px-3 w-36">Timeline</th>
                      <th className="py-2.5 px-3 min-w-[200px]">Lời thoại (Tiếng Việt)</th>
                      <th className="py-2.5 px-3 w-20 text-right">Mục tiêu</th>
                      <th className="py-2.5 px-3 w-20 text-right">TTS gốc</th>
                      <th className="py-2.5 px-3 w-20 text-center">Tốc độ</th>
                      <th className="py-2.5 px-3 w-20 text-right">Độ dài cuối</th>
                      <th className="py-2.5 px-3 w-28 text-center">Trạng thái</th>
                      <th className="py-2.5 px-3 w-28 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {(activeJob?.items || subtitles).map((item) => (
                      <tr
                        key={item.index}
                        className={`hover:bg-slate-800/30 transition-colors ${
                          item.warning ? 'bg-amber-500/5' : ''
                        } ${item.status === 'failed' ? 'bg-rose-500/5' : ''}`}
                      >
                        {/* Index */}
                        <td className="py-2.5 px-3 text-center font-mono text-slate-400">{item.index}</td>

                        {/* Timeline */}
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                          <div>{formatSecondsToSrtTime(item.startTime)}</div>
                          <div className="text-slate-400 text-[10px]">➔ {formatSecondsToSrtTime(item.endTime)}</div>
                        </td>

                        {/* Text & Warning */}
                        <td className="py-2.5 px-3">
                          <p className="text-slate-200 font-medium leading-relaxed">{item.text}</p>
                          {item.warning && (
                            <p className="text-[10px] text-amber-400/90 mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>{item.warning}</span>
                            </p>
                          )}
                          {item.error && (
                            <p className="text-[10px] text-rose-400 mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>{item.error}</span>
                            </p>
                          )}
                        </td>

                        {/* Target Duration */}
                        <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                          {item.targetDuration.toFixed(2)}s
                        </td>

                        {/* Original Duration */}
                        <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                          {item.originalDuration ? `${item.originalDuration.toFixed(2)}s` : '—'}
                        </td>

                        {/* Applied Speed */}
                        <td className="py-2.5 px-3 text-center font-mono">
                          {item.appliedSpeed ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                item.appliedSpeed > 1.2
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {item.appliedSpeed.toFixed(2)}x
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>

                        {/* Final Duration */}
                        <td className="py-2.5 px-3 text-right font-mono text-slate-200 font-semibold">
                          {item.finalDuration ? `${item.finalDuration.toFixed(2)}s` : '—'}
                        </td>

                        {/* Status Badge */}
                        <td className="py-2.5 px-3 text-center">
                          {item.status === 'completed' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Hoàn thành</span>
                            </span>
                          )}
                          {item.status === 'generating' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>Đang tạo...</span>
                            </span>
                          )}
                          {item.status === 'adjusting' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400">
                              <Sliders className="w-3 h-3" />
                              <span>Chỉnh tốc độ</span>
                            </span>
                          )}
                          {item.status === 'failed' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Thất bại</span>
                            </span>
                          )}
                          {item.status === 'pending' && (
                            <span className="text-[11px] text-slate-400">Chờ xử lý</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Preview Single */}
                            {activeJob && item.status === 'completed' && (
                              <button
                                type="button"
                                onClick={() => handlePlayItemAudio(item)}
                                className={`p-1.5 rounded-lg text-xs transition-colors ${
                                  playingItemIndex === item.index
                                    ? 'bg-amber-500 text-slate-950'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                }`}
                                title="Nghe thử câu này"
                              >
                                {playingItemIndex === item.index ? (
                                  <Pause className="w-3 h-3 fill-current" />
                                ) : (
                                  <Play className="w-3 h-3 fill-current" />
                                )}
                              </button>
                            )}

                            {/* Regenerate Single */}
                            {activeJob && (
                              <button
                                type="button"
                                onClick={() => handleRegenerateSingle(item.index)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs transition-colors"
                                title="Tạo lại riêng câu này"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ========================================================= */}
            {/* LIVE PROCESSING LOGS TERMINAL (Requirement 9.C) */}
            {/* ========================================================= */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-3 font-mono text-xs">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-white">Live Logs (Nhật ký xử lý thời gian thực)</span>
                  <span className="text-[11px] text-slate-400">
                    ({displayLogs.length} sự kiện)
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Filter tabs */}
                  <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[11px]">
                    {(['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setLogFilter(lvl)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          logFilter === lvl ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>

                  {/* Actions */}
                  {activeJob && (
                    <a
                      href={`/api/subtitles/job/${activeJob.id}/logs/download`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 text-[11px] transition-colors"
                      title="Xuất nhật ký thành file TXT"
                    >
                      <Download className="w-3 h-3 text-amber-400" />
                      <span>Tải Logs (.txt)</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (activeJob) setActiveJob({ ...activeJob, logs: [] });
                    }}
                    className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-800"
                    title="Xóa nhật ký trên màn hình"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Logs Stream Window */}
              <div className="h-60 overflow-y-auto space-y-1.5 pr-2 select-text text-[11px]">
                {displayLogs.length === 0 ? (
                  <div className="text-slate-400 py-8 text-center italic">
                    Chưa có nhật ký hoạt động. Nhấn "Bắt đầu xử lý" để theo dõi các sự kiện theo thời gian thực.
                  </div>
                ) : (
                  displayLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-slate-400 shrink-0">[{log.timestamp}]</span>
                      <span
                        className={`px-1 py-0.2 rounded font-bold shrink-0 text-[10px] ${
                          log.level === 'SUCCESS'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : log.level === 'WARNING'
                            ? 'bg-amber-500/20 text-amber-400'
                            : log.level === 'ERROR'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-sky-500/20 text-sky-400'
                        }`}
                      >
                        [{log.level}]
                      </span>
                      <span
                        className={`${
                          log.level === 'ERROR'
                            ? 'text-rose-300 font-semibold'
                            : log.level === 'WARNING'
                            ? 'text-amber-200'
                            : log.level === 'SUCCESS'
                            ? 'text-emerald-200'
                            : 'text-slate-300'
                        }`}
                      >
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: SINGLE TEXT TTS STUDIO (Preserves previous feature) */}
        {/* ========================================================= */}
        {activeTab === 'single' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Chuyển văn bản nhanh (Single TTS)</h2>
                <span className="text-xs text-slate-400">{singleText.length} ký tự</span>
              </div>

              <textarea
                value={singleText}
                onChange={(e) => setSingleText(e.target.value)}
                rows={5}
                placeholder="Nhập văn bản tiếng Việt..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 leading-relaxed"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Tốc độ đọc:</span>
                    <span className="text-amber-400 font-mono">{singleSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.8"
                    step="0.05"
                    value={singleSpeed}
                    onChange={(e) => setSingleSpeed(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Nghỉ ngắt câu:</span>
                    <span className="text-amber-400 font-mono">{singleSilence.toFixed(2)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={singleSilence}
                    onChange={(e) => setSingleSilence(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={singleIsLoading || !singleText.trim()}
                onClick={handleSingleSynthesize}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {singleIsLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang tạo âm thanh...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Tạo Giọng Đọc Hoài My ({singleFormat.toUpperCase()})</span>
                  </>
                )}
              </button>

              {singleAudioUrl && (
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <audio controls src={singleAudioUrl} className="h-8 w-64" />
                  <a
                    href={singleAudioUrl}
                    download={`hoaimy-${Date.now()}.${singleFormat}`}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải {singleFormat.toUpperCase()}</span>
                  </a>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 text-xs text-slate-400">
              <h3 className="text-sm font-semibold text-white">Về giọng đọc Hoài My:</h3>
              <p className="leading-relaxed">
                Mô hình <code className="text-amber-400 font-mono text-[11px]">hoaimy-vietnamese-vi-medium-ljkjhi</code> được tối ưu chuyên sâu cho tiếng Việt, phát âm tròn vành rõ chữ, cảm xúc ấm áp và mượt mà.
              </p>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] space-y-1">
                <div className="text-slate-300 font-medium">Khả năng tự động đồng bộ:</div>
                <p>
                  Khi dùng chế độ Phụ đề SRT, hệ thống tự động đo thời lượng câu và co giãn tốc độ (atempo) để khớp thời điểm bắt đầu và kết thúc của từng cảnh video.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Code Snippet Modal */}
      {showApiModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-white text-base">
                  Mã nguồn nạp mô hình Hoài My với PiperTTS
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
              Mã nguồn Node.js TypeScript nạp trực tiếp mô hình Hoài My đã yêu cầu:
            </p>

            <div className="relative bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs text-emerald-300 overflow-x-auto">
              <pre>{`import { PiperNativeTTS } from "pipertts";

// Khởi tạo và nạp mô hình Hoài My tiếng Việt
const tts = await PiperNativeTTS.load({
  model: "hub:hoaimy-vietnamese-vi-medium-ljkjhi",
  modelsDir: "./models",
});

// Chuyển đổi văn bản thành giọng nói
const { audio, sampleRate } = await tts.synthesize("Ca ca, lớn quá, thật nhiều đồ của tiên gia.", {
  outputFormat: "wav",
  sentenceSilence: 0.2,
  lengthScale: 1.0,
});`}</pre>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `import { PiperNativeTTS } from "pipertts";\n\nconst tts = await PiperNativeTTS.load({\n  model: "hub:hoaimy-vietnamese-vi-medium-ljkjhi",\n  modelsDir: "./models",\n});\n\nconst { audio } = await tts.synthesize("Ca ca, lớn quá, thật nhiều đồ của tiên gia.");`
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
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 mt-12 bg-slate-950/80 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>Hoài My Piper TTS Studio</span>
            <span>·</span>
            <span>Đồng bộ phụ đề Timeline SRT</span>
            <span>·</span>
            <span>Xuất MP3 & WAV hoàn chỉnh</span>
          </div>
          <div>Hỗ trợ tiếng Việt tự nhiên với chuẩn ngữ âm espeak-ng & FFmpeg atempo</div>
        </div>
      </footer>
    </div>
  );
}
