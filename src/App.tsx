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
  Info,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Eye,
  EyeOff,
  UploadCloud
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
  modelId: string;
  speakerId?: number;
  name: string;
  tag: string;
  gender: 'female' | 'male' | 'neutral';
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
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(true);

  // Layout expansion states (Requirement 3)
  const [isLeftPanelExpanded, setIsLeftPanelExpanded] = useState<boolean>(true);
  const [isLogsExpanded, setIsLogsExpanded] = useState<boolean>(true);
  const [showSrtEditor, setShowSrtEditor] = useState<boolean>(false);
  const [showStagesTracker, setShowStagesTracker] = useState<boolean>(true);
  const [espeakStatus, setEspeakStatus] = useState<{
    available: boolean;
    path?: string;
  } | null>(null);

  // Drag & drop state for subtitles (Requirement 1)
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isWindowDragging, setIsWindowDragging] = useState<boolean>(false);
  const [dragFeedback, setDragFeedback] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveBatchSize =
    batchSizeChoice === 'custom'
      ? Math.max(1, Math.min(32, customBatchSize || 4))
      : parseInt(batchSizeChoice, 10);

  // Logging & Filtering
  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'>('ALL');
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(true);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

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
        if (typeof data.espeakAvailable === 'boolean') {
          setEspeakStatus({
            available: data.espeakAvailable,
            path: data.espeakPath,
          });
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

  // Auto-scroll logs internally without scrolling the outer webpage viewport
  useEffect(() => {
    if (autoScrollLogs && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
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
          model: selectedVoice.modelId,
          speakerId: selectedVoice.speakerId,
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

  const handlePauseResume = async () => {
    if (!activeJob) return;
    if (activeJob.status === 'running') {
      await handlePauseJob();
    } else if (activeJob.status === 'paused') {
      await handleResumeJob();
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/cancel`, { method: 'POST' });
  };

  const handleRetryFailed = async () => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/retry-failed`, { method: 'POST' });
  };

  const handleResetJob = async () => {
    if (activeJob) {
      try {
        await fetch(`/api/subtitles/job/${activeJob.id}/cleanup`, { method: 'POST' });
      } catch {}
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setActiveJob(null);
    setMasterPlaying(false);
    setMasterCurrentTime(0);
  };

  const handleRegenerateSingle = async (index: number) => {
    if (!activeJob) return;
    await fetch(`/api/subtitles/job/${activeJob.id}/single/${index}`, { method: 'POST' });
  };

  const handlePlayItemAudio = (item: SubtitleItem) => {
    if (!activeJob) return;
    const url = `/api/subtitles/job/${activeJob.id}/item-audio/${item.index}?t=${Date.now()}`;

    // If currently playing this item, pause it
    if (playingItemIndex === item.index) {
      if (itemAudioRef.current) itemAudioRef.current.pause();
      setPlayingItemIndex(null);
      return;
    }

    // Stop master audio if playing
    if (masterAudioRef.current && masterPlaying) {
      masterAudioRef.current.pause();
      setMasterPlaying(false);
    }

    if (!itemAudioRef.current) {
      itemAudioRef.current = new Audio();
    }
    const audio = itemAudioRef.current;
    audio.pause();
    audio.src = url;
    audio.onended = () => setPlayingItemIndex(null);
    audio.onerror = () => {
      console.error('Lỗi tải file audio câu:', item.index);
      setPlayingItemIndex(null);
    };
    audio
      .play()
      .then(() => setPlayingItemIndex(item.index))
      .catch((e) => {
        console.error('Lỗi phát âm thanh câu:', e);
        setPlayingItemIndex(null);
      });
  };

  const handlePlayMasterAudio = () => {
    if (!activeJob?.masterAudio) return;

    // Stop item audio if playing
    if (itemAudioRef.current && playingItemIndex !== null) {
      itemAudioRef.current.pause();
      setPlayingItemIndex(null);
    }

    if (!masterAudioRef.current) {
      masterAudioRef.current = new Audio();
    }
    const audio = masterAudioRef.current;
    if (masterPlaying) {
      audio.pause();
      setMasterPlaying(false);
    } else {
      audio.src = activeJob.masterAudio.url;
      audio.ontimeupdate = () => {
        setMasterCurrentTime(audio.currentTime);
        if (audio.duration && !isNaN(audio.duration)) {
          setMasterDuration(audio.duration);
        }
      };
      audio.onended = () => {
        setMasterPlaying(false);
        setMasterCurrentTime(0);
      };
      audio.onerror = () => {
        console.error('Lỗi phát master audio');
        setMasterPlaying(false);
      };
      audio
        .play()
        .then(() => setMasterPlaying(true))
        .catch((e) => {
          console.error('Lỗi phát master audio:', e);
          setMasterPlaying(false);
        });
    }
  };

  const processSubtitleFile = (file: File) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.srt') && !name.endsWith('.txt')) {
      setDragFeedback('Vui lòng chọn hoặc kéo thả file phụ đề có đuôi .srt hoặc .txt');
      setTimeout(() => setDragFeedback(null), 4000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      let content = evt.target?.result as string;
      if (content) {
        // Strip BOM if present
        if (content.charCodeAt(0) === 0xFEFF) {
          content = content.slice(1);
        }
        // Normalize to Unicode NFC
        content = content.normalize('NFC');
        setSrtRawText(content);
        setActiveJob(null);
        setUploadedFileName(file.name);
        setDragFeedback(`Đã nạp file: ${file.name}`);
        setTimeout(() => setDragFeedback(null), 3500);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // Window-level drag & drop listener for smooth UX
  useEffect(() => {
    let dragCounter = 0;
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsWindowDragging(true);
      }
    };
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };
    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsWindowDragging(false);
      }
    };
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsWindowDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processSubtitleFile(files[0]);
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSubtitleFile(file);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSubtitleFile(files[0]);
    }
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
          model: selectedVoice.modelId,
          speakerId: selectedVoice.speakerId,
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

  const completedSentencesCount =
    activeJob?.overallProgress?.completed ??
    subtitles.filter((s) => s.status === 'completed').length;
  const totalSentencesCount =
    activeJob?.overallProgress?.total ?? subtitles.length;
  const completionPercent =
    totalSentencesCount > 0
      ? Math.round((completedSentencesCount / totalSentencesCount) * 100)
      : 0;

  const selectedVoice =
    voices.find((v) => v.id === selectedVoiceId) ||
    voices[0] || {
      id: 'hub:hoaimy-vietnamese-vi-medium-ljkjhi',
      modelId: 'hub:hoaimy-vietnamese-vi-medium-ljkjhi',
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
      <main className="flex-1 max-w-[1680px] w-full mx-auto px-3 sm:px-6 py-6 pb-36 sm:pb-44 space-y-6">
        {/* ========================================================= */}
        {/* TAB 1: SUBTITLE TIMELINE SYNCHRONIZATION STUDIO */}
        {/* ========================================================= */}
        {activeTab === 'subtitles' && (
          <div className="flex flex-col lg:flex-row items-start gap-6">
            {/* ========================================================= */}
            {/* CỘT BÊN TRÁI: TOÀN BỘ SETTINGS & DỮ LIỆU ĐẦU VÀO          */}
            {/* Có thể Expand hoặc Hide (Requirement 3)                  */}
            {/* ========================================================= */}
            {isLeftPanelExpanded ? (
              <aside className="w-full lg:w-[380px] xl:w-[410px] 2xl:w-[430px] shrink-0 space-y-4">
                {/* Panel Header & Hide Button */}
                <div className="flex items-center justify-between bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white tracking-tight">Cột Cài Đặt (Settings)</h2>
                      <p className="text-[11px] text-slate-400">Giọng đọc, phụ đề & tham số</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLeftPanelExpanded(false)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
                    title="Ẩn cột cài đặt để mở rộng không gian bên phải"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5 text-amber-400" />
                    <span>Ẩn Cột</span>
                  </button>
                </div>

                {/* 1. Voice Selection Card */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Radio className="w-4 h-4 text-amber-400" />
                      Giọng đọc chính thức
                    </span>
                    <span className="text-[11px] text-amber-400 font-medium bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                      Piper TTS
                    </span>
                  </div>

                  <div className="relative">
                    <select
                      value={selectedVoiceId}
                      onChange={(e) => setSelectedVoiceId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 appearance-none font-medium cursor-pointer"
                    >
                      {voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.tag})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  <div className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 space-y-1">
                    <div className="text-slate-300 font-medium flex items-center justify-between">
                      <span>{selectedVoice.name}</span>
                      <span className="text-amber-400 text-[10px] font-mono">22.05 kHz · mono</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {selectedVoice.description}
                    </p>
                  </div>

                  {/* eSpeak-NG Vietnamese Accent Health Status */}
                  {espeakStatus?.available ? (
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>eSpeak NG: Đã kết nối (Phát âm chuẩn tiếng Việt có dấu).</span>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>eSpeak NG: Chưa phát hiện trên hệ thống</span>
                      </div>
                      <p className="text-[10px] text-amber-200/90 leading-relaxed">
                        Để đọc chuẩn tiếng Việt có dấu khi chạy local, hãy chạy file <code className="text-white font-mono bg-slate-950 px-1 py-0.5 rounded">Setup.bat</code> hoặc cài đặt qua lệnh <code className="text-white font-mono bg-slate-950 px-1 py-0.5 rounded">winget install eSpeak-NG.eSpeak-NG</code>.
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. Upload Subtitle & Presets Card (Requirement 1: Kéo thả phụ đề) */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-amber-400" />
                      Tải tệp phụ đề & Mẫu
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Chọn file</span>
                    </button>
                  </div>

                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer select-none group ${
                      isDragging
                        ? 'border-amber-400 bg-amber-500/15 scale-[1.01] shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/40'
                        : 'border-slate-700 hover:border-amber-500/60 hover:bg-slate-950/70 bg-slate-950/40'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".srt,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform ${
                          isDragging
                            ? 'bg-amber-500 text-slate-950 scale-110'
                            : 'bg-slate-800/80 text-amber-400 group-hover:scale-105'
                        }`}
                      >
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div className="text-xs font-semibold text-white">
                        {isDragging ? 'Thả file phụ đề vào đây...' : 'Kéo thả file .SRT hoặc .TXT vào đây'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        hoặc <span className="text-amber-400 underline font-medium">bấm để duyệt file từ máy</span>
                      </div>
                      {dragFeedback && (
                        <div className="mt-1 text-[11px] text-emerald-300 font-medium px-2.5 py-0.5 bg-emerald-500/15 rounded-lg border border-emerald-500/30 animate-pulse">
                          ✓ {dragFeedback}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* File status badge if loaded */}
                  {uploadedFileName && (
                    <div className="flex items-center justify-between p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="truncate text-slate-200 font-medium text-xs">{uploadedFileName}</span>
                      </div>
                      <span className="text-[11px] text-amber-300 font-mono font-bold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 shrink-0">
                        {subtitles.length} câu
                      </span>
                    </div>
                  )}

                  {/* Preset chips */}
                  <div className="space-y-1.5">
                    <span className="text-slate-400 text-[11px] block">Dữ liệu mẫu nhanh:</span>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setSrtRawText(SAMPLE_PROMPT_SRT);
                          setUploadedFileName('Mẫu Prompt (2 câu)');
                          setActiveJob(null);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700/60 cursor-pointer"
                      >
                        Prompt (2 câu)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSrtRawText(SAMPLE_DIALOGUE_SRT);
                          setUploadedFileName('Hội thoại Phim (8 câu)');
                          setActiveJob(null);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700/60 cursor-pointer"
                      >
                        Hội thoại Phim (8 câu)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSrtRawText(SAMPLE_TEST_50_SRT);
                          setUploadedFileName('Bài giảng Test (50 câu)');
                          setActiveJob(null);
                        }}
                        className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg text-xs transition-colors border border-amber-500/30 font-medium cursor-pointer"
                        title="Kiểm thử tải lớn 50 câu"
                      >
                        Bài giảng (50 câu)
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      Đã phân tích: <strong className="text-white">{subtitles.length}</strong> câu
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSrtEditor(!showSrtEditor)}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] font-medium"
                    >
                      {showSrtEditor ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showSrtEditor ? 'Đóng xem SRT' : 'Xem & Sửa SRT thô'}</span>
                    </button>
                  </div>

                  {/* Optional Raw SRT Textarea editor */}
                  {showSrtEditor && (
                    <div className="pt-2 space-y-1">
                      <textarea
                        value={srtRawText}
                        onChange={(e) => {
                          setSrtRawText(e.target.value.normalize('NFC'));
                          setActiveJob(null);
                        }}
                        rows={6}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-[11px] text-slate-200 leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="Nội dung phụ đề SRT..."
                      />
                      <span className="text-[10px] text-slate-400 block italic">
                        Tự động chuẩn hóa Unicode NFC và phân tích timeline.
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. Processing Parameters Card */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Settings className="w-4 h-4 text-amber-400" />
                      Cấu hình Timeline & Tốc độ
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
                      className="text-slate-400 hover:text-white"
                    >
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${showSettingsDrawer ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>

                  {showSettingsDrawer && (
                    <div className="space-y-4 pt-1">
                      {/* Batch Size Selector */}
                      <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-200 font-semibold flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5 text-amber-400" />
                            Batch Size:
                          </span>
                          <span className="text-amber-400 font-mono font-bold">
                            {effectiveBatchSize} câu song song
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                          {(['1', '2', '4', '8', '16', 'custom'] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              disabled={activeJob?.status === 'running'}
                              onClick={() => setBatchSizeChoice(opt)}
                              className={`py-1 rounded-lg text-center font-medium transition-colors ${
                                batchSizeChoice === opt
                                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                                  : 'text-slate-400 hover:text-white'
                              } ${activeJob?.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {opt === '1' ? '1 (Tuần tự)' : opt === 'custom' ? 'Tùy chỉnh' : `${opt} câu`}
                            </button>
                          ))}
                        </div>
                        {batchSizeChoice === 'custom' && (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-slate-400 text-[11px]">Nhập số câu:</span>
                            <input
                              type="number"
                              min="1"
                              max="32"
                              value={customBatchSize}
                              onChange={(e) => setCustomBatchSize(Math.max(1, Math.min(32, parseInt(e.target.value) || 1)))}
                              className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-amber-500"
                            />
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
                          max="3.0"
                          step="0.05"
                          value={maxSpeed}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            setMaxSpeed(value);
                            setMinSpeed((current) => Math.min(current, value));
                          }}
                          className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                        />
                        <span className="text-[10px] text-slate-400 block">Giới hạn tăng tốc tối đa (1.1x - 3.0x)</span>
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
                          max="1.5"
                          step="0.05"
                          value={minSpeed}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            setMinSpeed(value);
                            setMaxSpeed((current) => Math.max(current, value));
                          }}
                          className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                        />
                        <span className="text-[10px] text-slate-400 block">Giới hạn giảm tốc khi câu ngắn (0.6x - 1.5x)</span>
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
                          <option value="strict">Ưu tiên Khớp Timeline Tuyệt Đối</option>
                        </select>
                      </div>

                      {/* Target Video Duration & Format */}
                      <div className="space-y-1.5">
                        <span className="text-slate-300 font-medium block">Thời lượng video (Tùy chọn):</span>
                        <input
                          type="text"
                          placeholder="00:05:00 hoặc số giây"
                          value={videoDurationStr}
                          onChange={(e) => setVideoDurationStr(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 placeholder:text-slate-600 font-mono"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                        <span className="text-slate-400">Định dạng file xuất:</span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOutputFormat('mp3')}
                            className={`px-2.5 py-1 rounded text-xs font-semibold ${
                              outputFormat === 'mp3' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            MP3
                          </button>
                          <button
                            type="button"
                            onClick={() => setOutputFormat('wav')}
                            className={`px-2.5 py-1 rounded text-xs font-semibold ${
                              outputFormat === 'wav' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            WAV
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Subtitle Warnings list if any */}
                {parseWarnings.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span>{parseWarnings.length} cảnh báo về timestamp:</span>
                    </div>
                    <div className="max-h-24 overflow-y-auto pl-4 list-disc space-y-0.5 text-amber-200/90 text-[11px]">
                      {parseWarnings.map((w, idx) => (
                        <div key={idx}>• {w}</div>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            ) : (
              /* Collapsed Rail Toggle Button for Desktop */
              <div className="hidden lg:flex flex-col items-center shrink-0">
                <button
                  type="button"
                  onClick={() => setIsLeftPanelExpanded(true)}
                  className="sticky top-20 p-3 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-800 rounded-2xl flex flex-col items-center gap-2 shadow-xl hover:border-amber-500/40 transition-all cursor-pointer group"
                  title="Mở rộng Cột Cài Đặt (Settings)"
                >
                  <PanelLeftOpen className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[11px] font-bold [writing-mode:vertical-lr] tracking-wider uppercase text-slate-300 group-hover:text-amber-300 py-1">
                    Mở Cài Đặt (Settings)
                  </span>
                </button>
              </div>
            )}

            {/* ========================================================= */}
            {/* CỘT BÊN PHẢI: WORKSTATION & RESULTS                       */}
            {/* 1. Tiến độ xử lý tổng thể                                 */}
            {/* 2. File Audio Hoàn Chỉnh Đồng Bộ Timeline                 */}
            {/* 3. Bảng Phân Tích Phụ Đề & Trạng Thái Từng Câu (Scroll)   */}
            {/* 4. Live Logs (Có thể Expand hoặc Close)                   */}
            {/* ========================================================= */}
            <section className="flex-1 min-w-0 w-full space-y-6">
              {/* Workspace Top Toolbar with Left Panel Toggle */}
              <div className="flex items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl px-4 py-2.5 shadow-md">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLeftPanelExpanded(!isLeftPanelExpanded)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                    title={isLeftPanelExpanded ? 'Ẩn cột cài đặt bên trái' : 'Mở rộng cột cài đặt bên trái'}
                  >
                    {isLeftPanelExpanded ? (
                      <>
                        <PanelLeftClose className="w-3.5 h-3.5 text-amber-400" />
                        <span>Ẩn Cột Cài Đặt</span>
                      </>
                    ) : (
                      <>
                        <PanelLeftOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>Hiện Cài Đặt (Settings & Phụ Đề)</span>
                      </>
                    )}
                  </button>
                  <span className="text-xs text-slate-400 hidden sm:inline">
                    Không gian làm việc đồng bộ Timeline
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                    Phụ đề: <strong className="text-amber-400">{subtitles.length}</strong> câu
                  </span>
                  <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 hidden sm:inline">
                    Giọng: <strong className="text-slate-200">{selectedVoice.name}</strong>
                  </span>
                </div>
              </div>

              {/* ------------------------------------------------------- */}
              {/* 1. CHI TIẾT TIẾN TRÌNH XỬ LÝ & 9 GIAI ĐOẠN              */}
              {/* (Tiến độ tổng thể, % và nút xử lý đã tách vào thanh dock đáy) */}
              {/* ------------------------------------------------------- */}
              <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-white">
                        Chi Tiết Xử Lý & Đo Lường Timeline
                      </h2>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        activeJob?.status === 'running'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                          : activeJob?.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : activeJob?.status === 'paused'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}>
                        {activeJob?.status === 'running' && 'Đang chạy song song'}
                        {activeJob?.status === 'completed' && 'Đã hoàn thành'}
                        {activeJob?.status === 'paused' && 'Đang tạm dừng'}
                        {(!activeJob || activeJob?.status === 'idle') && 'Chờ bắt đầu'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Thanh tiến độ, % hoàn thành và nút bắt đầu xử lý được ghim cố định ở thanh đáy màn hình (Sticky Bottom Bar).
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                    <span>Batch: <strong className="text-amber-400">{activeJob?.options.batchSize ?? effectiveBatchSize} câu/đợt</strong></span>
                  </div>
                </div>

                  {/* Batch & Concurrency Metrics Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 text-xs font-mono">
                    <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Tổng số câu:</span>
                      <span className="text-base font-bold text-white">{subtitles.length}</span>
                    </div>
                    <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Batch Song Song:</span>
                      <span className="text-sm font-bold text-amber-400">
                        {activeJob?.options.batchSize ?? effectiveBatchSize} câu/đợt
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

                {/* 9 Stages Visual Tracker (Collapsible) */}
                <div className="pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                      Tiến trình 9 giai đoạn xử lý:
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowStagesTracker(!showStagesTracker)}
                      className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1"
                    >
                      <span>{showStagesTracker ? 'Thu gọn' : 'Chi tiết 9 bước'}</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showStagesTracker ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {showStagesTracker && (
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
                  )}
                </div>
              </div>

              {/* ------------------------------------------------------- */}
              {/* 2. FILE AUDIO HOÀN CHỈNH ĐỒNG BỘ TIMELINE (MASTER AUDIO)*/}
              {/* ------------------------------------------------------- */}
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
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/api/subtitles/job/${activeJob.id}/master-audio?download=1&format=mp3`}
                        className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-transform active:scale-95"
                      >
                        <Download className="w-4 h-4" />
                        <span>Tải Master MP3</span>
                      </a>
                      <a
                        href={`/api/subtitles/job/${activeJob.id}/master-audio?download=1&format=wav`}
                        className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl border border-slate-700 flex items-center gap-1 transition-colors"
                        title="Tải WAV không nén"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-400" />
                        <span>WAV</span>
                      </a>
                      <button
                        type="button"
                        onClick={handleResetJob}
                        className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Dọn dẹp tệp tạm và làm mới"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Dọn Dẹp & Làm Mới</span>
                      </button>
                    </div>
                  </div>

                  {/* Audio Player Controls */}
                  <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={handlePlayMasterAudio}
                      className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md cursor-pointer"
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

              {/* ------------------------------------------------------- */}
              {/* 3. BẢNG PHÂN TÍCH PHỤ ĐỀ & TRẠNG THÁI TỪNG CÂU          */}
              {/* Scroll view + Nghe thử từng câu (Requirement 1 & 2)     */}
              {/* ------------------------------------------------------- */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">
                        Bảng Phân Tích Phụ Đề & Trạng Thái Từng Câu
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20">
                        Scroll View
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Theo dõi thời lượng gốc, điều chỉnh tốc độ riêng và nghe thử từng câu sau khi hoàn thành (Cuộn để xem tất cả câu)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-300 font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                      Tổng số: <strong className="text-amber-400">{activeJob?.items ? activeJob.items.length : subtitles.length}</strong> câu
                    </span>
                  </div>
                </div>

                {/* Subtitles Table with Scroll View (Requirement 1 & 2) */}
                <div className="overflow-x-auto overflow-y-auto max-h-[480px] rounded-xl border border-slate-800 scrollbar-thin shadow-inner bg-slate-950/40">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-20 bg-slate-950 shadow-md">
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] font-mono">
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3 w-36">Timeline</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Lời thoại (Tiếng Việt)</th>
                        <th className="py-2.5 px-3 w-20 text-right">Mục tiêu</th>
                        <th className="py-2.5 px-3 w-20 text-right">TTS gốc</th>
                        <th className="py-2.5 px-3 w-20 text-center">Tốc độ</th>
                        <th className="py-2.5 px-3 w-20 text-right">Độ dài cuối</th>
                        <th className="py-2.5 px-3 w-28 text-center">Trạng thái</th>
                        <th className="py-2.5 px-3 w-24 text-center">Nghe thử</th>
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

                          {/* Audio Preview (Requirement 2) */}
                          <td className="py-2.5 px-3 text-center">
                            {activeJob && item.status === 'completed' ? (
                              <button
                                type="button"
                                onClick={() => handlePlayItemAudio(item)}
                                className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                  playingItemIndex === item.index
                                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30 scale-105 ring-2 ring-amber-400/50'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-amber-500/40'
                                }`}
                                title={playingItemIndex === item.index ? 'Dừng phát' : 'Nghe thử câu thoại này'}
                              >
                                {playingItemIndex === item.index ? (
                                  <>
                                    <Pause className="w-3.5 h-3.5 fill-current text-slate-950" />
                                    <span>Dừng</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-3.5 h-3.5 fill-current text-amber-400 ml-0.5" />
                                    <span>Nghe</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <span className="text-slate-600 font-mono text-[11px]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ------------------------------------------------------- */}
              {/* 4. LIVE LOGS (Có thể Expand hoặc Close)                 */}
              {/* Requirement 3 & 4                                       */}
              {/* ------------------------------------------------------- */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs">
                {/* Logs Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-900/50 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Terminal className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-white">Live Logs</span>
                    {totalSentencesCount > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 shadow-sm">
                        <span>Hoàn thành:</span>
                        <strong className="text-amber-200">
                          {completedSentencesCount}/{totalSentencesCount}
                        </strong>
                        <span>câu</span>
                        <span className="text-[10px] text-amber-400/80">
                          ({completionPercent}%)
                        </span>
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      ({displayLogs.length} sự kiện)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Filter tabs (Only visible when expanded) */}
                    {isLogsExpanded && (
                      <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[11px]">
                        {(['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR'] as const).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setLogFilter(lvl)}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                              logFilter === lvl ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Actions when expanded */}
                    {isLogsExpanded && activeJob && (
                      <a
                        href={`/api/subtitles/job/${activeJob.id}/logs/download`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 text-[11px] transition-colors"
                        title="Xuất nhật ký thành file TXT"
                      >
                        <Download className="w-3 h-3 text-amber-400" />
                        <span>Tải Logs (.txt)</span>
                      </a>
                    )}

                    {isLogsExpanded && (
                      <button
                        type="button"
                        onClick={() => {
                          if (activeJob) setActiveJob({ ...activeJob, logs: [] });
                        }}
                        className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-800 cursor-pointer"
                        title="Xóa nhật ký trên màn hình"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}

                    {/* Expand / Close Toggle Button (Requirement 3) */}
                    <button
                      type="button"
                      onClick={() => setIsLogsExpanded(!isLogsExpanded)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold rounded-lg border border-slate-700 text-xs transition-colors cursor-pointer"
                      title={isLogsExpanded ? 'Đóng / Thu gọn Live Logs' : 'Mở rộng khung Live Logs'}
                    >
                      {isLogsExpanded ? (
                        <>
                          <Minimize2 className="w-3.5 h-3.5" />
                          <span>Thu Gọn Logs</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>Mở Rộng Logs</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Collapsed Preview Strip (When Closed) */}
                {!isLogsExpanded ? (
                  <div className="px-4 py-2 bg-slate-950/90 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-900">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-amber-400 font-semibold">[Logs đang đóng]</span>
                      {displayLogs.length > 0 ? (
                        <span className="truncate text-slate-300">
                          Mới nhất: {displayLogs[displayLogs.length - 1].message}
                        </span>
                      ) : (
                        <span>Chưa có log phát sinh.</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsLogsExpanded(true)}
                      className="text-amber-400 hover:underline shrink-0 ml-2 font-medium cursor-pointer"
                    >
                      Mở để xem chi tiết →
                    </button>
                  </div>
                ) : (
                  /* Expanded Logs Stream Window (Scrollable internally without moving viewport) */
                  <div
                    ref={logsContainerRef}
                    className="h-60 overflow-y-auto space-y-1.5 p-4 select-text text-[11px] scrollbar-thin"
                  >
                    {displayLogs.length === 0 ? (
                      <div className="text-slate-500 py-8 text-center italic">
                        Chưa có nhật ký hoạt động. Nhấn "Bắt đầu xử lý" để theo dõi các sự kiện theo thời gian thực.
                      </div>
                    ) : (
                      displayLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                          <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
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
                  </div>
                )}
              </div>
            </section>
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
      <footer className="border-t border-slate-900 py-6 mt-12 mb-20 bg-slate-950/80 text-xs text-slate-400">
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

      {/* ========================================================= */}
      {/* FULL-SCREEN DRAG & DROP OVERLAY (Requirement 1)            */}
      {/* Kéo thả phụ đề vào bất kỳ đâu trên màn hình               */}
      {/* ========================================================= */}
      {isWindowDragging && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsWindowDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsWindowDragging(false);
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
              processSubtitleFile(files[0]);
            }
          }}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md border-4 border-dashed border-amber-400 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-150 p-6 select-none"
        >
          <div className="w-20 h-20 rounded-3xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-2xl shadow-amber-500/50 scale-110 animate-bounce">
            <UploadCloud className="w-10 h-10" />
          </div>
          <div className="text-center space-y-1.5">
            <h3 className="text-2xl font-black text-white">Thả tệp phụ đề vào đây</h3>
            <p className="text-sm text-amber-300 font-medium">Hỗ trợ tệp phụ đề .SRT hoặc .TXT tiếng Việt</p>
            <p className="text-xs text-slate-400">Hệ thống sẽ tự động phân tích và đồng bộ timeline ngay lập tức</p>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STICKY BOTTOM BAR (Requirement 2)                          */}
      {/* Thanh dock luôn ghim đáy màn hình như Navbar dưới đáy     */}
      {/* Tách riêng: Progress bar, % hoàn thành & Nút bắt đầu xử lý*/}
      {/* ========================================================= */}
      {activeTab === 'subtitles' && (
        <div
          role="region"
          aria-label="Thanh điều khiển tiến độ và xử lý phụ đề"
          className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 shadow-[0_-12px_40px_rgba(0,0,0,0.85)]"
        >
          <div className="max-w-[1680px] mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
              {/* Vùng Trái: Thông tin Giọng đọc & Phụ đề & Trạng thái */}
              <div className="flex items-center justify-between md:justify-start gap-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center shrink-0">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div className="leading-tight">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate max-w-[140px] sm:max-w-[180px]">
                        {selectedVoice.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          activeJob?.status === 'running'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                            : activeJob?.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : activeJob?.status === 'paused'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {activeJob?.status === 'running' && 'Đang chạy song song'}
                        {activeJob?.status === 'completed' && 'Hoàn thành 100%'}
                        {activeJob?.status === 'paused' && 'Đang tạm dừng'}
                        {(!activeJob || activeJob?.status === 'idle') && 'Sẵn sàng'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                      <span className="text-amber-400 font-semibold">{subtitles.length} câu</span>
                      <span>·</span>
                      <span>Batch {activeJob?.options.batchSize ?? effectiveBatchSize} câu/đợt</span>
                      {uploadedFileName && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[120px] text-slate-300 hidden sm:inline" title={uploadedFileName}>
                            {uploadedFileName}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Vùng Giữa: Progress Bar & Phần Trăm Hoàn Thành (Requirement 2) */}
              <div className="flex-1 min-w-0 max-w-2xl mx-auto w-full space-y-1.5 px-0 md:px-4">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-extrabold text-amber-400">
                      {completionPercent}%
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      ({completedSentencesCount}/{totalSentencesCount} câu hoàn tất)
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {activeJob?.status === 'running' && (
                      <span className="text-amber-400 font-medium">
                        {activeJob.overallProgress.estimatedRemainingMs !== undefined
                          ? `Còn ~${(activeJob.overallProgress.estimatedRemainingMs / 1000).toFixed(0)}s`
                          : `Đã chạy ${(activeJob.overallProgress.elapsedMs / 1000).toFixed(1)}s`}
                      </span>
                    )}
                    {activeJob?.status === 'completed' && (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Master audio sẵn sàng
                      </span>
                    )}
                    {(!activeJob || activeJob?.status === 'idle') && (
                      <span className="text-slate-400">Chờ bắt đầu xử lý</span>
                    )}
                  </div>
                </div>

                {/* Thanh Tiến Độ Hoàn Thành (Progress Bar) */}
                <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700/80 shadow-inner relative">
                  <div
                    className={`h-full rounded-full transition-all duration-300 relative ${
                      activeJob?.status === 'completed'
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.5)]'
                        : 'bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 shadow-[0_0_14px_rgba(245,158,11,0.5)]'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, completionPercent))}%` }}
                  >
                    {activeJob?.status === 'running' && (
                      <div className="absolute inset-0 bg-white/25 animate-pulse" />
                    )}
                  </div>
                </div>
              </div>

              {/* Vùng Phải: Nút Bắt Đầu Xử Lý & Các Điều Khiển Phụ (Requirement 2) */}
              <div className="flex items-center justify-end gap-2 shrink-0">
                {activeJob?.status === 'running' ? (
                  <>
                    <button
                      type="button"
                      onClick={handlePauseResume}
                      className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Tạm dừng tiến trình"
                    >
                      <Pause className="w-4 h-4 text-amber-400" />
                      <span className="hidden sm:inline">Tạm dừng</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelJob}
                      className="px-3 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Hủy bỏ tiến trình"
                    >
                      <Square className="w-3.5 h-3.5 text-rose-400 fill-current" />
                      <span className="hidden sm:inline">Hủy</span>
                    </button>
                    <div className="px-4 py-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm">
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                      <span>Đang xử lý ({completionPercent}%)</span>
                    </div>
                  </>
                ) : activeJob?.status === 'paused' ? (
                  <>
                    <button
                      type="button"
                      onClick={handlePauseResume}
                      className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-colors cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Tiếp tục</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelJob}
                      className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 text-rose-400" />
                      <span>Hủy</span>
                    </button>
                  </>
                ) : (
                  <>
                    {activeJob?.status === 'completed' && activeJob.masterAudio && (
                      <button
                        type="button"
                        onClick={handlePlayMasterAudio}
                        className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                        title="Nghe file master hoàn chỉnh"
                      >
                        {masterPlaying ? (
                          <>
                            <Pause className="w-4 h-4 fill-current" />
                            <span>Dừng</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-current text-emerald-400" />
                            <span>Nghe Master</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Nút Bắt Đầu Xử Lý Chính */}
                    <button
                      type="button"
                      disabled={subtitles.length === 0}
                      onClick={handleStartProcessing}
                      className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-95 text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-xl shadow-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all cursor-pointer"
                    >
                      {activeJob?.status === 'completed' ? (
                        <>
                          <RotateCcw className="w-4 h-4" />
                          <span>Chạy Lại ({subtitles.length} câu)</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                          <span>Bắt Đầu Xử Lý ({subtitles.length} câu)</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
