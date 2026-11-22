import { useEffect, useMemo, useRef, useState } from "react";
import { Download, LoaderCircle, Upload } from "lucide-react";
import { createSrtZip } from "../utils/srtFromText";
import {
  analyzeSrtContent,
  formatVideoDubbingSrt,
} from "../utils/videoDubbingSrt";
import { filterSubtitleAudioItems } from "../utils/subtitleAudioFilters";
import { combineSubtitleCueWithPrevious } from "../utils/videoDubbingSubtitleEditing";
import { VideoDubbingPreviewController } from "../utils/videoDubbingPreview";
import {
  hasMatchedVideoDubbingQueueInputs,
  pairVideoDubbingQueueRows,
  replaceVideoDubbingSubtitleSources,
  resolveVideoDubbingTtsItems,
} from "../utils/videoDubbingQueue";
import { fitTextOverlaysToVideoDuration } from "../utils/videoDubbingOverlays";
import {
  adjustSubtitleCueTimings,
  adjustSubtitleTimelineZoom,
} from "../utils/videoDubbingSubtitleTiming";
import {
  DEFAULT_CHARACTER_CARD_STYLE,
  getCharacterCardScanRanges,
  getTextOverlayTimelineLanes,
  groupCharacterCardOcrCues,
  groupCharacterCardOcrCuesByOccurrences,
  resolveCharacterCardStyle,
} from "../utils/videoDubbingCharacterCards";
import { getAvailableVideoDubbingVoices } from "../utils/videoDubbingVoices";
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  DEFAULT_END_SCENE_ASPECT_RATIO,
  DEFAULT_END_SCENE_DURATION_SECONDS,
  DEFAULT_MIXER_SETTINGS,
  DEFAULT_TEXT_TRACK,
  DEFAULT_TEXT_TRACK_ID,
  END_SCENE_ASPECT_RATIOS,
  SUBTITLE_FONT_OPTIONS,
  SUBTITLE_TIMELINE_DRAG_THRESHOLD_PX,
  createDefaultEndSceneText,
} from "./VideoDubbingTab/constants";
import CoverEditorModal from "./VideoDubbingTab/CoverEditorModal";
import FileDetailsModal from "./VideoDubbingTab/FileDetailsModal";
import GuideModal from "./VideoDubbingTab/GuideModal";
import {
  getJobProcessingProgress,
  getOverlayAlignment,
  getSubtitleTextAlignment,
} from "./VideoDubbingTab/helpers";
import HistoryModal from "./VideoDubbingTab/HistoryModal";
import ProjectsModal from "./VideoDubbingTab/ProjectsModal";
import QueueControlBar from "./VideoDubbingTab/QueueControlBar";
import SettingsSidebar from "./VideoDubbingTab/SettingsSidebar";
import SourceFileInputs from "./VideoDubbingTab/SourceFileInputs";
import SourceInfoPanels from "./VideoDubbingTab/SourceInfoPanels";
import SubtitleBackgroundPickerModal from "./VideoDubbingTab/SubtitleBackgroundPickerModal";
import VideoDubbingHeader from "./VideoDubbingTab/VideoDubbingHeader";
import WorkspaceColumn from "./VideoDubbingTab/WorkspaceColumn";
import { VideoDubbingProvider } from "./VideoDubbingTab/VideoDubbingContext";

export default function VideoDubbingTab() {
  const [video, setVideo] = useState(null);
  const [srt, setSrt] = useState(null);
  const [subtitleCueOverridesByVideoId, setSubtitleCueOverridesByVideoId] =
    useState({});
  const [selectedSubtitleCue, setSelectedSubtitleCue] = useState(null);
  const timelineCueClipboardRef = useRef(null);
  const [textOverlays, setTextOverlays] = useState([]);
  const [characterCardCuesByVideoId, setCharacterCardCuesByVideoId] = useState(
    {},
  );
  const [characterCardStyle, setCharacterCardStyle] = useState(
    DEFAULT_CHARACTER_CARD_STYLE,
  );
  const [textTracks, setTextTracks] = useState([DEFAULT_TEXT_TRACK]);
  const [activeTextTrackId, setActiveTextTrackId] = useState(
    DEFAULT_TEXT_TRACK_ID,
  );
  const [selectedTextOverlay, setSelectedTextOverlay] = useState(null);
  const [logoTitleCollapsed, setLogoTitleCollapsed] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState("logo-title");
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState("settings");
  const [voices, setVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [voicesError, setVoicesError] = useState(null);
  const [speedPriority, setSpeedPriority] = useState("balanced");
  const [minSpeed, setMinSpeed] = useState(0.8);
  const [maxSpeed, setMaxSpeed] = useState(1.5);
  const [masterError, setMasterError] = useState(null);
  const [mixerSettings, setMixerSettings] = useState(DEFAULT_MIXER_SETTINGS);
  const [mixerVolumeDrafts, setMixerVolumeDrafts] = useState({});
  const [mixerSettingsSaved, setMixerSettingsSaved] = useState(false);
  const [mixerError, setMixerError] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewStatus, setPreviewStatus] = useState("stopped");
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [subtitleTimelineCursorTime, setSubtitleTimelineCursorTime] =
    useState(0);
  const [videoPreviewReady, setVideoPreviewReady] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [audioUpdateErrors, setAudioUpdateErrors] = useState({});
  const [coverEditorTarget, setCoverEditorTarget] = useState(null);
  const [coverEditorFile, setCoverEditorFile] = useState(null);
  const [coverEditorPreviewUrl, setCoverEditorPreviewUrl] = useState(null);
  const [coverEditorFrameCount, setCoverEditorFrameCount] = useState(5);
  const [coverEditorBusy, setCoverEditorBusy] = useState(false);
  const [coverEditorError, setCoverEditorError] = useState(null);
  const [coverEditorDragOver, setCoverEditorDragOver] = useState(false);
  const [characterCardRegion, setCharacterCardRegion] = useState(null);
  const [characterCardRegionDraft, setCharacterCardRegionDraft] =
    useState(null);
  const [characterCardDrawStart, setCharacterCardDrawStart] = useState(null);
  const [characterCardDrawMode, setCharacterCardDrawMode] = useState(false);
  const [characterCardOcrStartOffset, setCharacterCardOcrStartOffset] =
    useState(5);
  const [characterCardOcrDuration, setCharacterCardOcrDuration] = useState(10);
  const [characterCardScanCollapsed, setCharacterCardScanCollapsed] =
    useState(false);
  const [characterCardReferenceFile, setCharacterCardReferenceFile] =
    useState(null);
  const [
    characterCardReferencePreviewUrl,
    setCharacterCardReferencePreviewUrl,
  ] = useState(null);
  const [
    characterCardReferenceFramesToSkip,
    setCharacterCardReferenceFramesToSkip,
  ] = useState(30);
  const [
    characterCardReferenceSimilarity,
    setCharacterCardReferenceSimilarity,
  ] = useState(0.72);
  const [characterCardReferenceScanJob, setCharacterCardReferenceScanJob] =
    useState(null);
  const [
    characterCardReferenceSelectedIds,
    setCharacterCardReferenceSelectedIds,
  ] = useState([]);
  const [characterCardReferenceError, setCharacterCardReferenceError] =
    useState(null);
  const characterCardReferenceScanRequestRef = useRef(0);
  const characterCardReferenceScanJobIdRef = useRef(null);
  const [characterCardOcrJob, setCharacterCardOcrJob] = useState(null);
  const [characterCardOcrError, setCharacterCardOcrError] = useState(null);
  const [characterCardOcrWorker, setCharacterCardOcrWorker] = useState({
    status: "stopped",
    message: "OCR thường trực đang tắt.",
  });
  const characterCardOcrRequestRef = useRef(0);
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [logoWidthPercent, setLogoWidthPercent] = useState(15);
  const [logoPaddingPx, setLogoPaddingPx] = useState(24);
  const [logoPosition, setLogoPosition] = useState("top-left");
  const [logoUploading, setLogoUploading] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [subtitleFontSize, setSubtitleFontSize] = useState(32);
  const [subtitleFontFamily, setSubtitleFontFamily] = useState("Arial");
  const [subtitleFontOptions, setSubtitleFontOptions] = useState(
    SUBTITLE_FONT_OPTIONS,
  );
  const [subtitleColor, setSubtitleColor] = useState("#ffffff");
  const [subtitleBackgroundColor, setSubtitleBackgroundColor] =
    useState("#000000");
  const [subtitleBackgroundTransparent, setSubtitleBackgroundTransparent] =
    useState(false);
  const [subtitleBackgroundMode, setSubtitleBackgroundMode] = useState("color");
  const [subtitleBold, setSubtitleBold] = useState(false);
  const [subtitleItalic, setSubtitleItalic] = useState(false);
  const [subtitleUnderline, setSubtitleUnderline] = useState(false);
  const [subtitleTextCase, setSubtitleTextCase] = useState("none");
  const [subtitleOutlineEnabled, setSubtitleOutlineEnabled] = useState(false);
  const [subtitleOutlineColor, setSubtitleOutlineColor] = useState("#000000");
  const [subtitleOutlineWidthPx, setSubtitleOutlineWidthPx] = useState(2);
  const [subtitleCharacterSpacingPx, setSubtitleCharacterSpacingPx] =
    useState(0);
  const [subtitleLineSpacingPx, setSubtitleLineSpacingPx] = useState(0);
  const [subtitlePaddingPx, setSubtitlePaddingPx] = useState(8);
  const [subtitleMarginPx, setSubtitleMarginPx] = useState(32);
  const [exportQuality, setExportQuality] = useState("high");
  const subtitleMarginSaveTimerRef = useRef(null);
  const pendingSubtitleMarginSaveRef = useRef(null);
  const [subtitlePosition, setSubtitlePosition] = useState("bottom-center");
  const [subtitleBackgroundImage, setSubtitleBackgroundImage] = useState(null);
  const [subtitleBackgroundPickerOpen, setSubtitleBackgroundPickerOpen] =
    useState(false);
  const [subtitleBackgrounds, setSubtitleBackgrounds] = useState(["bg1"]);
  const [separationAvailability, setSeparationAvailability] = useState(null);
  const [separationError, setSeparationError] = useState(null);
  const [jobHistory, setJobHistory] = useState([]);
  const [historyError, setHistoryError] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const importProjectRef = useRef(null);
  const importProjectPromiseRef = useRef(null);
  const [defaultProjectId, setDefaultProjectId] = useState(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState(null);
  const [projectSaveState, setProjectSaveState] = useState("saved");
  const [projectReady, setProjectReady] = useState(false);
  const [srtContent, setSrtContent] = useState("");
  const projectSaveRequestRef = useRef(0);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [videoWorkspaceTab, setVideoWorkspaceTab] = useState("preview");
  const [timelineWorkspaceTab, setTimelineWorkspaceTab] = useState("subtitle");
  const [showTtsMasterTimeline, setShowTtsMasterTimeline] = useState(true);
  const [masterEditBusy, setMasterEditBusy] = useState(false);
  const runMasterEditAction = async (action) => {
    setMasterEditBusy(true);
    try {
      await action();
    } catch {
      // mediaError is already set in requestMasterEdit
    } finally {
      setMasterEditBusy(false);
    }
  };
  const [endSceneDurationSeconds, setEndSceneDurationSeconds] = useState(
    DEFAULT_END_SCENE_DURATION_SECONDS,
  );
  const [endSceneAspectRatio, setEndSceneAspectRatio] = useState(
    DEFAULT_END_SCENE_ASPECT_RATIO,
  );
  const endScenePreviewContainerRef = useRef(null);
  const [endScenePreviewSize, setEndScenePreviewSize] = useState({
    width: 640,
    height: 360,
  });
  const [endSceneTextOverlays, setEndSceneTextOverlays] = useState(() => [
    createDefaultEndSceneText(),
  ]);
  const [selectedEndSceneTextIndex, setSelectedEndSceneTextIndex] = useState(0);
  const endSceneStageRef = useRef(null);
  const [endSceneDrag, setEndSceneDrag] = useState(null);
  const [subtitleTimelineZoom, setSubtitleTimelineZoom] = useState(18);
  const [subtitleTimelineViewportWidth, setSubtitleTimelineViewportWidth] =
    useState(720);
  const [subtitleTimingAdjustmentsMs, setSubtitleTimingAdjustmentsMs] =
    useState({
      start: 100,
      end: 100,
      move: 100,
    });
  const [subtitleTimelineDrag, setSubtitleTimelineDrag] = useState(null);
  const subtitleTimelineDragMovedRef = useRef(false);
  const [textOverlayPreviewDrag, setTextOverlayPreviewDrag] = useState(null);
  const [exportClockNow, setExportClockNow] = useState(() => Date.now());
  const [fileDetailsOpen, setFileDetailsOpen] = useState(false);
  const [detailRowIndex, setDetailRowIndex] = useState(null);
  const [videoFiles, setVideoFiles] = useState([]);
  const [subtitleFiles, setSubtitleFiles] = useState([]);
  const [queueStates, setQueueStates] = useState({});
  const [queueRunning, setQueueRunning] = useState(false);
  const [joinAfterQueue, setJoinAfterQueue] = useState(false);
  const [concatPreflight, setConcatPreflight] = useState({
    status: "idle",
    message: "",
  });
  const [concatStatus, setConcatStatus] = useState("idle");
  const [joinedVideo, setJoinedVideo] = useState(null);
  const [settingsSyncRunning, setSettingsSyncRunning] = useState(false);
  const [settingsSyncMessage, setSettingsSyncMessage] = useState(null);
  const [srtDownloadMessage, setSrtDownloadMessage] = useState(null);
  const [allVideosAction, setAllVideosAction] = useState(null);
  const autoPipelineEnabled = true;
  const [autoPipelineExpanded, setAutoPipelineExpanded] = useState(true);
  const [masterPanelExpanded, setMasterPanelExpanded] = useState(false);
  const [subtitleAudioItems, setSubtitleAudioItems] = useState([]);
  const [subtitleAudioError, setSubtitleAudioError] = useState(null);
  const [subtitleAudioSyncing, setSubtitleAudioSyncing] = useState(false);
  const [subtitleAudioRegeneratingId, setSubtitleAudioRegeneratingId] =
    useState(null);
  const [subtitleAudioMasterBusy, setSubtitleAudioMasterBusy] = useState(false);
  const [subtitleAudioDrafts, setSubtitleAudioDrafts] = useState({});
  const [subtitleAudioPlayingId, setSubtitleAudioPlayingId] = useState(null);
  const [subtitleAudioFilterOpen, setSubtitleAudioFilterOpen] = useState(false);
  const [subtitleAudioTimingStepMs, setSubtitleAudioTimingStepMs] =
    useState(100);
  const [subtitleAudioShortFilterEnabled, setSubtitleAudioShortFilterEnabled] =
    useState(false);
  const [subtitleAudioMaxCharacterCount, setSubtitleAudioMaxCharacterCount] =
    useState(5);
  const [
    subtitleAudioSpecialCharactersFilterEnabled,
    setSubtitleAudioSpecialCharactersFilterEnabled,
  ] = useState(false);
  const [
    subtitleAudioSimilarFilterEnabled,
    setSubtitleAudioSimilarFilterEnabled,
  ] = useState(false);
  const [
    subtitleAudioNonAlphabetFilterEnabled,
    setSubtitleAudioNonAlphabetFilterEnabled,
  ] = useState(false);
  const subtitleAudioSyncRequestRef = useRef(0);
  const subtitleAudioKnownNonEmptyJobIdsRef = useRef(new Set());
  const subtitleAudioPlayerRef = useRef(null);
  const subtitleAudioPlaybackIdRef = useRef(null);
  const activeSubtitleSourceJobIdRef = useRef(null);
  const [separationPanelExpanded, setSeparationPanelExpanded] = useState(false);
  const [mixerPanelExpanded, setMixerPanelExpanded] = useState(true);
  const [autoPipelineTtsMasterEnabled, setAutoPipelineTtsMasterEnabled] =
    useState(true);
  const [autoPipelineDemucsEnabled, setAutoPipelineDemucsEnabled] =
    useState(false);
  const [originalAudioVolumePercent, setOriginalAudioVolumePercent] =
    useState(100);
  const [autoPipelineError, setAutoPipelineError] = useState(null);
  const [autoPipelineSaving, setAutoPipelineSaving] = useState(false);
  const autoPipelineConfigJobRef = useRef(null);
  const autoPipelineSavedConfigKeyRef = useRef(null);
  const queueCancelRef = useRef(false);
  const queueCurrentJobIdRef = useRef(null);
  const videoInputRef = useRef(null);
  const previewVideoRef = useRef(null);
  const previewStageRef = useRef(null);
  const subtitleTimelineTrackRef = useRef(null);
  const subtitleTimelineScrollRef = useRef(null);
  const srtInputRef = useRef(null);
  const subtitleBrowseTargetRef = useRef(null);
  const logoInputRef = useRef(null);
  const coverEditorInputRef = useRef(null);
  const uploadRef = useRef(null);
  const videoGenerationRef = useRef(0);
  const srtGenerationRef = useRef(0);
  const activeJobIdRef = useRef(null);
  const characterCardCueVideoIdRef = useRef(null);
  const subtitleTimelineCursorRef = useRef(0);
  const subtitleTimelineFitRef = useRef(false);
  const subtitleTimelineZoomFocusRef = useRef("playhead");
  const mixerSettingsTimerRef = useRef(null);
  const mixerSettingsRequestRef = useRef(0);
  const mixerSettingsVersionRef = useRef(0);
  const mixerSaveChainRef = useRef(Promise.resolve());
  const mixerTouchedRef = useRef(false);
  const audioContextRef = useRef(null);
  const previewNodesRef = useRef(new Map());
  const previewControllerRef = useRef(null);
  const previewJobIdRef = useRef(null);
  const previewTrackKeyRef = useRef(null);
  useEffect(() => {
    if (!coverEditorFile) {
      setCoverEditorPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(coverEditorFile);
    setCoverEditorPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [coverEditorFile]);
  useEffect(() => {
    if (!characterCardReferenceFile) {
      setCharacterCardReferencePreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(characterCardReferenceFile);
    setCharacterCardReferencePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [characterCardReferenceFile]);
  useEffect(
    () => () => {
      const scanId = characterCardReferenceScanJobIdRef.current;
      if (!scanId) return;
      characterCardReferenceScanRequestRef.current += 1;
      void fetch(
        `/api/video-dubbing/character-card-reference-scans/${scanId}/cancel`,
        {
          method: "POST",
        },
      ).catch((error) => {
        console.error("Không thể dừng quét ảnh mẫu khi rời video:", error);
      });
    },
    [video?.job?.id],
  );
  useEffect(() => {
    let active = true;
    const refreshWorkerStatus = async () => {
      try {
        const response = await fetch("/api/subtitle-ocr/worker/status");
        const result = await response.json();
        if (active && response.ok && result.worker)
          setCharacterCardOcrWorker(result.worker);
      } catch (error) {
        if (active) {
          setCharacterCardOcrError(
            error instanceof Error
              ? error.message
              : "Không lấy được trạng thái OCR thường trực.",
          );
        }
      }
    };
    void refreshWorkerStatus();
    if (
      characterCardOcrWorker.status !== "starting" &&
      characterCardOcrWorker.status !== "busy"
    ) {
      return () => {
        active = false;
      };
    }
    const timer = window.setInterval(() => void refreshWorkerStatus(), 800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [characterCardOcrWorker.status]);
  const releasePreviewGraph = (updateUi = true) => {
    previewControllerRef.current?.dispose();
    previewControllerRef.current = null;
    previewVideoRef.current?.pause();
    for (const { element } of previewNodesRef.current.values()) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
    previewNodesRef.current.clear();
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch((error) => {
        console.error("Không thể đóng Web Audio context:", error);
      });
    }
    previewJobIdRef.current = null;
    previewTrackKeyRef.current = null;
    if (updateUi) {
      setPreviewStatus("stopped");
      setPreviewCurrentTime(0);
      setSubtitleTimelineCursorTime(0);
      if (previewVideoRef.current && videoPreviewReady) {
        previewVideoRef.current.currentTime = 0;
      }
    }
  };
  const pauseMixerPreview = () => {
    previewControllerRef.current?.pause();
    setPreviewStatus("paused");
  };
  const seekMixerPreview = (time) => {
    const seekTo = Math.max(0, time);
    if (previewControllerRef.current) {
      previewControllerRef.current.seek(seekTo);
    } else if (previewVideoRef.current && videoPreviewReady) {
      previewVideoRef.current.currentTime = seekTo;
    }
    setPreviewCurrentTime(seekTo);
    setSubtitleTimelineCursorTime(seekTo);
  };
  const seekSubtitleTimeline = (time) => {
    const sourceDuration =
      job?.metadata?.durationSeconds ?? subtitleTimelineDuration;
    const endSceneEnabled = Boolean(job?.overlaySettings?.endScene?.enabled);
    const maximum =
      sourceDuration + (endSceneEnabled ? endSceneDurationSeconds : 0);
    const seekTo = Math.max(0, Math.min(time, maximum));
    if (endSceneEnabled && seekTo > sourceDuration) {
      previewControllerRef.current?.pause();
      if (previewVideoRef.current && videoPreviewReady) {
        previewVideoRef.current.currentTime = sourceDuration;
      }
      setPreviewStatus("paused");
      setPreviewCurrentTime(sourceDuration);
      setSubtitleTimelineCursorTime(seekTo);
      setVideoWorkspaceTab("preview");
      return;
    }
    if (videoWorkspaceTab === "end-scene") setVideoWorkspaceTab("preview");
    seekMixerPreview(seekTo);
  };
  const getCharacterCardPoint = (event) => {
    const bounds = previewStageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  const startCharacterCardRegion = (event) => {
    if (!characterCardDrawMode) return;
    const point = getCharacterCardPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setCharacterCardDrawStart(point);
    setCharacterCardRegionDraft({
      left: point.x,
      top: point.y,
      width: 0,
      height: 0,
    });
    setCharacterCardOcrError(null);
  };
  const moveCharacterCardRegion = (event) => {
    if (!characterCardDrawStart) return;
    const point = getCharacterCardPoint(event);
    if (!point) return;
    setCharacterCardRegionDraft({
      left: Math.min(characterCardDrawStart.x, point.x),
      top: Math.min(characterCardDrawStart.y, point.y),
      width: Math.abs(point.x - characterCardDrawStart.x),
      height: Math.abs(point.y - characterCardDrawStart.y),
    });
  };
  const finishCharacterCardRegion = (event) => {
    if (!characterCardDrawStart) return;
    const point = getCharacterCardPoint(event);
    if (point) {
      const region = {
        left: Math.min(characterCardDrawStart.x, point.x),
        top: Math.min(characterCardDrawStart.y, point.y),
        width: Math.abs(point.x - characterCardDrawStart.x),
        height: Math.abs(point.y - characterCardDrawStart.y),
      };
      if (region.width >= 0.01 && region.height >= 0.01) {
        setCharacterCardRegion(region);
      } else {
        setCharacterCardOcrError(
          "Vùng chọn quá nhỏ. Hãy kéo để khoanh vùng chữ trên video.",
        );
      }
    }
    setCharacterCardDrawStart(null);
    setCharacterCardRegionDraft(null);
    setCharacterCardDrawMode(false);
  };
  const cancelCharacterCardRegionDraw = () => {
    setCharacterCardDrawStart(null);
    setCharacterCardRegionDraft(null);
    setCharacterCardDrawMode(false);
  };
  const restartMixerPreview = async () => {
    const controller = previewControllerRef.current;
    if (!controller) {
      seekMixerPreview(0);
      await playMixerPreview();
      return;
    }
    setPreviewError(null);
    try {
      const playback = controller.restart();
      await audioContextRef.current?.resume();
      await playback;
      setPreviewStatus("playing");
    } catch (error) {
      setPreviewStatus("paused");
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Không thể khởi động lại preview.",
      );
    }
  };
  const updateMixerSetting = (track, patch) => {
    mixerSettingsVersionRef.current++;
    mixerTouchedRef.current = true;
    setMixerSettingsSaved(false);
    setMixerSettings((current) => ({
      ...current,
      [track]: { ...current[track], ...patch },
    }));
  };
  const playMixerPreview = async () => {
    const job = video?.job;
    const videoElement = previewVideoRef.current;
    if (!job || !videoElement || !job.metadata) return;
    if (previewStatus === "playing") {
      pauseMixerPreview();
      return;
    }
    const availableTracks = [];
    if (
      job.masterGeneration?.sizeBytes &&
      job.masterGeneration.durationSeconds !== undefined
    ) {
      availableTracks.push({
        track: "ttsMaster",
        url: job.masterEdit?.clips.length
          ? `/api/video-dubbing/jobs/${job.id}/master-edit/preview?v=${job.masterEdit.updatedAt}`
          : `/api/video-dubbing/jobs/${job.id}/master-audio?v=${job.masterGeneration.audioVersion || job.masterGeneration.sizeBytes}`,
      });
    }
    if (job.separation?.vocalsSizeBytes) {
      availableTracks.push({
        track: "vocals",
        url: `/api/video-dubbing/jobs/${job.id}/separation/vocals`,
      });
    }
    if (job.separation?.instrumentalSizeBytes) {
      availableTracks.push({
        track: "instrumental",
        url: `/api/video-dubbing/jobs/${job.id}/separation/instrumental`,
      });
    }
    if (!videoPreviewReady) {
      setPreviewError("Video chưa sẵn sàng để xem trước.");
      return;
    }
    setPreviewError(null);
    try {
      const trackKey = availableTracks
        .map(({ track, url }) => `${track}:${url}`)
        .join("|");
      let context = audioContextRef.current;
      if (
        !context ||
        previewJobIdRef.current !== job.id ||
        previewTrackKeyRef.current !== trackKey
      ) {
        releasePreviewGraph(false);
        context = new AudioContext();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -1;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.15;
        limiter.connect(context.destination);
        audioContextRef.current = context;
        previewJobIdRef.current = job.id;
        previewTrackKeyRef.current = trackKey;
        for (const { track, url } of availableTracks) {
          const element = new Audio();
          element.preload = "auto";
          element.src = url;
          const source = context.createMediaElementSource(element);
          const gain = context.createGain();
          source.connect(gain);
          gain.connect(limiter);
          const setting = mixerSettings[track];
          gain.gain.value = setting.muted ? 0 : setting.volumePercent / 100;
          previewNodesRef.current.set(track, { element, gain });
        }
      }
      const tracks = [...previewNodesRef.current.values()].map(
        ({ element }) => element,
      );
      if (!previewControllerRef.current) {
        const durationSeconds = job.metadata.durationSeconds;
        previewControllerRef.current = new VideoDubbingPreviewController(
          videoElement,
          tracks,
          durationSeconds,
          (time) => {
            setPreviewCurrentTime(time);
            setSubtitleTimelineCursorTime(time);
            if (time >= durationSeconds - 0.04) {
              setPreviewStatus("stopped");
            }
          },
          (error) => {
            setPreviewError(
              error instanceof Error
                ? error.message
                : "Không thể đồng bộ audio preview.",
            );
          },
        );
      }
      const playback = previewControllerRef.current.play();
      await context.resume();
      await playback;
      setPreviewStatus("playing");
    } catch (error) {
      for (const { element } of previewNodesRef.current.values()) {
        element.pause();
      }
      setPreviewStatus("paused");
      previewControllerRef.current?.pause();
      previewVideoRef.current?.pause();
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Không thể phát mixer preview.",
      );
    }
  };
  const loadJobHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch("/api/video-dubbing/jobs");
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.jobs)) {
        throw new Error(result.error || "Không thể tải lịch sử Video Dubbing.");
      }
      const items = result.jobs;
      setJobHistory(items);
      return items;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Không thể tải lịch sử Video Dubbing.";
      setHistoryError(message);
      return [];
    } finally {
      setHistoryLoading(false);
    }
  };
  const loadProjects = async () => {
    try {
      const response = await fetch("/api/video-dubbing/projects");
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.projects))
        throw new Error(result.error || "Không thể tải project.");
      setProjects(result.projects);
      return result.projects;
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "Không thể tải project.",
      );
      return [];
    }
  };
  const makeProjectWorkspace = () => ({
    version: 1,
    mixerSettings,
    selectedVoiceId,
    minSpeed,
    maxSpeed,
    speedPriority,
    autoPipelineTtsMasterEnabled,
    autoPipelineDemucsEnabled,
    originalAudioVolumePercent,
    logoEnabled,
    logoWidthPercent,
    logoPaddingPx,
    logoPosition,
    subtitlesEnabled,
    subtitleFontSize,
    subtitleFontFamily,
    subtitleColor,
    subtitleMarginPx,
    subtitleBackgroundColor,
    subtitleBackgroundTransparent,
    subtitleBackgroundMode,
    subtitleBold,
    subtitleItalic,
    subtitleUnderline,
    subtitleTextCase,
    subtitleOutlineEnabled,
    subtitleOutlineColor,
    subtitleOutlineWidthPx,
    subtitleCharacterSpacingPx,
    subtitleLineSpacingPx,
    subtitlePaddingPx,
    subtitlePosition,
    subtitleBackgroundImage,
    exportQuality,
    subtitleCueOverrides: video?.job?.id
      ? (subtitleCueOverridesByVideoId[video.job.id] ?? null)
      : null,
    subtitleCueOverridesByVideoId,
    textOverlays: textOverlays.filter((cue) => cue.kind !== "character-card"),
    characterCardStyle,
    characterCardCuesByVideoId: video?.job?.id
      ? {
          ...characterCardCuesByVideoId,
          [video.job.id]: textOverlays.filter(
            (cue) => cue.kind === "character-card",
          ),
        }
      : characterCardCuesByVideoId,
    textTracks,
    subtitleTimelineZoom,
    endSceneTemplate: {
      durationSeconds: endSceneDurationSeconds,
      aspectRatio: endSceneAspectRatio,
      textOverlays: endSceneTextOverlays,
    },
  });
  const createProject = async () => {
    const name = window.prompt(
      "Tên project Video Dubbing",
      video?.fileName?.replace(/\.[^.]+$/, "") || "Project mới",
    );
    if (!name?.trim()) return;
    if (
      video?.job?.id &&
      projects.some((project) => project.jobIds.includes(video.job.id))
    ) {
      setProjectError(
        "Video này đã thuộc một project. Hãy tiếp tục lưu project đang mở hoặc tạo project mới rồi tải video vào project đó.",
      );
      return;
    }
    setProjectBusy(true);
    setProjectError(null);
    try {
      const response = await fetch("/api/video-dubbing/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.project)
        throw new Error(result.error || "Không thể tạo project.");
      const created = result.project;
      const jobId = video?.job?.id;
      const saveResponse = await fetch(
        `/api/video-dubbing/projects/${created.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobIds: jobId ? [jobId] : [],
            activeJobId: jobId || null,
            srt: srtContent
              ? {
                  fileName: srt?.fileName || "subtitles.srt",
                  content: srtContent,
                }
              : null,
            workspace: makeProjectWorkspace(),
          }),
        },
      );
      const saved = await saveResponse.json();
      if (!saveResponse.ok || !saved.project)
        throw new Error(
          saved.error ||
            "Project được tạo nhưng chưa lưu được dữ liệu hiện tại.",
        );
      setActiveProject(saved.project);
      importProjectRef.current = saved.project;
      setProjectReady(true);
      setProjectSaveState("saved");
      setProjects((items) => [
        saved.project,
        ...items.filter((item) => item.id !== saved.project.id),
      ]);
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "Không thể tạo project.",
      );
    } finally {
      setProjectBusy(false);
    }
  };
  const openProject = async (project) => {
    setProjectReady(false);
    setProjectError(null);
    setProjectBusy(true);
    subtitleTimelineFitRef.current = false;
    subtitleTimelineZoomFocusRef.current = "playhead";
    try {
      const response = await fetch(`/api/video-dubbing/projects/${project.id}`);
      const result = await response.json();
      if (!response.ok || !result.project)
        throw new Error(result.error || "Không thể mở project.");
      const loaded = result.project;
      const w = loaded.workspace || {};
      const savedCharacterCardCues = w.characterCardCuesByVideoId;
      const loadedCharacterCardCuesByVideoId = {};
      if (
        savedCharacterCardCues &&
        typeof savedCharacterCardCues === "object" &&
        !Array.isArray(savedCharacterCardCues)
      ) {
        for (const [videoId, cues] of Object.entries(savedCharacterCardCues)) {
          if (!loaded.jobIds.includes(videoId) || !Array.isArray(cues))
            continue;
          loadedCharacterCardCuesByVideoId[videoId] = cues.filter(
            (cue) => cue?.kind === "character-card",
          );
        }
      }
      const savedCardStyle = Object.values(loadedCharacterCardCuesByVideoId)
        .flat()
        .find((cue) => cue?.kind === "character-card");
      setCharacterCardStyle(
        resolveCharacterCardStyle(w.characterCardStyle ?? savedCardStyle),
      );
      setCharacterCardCuesByVideoId(loadedCharacterCardCuesByVideoId);
      // Mark ownership before switching the active job so the legacy job overlay
      // hydration effect cannot overwrite the newer project workspace snapshot.
      setActiveProject(loaded);
      importProjectRef.current = loaded;
      const history = await loadJobHistory();
      const activeId = loaded.activeJobId || loaded.jobIds[0];
      const item = history.find((entry) => entry.job.id === activeId);
      if (item) openHistoryJob(item);
      else if (activeId)
        throw new Error("Project có liên kết tới job không còn tồn tại.");
      else {
        setVideo(null);
        setSrt(null);
        setSrtContent("");
      }
      if (loaded.srt) {
        const analysis = analyzeSrtContent(loaded.srt.content);
        setSrt({
          fileName: loaded.srt.fileName,
          sizeBytes: new Blob([loaded.srt.content]).size,
          content: loaded.srt.content,
          analysis,
        });
        setSrtContent(loaded.srt.content);
      } else {
        setSrt(null);
        setSrtContent("");
      }
      const projectJobs = loaded.jobIds
        .map((id) => history.find((entry) => entry.job.id === id)?.job)
        .filter((item) => Boolean(item))
        .sort((left, right) =>
          left.fileName.localeCompare(right.fileName, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        );
      setVideoFiles(
        projectJobs.map((item) => ({
          id: item.id,
          name: item.fileName,
          size: item.sizeBytes,
          job: item,
        })),
      );
      const storedSrts = loaded.sourceSrts?.length
        ? loaded.sourceSrts
        : loaded.srt
          ? [{ id: `legacy-${loaded.id}`, ...loaded.srt }]
          : [];
      setSubtitleFiles(
        storedSrts.map((item) => {
          const analysis = analyzeSrtContent(item.content);
          return {
            id: item.id,
            fileName: item.fileName,
            sizeBytes: new Blob([item.content]).size,
            content: item.content,
            analysis,
            videoId: item.videoId,
            matchByName: item.matchByName,
          };
        }),
      );
      setSelectedSubtitleCue(null);
      if (typeof w.subtitleMarginPx === "number")
        setSubtitleMarginPx(w.subtitleMarginPx);
      if (w.mixerSettings) setMixerSettings(w.mixerSettings);
      if (typeof w.selectedVoiceId === "string")
        setSelectedVoiceId(w.selectedVoiceId);
      if (typeof w.minSpeed === "number") setMinSpeed(w.minSpeed);
      if (typeof w.maxSpeed === "number") setMaxSpeed(w.maxSpeed);
      if (
        w.speedPriority === "balanced" ||
        w.speedPriority === "strict" ||
        w.speedPriority === "natural"
      )
        setSpeedPriority(w.speedPriority);
      setAutoPipelineTtsMasterEnabled(
        typeof w.autoPipelineTtsMasterEnabled === "boolean"
          ? w.autoPipelineTtsMasterEnabled
          : true,
      );
      if (typeof w.autoPipelineDemucsEnabled === "boolean")
        setAutoPipelineDemucsEnabled(w.autoPipelineDemucsEnabled);
      if (typeof w.originalAudioVolumePercent === "number")
        setOriginalAudioVolumePercent(w.originalAudioVolumePercent);
      if (typeof w.logoEnabled === "boolean") setLogoEnabled(w.logoEnabled);
      if (typeof w.logoWidthPercent === "number")
        setLogoWidthPercent(w.logoWidthPercent);
      if (typeof w.logoPaddingPx === "number")
        setLogoPaddingPx(w.logoPaddingPx);
      if (typeof w.logoPosition === "string") setLogoPosition(w.logoPosition);
      if (typeof w.subtitlesEnabled === "boolean")
        setSubtitlesEnabled(w.subtitlesEnabled);
      if (typeof w.subtitleFontSize === "number")
        setSubtitleFontSize(w.subtitleFontSize);
      if (typeof w.subtitleFontFamily === "string")
        setSubtitleFontFamily(w.subtitleFontFamily);
      if (typeof w.subtitleColor === "string")
        setSubtitleColor(w.subtitleColor);
      if (typeof w.subtitleBackgroundColor === "string")
        setSubtitleBackgroundColor(w.subtitleBackgroundColor);
      if (typeof w.subtitleBackgroundTransparent === "boolean")
        setSubtitleBackgroundTransparent(w.subtitleBackgroundTransparent);
      if (
        w.subtitleBackgroundMode === "none" ||
        w.subtitleBackgroundMode === "color" ||
        w.subtitleBackgroundMode === "image"
      )
        setSubtitleBackgroundMode(w.subtitleBackgroundMode);
      if (typeof w.subtitleBold === "boolean") setSubtitleBold(w.subtitleBold);
      if (typeof w.subtitleItalic === "boolean")
        setSubtitleItalic(w.subtitleItalic);
      if (typeof w.subtitleUnderline === "boolean")
        setSubtitleUnderline(w.subtitleUnderline);
      if (
        w.subtitleTextCase === "none" ||
        w.subtitleTextCase === "uppercase" ||
        w.subtitleTextCase === "lowercase" ||
        w.subtitleTextCase === "capitalize"
      )
        setSubtitleTextCase(w.subtitleTextCase);
      if (typeof w.subtitleOutlineEnabled === "boolean")
        setSubtitleOutlineEnabled(w.subtitleOutlineEnabled);
      if (typeof w.subtitleOutlineColor === "string")
        setSubtitleOutlineColor(w.subtitleOutlineColor);
      if (typeof w.subtitleOutlineWidthPx === "number")
        setSubtitleOutlineWidthPx(w.subtitleOutlineWidthPx);
      if (typeof w.subtitleCharacterSpacingPx === "number")
        setSubtitleCharacterSpacingPx(w.subtitleCharacterSpacingPx);
      if (typeof w.subtitleLineSpacingPx === "number")
        setSubtitleLineSpacingPx(w.subtitleLineSpacingPx);
      if (typeof w.subtitlePaddingPx === "number")
        setSubtitlePaddingPx(w.subtitlePaddingPx);
      setExportQuality(
        w.exportQuality === "source" ||
          w.exportQuality === "low" ||
          w.exportQuality === "medium" ||
          w.exportQuality === "high"
          ? w.exportQuality
          : "high",
      );
      if (typeof w.subtitlePosition === "string")
        setSubtitlePosition(w.subtitlePosition);
      if (
        typeof w.subtitleBackgroundImage === "string" ||
        w.subtitleBackgroundImage === null
      )
        setSubtitleBackgroundImage(w.subtitleBackgroundImage);
      if (
        w.subtitleCueOverridesByVideoId &&
        typeof w.subtitleCueOverridesByVideoId === "object" &&
        !Array.isArray(w.subtitleCueOverridesByVideoId)
      ) {
        setSubtitleCueOverridesByVideoId(w.subtitleCueOverridesByVideoId);
      } else if (loaded.activeJobId && Array.isArray(w.subtitleCueOverrides)) {
        setSubtitleCueOverridesByVideoId({
          [loaded.activeJobId]: w.subtitleCueOverrides,
        });
      } else {
        setSubtitleCueOverridesByVideoId({});
      }
      const loadedTextTracks = Array.isArray(w.textTracks)
        ? w.textTracks.filter((track) =>
            Boolean(
              track &&
              typeof track.id === "string" &&
              typeof track.name === "string",
            ),
          )
        : [DEFAULT_TEXT_TRACK];
      setTextTracks(loadedTextTracks);
      setActiveTextTrackId(loadedTextTracks[0]?.id || DEFAULT_TEXT_TRACK_ID);
      const projectTextOverlays = Array.isArray(w.textOverlays)
        ? w.textOverlays
            .filter((cue) => cue?.kind !== "character-card")
            .map((cue) => ({
              ...cue,
              trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
            }))
        : [];
      const activeCharacterCards = activeId
        ? (loadedCharacterCardCuesByVideoId[activeId] ??
          (item?.job.overlaySettings?.textOverlays ?? []).filter(
            (cue) => cue.kind === "character-card",
          ))
        : [];
      characterCardCueVideoIdRef.current = activeId || null;
      setTextOverlays([
        ...projectTextOverlays,
        ...activeCharacterCards.map((cue) => ({
          ...cue,
          trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
        })),
      ]);
      const savedEndSceneTemplate = w.endSceneTemplate;
      if (
        savedEndSceneTemplate &&
        typeof savedEndSceneTemplate === "object" &&
        !Array.isArray(savedEndSceneTemplate)
      ) {
        const template = savedEndSceneTemplate;
        const durationSeconds =
          typeof template.durationSeconds === "number" &&
          Number.isFinite(template.durationSeconds)
            ? Math.max(1, Math.min(120, template.durationSeconds))
            : DEFAULT_END_SCENE_DURATION_SECONDS;
        const textOverlays = Array.isArray(template.textOverlays)
          ? template.textOverlays.filter(
              (cue) =>
                cue &&
                typeof cue.text === "string" &&
                typeof cue.fontFamily === "string" &&
                Number.isFinite(cue.fontSize),
            )
          : [];
        setEndSceneDurationSeconds(durationSeconds);
        setEndSceneAspectRatio(
          END_SCENE_ASPECT_RATIOS.includes(template.aspectRatio)
            ? template.aspectRatio
            : DEFAULT_END_SCENE_ASPECT_RATIO,
        );
        setEndSceneTextOverlays(textOverlays);
        setSelectedEndSceneTextIndex(textOverlays.length ? 0 : null);
      } else {
        setEndSceneDurationSeconds(DEFAULT_END_SCENE_DURATION_SECONDS);
        setEndSceneAspectRatio(DEFAULT_END_SCENE_ASPECT_RATIO);
        setEndSceneTextOverlays([
          createDefaultEndSceneText(DEFAULT_END_SCENE_DURATION_SECONDS),
        ]);
        setSelectedEndSceneTextIndex(0);
      }
      if (typeof w.subtitleTimelineZoom === "number") {
        subtitleTimelineFitRef.current = false;
        setSubtitleTimelineZoom(w.subtitleTimelineZoom);
      }
      setActiveProject(loaded);
      setProjects((items) => [
        loaded,
        ...items.filter((item) => item.id !== loaded.id),
      ]);
      setProjectReady(true);
      setProjectSaveState("saved");
      setProjectsExpanded(false);
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "Không thể mở project.",
      );
    } finally {
      setProjectBusy(false);
    }
  };
  const deleteProject = async (project) => {
    if (
      !window.confirm(
        `Xóa project “${project.name}” cùng video, logo, đầu ra và dữ liệu xử lý thuộc project?`,
      )
    )
      return;
    setProjectBusy(true);
    try {
      const response = await fetch(
        `/api/video-dubbing/projects/${project.id}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Không thể xóa project.");
      setProjects((items) => items.filter((item) => item.id !== project.id));
      if (activeProject?.id === project.id) {
        importProjectRef.current = null;
        setVideoFiles([]);
        setSubtitleFiles([]);
        setQueueStates({});
        setActiveProject(null);
        setProjectReady(false);
        setVideo(null);
        setSrt(null);
        setSrtContent("");
        setEndSceneDurationSeconds(DEFAULT_END_SCENE_DURATION_SECONDS);
        setEndSceneAspectRatio(DEFAULT_END_SCENE_ASPECT_RATIO);
        setEndSceneTextOverlays([
          createDefaultEndSceneText(DEFAULT_END_SCENE_DURATION_SECONDS),
        ]);
        setSelectedEndSceneTextIndex(0);
      }
      if (defaultProjectId === project.id) {
        window.localStorage.removeItem("video-dubbing-default-project");
        setDefaultProjectId(null);
      }
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "Không thể xóa project.",
      );
    } finally {
      setProjectBusy(false);
    }
  };
  const renameProject = async (project) => {
    const name = window.prompt("Tên project mới", project.name)?.trim();
    if (!name || name === project.name) return;
    setProjectBusy(true);
    setProjectError(null);
    ++projectSaveRequestRef.current;
    try {
      const response = await fetch(
        `/api/video-dubbing/projects/${project.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.project)
        throw new Error(result.error || "Không thể đổi tên project.");
      const renamed = result.project;
      setProjects((items) =>
        items.map((item) => (item.id === renamed.id ? renamed : item)),
      );
      if (activeProject?.id === renamed.id) {
        setActiveProject(renamed);
        importProjectRef.current = renamed;
      }
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "Không thể đổi tên project.",
      );
    } finally {
      setProjectBusy(false);
    }
  };
  const saveSubtitleMarginForJob = async (jobId, value) => {
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${jobId}/overlay-settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subtitleMarginPx: value }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.job)
        throw new Error(result.error || "Không thể lưu khoảng cách phụ đề.");
      const savedJob = result.job;
      setVideoFiles((items) =>
        items.map((item) =>
          item.job?.id === jobId ? { ...item, job: savedJob } : item,
        ),
      );
      setJobHistory((items) =>
        items.map((item) =>
          item.job.id === jobId ? { ...item, job: savedJob } : item,
        ),
      );
      setVideo((current) =>
        current?.job?.id === jobId ? { ...current, job: savedJob } : current,
      );
    } catch (error) {
      setMediaError(
        error instanceof Error
          ? error.message
          : "Không thể lưu khoảng cách phụ đề.",
      );
    }
  };
  const flushSubtitleMarginSave = () => {
    if (subtitleMarginSaveTimerRef.current !== null) {
      window.clearTimeout(subtitleMarginSaveTimerRef.current);
      subtitleMarginSaveTimerRef.current = null;
    }
    const pending = pendingSubtitleMarginSaveRef.current;
    pendingSubtitleMarginSaveRef.current = null;
    if (pending) void saveSubtitleMarginForJob(pending.jobId, pending.value);
  };
  const scheduleSubtitleMarginSave = (jobId, value) => {
    pendingSubtitleMarginSaveRef.current = { jobId, value };
    if (subtitleMarginSaveTimerRef.current !== null)
      window.clearTimeout(subtitleMarginSaveTimerRef.current);
    subtitleMarginSaveTimerRef.current = window.setTimeout(() => {
      subtitleMarginSaveTimerRef.current = null;
      const pending = pendingSubtitleMarginSaveRef.current;
      pendingSubtitleMarginSaveRef.current = null;
      if (pending) void saveSubtitleMarginForJob(pending.jobId, pending.value);
    }, 350);
  };
  const openHistoryJob = (item) => {
    flushSubtitleMarginSave();
    const selectedJob = "job" in item ? item.job : item;
    const project = importProjectRef.current || activeProject;
    const projectCharacterCardCuesByVideoId =
      project?.workspace?.characterCardCuesByVideoId;
    const savedCharacterCards = Object.prototype.hasOwnProperty.call(
      characterCardCuesByVideoId,
      selectedJob.id,
    )
      ? characterCardCuesByVideoId[selectedJob.id]
      : (projectCharacterCardCuesByVideoId?.[selectedJob.id] ??
        (selectedJob.overlaySettings?.textOverlays ?? []).filter(
          (cue) => cue.kind === "character-card",
        ));
    characterCardCueVideoIdRef.current = selectedJob.id;
    setTextOverlays((current) => [
      ...current.filter((cue) => cue.kind !== "character-card"),
      ...savedCharacterCards.map((cue) => ({
        ...cue,
        trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
      })),
    ]);
    videoGenerationRef.current++;
    uploadRef.current?.abort();
    uploadRef.current = null;
    activeJobIdRef.current = selectedJob.id;
    setVideo({
      fileName: selectedJob.fileName,
      sizeBytes: selectedJob.sizeBytes,
      progress: 100,
      job: selectedJob,
      warning: "job" in item ? item.warning : undefined,
    });
    setSelectedTextOverlay(null);
    if (!activeProject?.jobIds.includes(selectedJob.id)) {
      setSrt(null);
      setSrtContent("");
    }
    setMasterError(null);
    setMediaError(null);
    setSeparationError(null);
    if (srtInputRef.current) srtInputRef.current.value = "";
  };
  const forgetCharacterCardCues = (videoId) => {
    if (characterCardCueVideoIdRef.current === videoId) {
      characterCardCueVideoIdRef.current = null;
    }
    setCharacterCardCuesByVideoId((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, videoId))
        return current;
      const next = { ...current };
      delete next[videoId];
      return next;
    });
  };
  const previewSourceVideo = async (selectedJob) => {
    if (
      selectedJob.status !== "completed" ||
      queueRunning ||
      settingsSyncRunning
    )
      return null;
    let currentJob = selectedJob;
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${selectedJob.id}`);
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(
          result.error || "Không thể tải trạng thái video mới nhất.",
        );
      }
      currentJob = result.job;
      if (currentJob.status !== "completed") {
        throw new Error("Video hiện chưa sẵn sàng để mở preview.");
      }
      setVideoFiles((items) =>
        items.map((item) =>
          item.job?.id === currentJob.id ? { ...item, job: currentJob } : item,
        ),
      );
      setJobHistory((items) =>
        items.map((item) =>
          item.job.id === currentJob.id ? { ...item, job: currentJob } : item,
        ),
      );
    } catch (error) {
      setMediaError(
        error instanceof Error
          ? error.message
          : "Không thể tải trạng thái video mới nhất.",
      );
      return null;
    }
    let project = importProjectRef.current || activeProject;
    if (project && !project.jobIds.includes(currentJob.id)) {
      try {
        project = await attachJobToProject(project, currentJob.id);
      } catch (error) {
        setProjectError(
          error instanceof Error
            ? error.message
            : "Không thể mở preview của video trong project.",
        );
        return null;
      }
    }
    openHistoryJob(currentJob);
    setSelectedSubtitleCue(null);
    const selectedSubtitle = pairVideoDubbingQueueRows(
      [
        {
          id: currentJob.id,
          name: currentJob.fileName,
          size: currentJob.sizeBytes,
          job: currentJob,
        },
      ],
      subtitleFiles,
    )[0]?.subtitle;
    if (selectedSubtitle?.content && selectedSubtitle.analysis) {
      setSrt({
        fileName: selectedSubtitle.fileName,
        sizeBytes: selectedSubtitle.sizeBytes,
        content: selectedSubtitle.content,
        analysis: selectedSubtitle.analysis,
        error: selectedSubtitle.error,
      });
      setSrtContent(selectedSubtitle.content);
    } else if (project?.activeJobId === currentJob.id && project.srt) {
      const analysis = analyzeSrtContent(project.srt.content);
      setSrt({
        fileName: project.srt.fileName,
        sizeBytes: new Blob([project.srt.content]).size,
        content: project.srt.content,
        analysis,
      });
      setSrtContent(project.srt.content);
    } else {
      setSrt(null);
      setSrtContent("");
    }
    const latestProject = importProjectRef.current || project;
    if (
      latestProject?.jobIds.includes(currentJob.id) &&
      latestProject.activeJobId !== currentJob.id
    ) {
      try {
        const response = await fetch(
          `/api/video-dubbing/projects/${latestProject.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ activeJobId: currentJob.id }),
          },
        );
        const result = await response.json();
        if (!response.ok || !result.project)
          throw new Error(
            result.error || "Không thể lưu video preview hiện tại.",
          );
        const savedProject = result.project;
        setActiveProject(savedProject);
        importProjectRef.current = savedProject;
        setProjects((items) =>
          items.map((entry) =>
            entry.id === savedProject.id ? savedProject : entry,
          ),
        );
      } catch (error) {
        setProjectError(
          error instanceof Error
            ? error.message
            : "Không thể lưu video preview hiện tại.",
        );
      }
    }
    return currentJob;
  };
  const deleteHistoryJob = async (item) => {
    if (
      !window.confirm(
        `Xóa job "${item.job.fileName}" và toàn bộ file đầu ra của job này?`,
      )
    ) {
      return;
    }
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${item.job.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể xóa job Video Dubbing.");
      }
      forgetCharacterCardCues(item.job.id);
      setJobHistory((current) =>
        current.filter((entry) => entry.job.id !== item.job.id),
      );
      if (activeJobIdRef.current === item.job.id) {
        activeJobIdRef.current = null;
        setVideo(null);
      }
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Không thể xóa job Video Dubbing.",
      );
    }
  };
  useEffect(() => {
    let active = true;
    void (async () => {
      const savedProjects = await loadProjects();
      if (!active) return;
      const configuredDefaultId = window.localStorage.getItem(
        "video-dubbing-default-project",
      );
      const defaultProject = savedProjects.find(
        (item) => item.id === configuredDefaultId,
      );
      if (defaultProject) {
        setDefaultProjectId(defaultProject.id);
        await openProject(defaultProject);
      } else {
        window.localStorage.removeItem("video-dubbing-default-project");
        setDefaultProjectId(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeProject?.id]);
  const setDefaultProject = (project) => {
    if (project)
      window.localStorage.setItem("video-dubbing-default-project", project.id);
    else window.localStorage.removeItem("video-dubbing-default-project");
    setDefaultProjectId(project?.id ?? null);
  };
  const projectWorkspaceSnapshot = JSON.stringify(makeProjectWorkspace());
  useEffect(() => {
    const videoId = characterCardCueVideoIdRef.current;
    if (!videoId) return;
    const cues = textOverlays.filter((cue) => cue.kind === "character-card");
    setCharacterCardCuesByVideoId((current) => {
      if (JSON.stringify(current[videoId] ?? []) === JSON.stringify(cues)) {
        return current;
      }
      return { ...current, [videoId]: cues };
    });
  }, [textOverlays]);
  useEffect(() => {
    if (!activeProject || !projectReady) return;
    const projectId = activeProject.id;
    const requestId = ++projectSaveRequestRef.current;
    setProjectSaveState("saving");
    const timer = window.setTimeout(() => {
      void fetch(`/api/video-dubbing/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          srt: srtContent
            ? {
                fileName: srt?.fileName || "subtitles.srt",
                content: srtContent,
              }
            : null,
          workspace: JSON.parse(projectWorkspaceSnapshot),
        }),
      })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok || !result.project)
            throw new Error(result.error || "Không thể tự lưu project.");
          if (requestId !== projectSaveRequestRef.current) return;
          setActiveProject(result.project);
          setProjects((items) => [
            result.project,
            ...items.filter((item) => item.id !== result.project.id),
          ]);
          setProjectSaveState("saved");
        })
        .catch((error) => {
          if (requestId !== projectSaveRequestRef.current) return;
          setProjectSaveState("error");
          setProjectError(
            error instanceof Error
              ? error.message
              : "Không thể tự lưu project.",
          );
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    activeProject?.id,
    projectReady,
    projectWorkspaceSnapshot,
    srtContent,
    srt?.fileName,
    video?.job?.id,
  ]);
  useEffect(() => {
    let active = true;
    const loadVoices = async () => {
      try {
        const response = await fetch("/api/voices");
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.voices)) {
          throw new Error(result.error || "Không thể tải danh sách giọng.");
        }
        const availableVoices = getAvailableVideoDubbingVoices(result.voices);
        if (!active) return;
        setVoices(availableVoices);
        const defaultVoice = availableVoices.find(
          (voice) => voice.modelId === result.defaultModel,
        );
        if (typeof activeProject?.workspace?.selectedVoiceId !== "string") {
          setSelectedVoiceId(defaultVoice?.id || availableVoices[0]?.id || "");
        }
        if (availableVoices.length === 0) {
          setVoicesError("Không tìm thấy mô hình giọng đọc khả dụng trên máy.");
        }
      } catch (error) {
        if (!active) return;
        setVoicesError(
          error instanceof Error
            ? error.message
            : "Không thể tải danh sách giọng.",
        );
      }
    };
    void loadVoices();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const loadSeparationAvailability = async () => {
      try {
        const response = await fetch("/api/video-dubbing/separation/status");
        const result = await response.json();
        if (!response.ok) {
          throw new Error("Không thể kiểm tra công cụ tách audio.");
        }
        if (active) setSeparationAvailability(result);
      } catch {
        if (active) {
          setSeparationAvailability({
            status: "unavailable",
            model: "htdemucs",
            message: "Không thể kiểm tra trạng thái Demucs trên máy này.",
          });
        }
      }
    };
    void loadSeparationAvailability();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const jobId = video?.job?.id;
    const status = video?.job?.status;
    const masterStatus = video?.job?.masterGeneration?.status;
    if (
      video?.error ||
      !jobId ||
      (status !== "uploading" &&
        status !== "probing" &&
        masterStatus !== "generating" &&
        video?.job?.autoPipeline?.status !== "running" &&
        video?.job?.audioMix?.status !== "running" &&
        video?.job?.finalMix?.status !== "running" &&
        video?.job?.videoExport?.status !== "running" &&
        video?.job?.separation?.status !== "processing")
    ) {
      return;
    }
    let active = true;
    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/video-dubbing/jobs/${jobId}`);
        const result = await response.json();
        if (!response.ok || !result.job || !active) return;
        const job = result.job;
        setVideo((current) =>
          current?.job?.id === jobId ? { ...current, job } : current,
        );
        setVideoFiles((current) =>
          current.map((item) =>
            item.job?.id === jobId ? { ...item, job } : item,
          ),
        );
        setJobHistory((current) =>
          current.map((item) =>
            item.job.id === jobId ? { ...item, job } : item,
          ),
        );
      } catch (error) {
        console.error("Không thể cập nhật trạng thái kiểm tra video:", error);
      }
    };
    void pollStatus();
    const interval = window.setInterval(() => void pollStatus(), 500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [
    video?.error,
    video?.job?.id,
    video?.job?.audioMix?.status,
    video?.job?.finalMix?.status,
    video?.job?.masterGeneration?.status,
    video?.job?.autoPipeline?.status,
    video?.job?.separation?.status,
    video?.job?.status,
    video?.job?.videoExport?.status,
  ]);
  const localMixerSettingsKey = JSON.stringify(mixerSettings);
  const mixerSettingsRef = useRef(mixerSettings);
  mixerSettingsRef.current = mixerSettings;
  useEffect(() => {
    releasePreviewGraph();
    setPreviewError(null);
    setMixerError(null);
    setVideoPreviewReady(false);
    mixerTouchedRef.current = false;
  }, [video?.job?.id]);
  useEffect(() => {
    releasePreviewGraph();
  }, [
    video?.job?.masterGeneration?.sizeBytes,
    video?.job?.separation?.vocalsSizeBytes,
    video?.job?.separation?.instrumentalSizeBytes,
  ]);
  useEffect(() => {
    const currentJob = video?.job;
    if (mixerTouchedRef.current) return;
    if (
      activeProject &&
      (!currentJob || !activeProject.jobIds.includes(currentJob.id))
    ) {
      return;
    }
    const projectSettings = activeProject?.workspace?.mixerSettings;
    const savedSettings =
      currentJob?.mixerSettings ||
      currentJob?.autoPipeline?.config?.mixerSettings ||
      (projectSettings &&
      typeof projectSettings === "object" &&
      !Array.isArray(projectSettings)
        ? projectSettings
        : undefined);
    setMixerSettings(savedSettings || DEFAULT_MIXER_SETTINGS);
    setMixerSettingsSaved(Boolean(savedSettings));
  }, [activeProject?.id, video?.job?.id]);
  useEffect(() => {
    if (
      activeProject &&
      (!video?.job?.id || activeProject.jobIds.includes(video.job.id))
    ) {
      return;
    }
    const settings = video?.job?.overlaySettings;
    characterCardCueVideoIdRef.current = video?.job?.id ?? null;
    setTextTracks([DEFAULT_TEXT_TRACK]);
    setActiveTextTrackId(DEFAULT_TEXT_TRACK_ID);
    setTextOverlays(
      (settings?.textOverlays ?? []).map((cue) => ({
        ...cue,
        trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
      })),
    );
    setExportQuality(settings?.exportQuality ?? "high");
    setSelectedTextOverlay(null);
    setLogoEnabled(settings?.logoEnabled ?? false);
    setLogoWidthPercent(settings?.logoWidthPercent ?? 15);
    setLogoPaddingPx(settings?.logoPaddingPx ?? 24);
    setLogoPosition(settings?.logoPosition ?? "top-left");
    setSubtitlesEnabled(settings?.subtitlesEnabled ?? false);
    setSubtitleFontSize(settings?.subtitleFontSize ?? 32);
    setSubtitleFontFamily(settings?.subtitleFontFamily ?? "Arial");
    setSubtitleColor(settings?.subtitleColor ?? "#ffffff");
    setSubtitleBackgroundColor(settings?.subtitleBackgroundColor ?? "#000000");
    setSubtitleBackgroundTransparent(
      settings?.subtitleBackgroundTransparent ?? false,
    );
    setSubtitleBackgroundMode(
      settings?.subtitleBackgroundMode ??
        (settings?.subtitleBackgroundImage
          ? "image"
          : settings?.subtitleBackgroundTransparent
            ? "none"
            : "color"),
    );
    setSubtitleBold(settings?.subtitleBold ?? false);
    setSubtitleItalic(settings?.subtitleItalic ?? false);
    setSubtitleUnderline(settings?.subtitleUnderline ?? false);
    setSubtitleTextCase(settings?.subtitleTextCase ?? "none");
    setSubtitleOutlineEnabled(settings?.subtitleOutlineEnabled ?? false);
    setSubtitleOutlineColor(settings?.subtitleOutlineColor ?? "#000000");
    setSubtitleOutlineWidthPx(settings?.subtitleOutlineWidthPx ?? 2);
    setSubtitleCharacterSpacingPx(settings?.subtitleCharacterSpacingPx ?? 0);
    setSubtitleLineSpacingPx(settings?.subtitleLineSpacingPx ?? 0);
    setSubtitlePaddingPx(settings?.subtitlePaddingPx ?? 8);
    setSubtitlePosition(settings?.subtitlePosition ?? "bottom-center");
    {
      const savedBackgroundImage = settings?.subtitleBackgroundImage ?? null;
      const normalizedBackgroundImage =
        typeof savedBackgroundImage === "string"
          ? savedBackgroundImage
              .replace(/\.(png|webp)$/i, "")
              .replace(/-(left|center|right)$/, "")
              .replace(/[^a-zA-Z0-9_-]/g, "") || null
          : null;
      setSubtitleBackgroundImage(
        (current) => normalizedBackgroundImage ?? current,
      );
    }
  }, [video?.job?.id, activeProject?.id]);
  // The subtitle margin is per-video even while the rest of the preview settings
  // may be hydrated from a shared project workspace. Prefer the project value
  // when present so project reload cannot reset the synchronized margin.
  useEffect(() => {
    const projectMargin = activeProject?.workspace?.subtitleMarginPx;
    if (typeof projectMargin === "number") {
      setSubtitleMarginPx(projectMargin);
      return;
    }
    setSubtitleMarginPx(video?.job?.overlaySettings?.subtitleMarginPx ?? 32);
  }, [
    video?.job?.id,
    activeProject?.id,
    activeProject?.workspace?.subtitleMarginPx,
  ]);
  useEffect(() => {
    void fetch("/api/video-dubbing/subtitle-backgrounds")
      .then((response) => response.json())
      .then((result) => {
        setSubtitleBackgrounds(result.backgrounds ?? []);
        setSubtitleBackgroundImage((current) =>
          current && result.backgrounds?.includes(current)
            ? current
            : (result.backgrounds?.[0] ?? null),
        );
      })
      .catch(() => setSubtitleBackgrounds([]));
  }, []);
  useEffect(() => {
    void fetch("/api/video-dubbing/fonts")
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải danh sách font.");
        return response.json();
      })
      .then(async (catalog) => {
        const faces = catalog.faces ?? [];
        await Promise.all(
          faces.map(async (face) => {
            try {
              const font = new FontFace(face.family, `url("${face.url}")`, {
                weight: String(face.weight),
                style: face.style,
              });
              await font.load();
              document.fonts.add(font);
            } catch (error) {
              console.warn(
                `[VideoDubbing] Không thể tải font ${face.family}:`,
                error,
              );
            }
          }),
        );
        setSubtitleFontOptions(
          catalog.families?.length ? catalog.families : SUBTITLE_FONT_OPTIONS,
        );
      })
      .catch((error) => {
        console.warn(
          "[VideoDubbing] Không thể đọc thư mục assets/fonts:",
          error,
        );
        setSubtitleFontOptions(SUBTITLE_FONT_OPTIONS);
      });
  }, []);
  useEffect(() => {
    const job = video?.job;
    if (!job || queueRunning || autoPipelineConfigJobRef.current === job.id) {
      return;
    }
    autoPipelineConfigJobRef.current = job.id;
    setAutoPipelineExpanded(true);
    setMasterPanelExpanded(false);
    setSeparationPanelExpanded(false);
    setMixerPanelExpanded(true);
    const config = job.autoPipeline?.config;
    autoPipelineSavedConfigKeyRef.current = config
      ? JSON.stringify({ ...config, mixerSettings: undefined })
      : null;
    const workspace = activeProject?.workspace;
    const hasProjectPipelineSettings = Boolean(
      workspace &&
      [
        "selectedVoiceId",
        "minSpeed",
        "maxSpeed",
        "speedPriority",
        "autoPipelineTtsMasterEnabled",
        "autoPipelineDemucsEnabled",
        "originalAudioVolumePercent",
        "mixerSettings",
      ].some((key) => Object.prototype.hasOwnProperty.call(workspace, key)),
    );
    if (hasProjectPipelineSettings) return;
    if (!config) {
      setAutoPipelineTtsMasterEnabled(true);
      setAutoPipelineDemucsEnabled(false);
      setOriginalAudioVolumePercent(100);
      setMixerSettings(DEFAULT_MIXER_SETTINGS);
      setSpeedPriority("balanced");
      setMinSpeed(0.8);
      setMaxSpeed(1.5);
      return;
    }
    setAutoPipelineTtsMasterEnabled(config.ttsMasterEnabled !== false);
    setAutoPipelineDemucsEnabled(config.demucsEnabled);
    setOriginalAudioVolumePercent(config.originalAudioVolumePercent);
    setMixerSettings(config.mixerSettings);
    setMixerSettingsSaved(true);
    setSpeedPriority(config.master.options.speedPriority);
    setMinSpeed(config.master.options.minSpeed);
    setMaxSpeed(config.master.options.maxSpeed);
    setSrt({
      fileName: "Phụ đề từ cấu hình Auto Pipeline",
      sizeBytes: 0,
      analysis: {
        subtitleCount: config.master.items.length,
        earliestStart: Math.min(
          ...config.master.items.map((item) => item.startTime),
        ),
        latestEnd: Math.max(...config.master.items.map((item) => item.endTime)),
        invalidBlockCount: 0,
        items: config.master.items,
      },
    });
    setSubtitlesEnabled(true);
  }, [
    video?.job?.id,
    video?.job?.autoPipeline?.config,
    queueRunning,
    activeProject?.id,
  ]);
  useEffect(() => {
    if (
      activeProject?.workspace &&
      typeof activeProject.workspace.selectedVoiceId === "string"
    )
      return;
    const savedModel = video?.job?.autoPipeline?.config?.master;
    if (!savedModel) return;
    const voice = voices.find(
      (candidate) =>
        candidate.modelId === savedModel.model &&
        candidate.speakerId === savedModel.speakerId,
    );
    if (voice) setSelectedVoiceId(voice.id);
  }, [
    video?.job?.id,
    video?.job?.autoPipeline?.config?.master,
    voices,
    activeProject?.id,
  ]);
  useEffect(() => {
    const job = video?.job;
    if (!job || job.status !== "completed" || !mixerTouchedRef.current) return;
    const version = ++mixerSettingsRequestRef.current;
    if (mixerSettingsTimerRef.current !== null) {
      window.clearTimeout(mixerSettingsTimerRef.current);
    }
    mixerSettingsTimerRef.current = window.setTimeout(() => {
      mixerSaveChainRef.current = mixerSaveChainRef.current.then(async () => {
        if (version !== mixerSettingsRequestRef.current) return;
        try {
          const response = await fetch(
            `/api/video-dubbing/jobs/${job.id}/mixer-settings`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: localMixerSettingsKey,
            },
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Không thể lưu mixer settings.");
          }
          if (version === mixerSettingsRequestRef.current) {
            mixerTouchedRef.current = false;
            setMixerSettingsSaved(true);
            setMixerError(null);
            if (result.job) {
              setVideo((current) =>
                current?.job?.id === job.id
                  ? { ...current, job: result.job }
                  : current,
              );
              setVideoFiles((current) =>
                current.map((item) =>
                  item.job?.id === job.id ? { ...item, job: result.job } : item,
                ),
              );
              setJobHistory((current) =>
                current.map((item) =>
                  item.job.id === job.id ? { ...item, job: result.job } : item,
                ),
              );
            }
          }
        } catch (error) {
          if (version === mixerSettingsRequestRef.current) {
            setMixerSettingsSaved(false);
            setMixerError(
              error instanceof Error
                ? error.message
                : "Không thể lưu mixer settings.",
            );
          }
        }
      });
    }, 350);
    return () => {
      if (mixerSettingsTimerRef.current !== null) {
        window.clearTimeout(mixerSettingsTimerRef.current);
        mixerSettingsTimerRef.current = null;
      }
    };
  }, [video?.job?.id, video?.job?.status, localMixerSettingsKey]);
  useEffect(() => {
    const context = audioContextRef.current;
    if (!context) return;
    for (const [track, node] of previewNodesRef.current) {
      const setting = mixerSettings[track];
      node.gain.gain.setTargetAtTime(
        setting.muted ? 0 : setting.volumePercent / 100,
        context.currentTime,
        0.015,
      );
    }
  }, [localMixerSettingsKey]);
  useEffect(
    () => () => {
      releasePreviewGraph(false);
      if (mixerSettingsTimerRef.current !== null) {
        window.clearTimeout(mixerSettingsTimerRef.current);
      }
    },
    [],
  );
  useEffect(() => {
    const job = video?.job;
    if (!job) return;
    setJobHistory((current) =>
      current.map((item) =>
        item.job.id === job.id
          ? {
              ...item,
              job,
              outputs: {
                ...item.outputs,
                sourceVideo:
                  job.status === "completed" && Boolean(job.metadata),
                masterAudio:
                  job.masterGeneration?.status === "completed" ||
                  item.outputs.masterAudio,
                vocals:
                  Boolean(job.separation?.vocalsSizeBytes) ||
                  item.outputs.vocals,
                instrumental:
                  Boolean(job.separation?.instrumentalSizeBytes) ||
                  item.outputs.instrumental,
                mixedAudio:
                  job.audioMix?.status === "completed" ||
                  item.outputs.mixedAudio,
                exportedVideo:
                  job.videoExport?.status === "completed" ||
                  item.outputs.exportedVideo,
                finalMix:
                  job.finalMix?.status === "completed" || item.outputs.finalMix,
              },
            }
          : item,
      ),
    );
  }, [video?.job]);
  const removeServerJob = async (jobId) => {
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${jobId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Máy chủ trả về HTTP ${response.status}.`);
      }
    } catch (error) {
      console.error("Không thể dọn dữ liệu job Video Dubbing:", error);
    }
  };
  const clearVideo = () => {
    videoGenerationRef.current++;
    activeJobIdRef.current = null;
    characterCardCueVideoIdRef.current = null;
    if (uploadRef.current) {
      uploadRef.current.abort();
      uploadRef.current = null;
    }
    setVideo(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };
  const uploadVideo = async (file) => {
    const generation = ++videoGenerationRef.current;
    setVideo({
      fileName: file.name,
      sizeBytes: file.size,
      progress: 0,
      job: null,
    });
    try {
      const createResponse = await fetch("/api/video-dubbing/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          sizeBytes: file.size,
          projectId: activeProject?.id,
        }),
      });
      const createResult = await createResponse.json();
      if (!createResponse.ok || !createResult.job) {
        throw new Error(createResult.error || "Không thể khởi tạo job video.");
      }
      const job = createResult.job;
      if (generation !== videoGenerationRef.current) {
        await removeServerJob(job.id);
        return;
      }
      const currentProject = importProjectRef.current || activeProject;
      const projectCharacterCardCuesByVideoId =
        currentProject?.workspace?.characterCardCuesByVideoId;
      const savedCharacterCards = Object.prototype.hasOwnProperty.call(
        characterCardCuesByVideoId,
        job.id,
      )
        ? characterCardCuesByVideoId[job.id]
        : (projectCharacterCardCuesByVideoId?.[job.id] ??
          (job.overlaySettings?.textOverlays ?? []).filter(
            (cue) => cue.kind === "character-card",
          ));
      characterCardCueVideoIdRef.current = job.id;
      setTextOverlays((current) => [
        ...current.filter((cue) => cue.kind !== "character-card"),
        ...savedCharacterCards.map((cue) => ({
          ...cue,
          trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
        })),
      ]);
      activeJobIdRef.current = job.id;
      setVideo((current) =>
        current?.fileName === file.name ? { ...current, job } : current,
      );
      const request = new XMLHttpRequest();
      uploadRef.current = request;
      request.open("PUT", `/api/video-dubbing/jobs/${job.id}/video`);
      request.setRequestHeader("Content-Type", "application/octet-stream");
      request.upload.onprogress = (event) => {
        if (
          !event.lengthComputable ||
          generation !== videoGenerationRef.current
        ) {
          return;
        }
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                progress: Math.min(100, (event.loaded / event.total) * 100),
              }
            : current,
        );
      };
      request.upload.onload = () => {
        if (generation !== videoGenerationRef.current) return;
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                progress: 100,
                job: { ...current.job, status: "probing" },
              }
            : current,
        );
      };
      request.onload = () => {
        if (generation !== videoGenerationRef.current) return;
        uploadRef.current = null;
        try {
          const result = JSON.parse(request.responseText);
          if (!request.status || request.status >= 400) {
            setVideo((current) =>
              current?.job?.id === job.id
                ? {
                    ...current,
                    job: result.job || current.job,
                    error: result.error || "Không thể kiểm tra video.",
                  }
                : current,
            );
            return;
          }
          setVideo((current) =>
            current?.job?.id === job.id
              ? { ...current, job: result.job, progress: 100 }
              : current,
          );
          void loadJobHistory();
        } catch {
          setVideo((current) =>
            current?.job?.id === job.id
              ? { ...current, error: "Máy chủ trả về phản hồi không hợp lệ." }
              : current,
          );
        }
      };
      request.onerror = () => {
        if (generation !== videoGenerationRef.current) return;
        uploadRef.current = null;
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                error: "Kết nối bị gián đoạn khi tải hoặc kiểm tra video.",
              }
            : current,
        );
      };
      request.onabort = () => {
        if (uploadRef.current === request) uploadRef.current = null;
      };
      request.send(file);
    } catch (error) {
      if (generation !== videoGenerationRef.current) return;
      const message =
        error instanceof Error ? error.message : "Không thể tải video lên.";
      setVideo((current) =>
        current?.fileName === file.name
          ? { ...current, error: message }
          : current,
      );
    }
  };
  const handleVideoFile = (file) => {
    if (!file) return;
    if (characterCardReferenceScanJob?.status === "running") {
      setCharacterCardReferenceError(
        "Hãy hủy lần quét hiện tại trước khi thay ảnh mẫu.",
      );
      return;
    }
    const generation = ++videoGenerationRef.current;
    const previousJobId = activeJobIdRef.current;
    const previousJobStatus = video?.job?.status;
    activeJobIdRef.current = null;
    uploadRef.current?.abort();
    uploadRef.current = null;
    if (
      previousJobId &&
      (previousJobStatus === "uploading" || previousJobStatus === "probing")
    ) {
      void fetch(`/api/video-dubbing/jobs/${previousJobId}/cancel`, {
        method: "POST",
      });
    }
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_VIDEO_EXTENSIONS.has(extension)) {
      setVideo({
        fileName: file.name,
        sizeBytes: file.size,
        progress: 0,
        job: null,
        error:
          "Định dạng video không được hỗ trợ. Hãy chọn MP4, MKV, MOV, AVI hoặc WebM.",
      });
      return;
    }
    void (async () => {
      if (generation === videoGenerationRef.current) {
        await uploadVideo(file);
      }
    })();
  };
  const handleVideoChange = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0 || queueRunning) return;
    void importQueueVideos(files);
  };
  const ensureImportProject = async (suggestedName) => {
    if (importProjectRef.current) return importProjectRef.current;
    if (activeProject) {
      importProjectRef.current = activeProject;
      return activeProject;
    }
    if (importProjectPromiseRef.current) return importProjectPromiseRef.current;
    const creation = (async () => {
      const response = await fetch("/api/video-dubbing/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:
            suggestedName.replace(/\.[^.]+$/, "").slice(0, 120) ||
            "Project mới",
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.project)
        throw new Error(result.error || "Không thể tạo project để lưu nguồn.");
      const created = result.project;
      setActiveProject(created);
      importProjectRef.current = created;
      setProjects((items) => [
        created,
        ...items.filter((item) => item.id !== created.id),
      ]);
      setProjectReady(true);
      setProjectSaveState("saved");
      return created;
    })();
    importProjectPromiseRef.current = creation;
    try {
      return await creation;
    } finally {
      if (importProjectPromiseRef.current === creation)
        importProjectPromiseRef.current = null;
    }
  };
  const attachJobToProject = async (project, jobId) => {
    const latestProject =
      importProjectRef.current?.id === project.id
        ? importProjectRef.current
        : project;
    const jobIds = [...new Set([...latestProject.jobIds, jobId])];
    const response = await fetch(
      `/api/video-dubbing/projects/${latestProject.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobIds,
          activeJobId: latestProject.activeJobId || jobId,
        }),
      },
    );
    const result = await response.json();
    if (!response.ok || !result.project)
      throw new Error(result.error || "Không thể liên kết video với project.");
    const saved = result.project;
    setActiveProject(saved);
    importProjectRef.current = saved;
    setProjects((items) => [
      saved,
      ...items.filter((item) => item.id !== saved.id),
    ]);
    return saved;
  };
  const importQueueVideos = async (files) => {
    if (queueRunning) return;
    for (const file of files) {
      const entry = {
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        file,
        uploading: true,
      };
      setVideoFiles((current) => [...current, entry]);
      const extension = file.name
        .slice(file.name.lastIndexOf("."))
        .toLowerCase();
      if (!ACCEPTED_VIDEO_EXTENSIONS.has(extension)) {
        setVideoFiles((current) =>
          current.map((item) =>
            item.id === entry.id
              ? { ...item, error: "Định dạng video không hỗ trợ." }
              : item,
          ),
        );
        continue;
      }
      try {
        const project = await ensureImportProject(file.name);
        const createResponse = await fetch("/api/video-dubbing/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            sizeBytes: file.size,
            projectId: project.id,
          }),
        });
        const createdResult = await createResponse.json();
        if (!createResponse.ok || !createdResult.job)
          throw new Error(
            createdResult.error || "Không thể khởi tạo vùng lưu video.",
          );
        let savedProject = await attachJobToProject(
          project,
          createdResult.job.id,
        );
        const savedJob = await new Promise((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open(
            "PUT",
            `/api/video-dubbing/jobs/${createdResult.job.id}/video`,
          );
          request.setRequestHeader("Content-Type", "application/octet-stream");
          request.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const index = queueRows.findIndex(
              (row) => row.video?.id === entry.id,
            );
            if (index < 0) return;
            setQueueStates((current) => ({
              ...current,
              [index]: {
                status: "uploading",
                jobId: createdResult.job.id,
                phase: "Đang lưu video vào project",
                progressPercent: Math.min(
                  100,
                  (event.loaded / event.total) * 100,
                ),
              },
            }));
          };
          request.onload = () => {
            try {
              const payload = JSON.parse(request.responseText);
              if (request.status < 200 || request.status >= 300 || !payload.job)
                reject(
                  new Error(
                    payload.error || "Không thể xác minh video đã lưu.",
                  ),
                );
              else resolve(payload.job);
            } catch (error) {
              reject(
                error instanceof Error
                  ? error
                  : new Error("Phản hồi lưu video không hợp lệ."),
              );
            }
          };
          request.onerror = () =>
            reject(new Error("Mất kết nối khi lưu video vào project."));
          request.send(file);
        });
        setVideoFiles((current) =>
          current.map((item) =>
            item.id === entry.id
              ? { ...item, file: undefined, uploading: false, job: savedJob }
              : item,
          ),
        );
        const rowIndex = queueRows.findIndex(
          (row) => row.video?.id === entry.id,
        );
        if (rowIndex >= 0)
          setQueueStates((current) => ({
            ...current,
            [rowIndex]: {
              status: "queued",
              jobId: savedJob.id,
              phase: "Đã lưu nguồn trong project",
            },
          }));
        // Ensure the project remains current if another import completed while this upload was in flight.
        savedProject = {
          ...savedProject,
          jobIds: [...new Set([...savedProject.jobIds, savedJob.id])],
        };
        if (!activeJobIdRef.current && !video?.job) {
          const savedCharacterCards =
            characterCardCuesByVideoId[savedJob.id] ??
            (savedJob.overlaySettings?.textOverlays ?? []).filter(
              (cue) => cue.kind === "character-card",
            );
          activeJobIdRef.current = savedJob.id;
          characterCardCueVideoIdRef.current = savedJob.id;
          setTextOverlays((current) => [
            ...current.filter((cue) => cue.kind !== "character-card"),
            ...savedCharacterCards.map((cue) => ({
              ...cue,
              trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
            })),
          ]);
        }
        setVideo(
          (current) =>
            current || {
              fileName: savedJob.fileName,
              sizeBytes: savedJob.sizeBytes,
              progress: 100,
              job: savedJob,
            },
        );
        void loadJobHistory();
      } catch (error) {
        setVideoFiles((current) =>
          current.map((item) =>
            item.id === entry.id
              ? {
                  ...item,
                  uploading: false,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Không thể lưu video vào project.",
                }
              : item,
          ),
        );
      }
    }
  };
  const handleSrtFile = async (file) => {
    if (!file) return;
    const generation = ++srtGenerationRef.current;
    setSrt({ fileName: file.name, sizeBytes: file.size });
    if (!file.name.toLowerCase().endsWith(".srt")) {
      setSrt({
        fileName: file.name,
        sizeBytes: file.size,
        error: "Chỉ hỗ trợ tệp phụ đề .srt.",
      });
      return;
    }
    try {
      const content = await file.text();
      const analysis = analyzeSrtContent(content);
      if (generation !== srtGenerationRef.current) return;
      setSrt({ fileName: file.name, sizeBytes: file.size, content, analysis });
      setSrtContent(content);
      setSubtitlesEnabled(true);
    } catch (error) {
      if (generation !== srtGenerationRef.current) return;
      setSrt({
        fileName: file.name,
        sizeBytes: file.size,
        error:
          error instanceof Error
            ? error.message
            : "Không thể đọc nội dung tệp SRT.",
      });
    }
  };
  const openSrtBrowser = (videoId) => {
    subtitleBrowseTargetRef.current = videoId || null;
    srtInputRef.current?.click();
  };
  const fileStem = (fileName) =>
    (fileName.split(/[\\/]/).pop() || fileName)
      .replace(/\.[^.]+$/, "")
      .trim()
      .toLocaleLowerCase();
  const handleSrtFiles = async (files, targetVideoId, matchByName = false) => {
    if (files.length === 0 || queueRunning) return;
    const queued = files.map((file) => {
      const matchingVideos = videoFiles.filter(
        (item) => fileStem(item.name) === fileStem(file.name),
      );
      const matchedVideoId =
        targetVideoId ||
        (matchingVideos.length === 1
          ? matchingVideos[0].job?.id || matchingVideos[0].id
          : undefined);
      return {
        id: crypto.randomUUID(),
        file,
        fileName: file.name,
        sizeBytes: file.size,
        videoId: matchedVideoId,
        matchByName: matchByName || !matchedVideoId,
      };
    });
    setSubtitleFiles((current) =>
      replaceVideoDubbingSubtitleSources(current, queued, targetVideoId),
    );
    const sourceSrtsToSave = [];
    for (const entry of queued) {
      try {
        if (!entry.file.name.toLowerCase().endsWith(".srt")) {
          throw new Error("Chỉ hỗ trợ tệp phụ đề .srt.");
        }
        const content = await entry.file.text();
        const analysis = analyzeSrtContent(content);
        const sourceSrt = {
          id: entry.id,
          fileName: entry.fileName,
          content,
          ...(entry.videoId ? { videoId: entry.videoId } : {}),
          ...(entry.matchByName ? { matchByName: true } : {}),
        };
        sourceSrtsToSave.push(sourceSrt);
        setSubtitlesEnabled(true);
        setSubtitleFiles((current) =>
          replaceVideoDubbingSubtitleSources(
            current.filter((item) => item.id !== entry.id),
            [{ ...entry, analysis, content, file: undefined }],
          ),
        );
        const activeJob = activeJobIdRef.current;
        if (entry.videoId && entry.videoId === activeJob) {
          setSrt({
            fileName: entry.fileName,
            sizeBytes: entry.sizeBytes,
            content,
            analysis,
          });
          setSrtContent(content);
          setSubtitleCueOverridesByVideoId((current) => {
            const next = { ...current };
            delete next[entry.videoId];
            return next;
          });
          setSelectedSubtitleCue(null);
        } else {
          setSrt(
            (current) =>
              current || {
                fileName: entry.fileName,
                sizeBytes: entry.sizeBytes,
                content,
                analysis,
              },
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Không thể đọc nội dung tệp SRT.";
        setSubtitleFiles((current) =>
          current.map((item) =>
            item.id === entry.id ? { ...item, error: message } : item,
          ),
        );
      }
    }
    if (sourceSrtsToSave.length > 0) {
      try {
        const project = await ensureImportProject(sourceSrtsToSave[0].fileName);
        const replacementIds = new Set(sourceSrtsToSave.map((item) => item.id));
        const sourceSrts = [
          ...(project.sourceSrts || []).filter(
            (item) => !replacementIds.has(item.id),
          ),
          ...sourceSrtsToSave,
        ];
        const saveResponse = await fetch(
          `/api/video-dubbing/projects/${project.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceSrts }),
          },
        );
        const savedResult = await saveResponse.json();
        if (!saveResponse.ok || !savedResult.project) {
          throw new Error(
            savedResult.error || "Không thể lưu các SRT vào project.",
          );
        }
        const savedProject = savedResult.project;
        setActiveProject(savedProject);
        importProjectRef.current = savedProject;
        setProjects((items) => [
          savedProject,
          ...items.filter((item) => item.id !== savedProject.id),
        ]);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Không thể lưu các SRT vào project.";
        setSubtitleFiles((current) =>
          current.map((item) =>
            sourceSrtsToSave.some((source) => source.id === item.id)
              ? { ...item, error: message }
              : item,
          ),
        );
      }
    }
  };
  const handleQueueDrop = (event, targetVideoId) => {
    event.preventDefault();
    event.stopPropagation();
    if (queueRunning) return;
    const droppedFiles = Array.from(event.dataTransfer.files);
    const droppedVideos = droppedFiles.filter((file) =>
      ACCEPTED_VIDEO_EXTENSIONS.has(
        file.name.slice(file.name.lastIndexOf(".")).toLowerCase(),
      ),
    );
    const droppedSubtitles = droppedFiles.filter((file) =>
      file.name.toLowerCase().endsWith(".srt"),
    );
    if (droppedVideos.length > 0) {
      void importQueueVideos(droppedVideos);
    }
    if (droppedSubtitles.length > 0) {
      const droppedTogether =
        droppedVideos.length > 0 ||
        (!targetVideoId && droppedSubtitles.length > 0);
      void handleSrtFiles(
        droppedSubtitles,
        droppedTogether ? undefined : targetVideoId,
        droppedTogether,
      );
    }
  };
  const handleSrtChange = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const targetVideoId = subtitleBrowseTargetRef.current || undefined;
    subtitleBrowseTargetRef.current = null;
    await handleSrtFiles(files, targetVideoId);
  };
  const clearSrt = () => {
    srtGenerationRef.current++;
    subtitleBrowseTargetRef.current = null;
    setSrt(null);
    setSubtitlesEnabled(false);
    if (srtInputRef.current) srtInputRef.current.value = "";
  };
  const clearSelectedFiles = async () => {
    if (isBusy) {
      await cancelVideo();
    } else {
      clearVideo();
    }
    clearSrt();
    setVideoFiles([]);
    setSubtitleFiles([]);
    setQueueStates({});
    setFileDetailsOpen(false);
    setDetailRowIndex(null);
  };
  const removeQueuedSource = async (videoSource, subtitleSource) => {
    try {
      const currentProject = importProjectRef.current || activeProject;
      const isRemovingActivePreview = Boolean(
        videoSource?.job &&
        (activeJobIdRef.current === videoSource.job.id ||
          video?.job?.id === videoSource.job.id),
      );
      const remainingVideos = videoSource
        ? videoFiles.filter((item) => item.id !== videoSource.id)
        : videoFiles;
      const removedVideoIndex = videoSource
        ? videoFiles.findIndex((item) => item.id === videoSource.id)
        : -1;
      const replacementPreview = isRemovingActivePreview
        ? remainingVideos
            .slice(Math.max(0, removedVideoIndex))
            .find((item) => item.job?.status === "completed") ||
          remainingVideos
            .slice(0, Math.max(0, removedVideoIndex))
            .reverse()
            .find((item) => item.job?.status === "completed")
        : undefined;
      if (videoSource?.job && currentProject) {
        const response = await fetch(
          `/api/video-dubbing/jobs/${videoSource.job.id}`,
          { method: "DELETE" },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Không thể xóa video nguồn đã lưu.");
        forgetCharacterCardCues(videoSource.job.id);
        const jobIds = currentProject.jobIds.filter(
          (id) => id !== videoSource.job.id,
        );
        const activeJobId = isRemovingActivePreview
          ? replacementPreview?.job?.id || null
          : currentProject.activeJobId === videoSource.job.id
            ? jobIds[0] || null
            : currentProject.activeJobId || null;
        const saveResponse = await fetch(
          `/api/video-dubbing/projects/${currentProject.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobIds, activeJobId }),
          },
        );
        const saved = await saveResponse.json();
        if (!saveResponse.ok || !saved.project)
          throw new Error(
            saved.error || "Không thể cập nhật project sau khi xóa video.",
          );
        setActiveProject(saved.project);
        importProjectRef.current = saved.project;
        setProjects((items) => [
          saved.project,
          ...items.filter((item) => item.id !== saved.project.id),
        ]);
        setJobHistory((items) =>
          items.filter((item) => item.job.id !== videoSource.job.id),
        );
        if (isRemovingActivePreview) {
          if (replacementPreview?.job) {
            await previewSourceVideo(replacementPreview.job);
          } else {
            activeJobIdRef.current = null;
            setVideo(null);
          }
        }
      }
      const latestProject = importProjectRef.current || currentProject;
      if (subtitleSource && latestProject) {
        const sourceSrts = (latestProject.sourceSrts || []).filter(
          (item) => item.id !== subtitleSource.id,
        );
        const response = await fetch(
          `/api/video-dubbing/projects/${latestProject.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceSrts,
              ...(subtitleSource.id.startsWith("legacy-") ? { srt: null } : {}),
            }),
          },
        );
        const saved = await response.json();
        if (!response.ok || !saved.project)
          throw new Error(saved.error || "Không thể xóa SRT khỏi project.");
        setActiveProject(saved.project);
        importProjectRef.current = saved.project;
      }
      if (videoSource)
        setVideoFiles((current) =>
          current.filter((item) => item.id !== videoSource.id),
        );
      if (subtitleSource)
        setSubtitleFiles((current) =>
          current.filter((item) => item.id !== subtitleSource.id),
        );
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "Không thể xóa tệp nguồn.",
      );
    }
  };
  const cancelVideo = async () => {
    const jobId = activeJobIdRef.current;
    videoGenerationRef.current++;
    activeJobIdRef.current = null;
    uploadRef.current?.abort();
    uploadRef.current = null;
    if (jobId) {
      try {
        const response = await fetch(
          `/api/video-dubbing/jobs/${jobId}/cancel`,
          { method: "POST" },
        );
        const result = await response.json();
        if (result.job) {
          setVideo((current) =>
            current?.job?.id === jobId
              ? { ...current, job: result.job, error: undefined }
              : current,
          );
          return;
        }
      } catch (error) {
        console.error("Không thể hủy job Video Dubbing:", error);
      }
    }
    setVideo((current) =>
      current
        ? { ...current, error: "Đã hủy quá trình tải/kiểm tra." }
        : current,
    );
  };
  const job = video?.job || null;
  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId);
  useEffect(() => {
    if (!previewTrackKeyRef.current?.includes("ttsMaster:")) return;
    releasePreviewGraph(false);
    setPreviewStatus("paused");
  }, [
    job?.id,
    job?.masterEdit?.updatedAt,
    job?.masterGeneration?.audioVersion,
    job?.masterGeneration?.sizeBytes,
  ]);
  const masterGeneration = job?.masterGeneration;
  const isMasterGenerating = masterGeneration?.status === "generating";
  const audioMix = job?.audioMix;
  const finalMix = job?.finalMix;
  const videoExport = job?.videoExport;
  const separation = job?.separation;
  const autoPipeline = job?.autoPipeline;
  const isAutoPipelineRunning = autoPipeline?.status === "running";
  const isSeparationProcessing = separation?.status === "processing";
  const autoPipelineProgress =
    autoPipeline?.phase === "separation" && isSeparationProcessing
      ? separation?.progressPercent
      : autoPipeline?.progressPercent;
  const separationElapsedSeconds =
    isSeparationProcessing && separation?.startedAtMs
      ? Math.max(0, (exportClockNow - separation.startedAtMs) / 1000)
      : separation?.elapsedSeconds;
  const separationHeartbeatFresh = Boolean(
    isSeparationProcessing &&
    separation?.heartbeatAtMs &&
    exportClockNow - separation.heartbeatAtMs < 15_000,
  );
  const separationPhaseLabel =
    separation?.phase === "loading_model"
      ? "nạp model"
      : separation?.phase === "extracting"
        ? "trích audio"
        : separation?.phase === "writing_outputs"
          ? "ghi track"
          : separation?.phase === "validating"
            ? "xác minh track"
            : separation?.phase === "checking"
              ? "kiểm tra môi trường"
              : "inference";
  const separationBackendLabel =
    separationAvailability?.backend === "mdx"
      ? `MDX · ${separationAvailability.device === "directml" ? "DirectML" : separationAvailability.device || "thiết bị chưa rõ"}`
      : separationAvailability?.backend === "demucs"
        ? `Demucs · ${separationAvailability.device || "CPU"}`
        : "đang xác định backend";
  const hasFinalMix = Boolean(finalMix?.sizeBytes && finalMix.sizeBytes > 44);
  const hasExportedVideo = Boolean(
    videoExport?.sizeBytes && videoExport.sizeBytes > 0,
  );
  useEffect(() => {
    if (
      videoExport?.status !== "running" &&
      !isSeparationProcessing &&
      !isAutoPipelineRunning
    )
      return;
    const interval = window.setInterval(
      () => setExportClockNow(Date.now()),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [videoExport?.status, isSeparationProcessing, isAutoPipelineRunning]);
  const isMediaProcessing =
    audioMix?.status === "running" ||
    finalMix?.status === "running" ||
    videoExport?.status === "running" ||
    isSeparationProcessing ||
    isAutoPipelineRunning;
  const hasMasterAudio = Boolean(
    masterGeneration?.durationSeconds !== undefined &&
    masterGeneration.sizeBytes !== undefined,
  );
  const isFinalMixCurrent = Boolean(
    finalMix &&
    finalMix.status !== "stale" &&
    finalMix.status !== "idle" &&
    finalMix.sizeBytes &&
    JSON.stringify(finalMix.renderedSettings) === localMixerSettingsKey,
  );
  const mixerTrackAvailability = {
    vocals: Boolean(separation?.vocalsSizeBytes),
    instrumental: Boolean(separation?.instrumentalSizeBytes),
    ttsMaster: hasMasterAudio,
  };
  const hasPreviewTrack = Object.entries(mixerTrackAvailability).some(
    ([track, available]) =>
      available &&
      !mixerSettings[track].muted &&
      mixerSettings[track].volumePercent > 0,
  );
  const canRenderFinalMix = Boolean(
    job?.status === "completed" &&
    (hasPreviewTrack || Boolean(job.metadata?.audioCodec)) &&
    !isMasterGenerating &&
    !isMediaProcessing,
  );
  const canStartSeparation = Boolean(
    job?.status === "completed" &&
    !isSeparationProcessing &&
    separationAvailability?.status === "ready" &&
    Boolean(job.metadata?.audioCodec) &&
    !isMasterGenerating &&
    !isMediaProcessing,
  );
  const currentTtsSubtitleItems = resolveVideoDubbingTtsItems(
    job?.id,
    subtitleCueOverridesByVideoId,
    srt?.analysis?.items ?? [],
  );
  const selectedSubtitleCueTtsItem =
    selectedSubtitleCue === null
      ? undefined
      : currentTtsSubtitleItems[selectedSubtitleCue];
  const canGenerateMaster = Boolean(
    job?.status === "completed" &&
    currentTtsSubtitleItems.length &&
    selectedVoice &&
    !isMasterGenerating &&
    !isMediaProcessing,
  );
  const autoPipelineConfig = useMemo(
    () =>
      !autoPipelineTtsMasterEnabled ||
      (currentTtsSubtitleItems.length > 0 && Boolean(selectedVoice))
        ? {
            enabled: autoPipelineEnabled,
            master: {
              items: currentTtsSubtitleItems,
              model:
                selectedVoice?.modelId ||
                job?.autoPipeline?.config?.master.model ||
                "",
              speakerId: selectedVoice?.speakerId,
              options: { minSpeed, maxSpeed, speedPriority },
            },
            ttsMasterEnabled: autoPipelineTtsMasterEnabled,
            demucsEnabled: autoPipelineDemucsEnabled,
            mixerSettings,
            originalAudioVolumePercent,
          }
        : null,
    [
      autoPipelineEnabled,
      autoPipelineTtsMasterEnabled,
      autoPipelineDemucsEnabled,
      maxSpeed,
      minSpeed,
      mixerSettings,
      originalAudioVolumePercent,
      job?.id,
      selectedVoice,
      speedPriority,
      srt?.analysis?.items,
      subtitleCueOverridesByVideoId,
    ],
  );
  const canStartAutoPipeline = Boolean(
    job?.status === "completed" &&
    autoPipelineEnabled &&
    (autoPipelineTtsMasterEnabled || autoPipelineDemucsEnabled) &&
    autoPipelineConfig &&
    !isAutoPipelineRunning &&
    !isMediaProcessing &&
    (!autoPipelineTtsMasterEnabled ||
      Boolean(currentTtsSubtitleItems.length && selectedVoice)) &&
    (!autoPipelineDemucsEnabled ||
      (separationAvailability?.status === "ready" &&
        Boolean(job.metadata?.audioCodec))),
  );
  const queueRows = pairVideoDubbingQueueRows(videoFiles, subtitleFiles);
  const projectJobItems = activeProject
    ? activeProject.jobIds
        .map((id) => jobHistory.find((item) => item.job.id === id))
        .filter((item) => item !== undefined)
        .filter(
          (item) => !videoFiles.some((video) => video.job?.id === item.job.id),
        )
    : [];
  const allVideosJobs = Array.from(
    new Map(
      [
        ...projectJobItems.map(({ job: savedJob }) => savedJob),
        ...queueRows.flatMap(({ video: queuedVideo }) =>
          queuedVideo?.job ? [queuedVideo.job] : [],
        ),
      ]
        .filter((targetJob) => targetJob.status === "completed")
        .map((targetJob) => [targetJob.id, targetJob]),
    ).values(),
  );
  const resolveSrtDownload = (targetJob) => {
    const queueRow = queueRows.find(
      ({ video: queuedVideo }) => queuedVideo?.job?.id === targetJob.id,
    );
    const hasTimelineOverride = Object.prototype.hasOwnProperty.call(
      subtitleCueOverridesByVideoId,
      targetJob.id,
    );
    const cues = hasTimelineOverride
      ? subtitleCueOverridesByVideoId[targetJob.id]
      : queueRow?.subtitle?.analysis?.items?.length
        ? queueRow.subtitle.analysis.items
        : job?.id === targetJob.id && srt?.analysis?.items?.length
          ? srt.analysis.items
          : targetJob.overlaySettings?.subtitles || [];
    if (!cues?.some((cue) => typeof cue.text === "string" && cue.text.trim())) {
      return null;
    }
    const matchedProjectSrt = activeProject?.sourceSrts?.find(
      (source) =>
        source.videoId === targetJob.id ||
        (!source.videoId &&
          source.matchByName !== false &&
          fileStem(source.fileName) === fileStem(targetJob.fileName)),
    );
    const originalFileName =
      queueRow?.subtitle?.fileName ||
      matchedProjectSrt?.fileName ||
      (activeProject?.activeJobId === targetJob.id
        ? activeProject.srt?.fileName
        : undefined);
    return {
      fileName:
        originalFileName?.split(/[\\/]/).pop() ||
        `${
          targetJob.fileName
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.[^.]+$/, "") || "subtitles"
        }.srt`,
      cues: [...cues],
    };
  };
  const allSrtDownloadTargets = allVideosJobs.flatMap((targetJob) => {
    const resolved = resolveSrtDownload(targetJob);
    return resolved ? [{ targetJob, ...resolved }] : [];
  });
  const triggerFileDownload = (fileName, blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadSrtForJob = (targetJob) => {
    try {
      const resolved = resolveSrtDownload(targetJob);
      if (!resolved) {
        setSrtDownloadMessage(`Không có phụ đề để tải: ${targetJob.fileName}`);
        return;
      }
      triggerFileDownload(
        resolved.fileName,
        new Blob([formatVideoDubbingSrt(resolved.cues)], {
          type: "application/x-subrip;charset=utf-8",
        }),
      );
      setSrtDownloadMessage(`Đã tải ${resolved.fileName}.`);
    } catch (error) {
      setSrtDownloadMessage(
        error instanceof Error ? error.message : "Không thể tạo tệp SRT.",
      );
    }
  };
  const downloadAllSrts = () => {
    try {
      const usedNames = new Set();
      const files = allSrtDownloadTargets.map(({ fileName, cues }) => {
        const extensionIndex = fileName.toLocaleLowerCase().endsWith(".srt")
          ? fileName.length - 4
          : fileName.length;
        const baseName = fileName.slice(0, extensionIndex);
        let uniqueName = `${baseName}.srt`;
        let suffix = 2;
        while (usedNames.has(uniqueName.toLocaleLowerCase())) {
          uniqueName = `${baseName} (${suffix}).srt`;
          suffix += 1;
        }
        usedNames.add(uniqueName.toLocaleLowerCase());
        return {
          fileName: uniqueName,
          content: formatVideoDubbingSrt(cues),
        };
      });
      if (!files.length) {
        setSrtDownloadMessage("Không có phụ đề để tải.");
        return;
      }
      triggerFileDownload("subtitles.zip", createSrtZip(files));
      setSrtDownloadMessage(`Đã tạo ZIP gồm ${files.length} phụ đề.`);
    } catch (error) {
      setSrtDownloadMessage(
        error instanceof Error ? error.message : "Không thể tạo tệp ZIP SRT.",
      );
    }
  };
  const allVideosRunning = allVideosAction?.status === "running";
  const allVideosTtsReady = Boolean(
    selectedVoice ||
    allVideosJobs.every(
      (targetJob) => targetJob.autoPipeline?.config?.master.model,
    ),
  );
  const allVideosActionDisabled =
    allVideosJobs.length === 0 ||
    allVideosRunning ||
    queueRunning ||
    settingsSyncRunning;
  const queueRowCount = queueRows.length;
  const queueCountsMatch = hasMatchedVideoDubbingQueueInputs(queueRows);
  const queueInputsValid =
    queueCountsMatch &&
    queueRows.every(
      ({ video: file, subtitle: entry }) =>
        Boolean(
          file &&
          !file.uploading &&
          !file.error &&
          file.job?.status === "completed" &&
          ACCEPTED_VIDEO_EXTENSIONS.has(
            file.name.slice(file.name.lastIndexOf(".")).toLowerCase(),
          ),
        ) &&
        Boolean(entry?.analysis?.items.length) &&
        !entry?.error,
    );
  const canStartQueue = Boolean(
    queueInputsValid &&
    autoPipelineEnabled &&
    (autoPipelineTtsMasterEnabled ? selectedVoice : true) &&
    (autoPipelineTtsMasterEnabled || autoPipelineDemucsEnabled) &&
    !queueRunning &&
    !allVideosRunning &&
    !isAutoPipelineRunning &&
    (!autoPipelineDemucsEnabled || separationAvailability?.status === "ready"),
  );
  const uploadQueuedVideo = async (file, rowIndex) => {
    const createResponse = await fetch("/api/video-dubbing/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        sizeBytes: file.size,
        projectId: activeProject?.id,
      }),
    });
    const createResult = await createResponse.json();
    if (!createResponse.ok || !createResult.job) {
      throw new Error(createResult.error || "Không thể khởi tạo job video.");
    }
    const createdJob = createResult.job;
    activeJobIdRef.current = createdJob.id;
    queueCurrentJobIdRef.current = createdJob.id;
    setVideo({
      fileName: file.name,
      sizeBytes: file.size,
      progress: 0,
      job: createdJob,
    });
    setQueueStates((current) => ({
      ...current,
      [rowIndex]: {
        status: "uploading",
        jobId: createdJob.id,
        phase: "Đang tải video lên",
        progressPercent: 0,
      },
    }));
    return await new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      uploadRef.current = request;
      request.open("PUT", `/api/video-dubbing/jobs/${createdJob.id}/video`);
      request.setRequestHeader("Content-Type", "application/octet-stream");
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const progressPercent = Math.min(
          100,
          (event.loaded / event.total) * 100,
        );
        setQueueStates((current) => ({
          ...current,
          [rowIndex]: {
            ...current[rowIndex],
            status: "uploading",
            jobId: createdJob.id,
            phase: "Đang tải video lên",
            progressPercent,
          },
        }));
      };
      request.upload.onload = () => {
        setQueueStates((current) => ({
          ...current,
          [rowIndex]: {
            ...current[rowIndex],
            status: "uploading",
            jobId: createdJob.id,
            phase: "Đang kiểm tra video",
          },
        }));
      };
      request.onload = () => {
        if (uploadRef.current === request) uploadRef.current = null;
        try {
          const result = JSON.parse(request.responseText);
          if (request.status < 200 || request.status >= 300 || !result.job) {
            reject(new Error(result.error || "Không thể kiểm tra video."));
            return;
          }
          resolve(result.job);
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error("Máy chủ trả về phản hồi tải video không hợp lệ."),
          );
        }
      };
      request.onerror = () => {
        if (uploadRef.current === request) uploadRef.current = null;
        reject(new Error("Kết nối bị gián đoạn khi tải hoặc kiểm tra video."));
      };
      request.onabort = () => {
        if (uploadRef.current === request) uploadRef.current = null;
        reject(new Error("Đã hủy tải video."));
      };
      request.send(file);
    });
  };
  const applyPreviewOverlayToJob = async (targetJob, subtitle) => {
    const sourceJob = job;
    const sourceLogoName = sourceJob?.overlaySettings?.logoFileName;
    if (logoEnabled && (!sourceJob || !sourceLogoName)) {
      throw new Error(
        "Logo đang bật nhưng chưa có logo trong preview để áp dụng cho hàng đợi.",
      );
    }
    if (activeProject && !activeProject.jobIds.includes(targetJob.id)) {
      await attachJobToProject(activeProject, targetJob.id);
    }
    const duration =
      targetJob.metadata?.durationSeconds ?? Number.POSITIVE_INFINITY;
    const sourceCues = resolveVideoDubbingTtsItems(
      targetJob.id,
      subtitleCueOverridesByVideoId,
      subtitle?.analysis?.items?.length
        ? subtitle.analysis.items
        : targetJob.id === job?.id
          ? srt?.analysis?.items || []
          : (targetJob.overlaySettings?.subtitles || []).map((cue, index) => ({
              id: `saved-${index + 1}`,
              index: index + 1,
              startTime: cue.startTime,
              endTime: cue.endTime,
              targetDuration: Math.max(0.1, cue.endTime - cue.startTime),
              text: cue.text,
              status: "pending",
            })),
    );
    const targetCharacterCards =
      targetJob.id === sourceJob?.id
        ? textOverlays.filter((cue) => cue.kind === "character-card")
        : (characterCardCuesByVideoId[targetJob.id] ??
          (targetJob.overlaySettings?.textOverlays ?? []).filter(
            (cue) => cue.kind === "character-card",
          ));
    const textOverlayClips = fitTextOverlaysToVideoDuration(
      [
        ...textOverlays.filter((cue) => cue.kind !== "character-card"),
        ...targetCharacterCards,
      ],
      duration,
    );
    const settings = {
      exportQuality,
      logoEnabled: logoEnabled && Boolean(sourceLogoName),
      logoWidthPercent,
      logoPaddingPx,
      logoPosition,
      subtitlesEnabled: subtitlesEnabled && sourceCues.length > 0,
      subtitles: sourceCues.map(({ startTime, endTime, text }) => ({
        startTime,
        endTime,
        text,
      })),
      textOverlays: textOverlayClips,
      subtitleFontSize,
      subtitleFontFamily,
      subtitleColor,
      subtitleBackgroundColor,
      subtitleBackgroundTransparent: subtitleBackgroundMode === "none",
      subtitleBackgroundMode,
      subtitleBold,
      subtitleItalic,
      subtitleUnderline,
      subtitleTextCase,
      subtitleOutlineEnabled,
      subtitleOutlineColor,
      subtitleOutlineWidthPx,
      subtitleCharacterSpacingPx,
      subtitleLineSpacingPx,
      subtitlePaddingPx,
      subtitleMarginPx,
      subtitlePosition,
      subtitleBackgroundImage:
        subtitleBackgroundMode === "image" ? subtitleBackgroundImage : null,
      subtitleFontSizeScale:
        sourceJob?.overlaySettings?.subtitleFontSizeScale ?? 100,
      subtitleVerticalOffsetPx:
        sourceJob?.overlaySettings?.subtitleVerticalOffsetPx ?? 0,
      subtitleBackgroundSideScale:
        sourceJob?.overlaySettings?.subtitleBackgroundSideScale ?? 100,
      subtitleBackgroundLeftSlicePx:
        sourceJob?.overlaySettings?.subtitleBackgroundLeftSlicePx ?? 128,
      subtitleBackgroundRightSlicePx:
        sourceJob?.overlaySettings?.subtitleBackgroundRightSlicePx ?? 128,
    };
    const saveResponse = await fetch(
      `/api/video-dubbing/jobs/${targetJob.id}/overlay-settings`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      },
    );
    const saveResult = await saveResponse.json();
    if (!saveResponse.ok || !saveResult.job)
      throw new Error(
        saveResult.error ||
          "Không thể áp dụng cấu hình preview cho video trong hàng đợi.",
      );
    const savedJob = saveResult.job;
    setVideoFiles((current) =>
      current.map((item) =>
        item.job?.id === savedJob.id ? { ...item, job: savedJob } : item,
      ),
    );
    setJobHistory((current) =>
      current.map((item) =>
        item.job.id === savedJob.id ? { ...item, job: savedJob } : item,
      ),
    );
    setVideo((current) =>
      current?.job?.id === savedJob.id
        ? { ...current, job: savedJob }
        : current,
    );
    return savedJob;
  };
  const syncSettingsToAllVideos = async () => {
    if (settingsSyncRunning || queueRunning) return;
    const sources = videoFiles.filter(
      (item) => item.job?.status === "completed",
    );
    if (sources.length === 0) {
      setSettingsSyncMessage("Chưa có video đã lưu để đồng bộ.");
      return;
    }
    setSettingsSyncRunning(true);
    setSettingsSyncMessage(null);
    let synced = 0;
    const errors = [];
    try {
      for (let index = 0; index < sources.length; index++) {
        const source = sources[index];
        const sourceJob = source.job;
        const row = queueRows.find(
          (item) => item.video?.job?.id === sourceJob.id,
        );
        setSettingsSyncMessage(
          `Đang đồng bộ ${index + 1}/${sources.length}: ${source.name}`,
        );
        try {
          await applyPreviewOverlayToJob(sourceJob, row?.subtitle);
          const subtitleItems = resolveVideoDubbingTtsItems(
            sourceJob.id,
            subtitleCueOverridesByVideoId,
            row?.subtitle?.analysis?.items ||
              sourceJob.autoPipeline?.config?.master.items ||
              [],
          );
          if (selectedVoice && subtitleItems?.length) {
            const config = {
              enabled: true,
              master: {
                items: subtitleItems,
                model: selectedVoice.modelId,
                speakerId: selectedVoice.speakerId,
                options: { minSpeed, maxSpeed, speedPriority },
              },
              ttsMasterEnabled: autoPipelineTtsMasterEnabled,
              demucsEnabled:
                autoPipelineDemucsEnabled &&
                Boolean(sourceJob.metadata?.audioCodec),
              mixerSettings,
              originalAudioVolumePercent,
            };
            const response = await fetch(
              `/api/video-dubbing/jobs/${sourceJob.id}/auto-pipeline/config`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
              },
            );
            const result = await response.json();
            if (!response.ok)
              throw new Error(
                result.error || "Không thể lưu cấu hình Auto Pipeline.",
              );
          }
          synced++;
        } catch (error) {
          errors.push(
            `${source.name}: ${error instanceof Error ? error.message : "Lỗi đồng bộ"}`,
          );
        }
      }
      void loadJobHistory();
      setSettingsSyncMessage(
        errors.length
          ? `Đã đồng bộ ${synced}/${sources.length} video. ${errors.slice(0, 2).join("; ")}${errors.length > 2 ? `; và ${errors.length - 2} lỗi khác` : ""}`
          : `Đã đồng bộ cài đặt cho ${synced} video.`,
      );
    } finally {
      setSettingsSyncRunning(false);
    }
  };
  const checkQueueConcatCompatibility = async (jobIds) => {
    setConcatPreflight({
      status: "checking",
      message: "Đang kiểm tra thông số video nguồn…",
    });
    try {
      const response = await fetch(
        "/api/video-dubbing/exports/concat/preflight",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobIds,
            exportQuality,
            willRenderVideo: Boolean(
              (logoEnabled && job?.overlaySettings?.logoFileName) ||
              (subtitlesEnabled &&
                (subtitleCueOverrides?.length ||
                  srt?.analysis?.items.length ||
                  job?.overlaySettings?.subtitles.length)) ||
              textOverlays.length,
            ),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Không thể kiểm tra khả năng ghép video.",
        );
      const compatible = Boolean(result.compatible);
      setConcatPreflight({
        status: compatible ? "compatible" : "incompatible",
        message: result.message || "Không thể xác định khả năng ghép.",
      });
      return compatible;
    } catch (error) {
      setConcatPreflight({
        status: "incompatible",
        message:
          error instanceof Error
            ? error.message
            : "Không thể kiểm tra khả năng ghép video.",
      });
      return false;
    }
  };
  const toggleJoinAfterQueue = async () => {
    if (joinAfterQueue) {
      setJoinAfterQueue(false);
      setConcatPreflight({ status: "idle", message: "" });
      return;
    }
    const jobIds = queueRows.map((row) => row.video?.job?.id);
    if (jobIds.length < 2 || jobIds.some((id) => !id)) {
      setConcatPreflight({
        status: "incompatible",
        message:
          "Hãy lưu ít nhất hai video vào project để kiểm tra khả năng ghép trước.",
      });
      return;
    }
    if (await checkQueueConcatCompatibility(jobIds)) setJoinAfterQueue(true);
  };
  const startQueue = async () => {
    if (!canStartQueue || (autoPipelineTtsMasterEnabled && !selectedVoice))
      return;
    let shouldJoinAfterQueue = joinAfterQueue;
    if (shouldJoinAfterQueue) {
      const jobIds = queueRows.map((row) => row.video?.job?.id);
      if (
        jobIds.length < 2 ||
        jobIds.some((id) => !id) ||
        !(await checkQueueConcatCompatibility(jobIds))
      ) {
        setJoinAfterQueue(false);
        setMediaError(
          "Preflight không xác nhận được khả năng ghép. Hàng đợi chưa chạy; có thể bỏ chọn ghép nối để export riêng từng video.",
        );
        return;
      }
    }
    const completedJobIds = [];
    let queueHadFailure = false;
    queueCancelRef.current = false;
    setJoinedVideo(null);
    setConcatStatus("idle");
    setQueueRunning(true);
    setAutoPipelineError(null);
    setQueueStates(
      Object.fromEntries(
        queueRows.map(({ index }) => [index, { status: "queued" }]),
      ),
    );
    try {
      for (const row of queueRows) {
        const { index } = row;
        if (queueCancelRef.current) break;
        const file = row.video;
        const subtitle = row.subtitle;
        if (!file || !subtitle?.analysis) {
          queueHadFailure = true;
          setQueueStates((current) => ({
            ...current,
            [index]: {
              status: "failed",
              phase: "Thiếu video hoặc SRT hợp lệ",
              error: "Cần ghép đủ video và phụ đề SRT hợp lệ cho hàng này.",
            },
          }));
          continue;
        }
        let currentJobId;
        try {
          setSrt({
            fileName: subtitle.fileName,
            sizeBytes: subtitle.sizeBytes,
            content: subtitle.content,
            analysis: subtitle.analysis,
          });
          if (subtitle.content) setSrtContent(subtitle.content);
          const uploadedJob =
            file.job ||
            (file.file ? await uploadQueuedVideo(file.file, index) : null);
          if (!uploadedJob)
            throw new Error(
              "Video chưa được lưu vào project. Hãy nhập lại video nguồn.",
            );
          currentJobId = uploadedJob.id;
          if (queueCancelRef.current) {
            throw new Error("Đã hủy hàng đợi.");
          }
          if (uploadedJob.status !== "completed") {
            throw new Error(
              uploadedJob.error || "Video chưa vượt qua bước kiểm tra.",
            );
          }
          setQueueStates((current) => ({
            ...current,
            [index]: {
              status: "processing",
              jobId: uploadedJob.id,
              phase: "Đang áp dụng logo và style preview",
            },
          }));
          const preparedJob = await applyPreviewOverlayToJob(
            uploadedJob,
            subtitle,
          );
          setVideo({
            fileName: file.name,
            sizeBytes: file.size,
            progress: 100,
            job: preparedJob,
          });
          const config = {
            enabled: true,
            master: {
              items: resolveVideoDubbingTtsItems(
                uploadedJob.id,
                subtitleCueOverridesByVideoId,
                subtitle.analysis.items,
              ),
              model:
                selectedVoice?.modelId ||
                uploadedJob.autoPipeline?.config?.master.model ||
                "",
              speakerId: selectedVoice?.speakerId,
              options: { minSpeed, maxSpeed, speedPriority },
            },
            ttsMasterEnabled: autoPipelineTtsMasterEnabled,
            demucsEnabled: autoPipelineDemucsEnabled,
            mixerSettings,
            originalAudioVolumePercent,
          };
          const startResponse = await fetch(
            `/api/video-dubbing/jobs/${uploadedJob.id}/auto-pipeline`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(config),
            },
          );
          const startResult = await startResponse.json();
          if (!startResponse.ok) {
            throw new Error(
              startResult.error || "Không thể bắt đầu Auto Pipeline.",
            );
          }
          setQueueStates((current) => ({
            ...current,
            [index]: {
              status: "processing",
              jobId: uploadedJob.id,
              phase: "Đang bắt đầu Auto Pipeline",
            },
          }));
          let completedJob = null;
          while (!completedJob) {
            const response = await fetch(
              `/api/video-dubbing/jobs/${uploadedJob.id}`,
            );
            const result = await response.json();
            if (!response.ok || !result.job) {
              throw new Error(result.error || "Không thể đọc trạng thái job.");
            }
            const latestJob = result.job;
            setVideo((current) =>
              current?.job?.id === latestJob.id
                ? { ...current, job: latestJob }
                : current,
            );
            const state = latestJob.autoPipeline;
            if (!state) {
              throw new Error("Job chưa có trạng thái Auto Pipeline.");
            }
            setQueueStates((current) => ({
              ...current,
              [index]: {
                status: "processing",
                jobId: latestJob.id,
                phase: state?.phase || "Đang xử lý",
                progressPercent: state?.progressPercent,
              },
            }));
            if (state?.status === "completed") {
              if (
                latestJob.videoExport?.status !== "completed" ||
                !latestJob.videoExport?.sizeBytes
              ) {
                throw new Error(
                  "Auto Pipeline chưa xác minh được file MP4 đầu ra.",
                );
              }
              completedJob = latestJob;
              break;
            }
            if (state?.status === "failed" || state?.status === "interrupted") {
              throw new Error(state.error || "Auto Pipeline không hoàn tất.");
            }
            if (state?.status === "cancelled") {
              queueCancelRef.current = true;
              setQueueStates((current) => ({
                ...current,
                [index]: {
                  status: "cancelled",
                  jobId: latestJob.id,
                  phase: "Đã hủy",
                },
              }));
              break;
            }
            if (queueCancelRef.current && state?.status === "running") {
              await fetch(
                `/api/video-dubbing/jobs/${latestJob.id}/auto-pipeline/cancel`,
                { method: "POST" },
              );
            }
            await new Promise((resolve) => window.setTimeout(resolve, 750));
          }
          if (completedJob) {
            completedJobIds.push(completedJob.id);
            setQueueStates((current) => ({
              ...current,
              [index]: {
                status: "completed",
                jobId: completedJob.id,
                phase: "Hoàn tất",
                progressPercent: 100,
              },
            }));
          }
        } catch (error) {
          queueHadFailure = true;
          const message =
            error instanceof Error ? error.message : "Không thể xử lý video.";
          setQueueStates((current) => ({
            ...current,
            [index]: {
              status: queueCancelRef.current ? "cancelled" : "failed",
              jobId: currentJobId || current[index]?.jobId,
              phase: queueCancelRef.current ? "Đã hủy" : "Thất bại",
              error: message,
            },
          }));
          if (queueCancelRef.current) break;
        } finally {
          queueCurrentJobIdRef.current = null;
        }
      }
      if (shouldJoinAfterQueue) {
        if (
          queueCancelRef.current ||
          queueHadFailure ||
          completedJobIds.length !== queueRows.length
        ) {
          setConcatStatus("skipped");
        } else if (completedJobIds.length < 2) {
          setConcatStatus("failed");
          setMediaError("Cần ít nhất hai video hoàn tất để ghép nối.");
        } else {
          setConcatStatus("running");
          setMediaError(null);
          try {
            const response = await fetch("/api/video-dubbing/exports/concat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobIds: completedJobIds }),
            });
            const result = await response.json();
            if (!response.ok || !result.fileName || !result.jobId) {
              throw new Error(
                result.error || "Không thể ghép video bằng stream copy.",
              );
            }
            setJoinedVideo({
              jobId: result.jobId,
              fileName: result.fileName,
              sizeBytes: result.sizeBytes,
            });
            setConcatStatus("completed");
          } catch (error) {
            setConcatStatus("failed");
            setMediaError(
              error instanceof Error
                ? error.message
                : "Không thể ghép video bằng stream copy.",
            );
          }
        }
      }
    } finally {
      queueCurrentJobIdRef.current = null;
      setQueueRunning(false);
      void loadJobHistory();
    }
  };
  const stopQueue = async () => {
    queueCancelRef.current = true;
    if (uploadRef.current) {
      uploadRef.current.abort();
      const activeJobId = activeJobIdRef.current;
      if (activeJobId) {
        try {
          const response = await fetch(
            `/api/video-dubbing/jobs/${activeJobId}/cancel`,
            { method: "POST" },
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Không thể hủy tải video.");
          }
        } catch (error) {
          setAutoPipelineError(
            error instanceof Error ? error.message : "Không thể hủy tải video.",
          );
        }
      }
      return;
    }
    const currentJobId = queueCurrentJobIdRef.current;
    if (currentJobId) {
      try {
        const statusResponse = await fetch(
          `/api/video-dubbing/jobs/${currentJobId}`,
        );
        const statusResult = await statusResponse.json();
        if (!statusResponse.ok) {
          throw new Error(
            statusResult.error || "Không thể đọc trạng thái job.",
          );
        }
        if (statusResult.job?.autoPipeline?.status === "running") {
          const response = await fetch(
            `/api/video-dubbing/jobs/${currentJobId}/auto-pipeline/cancel`,
            { method: "POST" },
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Không thể hủy Auto Pipeline.");
          }
        }
      } catch (error) {
        setAutoPipelineError(
          error instanceof Error
            ? error.message
            : "Không thể hủy Auto Pipeline.",
        );
      }
    }
  };
  const canExportVideo = Boolean(
    job?.status === "completed" &&
    mixerSettingsSaved &&
    isFinalMixCurrent &&
    !isMasterGenerating &&
    !isMediaProcessing,
  );
  const createMaster = async () => {
    if (!job || !currentTtsSubtitleItems.length || !selectedVoice) return;
    setMasterError(null);
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${job.id}/master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: currentTtsSubtitleItems,
          model: selectedVoice.modelId,
          speakerId: selectedVoice.speakerId,
          options: { minSpeed, maxSpeed, speedPriority },
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu tạo TTS Master.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: {
                ...current.job,
                masterGeneration: result.masterGeneration,
              },
            }
          : current,
      );
    } catch (error) {
      setMasterError(
        error instanceof Error
          ? error.message
          : "Không thể bắt đầu tạo TTS Master.",
      );
    }
  };
  const regenerateSubtitleAudio = async (item) => {
    if (!job || !selectedVoice || subtitleAudioRegeneratingId) return;
    setSubtitleAudioRegeneratingId(item.id);
    setSubtitleAudioError(null);
    try {
      const syncResponse = await fetch(
        `/api/video-dubbing/jobs/${job.id}/subtitle-audio`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: subtitleAudioInput.map((entry) =>
              entry.id === item.id ? { ...entry, text: item.text } : entry,
            ),
          }),
        },
      );
      const synced = await syncResponse.json();
      if (!syncResponse.ok || !Array.isArray(synced.items)) {
        throw new Error(
          synced.error || "Không thể đồng bộ danh sách audio phụ đề.",
        );
      }
      setSubtitleAudioItems(synced.items);
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/subtitle-audio/${encodeURIComponent(item.id)}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [item],
            model: selectedVoice.modelId,
            speakerId: selectedVoice.speakerId,
            options: { minSpeed, maxSpeed, speedPriority },
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.items)) {
        throw new Error(
          result.error || `Không thể tạo lại audio câu #${item.index}.`,
        );
      }
      setSubtitleAudioItems(result.items);
      const updated = result.items.find((entry) => entry.id === item.id);
      if (updated?.status === "failed") {
        setSubtitleAudioError(
          `Câu #${item.index} (ID ${item.id}): ${updated.error || "Tạo audio thất bại."}`,
        );
      }
    } catch (error) {
      setSubtitleAudioError(
        error instanceof Error
          ? error.message
          : "Không thể tạo lại audio phụ đề.",
      );
    } finally {
      setSubtitleAudioRegeneratingId(null);
    }
  };
  const rebuildMasterFromSubtitleAudio = async () => {
    if (!job || !subtitleAudioInput.length || subtitleAudioMasterBusy) return;
    setSubtitleAudioMasterBusy(true);
    setSubtitleAudioError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/subtitle-audio/master`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: subtitleAudioInput }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(
          result.error || "Không thể tạo lại Master từ các audio câu.",
        );
      }
      setVideo((current) =>
        current?.job?.id === job.id ? { ...current, job: result.job } : current,
      );
    } catch (error) {
      setSubtitleAudioError(
        error instanceof Error ? error.message : "Không thể tạo lại Master.",
      );
    } finally {
      setSubtitleAudioMasterBusy(false);
    }
  };
  const saveAutoPipelineConfig = async (config = autoPipelineConfig) => {
    if (!job || !config) return;
    setAutoPipelineError(null);
    setAutoPipelineSaving(true);
    try {
      const saveOperation = mixerSaveChainRef.current.then(async () => {
        const mixerSettingsVersion = mixerSettingsVersionRef.current;
        const configToSave = {
          ...config,
          mixerSettings: mixerSettingsRef.current,
        };
        const configKey = JSON.stringify(configToSave);
        const response = await fetch(
          `/api/video-dubbing/jobs/${job.id}/auto-pipeline/config`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: configKey,
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error || "Không thể lưu cấu hình Auto Pipeline.",
          );
        }
        autoPipelineSavedConfigKeyRef.current = JSON.stringify({
          ...configToSave,
          mixerSettings: undefined,
        });
        if (mixerSettingsVersionRef.current === mixerSettingsVersion) {
          mixerTouchedRef.current = false;
          setMixerSettingsSaved(true);
        }
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                job: {
                  ...current.job,
                  mixerSettings:
                    mixerSettingsVersionRef.current === mixerSettingsVersion
                      ? result.config.mixerSettings
                      : current.job.mixerSettings,
                  autoPipeline: {
                    ...(current.job.autoPipeline || {
                      status: "idle",
                      phase: "validating",
                      completedStages: [],
                      reusedOutputs: [],
                      artifacts: {},
                      updatedAt: Date.now(),
                    }),
                    config: result.config,
                  },
                },
              }
            : current,
        );
      });
      mixerSaveChainRef.current = saveOperation.catch(() => undefined);
      await saveOperation;
    } catch (error) {
      setAutoPipelineError(
        error instanceof Error
          ? error.message
          : "Không thể lưu cấu hình Auto Pipeline.",
      );
    } finally {
      setAutoPipelineSaving(false);
    }
  };
  const startAutoPipeline = async () => {
    if (!job || !autoPipelineConfig) return;
    setAutoPipelineError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/auto-pipeline/tts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(autoPipelineConfig),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu tạo TTS.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: { ...current.job, autoPipeline: result.state },
            }
          : current,
      );
    } catch (error) {
      setAutoPipelineError(
        error instanceof Error ? error.message : "Không thể bắt đầu tạo TTS.",
      );
    }
  };
  const cancelAutoPipeline = async () => {
    if (!job) return;
    setAutoPipelineError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/auto-pipeline/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy Auto Pipeline.");
      }
      if (result.state) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                job: { ...current.job, autoPipeline: result.state },
              }
            : current,
        );
      }
    } catch (error) {
      setAutoPipelineError(
        error instanceof Error ? error.message : "Không thể hủy Auto Pipeline.",
      );
    }
  };
  const startFinalMix = async () => {
    if (!job) return;
    setMediaError(null);
    setMixerError(null);
    try {
      await flushMixerSettings(job.id);
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/final-mix`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: localMixerSettingsKey,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể render final mix.");
      }
      setMixerSettingsSaved(true);
      mixerTouchedRef.current = false;
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: {
                ...current.job,
                mixerSettings,
                mixSelection: "final",
                finalMix: result.finalMix,
              },
            }
          : current,
      );
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể render final mix.",
      );
    }
  };
  const cancelFinalMix = async () => {
    if (!job) return;
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/final-mix/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy final mix.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
        );
      }
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể hủy final mix.",
      );
    }
  };
  const cancelMaster = async () => {
    if (!job) return;
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/master/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy tạo TTS Master.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
        );
      }
    } catch (error) {
      setMasterError(
        error instanceof Error ? error.message : "Không thể hủy TTS Master.",
      );
    }
  };
  const flushMixerSettings = async (jobId) => {
    if (mixerSettingsTimerRef.current !== null) {
      window.clearTimeout(mixerSettingsTimerRef.current);
      mixerSettingsTimerRef.current = null;
    }
    const version = ++mixerSettingsRequestRef.current;
    if (!mixerTouchedRef.current) return;
    const response = await fetch(
      `/api/video-dubbing/jobs/${jobId}/mixer-settings`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: localMixerSettingsKey,
      },
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Không thể lưu mixer settings.");
    }
    if (version === mixerSettingsRequestRef.current) {
      mixerTouchedRef.current = false;
      setMixerSettingsSaved(true);
      setMixerError(null);
    }
  };
  const chooseCoverFile = (file) => {
    if (!file) return;
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      setCoverEditorError("Ảnh cover chỉ hỗ trợ PNG, JPG hoặc WebP.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setCoverEditorError("Ảnh cover không được vượt quá 20 MB.");
      return;
    }
    setCoverEditorError(null);
    setCoverEditorFile(file);
  };
  const confirmCoverEditor = async () => {
    const targetJob = coverEditorTarget;
    if (!targetJob) return;
    if (!coverEditorFile && !targetJob.overlaySettings?.coverFileName) {
      setCoverEditorError("Hãy chọn ảnh cover trước khi xác nhận.");
      return;
    }
    setCoverEditorBusy(true);
    setCoverEditorError(null);
    try {
      if (coverEditorFile) {
        const extension = coverEditorFile.name
          .slice(coverEditorFile.name.lastIndexOf("."))
          .toLowerCase();
        const uploadResponse = await fetch(
          `/api/video-dubbing/jobs/${targetJob.id}/cover?extension=${encodeURIComponent(extension)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: coverEditorFile,
          },
        );
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadResult.job) {
          throw new Error(uploadResult.error || "Không thể tải ảnh cover lên.");
        }
      }
      const settingsResponse = await fetch(
        `/api/video-dubbing/jobs/${targetJob.id}/overlay-settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            coverEnabled: true,
            coverFrameCount: coverEditorFrameCount,
          }),
        },
      );
      const settingsResult = await settingsResponse.json();
      if (!settingsResponse.ok || !settingsResult.job) {
        throw new Error(settingsResult.error || "Không thể lưu cài đặt cover.");
      }
      updateListedJob(settingsResult.job);
      setCoverEditorTarget(null);
      setCoverEditorFile(null);
    } catch (error) {
      setCoverEditorError(
        error instanceof Error ? error.message : "Không thể lưu ảnh cover.",
      );
    } finally {
      setCoverEditorBusy(false);
    }
  };
  const removeCoverFromEditor = async () => {
    if (!coverEditorTarget) return;
    setCoverEditorBusy(true);
    setCoverEditorError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${coverEditorTarget.id}/cover`,
        {
          method: "DELETE",
        },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể xóa ảnh cover.");
      }
      const updatedJob = result.job;
      updateListedJob(updatedJob);
      setCoverEditorTarget(updatedJob);
      setCoverEditorFile(null);
      setCoverEditorFrameCount(5);
    } catch (error) {
      setCoverEditorError(
        error instanceof Error ? error.message : "Không thể xóa ảnh cover.",
      );
    } finally {
      setCoverEditorBusy(false);
    }
  };
  const uploadOverlayLogo = async (file) => {
    if (!job) return;
    setMediaError(null);
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      setMediaError("Logo chỉ hỗ trợ PNG, JPG hoặc WebP.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setMediaError("Logo không được vượt quá 20 MB.");
      return;
    }
    setLogoUploading(true);
    try {
      const uploadUrl = activeProject
        ? `/api/video-dubbing/projects/${activeProject.id}/logo?extension=${encodeURIComponent(extension)}`
        : `/api/video-dubbing/jobs/${job.id}/logo?extension=${encodeURIComponent(extension)}`;
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể tải logo lên.");
      }
      if (result.project) {
        const project = result.project;
        setActiveProject(project);
        importProjectRef.current = project;
        setProjects((items) => [
          project,
          ...items.filter((item) => item.id !== project.id),
        ]);
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
        );
      }
      setLogoEnabled(true);
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể tải logo lên.",
      );
    } finally {
      setLogoUploading(false);
    }
  };
  const startVideoExport = async () => {
    if (!job) return;
    setMediaError(null);
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${job.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exportQuality,
          coverEnabled: Boolean(
            job.overlaySettings?.coverEnabled &&
            job.overlaySettings.coverFileName,
          ),
          coverFrameCount: job.overlaySettings?.coverFrameCount ?? 5,
          logoEnabled:
            logoEnabled && Boolean(job.overlaySettings?.logoFileName),
          logoWidthPercent,
          logoPaddingPx,
          logoPosition,
          subtitlesEnabled,
          subtitles: (
            subtitleCueOverrides ||
            srt?.analysis?.items ||
            job.overlaySettings?.subtitles ||
            []
          ).map(({ startTime, endTime, text }) => ({
            startTime,
            endTime,
            text,
          })),
          textOverlays: fitTextOverlaysToVideoDuration(
            textOverlays,
            job.metadata?.durationSeconds ?? Number.POSITIVE_INFINITY,
          ),
          endScene: {
            enabled: Boolean(job.overlaySettings?.endScene?.enabled),
            durationSeconds: endSceneDurationSeconds,
            aspectRatio: endSceneAspectRatio,
            textOverlays: endSceneTextOverlays,
          },
          subtitleFontSize,
          subtitleFontFamily,
          subtitleColor,
          subtitleBackgroundColor,
          subtitleBackgroundTransparent: subtitleBackgroundMode === "none",
          subtitleBackgroundMode,
          subtitleBold,
          subtitleItalic,
          subtitleUnderline,
          subtitleTextCase,
          subtitleOutlineEnabled,
          subtitleOutlineColor,
          subtitleOutlineWidthPx,
          subtitleCharacterSpacingPx,
          subtitleLineSpacingPx,
          subtitlePaddingPx,
          subtitleMarginPx,
          subtitlePosition,
          subtitleBackgroundImage:
            subtitleBackgroundMode === "image" ? subtitleBackgroundImage : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu xuất MP4.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: result.job || {
                ...current.job,
                videoExport: result.videoExport,
              },
            }
          : current,
      );
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể bắt đầu xuất MP4.",
      );
    }
  };
  const updateListedJob = (updatedJob) => {
    setVideo((current) =>
      current?.job?.id === updatedJob.id
        ? { ...current, job: updatedJob }
        : current,
    );
    setVideoFiles((current) =>
      current.map((item) =>
        item.job?.id === updatedJob.id ? { ...item, job: updatedJob } : item,
      ),
    );
    setJobHistory((current) =>
      current.map((item) =>
        item.job.id === updatedJob.id ? { ...item, job: updatedJob } : item,
      ),
    );
  };
  const saveEndSceneForCurrentVideo = async (enabled) => {
    if (!job) return;
    setMediaError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/overlay-settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endScene: {
              enabled,
              durationSeconds: endSceneDurationSeconds,
              aspectRatio: endSceneAspectRatio,
              textOverlays: endSceneTextOverlays,
            },
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(
          result.error || "Không thể cập nhật End Scene cho video.",
        );
      }
      updateListedJob(result.job);
    } catch (error) {
      setMediaError(
        error instanceof Error
          ? error.message
          : "Không thể cập nhật End Scene cho video.",
      );
    }
  };
  const updateEndSceneText = (index, patch) => {
    setEndSceneTextOverlays((current) =>
      current.map((cue, cueIndex) =>
        cueIndex === index ? { ...cue, ...patch } : cue,
      ),
    );
  };
  const addEndSceneText = () => {
    const cue = createDefaultEndSceneText(endSceneDurationSeconds);
    cue.text = "Văn bản mới";
    cue.yPercent = Math.min(90, 50 + endSceneTextOverlays.length * 8);
    setEndSceneTextOverlays((current) => [...current, cue]);
    setSelectedEndSceneTextIndex(endSceneTextOverlays.length);
  };
  const removeSelectedEndSceneText = () => {
    if (selectedEndSceneTextIndex === null) return;
    const next = endSceneTextOverlays.filter(
      (_, index) => index !== selectedEndSceneTextIndex,
    );
    setEndSceneTextOverlays(next);
    setSelectedEndSceneTextIndex(
      next.length ? Math.min(selectedEndSceneTextIndex, next.length - 1) : null,
    );
  };
  const updateRenderedAudio = async (targetJob) => {
    if (
      !targetJob.exportedVideoFileName ||
      !targetJob.videoExport?.sizeBytes ||
      targetJob.videoExport.status === "running"
    ) {
      return;
    }
    setAudioUpdateErrors((current) => {
      const next = { ...current };
      delete next[targetJob.id];
      return next;
    });
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${targetJob.id}/update-rendered-audio`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        if (result.job) updateListedJob(result.job);
        throw new Error(result.error || "Không thể cập nhật audio MP4.");
      }
      updateListedJob(result.job);
      const deadline = Date.now() + 2 * 60 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        const statusResponse = await fetch(
          `/api/video-dubbing/jobs/${targetJob.id}`,
        );
        const statusResult = await statusResponse.json();
        if (!statusResponse.ok || !statusResult.job) {
          throw new Error(
            statusResult.error || "Không thể kiểm tra cập nhật audio MP4.",
          );
        }
        const latestJob = statusResult.job;
        updateListedJob(latestJob);
        if (latestJob.videoExport?.status !== "running") {
          if (latestJob.videoExport?.status !== "completed") {
            throw new Error(
              latestJob.videoExport?.error ||
                `Cập nhật audio kết thúc với trạng thái ${latestJob.videoExport?.status || "không xác định"}.`,
            );
          }
          return;
        }
      }
      throw new Error("Cập nhật audio MP4 quá thời gian chờ.");
    } catch (error) {
      setAudioUpdateErrors((current) => ({
        ...current,
        [targetJob.id]:
          error instanceof Error
            ? error.message
            : "Không thể cập nhật audio MP4.",
      }));
    }
  };
  const requestMasterEdit = async (jobId, action, clips) => {
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${jobId}/master-edit/${action}`,
        {
          method: action === "clips" ? "PUT" : "POST",
          ...(clips
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clips }),
              }
            : {}),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        if (result.job) updateListedJob(result.job);
        throw new Error(result.error || "Không thể cập nhật TTS Master.");
      }
      updateListedJob(result.job);
      setMediaError(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Không thể cập nhật TTS Master.";
      setMediaError(message);
      throw error;
    }
  };
  const runAllVideosAction = async (action, targetJobs = allVideosJobs) => {
    if (
      allVideosRunning ||
      queueRunning ||
      settingsSyncRunning ||
      targetJobs.length === 0
    ) {
      return;
    }
    if (
      action === "tts" &&
      !selectedVoice &&
      targetJobs.some(
        (targetJob) => !targetJob.autoPipeline?.config?.master.model,
      )
    ) {
      setAllVideosAction({
        action,
        status: "completed",
        currentIndex: 0,
        total: targetJobs.length,
        completed: 0,
        errors: ["Hãy chọn giọng đọc trước khi tạo TTS."],
      });
      return;
    }
    const actionLabels = {
      tts: "TTS",
      demucs: "Demucs",
      mix: "Mix Audio",
      render: "Render",
      download: "Download",
    };
    const errors = [];
    let completed = 0;
    setAllVideosAction({
      action,
      status: "running",
      currentIndex: 0,
      total: targetJobs.length,
      completed: 0,
      errors: [],
    });
    if (action === "download") {
      const downloadableJobs = targetJobs.filter(
        (targetJob) => targetJob.videoExport?.status === "completed",
      );
      if (!downloadableJobs.length) return;
      const downloadUrl = new URL(
        "/api/video-dubbing/exports/download-all",
        window.location.origin,
      );
      downloadUrl.searchParams.set(
        "jobIds",
        downloadableJobs.map((targetJob) => targetJob.id).join(","),
      );
      const link = document.createElement("a");
      link.href = downloadUrl.toString();
      link.download = "video-dubbing-exports.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setAllVideosAction({
        action,
        status: "completed",
        currentIndex: downloadableJobs.length,
        total: downloadableJobs.length,
        completed: downloadableJobs.length,
        errors: [],
      });
      void loadJobHistory();
      return;
    }
    const fetchLatestJob = async (jobId) => {
      const response = await fetch(`/api/video-dubbing/jobs/${jobId}`);
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể tải trạng thái job.");
      }
      updateListedJob(result.job);
      return result.job;
    };
    const postJobAction = async (jobId, body) => {
      const endpoint =
        action === "tts"
          ? `/api/video-dubbing/jobs/${jobId}/auto-pipeline/tts`
          : action === "demucs"
            ? `/api/video-dubbing/jobs/${jobId}/separation`
            : action === "mix"
              ? `/api/video-dubbing/jobs/${jobId}/final-mix`
              : `/api/video-dubbing/jobs/${jobId}/export`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error || `Không thể bắt đầu ${actionLabels[action]}.`,
        );
      }
      if (result.job) updateListedJob(result.job);
      const isRunning = (currentJob) =>
        action === "tts"
          ? currentJob.autoPipeline?.status === "running"
          : action === "demucs"
            ? currentJob.separation?.status === "processing"
            : action === "mix"
              ? currentJob.finalMix?.status === "running"
              : currentJob.videoExport?.status === "running";
      const taskState = (currentJob) =>
        action === "tts"
          ? currentJob.autoPipeline
          : action === "demucs"
            ? currentJob.separation
            : action === "mix"
              ? currentJob.finalMix
              : currentJob.videoExport;
      const deadline = Date.now() + 2 * 60 * 60 * 1000;
      while (Date.now() < deadline) {
        const latestJob = await fetchLatestJob(jobId);
        if (!isRunning(latestJob)) {
          const state = taskState(latestJob);
          if (state?.status !== "completed") {
            throw new Error(
              state?.error ||
                `${actionLabels[action]} kết thúc với trạng thái ${state?.status || "không xác định"}.`,
            );
          }
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      throw new Error(`${actionLabels[action]} quá thời gian chờ.`);
    };
    try {
      for (let index = 0; index < targetJobs.length; index++) {
        const listedJob = targetJobs[index];
        setAllVideosAction({
          action,
          status: "running",
          currentIndex: index + 1,
          total: targetJobs.length,
          currentFileName: listedJob.fileName,
          completed,
          errors: [...errors],
        });
        try {
          const targetJob = await fetchLatestJob(listedJob.id);
          const row = queueRows.find(
            ({ video: queuedVideo }) => queuedVideo?.job?.id === targetJob.id,
          );
          if (action === "tts") {
            const isCurrentJob = targetJob.id === job?.id;
            const savedCues = targetJob.overlaySettings?.subtitles || [];
            const fallbackItems =
              (row?.subtitle?.analysis?.items.length
                ? row.subtitle.analysis.items
                : undefined) ||
              (targetJob.autoPipeline?.config?.master.items.length
                ? targetJob.autoPipeline.config.master.items
                : undefined) ||
              savedCues.map((cue, cueIndex) => ({
                id: `saved-${cueIndex + 1}`,
                index: cueIndex + 1,
                startTime: cue.startTime,
                endTime: cue.endTime,
                targetDuration: Math.max(0.1, cue.endTime - cue.startTime),
                text: cue.text,
                status: "pending",
              }));
            const items = resolveVideoDubbingTtsItems(
              targetJob.id,
              subtitleCueOverridesByVideoId,
              fallbackItems,
            );
            if (!items.length) {
              throw new Error("Video chưa có phụ đề để tạo TTS.");
            }
            const savedMaster = targetJob.autoPipeline?.config?.master;
            const useCurrentTtsSettings = isCurrentJob || !savedMaster;
            const voice = useCurrentTtsSettings ? selectedVoice : undefined;
            if (useCurrentTtsSettings && !voice) {
              throw new Error(
                "Hãy chọn giọng đọc cho video này trước khi tạo TTS.",
              );
            }
            const targetConfig = {
              enabled: true,
              master: {
                items,
                model: useCurrentTtsSettings
                  ? voice.modelId
                  : savedMaster.model,
                speakerId: useCurrentTtsSettings
                  ? voice?.speakerId
                  : savedMaster?.speakerId,
                options: useCurrentTtsSettings
                  ? { minSpeed, maxSpeed, speedPriority }
                  : savedMaster.options,
              },
              demucsEnabled: false,
              ttsMasterEnabled: true,
              mixerSettings: isCurrentJob
                ? mixerSettings
                : targetJob.mixerSettings ||
                  targetJob.autoPipeline?.config?.mixerSettings ||
                  mixerSettings,
              originalAudioVolumePercent: useCurrentTtsSettings
                ? originalAudioVolumePercent
                : (targetJob.autoPipeline?.config?.originalAudioVolumePercent ??
                  originalAudioVolumePercent),
            };
            await postJobAction(targetJob.id, targetConfig);
          } else if (action === "mix") {
            const settings =
              targetJob.id === job?.id
                ? mixerSettings
                : targetJob.mixerSettings ||
                  targetJob.autoPipeline?.config?.mixerSettings ||
                  mixerSettings;
            await postJobAction(targetJob.id, settings);
          } else if (action === "demucs") {
            if (!targetJob.metadata?.audioCodec) {
              throw new Error("Video nguồn không có audio để Demucs tách.");
            }
            await postJobAction(targetJob.id);
          } else {
            await applyPreviewOverlayToJob(targetJob, row?.subtitle);
            await postJobAction(targetJob.id);
          }
          completed++;
        } catch (error) {
          errors.push(
            `${listedJob.fileName}: ${error instanceof Error ? error.message : "Lỗi không xác định."}`,
          );
        }
      }
    } finally {
      setAllVideosAction({
        action,
        status: "completed",
        currentIndex: targetJobs.length,
        total: targetJobs.length,
        completed,
        errors,
      });
      await loadJobHistory();
    }
  };
  const openProjectFolder = async () => {
    if (!activeProject) return;
    try {
      const response = await fetch(
        `/api/video-dubbing/projects/${activeProject.id}/open-folder`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Không thể mở thư mục project.");
    } catch (error) {
      setProjectError(
        error instanceof Error
          ? error.message
          : "Không thể mở thư mục project.",
      );
    }
  };
  const cancelMediaTask = async (task) => {
    if (!job) return;
    setMediaError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/${task}/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy tác vụ media.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
        );
      }
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể hủy tác vụ media.",
      );
    }
  };
  const startSeparation = async () => {
    if (!job) return;
    setSeparationError(null);
    setVideo((current) =>
      current?.job?.id === job.id
        ? {
            ...current,
            job: {
              ...current.job,
              separation: {
                ...current.job.separation,
                status: "processing",
                phase: "checking",
              },
            },
          }
        : current,
    );
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/separation`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu tách audio.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: { ...current.job, separation: result.separation },
            }
          : current,
      );
    } catch (error) {
      setSeparationError(
        error instanceof Error
          ? error.message
          : "Không thể bắt đầu tách audio.",
      );
      try {
        const statusResponse = await fetch(`/api/video-dubbing/jobs/${job.id}`);
        const statusResult = await statusResponse.json();
        if (statusResponse.ok && statusResult.job) {
          setVideo((current) =>
            current?.job?.id === job.id
              ? { ...current, job: statusResult.job }
              : current,
          );
        }
      } catch (statusError) {
        console.error("Không thể tải trạng thái tách audio:", statusError);
      }
    }
  };
  const cancelSeparation = async () => {
    if (!job) return;
    setSeparationError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/separation/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy tác vụ tách audio.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
        );
      }
    } catch (error) {
      setSeparationError(
        error instanceof Error
          ? error.message
          : "Không thể hủy tác vụ tách audio.",
      );
    }
  };
  const autoPipelineConfigKey = autoPipelineConfig
    ? JSON.stringify({ ...autoPipelineConfig, mixerSettings: undefined })
    : "null";
  useEffect(() => {
    if (
      !job ||
      !autoPipelineConfig ||
      isAutoPipelineRunning ||
      autoPipelineSavedConfigKeyRef.current === autoPipelineConfigKey
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => void saveAutoPipelineConfig(autoPipelineConfig),
      450,
    );
    return () => window.clearTimeout(timer);
  }, [
    job?.id,
    autoPipelineConfigKey,
    autoPipelineConfig,
    isAutoPipelineRunning,
  ]);
  const isBusy =
    !video?.error &&
    (!job || job.status === "uploading" || job.status === "probing");
  const detailVideoFile =
    detailRowIndex === null ? null : queueRows[detailRowIndex]?.video || null;
  const detailSubtitle =
    detailRowIndex === null
      ? null
      : queueRows[detailRowIndex]?.subtitle || null;
  const detailState =
    detailRowIndex === null ? null : queueStates[detailRowIndex] || null;
  const detailJobId = detailState?.jobId;
  const detailJob =
    (detailJobId && video?.job?.id === detailJobId ? video.job : null) ||
    (detailJobId
      ? jobHistory.find((item) => item.job.id === detailJobId)?.job || null
      : null);
  const previewVideoRow = (event, selectedJob) => {
    if (
      !selectedJob ||
      !(event.target instanceof Element) ||
      event.target.closest("button, a, input, select, textarea, label, summary")
    ) {
      return;
    }
    void previewSourceVideo(selectedJob);
  };
  const renderJobProcessingBar = (targetJob) => {
    const progress = getJobProcessingProgress(targetJob);
    if (!progress) return null;
    const percent =
      progress.progressPercent === undefined
        ? undefined
        : Math.max(0, Math.min(100, progress.progressPercent));
    return (
      <div className="mt-1.5 space-y-1 px-1" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-300">
          <span className="truncate">{progress.label}</span>
          <span className="shrink-0">
            {percent === undefined ? "Đang xử lý…" : `${Math.round(percent)}%`}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${progress.label}: ${targetJob.fileName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 overflow-hidden rounded-full bg-slate-800"
        >
          <div
            className={`h-full transition-all ${progress.colorClass} ${percent === undefined ? "w-1/3 animate-pulse" : ""}`}
            style={percent === undefined ? undefined : { width: `${percent}%` }}
          />
        </div>
      </div>
    );
  };
  const openCoverEditor = async (event, targetJob) => {
    event.stopPropagation();
    const activeJob =
      job?.id === targetJob.id
        ? targetJob
        : await previewSourceVideo(targetJob);
    if (!activeJob) return;
    setCoverEditorTarget(activeJob);
    setCoverEditorFile(null);
    setCoverEditorFrameCount(activeJob.overlaySettings?.coverFrameCount ?? 5);
    setCoverEditorError(null);
  };
  const renderCoverEditorButton = (targetJob) => {
    const coverFileName = targetJob.overlaySettings?.coverFileName;
    return (
      <button
        type="button"
        onClick={(event) => openCoverEditor(event, targetJob)}
        disabled={
          targetJob.status !== "completed" ||
          coverEditorBusy ||
          queueRunning ||
          settingsSyncRunning
        }
        title={
          coverFileName
            ? `Chỉnh cover · ${targetJob.fileName}`
            : `Thêm cover · ${targetJob.fileName}`
        }
        aria-label={
          coverFileName
            ? `Chỉnh ảnh cover ${targetJob.fileName}`
            : `Thêm ảnh cover ${targetJob.fileName}`
        }
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-violet-500/35 bg-violet-950/30 text-violet-200 hover:bg-violet-900/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {coverFileName ? (
          <img
            src={`/api/video-dubbing/jobs/${targetJob.id}/cover?v=${targetJob.updatedAt}`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Upload className="h-4 w-4" />
        )}
      </button>
    );
  };
  const renderVideoActions = (targetJob) => {
    const isCurrentJob = job?.id === targetJob.id;
    const autoPipelineRunning = isCurrentJob && isAutoPipelineRunning;
    const finalMixRunning = isCurrentJob && finalMix?.status === "running";
    const exportRunning = isCurrentJob && videoExport?.status === "running";
    const hasSrtToDownload = Boolean(resolveSrtDownload(targetJob));
    const hasVideoToDownload = Boolean(
      targetJob.exportedVideoFileName && targetJob.videoExport?.sizeBytes,
    );
    const audioUpdateRunning =
      targetJob.videoExport?.status === "running" &&
      targetJob.videoExport.detail?.toLowerCase().includes("audio");
    return (
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex w-full flex-row gap-1 justify-between">
          <button
            type="button"
            onClick={() =>
              void (autoPipelineRunning
                ? cancelAutoPipeline()
                : startAutoPipeline())
            }
            disabled={
              allVideosRunning ||
              !isCurrentJob ||
              (!autoPipelineRunning && !canStartAutoPipeline)
            }
            title={
              autoPipelineRunning
                ? "Hủy Auto Pipeline"
                : "Tạo TTS Master cho video này"
            }
            aria-label={
              autoPipelineRunning
                ? "Hủy Auto Pipeline"
                : `TTS ${targetJob.fileName}`
            }
            className="rounded-none border border-indigo-400/35 bg-indigo-950/20 px-1.5 py-1 text-xs font-semibold text-indigo-100 hover:bg-indigo-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {autoPipelineRunning ? "Hủy TTS" : "TTS"}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void runAllVideosAction("demucs", [targetJob]);
            }}
            disabled={
              allVideosActionDisabled ||
              !targetJob.metadata?.audioCodec ||
              targetJob.separation?.status === "processing" ||
              separationAvailability?.status !== "ready"
            }
            title={
              targetJob.separation?.status === "processing"
                ? "Demucs đang chạy"
                : separationAvailability?.status === "ready"
                  ? "Tách vocals và instrumental cho video này"
                  : separationAvailability?.message || "Demucs chưa sẵn sàng"
            }
            aria-label={`Demucs ${targetJob.fileName}`}
            className="rounded-none border border-violet-400/35 bg-violet-950/20 px-1.5 py-1 text-xs font-semibold text-violet-100 hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {targetJob.separation?.status === "processing"
              ? "Đang tách"
              : "Demucs"}
          </button>
          <button
            type="button"
            onClick={() =>
              void (finalMixRunning ? cancelFinalMix() : startFinalMix())
            }
            disabled={
              allVideosRunning ||
              !isCurrentJob ||
              (!finalMixRunning && !canRenderFinalMix)
            }
            title={
              finalMixRunning ? "Hủy render final mix" : "Render final mix"
            }
            aria-label={
              finalMixRunning
                ? "Hủy render final mix"
                : `Mix Audio ${targetJob.fileName}`
            }
            className="rounded-none border border-cyan-400/35 bg-cyan-950/20 px-1.5 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {finalMixRunning ? "Hủy Mix" : "Mix Audio"}
          </button>
          <button
            type="button"
            onClick={() =>
              void (exportRunning
                ? cancelMediaTask("export")
                : startVideoExport())
            }
            disabled={
              allVideosRunning ||
              !isCurrentJob ||
              (!exportRunning && (!canExportVideo || logoUploading))
            }
            title={exportRunning ? "Hủy export" : "Export video"}
            aria-label={
              exportRunning ? "Hủy export" : `Render ${targetJob.fileName}`
            }
            className="rounded-none border border-sky-400/35 bg-sky-950/20 px-1.5 py-1 text-xs font-semibold text-sky-100 hover:bg-sky-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exportRunning ? "Hủy" : "Render"}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              downloadSrtForJob(targetJob);
            }}
            disabled={!hasSrtToDownload}
            title={
              hasSrtToDownload
                ? "Tải phụ đề SRT đã chỉnh sửa"
                : "Video này chưa có phụ đề"
            }
            aria-label={`Tải SRT ${targetJob.fileName}`}
            className="rounded-none border border-emerald-500/35 bg-emerald-950/20 px-1.5 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-1"
          >
            <Download className="h-3.5 w-3.5" />
            <span>SRT</span>
          </button>
          {hasVideoToDownload ? (
            <a
              href={`/api/video-dubbing/jobs/${targetJob.id}/download`}
              download={
                targetJob.exportedVideoFileName ||
                `${targetJob.fileName.replace(/\.[^.]+$/, "")}_merged.mp4`
              }
              onClick={(event) => event.stopPropagation()}
              title={
                targetJob.videoExport?.status === "stale"
                  ? "Tải MP4 đã render trước đó (cài đặt hiện tại đã thay đổi)"
                  : "Tải video đã render"
              }
              aria-label={`Tải Video ${targetJob.fileName}`}
              className="inline-flex items-center justify-center gap-1 rounded-none border border-emerald-500/35 bg-emerald-950/20 px-1.5 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-950/40"
            >
              <Download className="h-3.5 w-3.5" />
              <span>MP4</span>
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Render video trước khi tải"
              aria-label={`Tải Video ${targetJob.fileName} (chưa sẵn sàng)`}
              className="inline-flex items-center justify-center gap-1 rounded-none border border-emerald-500/35 bg-emerald-950/10 px-1.5 py-1 text-xs font-semibold text-emerald-100 opacity-40 cursor-not-allowed"
            >
              <Download className="h-3.5 w-3.5" />
              <span>MP4</span>
            </button>
          )}
        </div>
        <div className="flex w-full flex-row gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void updateRenderedAudio(targetJob);
            }}
            disabled={
              !hasVideoToDownload ||
              targetJob.videoExport?.status === "running" ||
              targetJob.finalMix?.status === "running" ||
              allVideosRunning
            }
            title={
              !hasVideoToDownload
                ? "Hãy render video trước"
                : "Thay audio MP4 bằng Final Mix mới, không mã hóa lại hình ảnh"
            }
            aria-label={`Cập nhật Audio MP4 ${targetJob.fileName}`}
            className="col-span-3 inline-flex items-center justify-center gap-1.5 rounded-none border border-fuchsia-400/35 bg-fuchsia-950/20 px-2 py-1.5 text-xs font-semibold text-fuchsia-100 hover:bg-fuchsia-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {audioUpdateRunning && (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            )}
            {audioUpdateRunning
              ? "Đang cập nhật Audio MP4…"
              : "⚡ Cập nhật Audio MP4"}
          </button>
        </div>
        {audioUpdateErrors[targetJob.id] && (
          <p className="text-[10px] leading-snug text-rose-300" role="alert">
            {audioUpdateErrors[targetJob.id]}
          </p>
        )}
      </div>
    );
  };
  const overlayAlignment = getOverlayAlignment(logoPosition);
  const subtitleOverlayAlignment = getOverlayAlignment(subtitlePosition);
  const subtitleCueOverrides = job?.id
    ? (subtitleCueOverridesByVideoId[job.id] ?? null)
    : null;
  const previewSubtitleCues =
    subtitleCueOverrides ||
    srt?.analysis?.items ||
    job?.overlaySettings?.subtitles ||
    [];
  useEffect(() => {
    if (!job?.id || !previewSubtitleCues.length) return;
    const seen = new Set();
    const needsIds = previewSubtitleCues.some((cue) => {
      const id = cue.id;
      if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || seen.has(id))
        return true;
      seen.add(id);
      return false;
    });
    if (!needsIds) return;
    setSubtitleCueOverridesByVideoId((current) => {
      const cues = current[job.id] ?? previewSubtitleCues;
      const ids = new Set();
      return {
        ...current,
        [job.id]: cues.map((cue) => {
          let id = cue.id;
          if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || ids.has(id)) {
            id = crypto.randomUUID();
          }
          ids.add(id);
          return { ...cue, id };
        }),
      };
    });
  }, [job?.id, previewSubtitleCues]);
  const subtitleAudioInput = currentTtsSubtitleItems.map((item, index) => ({
    id: item.id,
    index: index + 1,
    startTime: item.startTime,
    endTime: item.endTime,
    text: item.text,
  }));
  const subtitleAudioInputKey = JSON.stringify(subtitleAudioInput);
  const activeSubtitleAudioFilterCount =
    Number(subtitleAudioShortFilterEnabled) +
    Number(subtitleAudioSpecialCharactersFilterEnabled) +
    Number(subtitleAudioNonAlphabetFilterEnabled) +
    Number(subtitleAudioSimilarFilterEnabled);
  const filteredSubtitleAudioInput = filterSubtitleAudioItems(
    subtitleAudioInput,
    {
      ...(subtitleAudioShortFilterEnabled
        ? { maxCharacterCount: subtitleAudioMaxCharacterCount }
        : {}),
      specialCharactersOnly: subtitleAudioSpecialCharactersFilterEnabled,
      nonAlphabetOnly: subtitleAudioNonAlphabetFilterEnabled,
      similarAdjacent: subtitleAudioSimilarFilterEnabled,
      similarityThreshold: 0.8,
    },
  );
  useEffect(() => {
    setSubtitleAudioItems([]);
    setSubtitleAudioError(null);
    setSubtitleAudioDrafts({});
    subtitleAudioPlaybackIdRef.current = null;
    setSubtitleAudioPlayingId(null);
    const player = subtitleAudioPlayerRef.current;
    if (player) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
  }, [job?.id]);
  useEffect(
    () => () => {
      const player = subtitleAudioPlayerRef.current;
      if (!player) return;
      subtitleAudioPlaybackIdRef.current = null;
      player.pause();
      player.removeAttribute("src");
    },
    [],
  );
  useEffect(() => {
    const activeJob = video?.job;
    if (!activeJob) return;
    const previousJobId = activeSubtitleSourceJobIdRef.current;
    const jobChanged = previousJobId !== activeJob.id;
    activeSubtitleSourceJobIdRef.current = activeJob.id;
    const queuedSubtitle = pairVideoDubbingQueueRows(
      [
        {
          id: activeJob.id,
          name: video.fileName,
          job: activeJob,
        },
      ],
      subtitleFiles,
    )[0]?.subtitle;
    const projectSubtitle = activeProject?.sourceSrts?.find(
      (source) =>
        source.videoId === activeJob.id ||
        (!source.videoId &&
          source.matchByName !== false &&
          fileStem(source.fileName) === fileStem(video.fileName)),
    );
    const legacyProjectSubtitle =
      activeProject?.activeJobId === activeJob.id
        ? activeProject.srt
        : undefined;
    const source =
      queuedSubtitle?.content !== undefined
        ? queuedSubtitle
        : projectSubtitle
          ? {
              fileName: projectSubtitle.fileName,
              content: projectSubtitle.content,
              sizeBytes: new Blob([projectSubtitle.content]).size,
            }
          : legacyProjectSubtitle
            ? {
                fileName: legacyProjectSubtitle.fileName,
                content: legacyProjectSubtitle.content,
                sizeBytes: new Blob([legacyProjectSubtitle.content]).size,
              }
            : null;
    if (source?.content !== undefined) {
      const analysis =
        "analysis" in source && source.analysis
          ? source.analysis
          : analyzeSrtContent(source.content);
      setSrt({
        fileName: source.fileName,
        sizeBytes: source.sizeBytes,
        content: source.content,
        analysis,
        error: "error" in source ? source.error : undefined,
      });
      setSrtContent(source.content);
      setSubtitlesEnabled(true);
    } else if (jobChanged && previousJobId !== null) {
      setSrt(null);
      setSrtContent("");
      setSelectedSubtitleCue(null);
    }
  }, [video?.job?.id, video?.fileName, subtitleFiles, activeProject]);
  useEffect(() => {
    if (videoWorkspaceTab !== "preview" || !job?.id) return;
    if (subtitleAudioInput.length) {
      subtitleAudioKnownNonEmptyJobIdsRef.current.add(job.id);
    } else if (!subtitleAudioKnownNonEmptyJobIdsRef.current.has(job.id)) {
      return;
    }
    const requestId = ++subtitleAudioSyncRequestRef.current;
    const timer = window.setTimeout(() => {
      setSubtitleAudioSyncing(true);
      setSubtitleAudioError(null);
      void fetch(`/api/video-dubbing/jobs/${job.id}/subtitle-audio`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: JSON.parse(subtitleAudioInputKey) }),
      })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok || !Array.isArray(result.items)) {
            throw new Error(
              result.error || "Không thể đồng bộ audio từng câu.",
            );
          }
          if (requestId === subtitleAudioSyncRequestRef.current) {
            setSubtitleAudioItems(result.items);
          }
        })
        .catch((error) => {
          if (requestId === subtitleAudioSyncRequestRef.current) {
            setSubtitleAudioError(
              error instanceof Error
                ? error.message
                : "Không thể đồng bộ audio từng câu.",
            );
          }
        })
        .finally(() => {
          if (requestId === subtitleAudioSyncRequestRef.current)
            setSubtitleAudioSyncing(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      subtitleAudioSyncRequestRef.current += 1;
    };
  }, [videoWorkspaceTab, job?.id, subtitleAudioInputKey]);
  const updatePreviewSubtitleCues = (update) => {
    if (!job) return;
    setSubtitleCueOverridesByVideoId((current) => {
      const currentCues = current[job.id] ?? previewSubtitleCues;
      return {
        ...current,
        [job.id]: update(currentCues).map((cue) => ({
          id: cue.id || crypto.randomUUID(),
          startTime: cue.startTime,
          endTime: cue.endTime,
          text: cue.text,
        })),
      };
    });
  };
  const updateSelectedSubtitleCue = (patch) => {
    if (selectedSubtitleCue === null) return;
    updatePreviewSubtitleCues((cues) =>
      cues.map((cue, index) =>
        index === selectedSubtitleCue ? { ...cue, ...patch } : cue,
      ),
    );
  };
  const saveSubtitleAudioCueChanges = (cues) => {
    updatePreviewSubtitleCues(() => cues);
    const content = formatVideoDubbingSrt(cues);
    const analysis = content ? analyzeSrtContent(content) : undefined;
    setSrtContent(content);
    setSrt((current) => ({
      fileName: current?.fileName || "subtitles.srt",
      sizeBytes: new TextEncoder().encode(content).length,
      content,
      analysis,
    }));
  };
  const adjustSubtitleAudioCueTiming = (cueId, field, direction) => {
    const draft = subtitleAudioDrafts[cueId];
    if (draft !== undefined && !draft.trim()) {
      commitSubtitleAudioCueText(cueId);
      return;
    }
    const cues = previewSubtitleCues.map((cue) =>
      cue.id === cueId && draft !== undefined
        ? { ...cue, text: draft.trim() }
        : cue,
    );
    const delta = (subtitleAudioTimingStepMs / 1000) * direction;
    const adjustedCues = adjustSubtitleCueTimings(
      cues,
      field,
      delta,
      job?.metadata?.durationSeconds,
    );
    const adjustedCue = adjustedCues.find((cue) => cue.id === cueId);
    if (!adjustedCue) return;
    saveSubtitleAudioCueChanges(
      cues.map((cue) => (cue.id === cueId ? adjustedCue : cue)),
    );
    setSubtitleAudioDrafts((current) => {
      const next = { ...current };
      delete next[cueId];
      return next;
    });
  };
  const commitSubtitleAudioCueText = (cueId) => {
    const draft = subtitleAudioDrafts[cueId];
    if (draft === undefined) return;
    if (!draft.trim()) {
      setSubtitleAudioError(
        "Nội dung phụ đề không được để trống; hãy dùng nút xóa câu nếu muốn bỏ câu.",
      );
      setSubtitleAudioDrafts((current) => {
        const next = { ...current };
        delete next[cueId];
        return next;
      });
      return;
    }
    const cues = previewSubtitleCues.map((cue) =>
      cue.id === cueId ? { ...cue, text: draft.trim() } : cue,
    );
    saveSubtitleAudioCueChanges(cues);
    setSubtitleAudioDrafts((current) => {
      const next = { ...current };
      delete next[cueId];
      return next;
    });
    setSubtitleAudioError(null);
  };
  const regenerateSubtitleAudioWithDraft = (item) => {
    const draft = subtitleAudioDrafts[item.id];
    if (draft !== undefined && !draft.trim()) {
      commitSubtitleAudioCueText(item.id);
      return;
    }
    if (draft !== undefined) commitSubtitleAudioCueText(item.id);
    void regenerateSubtitleAudio({
      ...item,
      text: draft?.trim() || item.text,
    });
  };
  const deleteSubtitleAudioCue = (cueId) => {
    const cues = previewSubtitleCues.filter((cue) => cue.id !== cueId);
    if (cues.length === previewSubtitleCues.length) return;
    saveSubtitleAudioCueChanges(cues);
    setSubtitleAudioError(null);
  };
  const playSubtitleAudio = async (item) => {
    if (!item.audioUrl) return;
    let player = subtitleAudioPlayerRef.current;
    if (!player) {
      player = new Audio();
      player.preload = "none";
      player.onended = () => {
        subtitleAudioPlaybackIdRef.current = null;
        setSubtitleAudioPlayingId(null);
      };
      player.onerror = () => {
        const playbackId = subtitleAudioPlaybackIdRef.current;
        if (!playbackId) return;
        subtitleAudioPlaybackIdRef.current = null;
        setSubtitleAudioPlayingId(null);
        setSubtitleAudioError("Không thể phát audio câu phụ đề.");
      };
      subtitleAudioPlayerRef.current = player;
    }
    if (subtitleAudioPlaybackIdRef.current === item.id && !player.paused) {
      player.pause();
      subtitleAudioPlaybackIdRef.current = null;
      setSubtitleAudioPlayingId(null);
      return;
    }
    player.pause();
    const playbackId = item.id;
    subtitleAudioPlaybackIdRef.current = playbackId;
    player.src = `${item.audioUrl}?v=${encodeURIComponent(item.generatedText || "")}`;
    setSubtitleAudioError(null);
    try {
      await player.play();
      if (subtitleAudioPlaybackIdRef.current === playbackId) {
        setSubtitleAudioPlayingId(playbackId);
      }
    } catch (error) {
      if (subtitleAudioPlaybackIdRef.current !== playbackId) return;
      subtitleAudioPlaybackIdRef.current = null;
      setSubtitleAudioPlayingId(null);
      setSubtitleAudioError(
        error instanceof Error
          ? `Không thể phát audio: ${error.message}`
          : "Không thể phát audio.",
      );
    }
  };
  const combineSubtitleAudioCueAbove = (cueId, mode) => {
    const currentIndex = previewSubtitleCues.findIndex(
      (cue) => cue.id === cueId,
    );
    if (currentIndex <= 0) return;
    const aboveId = previewSubtitleCues[currentIndex - 1].id;
    const cues = combineSubtitleCueWithPrevious(
      previewSubtitleCues,
      cueId,
      mode,
      subtitleAudioDrafts,
    );
    if (!cues) return;
    saveSubtitleAudioCueChanges(cues);
    setSubtitleAudioDrafts((current) => {
      const next = { ...current };
      delete next[cueId];
      if (aboveId) delete next[aboveId];
      return next;
    });
    setSubtitleAudioError(null);
  };
  const adjustAllSubtitleCues = (field, direction) => {
    const delta = (subtitleTimingAdjustmentsMs[field] / 1000) * direction;
    if (!Number.isFinite(delta) || delta === 0) return;
    updatePreviewSubtitleCues((originalCues) => {
      return adjustSubtitleCueTimings(
        originalCues,
        field,
        delta,
        job?.metadata?.durationSeconds,
      );
    });
  };
  const renderSubtitleTimingAdjustment = (field, label) => (
    <div className="inline-flex items-center gap-1 whitespace-nowrap">
      <span>{label}:</span>
      <button
        type="button"
        disabled={!previewSubtitleCues.length || !job}
        onClick={() => adjustAllSubtitleCues(field, -1)}
        aria-label={`${label} giảm ${subtitleTimingAdjustmentsMs[field]} mili giây cho toàn bộ phụ đề`}
        title={`${label} giảm ${subtitleTimingAdjustmentsMs[field]} ms trên toàn bộ phụ đề`}
        className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300 hover:border-cyan-500/50 disabled:opacity-40"
      >
        ←
      </button>
      <input
        type="number"
        min={1}
        step={1}
        value={subtitleTimingAdjustmentsMs[field]}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value) && value >= 1) {
            setSubtitleTimingAdjustmentsMs((current) => ({
              ...current,
              [field]: Math.round(value),
            }));
          }
        }}
        aria-label={`${label} mili giây`}
        className="w-14 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-center text-slate-200"
      />
      <span>ms</span>
      <button
        type="button"
        disabled={!previewSubtitleCues.length || !job}
        onClick={() => adjustAllSubtitleCues(field, 1)}
        aria-label={`${label} tăng ${subtitleTimingAdjustmentsMs[field]} mili giây cho toàn bộ phụ đề`}
        title={`${label} tăng ${subtitleTimingAdjustmentsMs[field]} ms trên toàn bộ phụ đề`}
        className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300 hover:border-cyan-500/50 disabled:opacity-40"
      >
        →
      </button>
    </div>
  );
  const subtitleTimelineDuration = Math.max(
    1,
    job?.metadata?.durationSeconds || 0,
    job?.overlaySettings?.endScene?.enabled
      ? (job.metadata?.durationSeconds || 0) + endSceneDurationSeconds
      : 0,
    ...previewSubtitleCues.map((cue) => cue.endTime),
    ...textOverlays.filter((cue) => !cue.isTitle).map((cue) => cue.endTime),
  );
  const subtitleTimelineCursor =
    previewStatus === "playing"
      ? previewCurrentTime
      : subtitleTimelineCursorTime;
  const previewingEndScene =
    videoWorkspaceTab === "preview" &&
    Boolean(job?.overlaySettings?.endScene?.enabled) &&
    Boolean(job?.metadata) &&
    subtitleTimelineCursor >=
      (job?.metadata?.durationSeconds ?? Number.POSITIVE_INFINITY);
  subtitleTimelineCursorRef.current = subtitleTimelineCursor;
  const fitSubtitleTimelineToPanel = () => {
    const container = subtitleTimelineScrollRef.current;
    if (!container) return;
    const viewportWidth = container.clientWidth;
    if (viewportWidth <= 0) return;
    setSubtitleTimelineViewportWidth(viewportWidth);
    subtitleTimelineFitRef.current = true;
    subtitleTimelineZoomFocusRef.current = "left";
    setSubtitleTimelineZoom(
      Math.max(0.001, Math.min(180, viewportWidth / subtitleTimelineDuration)),
    );
    container.scrollLeft = 0;
  };
  const changeSubtitleTimelineZoom = (zoom) => {
    subtitleTimelineFitRef.current = false;
    subtitleTimelineZoomFocusRef.current = "playhead";
    setSubtitleTimelineZoom(zoom);
  };
  const deleteActiveTextTrack = () => {
    if (!textTracks.some((track) => track.id === activeTextTrackId)) return;
    setTextTracks((tracks) =>
      tracks.filter((track) => track.id !== activeTextTrackId),
    );
    setTextOverlays((cues) =>
      cues.filter(
        (cue) =>
          cue.isTitle ||
          (cue.trackId || DEFAULT_TEXT_TRACK_ID) !== activeTextTrackId,
      ),
    );
    setActiveTextTrackId(
      textTracks.find((track) => track.id !== activeTextTrackId)?.id ||
        DEFAULT_TEXT_TRACK_ID,
    );
    setSelectedTextOverlay(null);
    setSelectedSubtitleCue(null);
  };
  useEffect(() => {
    characterCardOcrRequestRef.current += 1;
    setCharacterCardRegion(null);
    setCharacterCardRegionDraft(null);
    setCharacterCardDrawStart(null);
    setCharacterCardDrawMode(false);
    setCharacterCardOcrJob(null);
    setCharacterCardOcrError(null);
  }, [job?.id]);
  useEffect(() => {
    if (timelineWorkspaceTab !== "subtitle") return;
    const onKeyDown = (event) => {
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        !target.closest("[data-video-dubbing-timeline]")
      )
        return;
      if (
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox']",
        )
      )
        return;
      const hasModifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (event.shiftKey && !hasModifier && key === "z") {
        event.preventDefault();
        fitSubtitleTimelineToPanel();
        return;
      }
      if (hasModifier && (key === "c" || key === "v")) {
        if (key === "c") {
          if (selectedTextOverlay !== null) {
            const cue = textOverlays[selectedTextOverlay];
            if (!cue || cue.isTitle) return;
            timelineCueClipboardRef.current = { kind: "text", cue: { ...cue } };
          } else if (selectedSubtitleCue !== null) {
            const cue = previewSubtitleCues[selectedSubtitleCue];
            if (!cue) return;
            timelineCueClipboardRef.current = {
              kind: "subtitle",
              cue: { ...cue },
            };
          } else {
            return;
          }
          event.preventDefault();
          return;
        }
        const clipboard = timelineCueClipboardRef.current;
        if (!clipboard || !job) return;
        event.preventDefault();
        const duration = Math.max(
          0.1,
          job.metadata?.durationSeconds || subtitleTimelineDuration,
        );
        const startTime = Math.min(
          subtitleTimelineCursor,
          Math.max(0, duration - 0.1),
        );
        if (clipboard.kind === "subtitle") {
          const cueDuration = Math.max(
            0.1,
            clipboard.cue.endTime - clipboard.cue.startTime,
          );
          const cue = {
            ...clipboard.cue,
            id: crypto.randomUUID(),
            startTime,
            endTime: Math.min(duration, startTime + cueDuration),
          };
          setSelectedTextOverlay(null);
          setSelectedSubtitleCue(previewSubtitleCues.length);
          setSubtitlesEnabled(true);
          updatePreviewSubtitleCues((cues) => [...cues, cue]);
        } else {
          const cueDuration = Math.max(
            0.1,
            clipboard.cue.endTime - clipboard.cue.startTime,
          );
          const cue = {
            ...clipboard.cue,
            id: crypto.randomUUID(),
            startTime,
            endTime: Math.min(duration, startTime + cueDuration),
            isTitle: false,
            extendToVideoEnd: false,
          };
          setSelectedSubtitleCue(null);
          setSelectedTextOverlay(textOverlays.length);
          setActiveTextTrackId(cue.trackId || DEFAULT_TEXT_TRACK_ID);
          setTextOverlays([...textOverlays, cue]);
        }
        return;
      }
      if (event.key !== "Delete" || hasModifier) return;
      if (selectedTextOverlay !== null) {
        const cue = textOverlays[selectedTextOverlay];
        if (!cue || cue.isTitle) return;
        event.preventDefault();
        setTextOverlays(
          textOverlays.filter((_, index) => index !== selectedTextOverlay),
        );
        setSelectedTextOverlay(null);
      } else if (
        selectedSubtitleCue !== null &&
        previewSubtitleCues[selectedSubtitleCue]
      ) {
        event.preventDefault();
        updatePreviewSubtitleCues((cues) =>
          cues.filter((_, index) => index !== selectedSubtitleCue),
        );
        setSelectedSubtitleCue(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    timelineWorkspaceTab,
    selectedTextOverlay,
    selectedSubtitleCue,
    textOverlays,
    previewSubtitleCues,
    job,
    subtitleTimelineDuration,
    subtitleTimelineCursor,
    updatePreviewSubtitleCues,
    fitSubtitleTimelineToPanel,
  ]);
  const subtitleTimelineWidth = Math.max(
    subtitleTimelineViewportWidth,
    subtitleTimelineDuration * subtitleTimelineZoom,
  );
  const subtitleTimelineMinZoom = Math.min(
    8,
    Math.max(0.001, subtitleTimelineViewportWidth / subtitleTimelineDuration),
  );
  const subtitleTimelineStep = Math.max(
    5,
    Math.ceil(subtitleTimelineDuration / 12 / 5) * 5,
  );
  const subtitleTimelineTicks = Array.from(
    { length: Math.floor(subtitleTimelineDuration / subtitleTimelineStep) + 1 },
    (_, index) => index * subtitleTimelineStep,
  );
  useEffect(() => {
    const container = subtitleTimelineScrollRef.current;
    if (!container) return;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey) {
        const direction = event.deltaY < 0 ? 1 : -1;
        subtitleTimelineFitRef.current = false;
        subtitleTimelineZoomFocusRef.current = "playhead";
        setSubtitleTimelineZoom((current) =>
          adjustSubtitleTimelineZoom(
            current,
            direction > 0 ? "in" : "out",
            subtitleTimelineMinZoom,
          ),
        );
        return;
      }
      container.scrollLeft += event.deltaY || event.deltaX;
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [
    job?.id,
    previewSubtitleCues.length,
    subtitleTimelineDuration,
    subtitleTimelineMinZoom,
  ]);
  useEffect(() => {
    const container = subtitleTimelineScrollRef.current;
    if (!container) return;
    const updateViewportWidth = () => {
      const viewportWidth = container.clientWidth;
      if (viewportWidth <= 0) return;
      setSubtitleTimelineViewportWidth(viewportWidth);
      if (subtitleTimelineFitRef.current) {
        subtitleTimelineZoomFocusRef.current = "left";
        setSubtitleTimelineZoom(
          Math.max(
            0.001,
            Math.min(180, viewportWidth / subtitleTimelineDuration),
          ),
        );
      }
    };
    updateViewportWidth();
    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [job?.id, timelineWorkspaceTab, subtitleTimelineDuration]);
  useEffect(() => {
    if (timelineWorkspaceTab !== "subtitle") return;
    const frame = window.requestAnimationFrame(() => {
      const container = subtitleTimelineScrollRef.current;
      if (!container) return;
      if (subtitleTimelineZoomFocusRef.current === "left") {
        subtitleTimelineZoomFocusRef.current = "playhead";
        container.scrollLeft = 0;
        return;
      }
      const markerX =
        (subtitleTimelineCursor / subtitleTimelineDuration) *
        subtitleTimelineWidth;
      container.scrollLeft = Math.max(0, markerX - container.clientWidth / 2);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    subtitleTimelineZoom,
    subtitleTimelineWidth,
    subtitleTimelineDuration,
    timelineWorkspaceTab,
  ]);
  useEffect(() => {
    if (previewStatus !== "playing" || subtitleTimelineFitRef.current) return;
    let frame = 0;
    const keepPlayheadCentered = () => {
      const container = subtitleTimelineScrollRef.current;
      if (container && !subtitleTimelineFitRef.current) {
        const markerX =
          (subtitleTimelineCursorRef.current / subtitleTimelineDuration) *
          subtitleTimelineWidth;
        const nextScrollLeft = Math.max(0, markerX - container.clientWidth / 2);
        if (Math.abs(container.scrollLeft - nextScrollLeft) > 1) {
          container.scrollLeft = nextScrollLeft;
        }
      }
      frame = window.requestAnimationFrame(keepPlayheadCentered);
    };
    frame = window.requestAnimationFrame(keepPlayheadCentered);
    return () => window.cancelAnimationFrame(frame);
  }, [previewStatus, subtitleTimelineDuration, subtitleTimelineWidth]);
  const subtitleTimelineItems = [];
  const subtitleTimelineLaneEnds = [];
  previewSubtitleCues
    .map((cue, index) => ({ cue, index }))
    .sort((first, second) => first.cue.startTime - second.cue.startTime)
    .forEach(({ cue, index }) => {
      let lane = subtitleTimelineLaneEnds.findIndex(
        (end) => end <= cue.startTime,
      );
      if (lane < 0) lane = subtitleTimelineLaneEnds.length;
      subtitleTimelineLaneEnds[lane] = cue.endTime;
      subtitleTimelineItems.push({ cue, index, lane });
    });
  const textTimelineLanes = getTextOverlayTimelineLanes(
    textOverlays,
    DEFAULT_TEXT_TRACK_ID,
  );
  const activePreviewSubtitle = subtitlesEnabled
    ? previewSubtitleCues.find(
        (cue) =>
          cue.startTime <= previewCurrentTime &&
          cue.endTime >= previewCurrentTime,
      )
    : undefined;
  const orderedSubtitleAudioInput = [...subtitleAudioInput].sort(
    (first, second) =>
      first.startTime - second.startTime || first.index - second.index,
  );
  const activeSubtitleAudioIndex = orderedSubtitleAudioInput.findIndex(
    (item) =>
      item.startTime <= previewCurrentTime &&
      item.endTime >= previewCurrentTime,
  );
  const activeSubtitleAudioItem =
    activeSubtitleAudioIndex >= 0
      ? orderedSubtitleAudioInput[activeSubtitleAudioIndex]
      : undefined;
  const previousSubtitleAudioItem =
    activeSubtitleAudioIndex >= 0
      ? orderedSubtitleAudioInput[activeSubtitleAudioIndex - 1]
      : [...orderedSubtitleAudioInput]
          .reverse()
          .find((item) => item.startTime < previewCurrentTime);
  const nextSubtitleAudioItem =
    activeSubtitleAudioIndex >= 0
      ? orderedSubtitleAudioInput[activeSubtitleAudioIndex + 1]
      : orderedSubtitleAudioInput.find(
          (item) => item.startTime > previewCurrentTime,
        );
  const activeSubtitleAudioRow = activeSubtitleAudioItem
    ? subtitleAudioItems.find(
        (entry) => entry.id === activeSubtitleAudioItem.id,
      )
    : undefined;
  const activeSubtitleAudio = activeSubtitleAudioItem
    ? {
        ...activeSubtitleAudioItem,
        targetDuration: Math.max(
          0.1,
          activeSubtitleAudioItem.endTime - activeSubtitleAudioItem.startTime,
        ),
        status: "pending",
      }
    : undefined;
  const previewTextOverlays = textOverlays.map((cue) =>
    cue.isTitle
      ? {
          ...cue,
          startTime: 0,
          endTime: job?.metadata?.durationSeconds ?? cue.endTime,
        }
      : cue,
  );
  const titleOverlayIndex = textOverlays.findIndex((cue) => cue.isTitle);
  const titleOverlay =
    titleOverlayIndex >= 0 ? textOverlays[titleOverlayIndex] : undefined;
  const activePreviewTextItems = previewTextOverlays
    .map((cue, index) => ({ cue, index }))
    .filter(
      ({ cue }) =>
        cue.enabled !== false &&
        cue.startTime <= previewCurrentTime &&
        cue.endTime >= previewCurrentTime,
    );
  const updateSelectedTextOverlay = (patch) => {
    if (selectedTextOverlay === null) return;
    if (textOverlays[selectedTextOverlay]?.kind === "character-card") {
      setCharacterCardStyle((current) =>
        resolveCharacterCardStyle({ ...current, ...patch }, current),
      );
    }
    setTextOverlays((items) =>
      items.map((item, index) =>
        index === selectedTextOverlay ? { ...item, ...patch } : item,
      ),
    );
  };
  const applySelectedTextOverlayToTrack = () => {
    if (selectedTextOverlay === null) return;
    const cue = textOverlays[selectedTextOverlay];
    if (!cue || cue.isTitle) return;
    const trackId = cue.trackId || DEFAULT_TEXT_TRACK_ID;
    const styleAndPosition = {
      fontFamily: cue.fontFamily,
      fontSize: cue.fontSize,
      bold: cue.bold,
      italic: cue.italic,
      underline: cue.underline,
      textCase: cue.textCase,
      color: cue.color,
      outlineEnabled: cue.outlineEnabled,
      outlineColor: cue.outlineColor,
      outlineWidthPx: cue.outlineWidthPx,
      characterSpacingPx: cue.characterSpacingPx,
      lineSpacingPx: cue.lineSpacingPx,
      textAlign: cue.textAlign ?? getSubtitleTextAlignment(cue.position),
      position: cue.position,
      xPercent: cue.xPercent,
      yPercent: cue.yPercent,
      backgroundColor: cue.backgroundColor,
      backgroundTransparent: cue.backgroundTransparent,
      paddingPx: cue.paddingPx,
    };
    if (cue.kind === "character-card") {
      setCharacterCardStyle((current) =>
        resolveCharacterCardStyle({ ...cue, ...styleAndPosition }, current),
      );
    }
    setTextOverlays((items) =>
      items.map((item) =>
        !item.isTitle && (item.trackId || DEFAULT_TEXT_TRACK_ID) === trackId
          ? {
              ...item,
              ...styleAndPosition,
              ...(cue.kind === "character-card" &&
              item.kind === "character-card"
                ? { characterRoleFontSize: cue.characterRoleFontSize }
                : {}),
            }
          : item,
      ),
    );
  };
  const addTextOverlayToTrack = (kind = "text") => {
    if (!job) return;
    const trackId = textTracks.some((track) => track.id === activeTextTrackId)
      ? activeTextTrackId
      : textTracks[0]?.id || DEFAULT_TEXT_TRACK_ID;
    const duration = Math.max(
      0.1,
      job.metadata?.durationSeconds || subtitleTimelineDuration,
    );
    const startTime = Math.min(
      subtitleTimelineCursor,
      Math.max(0, duration - 0.1),
    );
    const trackStyle =
      kind === "character-card"
        ? characterCardStyle
        : textOverlays.find(
            (item) =>
              !item.isTitle &&
              (item.trackId || DEFAULT_TEXT_TRACK_ID) === trackId,
          );
    const cue = {
      kind,
      startTime,
      endTime: Math.min(duration, startTime + 3),
      text: kind === "character-card" ? "Tên nhân vật" : "Text mới",
      characterRole: kind === "character-card" ? "Chức vụ" : undefined,
      characterRoleFontSize:
        kind === "character-card"
          ? (trackStyle?.characterRoleFontSize ??
            Math.max(8, Math.round((trackStyle?.fontSize ?? 32) * 0.7)))
          : undefined,
      trackId,
      fontSize: trackStyle?.fontSize ?? 28,
      fontFamily: trackStyle?.fontFamily ?? "Arial",
      color: trackStyle?.color ?? "#ffffff",
      bold: trackStyle?.bold ?? false,
      italic: trackStyle?.italic ?? false,
      underline: trackStyle?.underline ?? false,
      textCase: trackStyle?.textCase ?? "none",
      outlineEnabled: trackStyle?.outlineEnabled ?? false,
      outlineColor: trackStyle?.outlineColor ?? "#000000",
      outlineWidthPx: trackStyle?.outlineWidthPx ?? 2,
      characterSpacingPx: trackStyle?.characterSpacingPx ?? 0,
      lineSpacingPx: trackStyle?.lineSpacingPx ?? 0,
      textAlign:
        trackStyle?.textAlign ??
        (trackStyle ? getSubtitleTextAlignment(trackStyle.position) : "center"),
      position: trackStyle?.position ?? "middle-center",
      xPercent: trackStyle?.xPercent,
      yPercent: trackStyle?.yPercent,
      backgroundColor: trackStyle?.backgroundColor ?? "#000000",
      backgroundTransparent: trackStyle?.backgroundTransparent ?? true,
      paddingPx: trackStyle?.paddingPx ?? 0,
    };
    setTextOverlays((items) => [...items, cue]);
    setSelectedTextOverlay(textOverlays.length);
  };
  const startCharacterCardOcrWorker = async () => {
    setCharacterCardOcrError(null);
    try {
      const response = await fetch("/api/subtitle-ocr/worker/start", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok || !result.worker) {
        throw new Error(result.error || "Không thể bật OCR thường trực.");
      }
      setCharacterCardOcrWorker(result.worker);
    } catch (error) {
      setCharacterCardOcrError(
        error instanceof Error
          ? error.message
          : "Không thể bật OCR thường trực.",
      );
    }
  };
  const stopCharacterCardOcrWorker = async () => {
    setCharacterCardOcrError(null);
    try {
      const response = await fetch("/api/subtitle-ocr/worker/stop", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok || !result.worker) {
        throw new Error(result.error || "Không thể dừng OCR thường trực.");
      }
      setCharacterCardOcrWorker(result.worker);
      if (
        characterCardOcrJob?.status === "running" ||
        characterCardOcrJob?.status === "queued"
      ) {
        characterCardOcrRequestRef.current += 1;
        setCharacterCardOcrJob({
          ...characterCardOcrJob,
          status: "cancelled",
          message: "Đã dừng worker OCR thường trực.",
        });
      }
    } catch (error) {
      setCharacterCardOcrError(
        error instanceof Error
          ? error.message
          : "Không thể dừng OCR thường trực.",
      );
    }
  };
  const acceptCharacterCardReferenceFile = (file) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setCharacterCardReferenceError(
        "Ảnh mẫu cần có định dạng PNG, JPEG hoặc WebP.",
      );
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setCharacterCardReferenceError("Ảnh mẫu không được vượt quá 8 MB.");
      return;
    }
    setCharacterCardReferenceFile(file);
    setCharacterCardReferenceError(null);
    setCharacterCardReferenceScanJob(null);
    setCharacterCardReferenceSelectedIds([]);
  };
  const pasteCharacterCardReference = (event) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/"),
    );
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    acceptCharacterCardReferenceFile(file);
  };
  const startCharacterCardReferenceScan = async () => {
    if (!job || !characterCardRegion || !characterCardReferenceFile) return;
    const requestId = ++characterCardReferenceScanRequestRef.current;
    setCharacterCardReferenceError(null);
    setCharacterCardReferenceSelectedIds([]);
    setCharacterCardReferenceScanJob(null);
    try {
      const referenceImage = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Không thể đọc ảnh mẫu."));
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            reject(new Error("Không thể đọc ảnh mẫu."));
            return;
          }
          resolve(reader.result);
        };
        reader.readAsDataURL(characterCardReferenceFile);
      });
      if (requestId !== characterCardReferenceScanRequestRef.current) return;
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/character-card-reference-scan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            referenceImage,
            region: characterCardRegion,
            framesToSkip: characterCardReferenceFramesToSkip,
            similarityThreshold: characterCardReferenceSimilarity,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể bắt đầu quét ảnh mẫu.");
      }
      let scanJob = result.job;
      characterCardReferenceScanJobIdRef.current = scanJob.id;
      setCharacterCardReferenceScanJob(scanJob);
      while (scanJob.status === "running") {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        if (requestId !== characterCardReferenceScanRequestRef.current) return;
        const statusResponse = await fetch(
          `/api/video-dubbing/character-card-reference-scans/${scanJob.id}`,
        );
        const statusResult = await statusResponse.json();
        if (!statusResponse.ok || !statusResult.job) {
          throw new Error(
            statusResult.error || "Không lấy được trạng thái quét ảnh mẫu.",
          );
        }
        scanJob = statusResult.job;
        setCharacterCardReferenceScanJob(scanJob);
      }
      if (characterCardReferenceScanJobIdRef.current === scanJob.id) {
        characterCardReferenceScanJobIdRef.current = null;
      }
      if (requestId !== characterCardReferenceScanRequestRef.current) return;
      if (scanJob.status !== "completed") {
        throw new Error(
          scanJob.error ||
            scanJob.message ||
            "Quét ảnh mẫu đã dừng trước khi hoàn tất.",
        );
      }
      setCharacterCardReferenceSelectedIds(
        scanJob.results.map((item) => item.id),
      );
    } catch (error) {
      if (requestId === characterCardReferenceScanRequestRef.current) {
        setCharacterCardReferenceError(
          error instanceof Error ? error.message : "Không thể quét ảnh mẫu.",
        );
      }
    }
  };
  const cancelCharacterCardReferenceScan = async () => {
    if (
      !characterCardReferenceScanJob ||
      characterCardReferenceScanJob.status !== "running"
    )
      return;
    try {
      const response = await fetch(
        `/api/video-dubbing/character-card-reference-scans/${characterCardReferenceScanJob.id}/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể hủy quét ảnh mẫu.");
      }
      characterCardReferenceScanRequestRef.current += 1;
      characterCardReferenceScanJobIdRef.current = null;
      setCharacterCardReferenceScanJob(result.job);
    } catch (error) {
      setCharacterCardReferenceError(
        error instanceof Error ? error.message : "Không thể hủy quét ảnh mẫu.",
      );
    }
  };
  const createCharacterCardsAutomatically = async (selectedOccurrences) => {
    if (!job || !characterCardRegion) return;
    const scanRanges = getCharacterCardScanRanges(
      selectedOccurrences?.length
        ? selectedOccurrences.map((occurrence) => occurrence.time)
        : [subtitleTimelineCursor],
      characterCardOcrStartOffset,
      characterCardOcrDuration,
      job.metadata?.durationSeconds ?? 0,
    );
    if (!scanRanges.length) {
      setCharacterCardOcrError(
        "Không còn khoảng thời gian trong video để quét.",
      );
      return;
    }
    const requestId = ++characterCardOcrRequestRef.current;
    setCharacterCardOcrError(null);
    setCharacterCardOcrJob(null);
    const subtitles = [];
    try {
      for (let index = 0; index < scanRanges.length; index += 1) {
        const scanRange = scanRanges[index];
        const startResponse = await fetch(
          `/api/video-dubbing/jobs/${job.id}/character-card-ocr`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timeStart: scanRange.startTime,
              durationSeconds: scanRange.durationSeconds,
              region: characterCardRegion,
            }),
          },
        );
        const startResult = await startResponse.json();
        if (!startResponse.ok || !startResult.job) {
          throw new Error(
            startResult.error || "Không thể bắt đầu OCR vùng card.",
          );
        }
        let ocrJob = startResult.job;
        setCharacterCardOcrJob(ocrJob);
        while (ocrJob.status === "queued" || ocrJob.status === "running") {
          await new Promise((resolve) => window.setTimeout(resolve, 700));
          if (requestId !== characterCardOcrRequestRef.current) return;
          const statusResponse = await fetch(
            `/api/subtitle-ocr/jobs/${ocrJob.id}`,
          );
          const statusResult = await statusResponse.json();
          if (!statusResponse.ok || !statusResult.job) {
            throw new Error(
              statusResult.error || "Không lấy được trạng thái OCR.",
            );
          }
          ocrJob = statusResult.job;
          setCharacterCardOcrJob(ocrJob);
        }
        if (requestId !== characterCardOcrRequestRef.current) return;
        if (ocrJob.status !== "completed") {
          throw new Error(
            ocrJob.error || ocrJob.message || "OCR đã dừng trước khi hoàn tất.",
          );
        }
        subtitles.push(...ocrJob.subtitles);
      }
      if (requestId !== characterCardOcrRequestRef.current) return;
      const groups = selectedOccurrences?.length
        ? groupCharacterCardOcrCuesByOccurrences(subtitles, selectedOccurrences)
        : groupCharacterCardOcrCues(subtitles);
      if (!groups.length) {
        setCharacterCardOcrError(
          "Không phát hiện chữ trong vùng đã chọn; chưa tạo card nào.",
        );
        return;
      }
      const trackId = textTracks.some((track) => track.id === activeTextTrackId)
        ? activeTextTrackId
        : textTracks[0]?.id || DEFAULT_TEXT_TRACK_ID;
      const trackStyle = characterCardStyle;
      const cards = groups.flatMap((group) => {
        const lines = group.lines.flatMap((line) =>
          line
            .split(/\r?\n/)
            .map((part) => part.trim())
            .filter(Boolean),
        );
        const scanRange = scanRanges.find(
          (range) =>
            group.startTime < range.endTime && group.endTime > range.startTime,
        );
        if (!scanRange) return [];
        const startTime = Math.max(scanRange.startTime, group.startTime);
        const endTime = Math.min(scanRange.endTime, group.endTime);
        if (endTime <= startTime || !lines.length) return [];
        return [
          {
            id: crypto.randomUUID(),
            kind: "character-card",
            startTime,
            endTime,
            text: lines[0] || "Tên nhân vật",
            characterRole: lines.slice(1).join(" "),
            trackId,
            fontSize: trackStyle?.fontSize ?? 28,
            characterRoleFontSize:
              trackStyle?.characterRoleFontSize ??
              Math.max(8, Math.round((trackStyle?.fontSize ?? 28) * 0.7)),
            fontFamily: trackStyle?.fontFamily ?? "Arial",
            color: trackStyle?.color ?? "#ffffff",
            bold: trackStyle?.bold ?? false,
            italic: trackStyle?.italic ?? false,
            underline: trackStyle?.underline ?? false,
            textCase: trackStyle?.textCase ?? "none",
            outlineEnabled: trackStyle?.outlineEnabled ?? false,
            outlineColor: trackStyle?.outlineColor ?? "#000000",
            outlineWidthPx: trackStyle?.outlineWidthPx ?? 2,
            characterSpacingPx: trackStyle?.characterSpacingPx ?? 0,
            lineSpacingPx: trackStyle?.lineSpacingPx ?? 0,
            textAlign:
              trackStyle?.textAlign ??
              (trackStyle
                ? getSubtitleTextAlignment(trackStyle.position)
                : "center"),
            position: trackStyle?.position ?? "middle-center",
            xPercent: trackStyle?.xPercent,
            yPercent: trackStyle?.yPercent,
            backgroundColor: trackStyle?.backgroundColor ?? "#000000",
            backgroundTransparent: trackStyle?.backgroundTransparent ?? true,
            paddingPx: trackStyle?.paddingPx ?? 0,
          },
        ];
      });
      if (!cards.length) {
        setCharacterCardOcrError(
          "Không phát hiện chữ trong vùng đã chọn; chưa tạo card nào.",
        );
        return;
      }
      setTextOverlays((current) => [...current, ...cards]);
      setActiveTextTrackId(trackId);
      setSelectedTextOverlay(null);
      setSelectedSubtitleCue(null);
      if (selectedOccurrences?.length) {
        setCharacterCardReferenceScanJob(null);
        setCharacterCardReferenceSelectedIds([]);
      }
    } catch (error) {
      if (requestId === characterCardOcrRequestRef.current) {
        setCharacterCardOcrError(
          error instanceof Error ? error.message : "Không thể tạo card từ OCR.",
        );
      }
    }
  };
  const cancelCharacterCardOcr = async () => {
    if (!characterCardOcrJob) return;
    try {
      const response = await fetch(
        `/api/subtitle-ocr/jobs/${characterCardOcrJob.id}/cancel`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể hủy OCR.");
      }
      characterCardOcrRequestRef.current += 1;
      setCharacterCardOcrJob(result.job);
    } catch (error) {
      setCharacterCardOcrError(
        error instanceof Error ? error.message : "Không thể hủy OCR.",
      );
    }
  };
  const createTitleOverlay = () => {
    if (titleOverlayIndex >= 0) {
      setTextOverlays((items) =>
        items.map((item, index) =>
          index === titleOverlayIndex
            ? {
                ...item,
                enabled: true,
                isTitle: true,
                startTime: 0,
                extendToVideoEnd: true,
              }
            : item,
        ),
      );
      setSelectedTextOverlay(titleOverlayIndex);
      return;
    }
    const reusableClipIndex = textOverlays.findIndex(
      (cue) => cue.extendToVideoEnd && cue.startTime === 0,
    );
    if (reusableClipIndex >= 0) {
      setTextOverlays((items) =>
        items.map((item, index) =>
          index === reusableClipIndex
            ? {
                ...item,
                isTitle: true,
                enabled: true,
                startTime: 0,
                endTime: job?.metadata?.durationSeconds ?? item.endTime,
                extendToVideoEnd: true,
              }
            : item,
        ),
      );
      setSelectedTextOverlay(reusableClipIndex);
      return;
    }
    const duration = Math.max(0.1, job?.metadata?.durationSeconds ?? 1);
    const title = {
      kind: "text",
      startTime: 0,
      endTime: duration,
      text: "Tiêu đề phim",
      extendToVideoEnd: true,
      isTitle: true,
      enabled: true,
      fontSize: 28,
      fontFamily: "Arial",
      color: "#ffffff",
      bold: true,
      italic: true,
      underline: false,
      textCase: "none",
      outlineEnabled: true,
      outlineColor: "#000000",
      outlineWidthPx: 2,
      characterSpacingPx: 0,
      lineSpacingPx: 0,
      position: "top-center",
      xPercent: 55,
      yPercent: 12,
      backgroundColor: "#000000",
      backgroundTransparent: true,
      paddingPx: 0,
    };
    setTextOverlays((items) => [...items, title]);
    setSelectedTextOverlay(textOverlays.length);
  };
  const subtitleTextStyleValue = {
    fontFamily: subtitleFontFamily,
    fontSize: subtitleFontSize,
    bold: subtitleBold,
    underline: subtitleUnderline,
    italic: subtitleItalic,
    textCase: subtitleTextCase,
    color: subtitleColor,
    outlineEnabled: subtitleOutlineEnabled,
    outlineColor: subtitleOutlineColor,
    outlineWidthPx: subtitleOutlineWidthPx,
    characterSpacingPx: subtitleCharacterSpacingPx,
    lineSpacingPx: subtitleLineSpacingPx,
  };
  const updateSubtitleTextStyle = (patch) => {
    if (patch.fontFamily !== undefined) setSubtitleFontFamily(patch.fontFamily);
    if (patch.fontSize !== undefined) setSubtitleFontSize(patch.fontSize);
    if (patch.bold !== undefined) setSubtitleBold(patch.bold);
    if (patch.underline !== undefined) setSubtitleUnderline(patch.underline);
    if (patch.italic !== undefined) setSubtitleItalic(patch.italic);
    if (patch.textCase !== undefined) setSubtitleTextCase(patch.textCase);
    if (patch.color !== undefined) setSubtitleColor(patch.color);
    if (patch.outlineEnabled !== undefined)
      setSubtitleOutlineEnabled(patch.outlineEnabled);
    if (patch.outlineColor !== undefined)
      setSubtitleOutlineColor(patch.outlineColor);
    if (patch.outlineWidthPx !== undefined)
      setSubtitleOutlineWidthPx(patch.outlineWidthPx);
    if (patch.characterSpacingPx !== undefined)
      setSubtitleCharacterSpacingPx(patch.characterSpacingPx);
    if (patch.lineSpacingPx !== undefined)
      setSubtitleLineSpacingPx(patch.lineSpacingPx);
  };
  const startTextOverlayPreviewDrag = (event, cueIndex) => {
    const stage = previewStageRef.current;
    if (!stage) return;
    const stageBounds = stage.getBoundingClientRect();
    const overlayBounds = event.currentTarget.getBoundingClientRect();
    if (stageBounds.width <= 0 || stageBounds.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedTextOverlay(cueIndex);
    const cue = textOverlays[cueIndex];
    const alignment = cue.isTitle
      ? "center"
      : (cue.textAlign ?? getSubtitleTextAlignment(cue.position));
    const anchorX =
      alignment === "left"
        ? overlayBounds.left
        : alignment === "right"
          ? overlayBounds.right
          : overlayBounds.left + overlayBounds.width / 2;
    setTextOverlayPreviewDrag({
      cueIndex,
      pointerX: event.clientX,
      pointerY: event.clientY,
      anchorX: anchorX - stageBounds.left,
      centerY: overlayBounds.top + overlayBounds.height / 2 - stageBounds.top,
      stageLeft: stageBounds.left,
      stageTop: stageBounds.top,
      stageWidth: stageBounds.width,
      stageHeight: stageBounds.height,
      overlayWidth: overlayBounds.width,
      overlayHeight: overlayBounds.height,
    });
  };
  const startEndSceneTextDrag = (event, cueIndex) => {
    const stage = endSceneStageRef.current;
    const cue = endSceneTextOverlays[cueIndex];
    if (!stage || !cue) return;
    const bounds = stage.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedEndSceneTextIndex(cueIndex);
    setEndSceneDrag({
      index: cueIndex,
      pointerX: event.clientX,
      pointerY: event.clientY,
      xPercent: cue.xPercent ?? 50,
      yPercent: cue.yPercent ?? 50,
      stageLeft: bounds.left,
      stageTop: bounds.top,
      stageWidth: bounds.width,
      stageHeight: bounds.height,
    });
  };
  const startSubtitleTimelineDrag = (
    event,
    cueIndex,
    startTime,
    endTime,
    mode,
    track = "subtitle",
  ) => {
    if (track === "subtitle" && previewSubtitleCues.length === 0) return;
    if (mode !== "move") event.preventDefault();
    event.stopPropagation();
    const trackBounds =
      subtitleTimelineTrackRef.current?.getBoundingClientRect();
    if (!trackBounds || trackBounds.width <= 0) return;
    subtitleTimelineDragMovedRef.current = false;
    setSubtitleTimelineDrag({
      cueIndex,
      track,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      trackWidth: trackBounds.width,
      timelineDuration: subtitleTimelineDuration,
      originalStart: startTime,
      originalEnd: endTime,
    });
  };
  useEffect(() => {
    const drag = subtitleTimelineDrag;
    if (!drag) return;
    const onPointerMove = (event) => {
      if (event.pointerId !== drag.pointerId) return;
      if (!subtitleTimelineDragMovedRef.current) {
        if (
          Math.abs(event.clientX - drag.startX) <
          SUBTITLE_TIMELINE_DRAG_THRESHOLD_PX
        )
          return;
        subtitleTimelineDragMovedRef.current = true;
      }
      const delta =
        ((event.clientX - drag.startX) / drag.trackWidth) *
        drag.timelineDuration;
      const snap = (time) => Math.round(time * 20) / 20;
      let startTime = drag.originalStart;
      let endTime = drag.originalEnd;
      if (drag.mode === "move") {
        const length = drag.originalEnd - drag.originalStart;
        startTime = snap(
          Math.max(
            0,
            Math.min(
              drag.timelineDuration - length,
              drag.originalStart + delta,
            ),
          ),
        );
        endTime = startTime + length;
      } else if (drag.mode === "start") {
        startTime = snap(
          Math.max(
            0,
            Math.min(drag.originalEnd - 0.1, drag.originalStart + delta),
          ),
        );
      } else {
        endTime = snap(
          Math.min(
            drag.timelineDuration,
            Math.max(drag.originalStart + 0.1, drag.originalEnd + delta),
          ),
        );
      }
      const update = (items, isText = false) => {
        if (!items[drag.cueIndex]) return items;
        return items.map((item, index) =>
          index === drag.cueIndex
            ? {
                ...item,
                startTime,
                endTime,
                ...(isText ? { extendToVideoEnd: false } : {}),
              }
            : item,
        );
      };
      if (drag.track === "subtitle") {
        updatePreviewSubtitleCues((cues) => update(cues));
      } else {
        setTextOverlays((current) => update(current, true));
      }
    };
    const onPointerUp = (event) => {
      if (event.pointerId === drag.pointerId) {
        subtitleTimelineDragMovedRef.current = false;
        setSubtitleTimelineDrag(null);
      }
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [
    subtitleTimelineDrag,
    previewSubtitleCues,
    subtitleCueOverrides,
    textOverlays,
    job?.id,
  ]);
  useEffect(() => {
    const drag = textOverlayPreviewDrag;
    if (!drag) return;
    const onPointerMove = (event) => {
      const overlayWidthPercent = Math.min(
        100,
        (drag.overlayWidth / drag.stageWidth) * 100,
      );
      const cue = textOverlays[drag.cueIndex];
      const alignment = cue?.isTitle
        ? "center"
        : (cue?.textAlign ??
          (cue ? getSubtitleTextAlignment(cue.position) : "center"));
      const minimumX =
        alignment === "right"
          ? overlayWidthPercent
          : alignment === "center"
            ? overlayWidthPercent / 2
            : 0;
      const maximumX =
        alignment === "left"
          ? 100 - overlayWidthPercent
          : alignment === "center"
            ? 100 - overlayWidthPercent / 2
            : 100;
      const minimumY = Math.min(
        50,
        (drag.overlayHeight / 2 / drag.stageHeight) * 100,
      );
      const xPercent = Math.max(
        minimumX,
        Math.min(
          maximumX,
          ((drag.anchorX + event.clientX - drag.pointerX) / drag.stageWidth) *
            100,
        ),
      );
      const yPercent = Math.max(
        minimumY,
        Math.min(
          100 - minimumY,
          ((drag.centerY + event.clientY - drag.pointerY) / drag.stageHeight) *
            100,
        ),
      );
      if (cue?.kind === "character-card") {
        setCharacterCardStyle((current) =>
          resolveCharacterCardStyle(
            { ...current, xPercent, yPercent },
            current,
          ),
        );
      }
      setTextOverlays((items) =>
        items.map((item, index) =>
          index === drag.cueIndex ? { ...item, xPercent, yPercent } : item,
        ),
      );
    };
    const onPointerUp = () => setTextOverlayPreviewDrag(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [textOverlayPreviewDrag, textOverlays]);
  useEffect(() => {
    const drag = endSceneDrag;
    if (!drag) return;
    const onPointerMove = (event) => {
      const xPercent = Math.max(
        0,
        Math.min(
          100,
          (((drag.xPercent / 100) * drag.stageWidth +
            event.clientX -
            drag.pointerX) /
            drag.stageWidth) *
            100,
        ),
      );
      const yPercent = Math.max(
        0,
        Math.min(
          100,
          (((drag.yPercent / 100) * drag.stageHeight +
            event.clientY -
            drag.pointerY) /
            drag.stageHeight) *
            100,
        ),
      );
      setEndSceneTextOverlays((items) =>
        items.map((item, index) =>
          index === drag.index ? { ...item, xPercent, yPercent } : item,
        ),
      );
    };
    const onPointerUp = () => setEndSceneDrag(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [endSceneDrag]);
  useEffect(() => {
    if (videoWorkspaceTab !== "end-scene") return;
    const container = endScenePreviewContainerRef.current;
    if (!container) return;
    const updateSize = () => {
      const availableWidth = container.clientWidth;
      if (availableWidth <= 0) return;
      const [ratioWidth, ratioHeight] = endSceneAspectRatio
        .split(":")
        .map(Number);
      const ratio = ratioWidth / ratioHeight;
      const height = Math.min(
        window.innerHeight * 0.6,
        640,
        availableWidth / ratio,
      );
      const width = height * ratio;
      setEndScenePreviewSize((current) =>
        Math.abs(current.width - width) < 1 &&
        Math.abs(current.height - height) < 1
          ? current
          : { width, height },
      );
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    updateSize();
    return () => observer.disconnect();
  }, [videoWorkspaceTab, endSceneAspectRatio]);
  const measuredPreviewScale =
    videoPreviewReady && job?.metadata && previewVideoRef.current
      ? previewVideoRef.current.clientWidth / job.metadata.width
      : 0;
  const previewOverlayScale =
    measuredPreviewScale > 0
      ? measuredPreviewScale
      : job?.metadata?.width
        ? Math.min(1, 960 / job.metadata.width)
        : 1;
  const endSceneOverlayScale =
    job?.metadata?.width && endScenePreviewSize.width > 0
      ? endScenePreviewSize.width / job.metadata.width
      : previewOverlayScale;
  const selectedEndSceneCue =
    selectedEndSceneTextIndex === null
      ? null
      : (endSceneTextOverlays[selectedEndSceneTextIndex] ?? null);
  const endSceneTextStyleValue = {
    fontFamily: selectedEndSceneCue?.fontFamily ?? "Arial",
    fontSize: selectedEndSceneCue?.fontSize ?? 48,
    bold: selectedEndSceneCue?.bold ?? false,
    underline: selectedEndSceneCue?.underline ?? false,
    italic: selectedEndSceneCue?.italic ?? false,
    textCase: selectedEndSceneCue?.textCase ?? "none",
    color: selectedEndSceneCue?.color ?? "#ffffff",
    outlineEnabled: selectedEndSceneCue?.outlineEnabled ?? false,
    outlineColor: selectedEndSceneCue?.outlineColor ?? "#000000",
    outlineWidthPx: selectedEndSceneCue?.outlineWidthPx ?? 2,
    characterSpacingPx: selectedEndSceneCue?.characterSpacingPx ?? 0,
    lineSpacingPx: selectedEndSceneCue?.lineSpacingPx ?? 0,
  };
  const updateSelectedEndSceneStyle = (patch) => {
    if (selectedEndSceneTextIndex !== null) {
      updateEndSceneText(selectedEndSceneTextIndex, patch);
    }
  };
  const endSceneEnabled = Boolean(job?.overlaySettings?.endScene?.enabled);
  const subtitleBackgroundSliceUrl = (background, slice) =>
    `/assets/subtitle/${encodeURIComponent(`${background}-${slice}.png`)}`;

  const stageContextValue = {
    acceptCharacterCardReferenceFile,
    activePreviewSubtitle,
    activePreviewTextItems,
    activeSubtitleAudio,
    activeSubtitleAudioFilterCount,
    activeSubtitleAudioItem,
    activeSubtitleAudioRow,
    activeTextTrackId,
    addEndSceneText,
    addTextOverlayToTrack,
    adjustSubtitleAudioCueTiming,
    applySelectedTextOverlayToTrack,
    cancelCharacterCardOcr,
    cancelCharacterCardReferenceScan,
    cancelCharacterCardRegionDraw,
    changeSubtitleTimelineZoom,
    characterCardDrawMode,
    characterCardOcrDuration,
    characterCardOcrError,
    characterCardOcrJob,
    characterCardOcrStartOffset,
    characterCardOcrWorker,
    characterCardReferenceError,
    characterCardReferenceFile,
    characterCardReferenceFramesToSkip,
    characterCardReferencePreviewUrl,
    characterCardReferenceScanJob,
    characterCardReferenceSelectedIds,
    characterCardReferenceSimilarity,
    characterCardRegion,
    characterCardRegionDraft,
    combineSubtitleAudioCueAbove,
    commitSubtitleAudioCueText,
    createCharacterCardsAutomatically,
    createTitleOverlay,
    deleteActiveTextTrack,
    deleteSubtitleAudioCue,
    endSceneAspectRatio,
    endSceneDurationSeconds,
    endSceneEnabled,
    endSceneOverlayScale,
    endScenePreviewContainerRef,
    endScenePreviewSize,
    endSceneStageRef,
    endSceneTextOverlays,
    endSceneTextStyleValue,
    filteredSubtitleAudioInput,
    finishCharacterCardRegion,
    fitSubtitleTimelineToPanel,
    flushSubtitleMarginSave,
    hasExportedVideo,
    hasPreviewTrack,
    isFinalMixCurrent,
    isMasterGenerating,
    isMediaProcessing,
    job,
    logoEnabled,
    logoInputRef,
    logoPaddingPx,
    logoPosition,
    logoUploading,
    logoWidthPercent,
    mixerSettings,
    moveCharacterCardRegion,
    nextSubtitleAudioItem,
    overlayAlignment,
    pasteCharacterCardReference,
    playMixerPreview,
    playSubtitleAudio,
    previewCurrentTime,
    previewOverlayScale,
    previewStageRef,
    previewStatus,
    previewSubtitleCues,
    previewVideoRef,
    previewingEndScene,
    previousSubtitleAudioItem,
    rebuildMasterFromSubtitleAudio,
    regenerateSubtitleAudio,
    regenerateSubtitleAudioWithDraft,
    removeSelectedEndSceneText,
    renderSubtitleTimingAdjustment,
    requestMasterEdit,
    runMasterEditAction,
    masterEditBusy,
    restartMixerPreview,
    saveEndSceneForCurrentVideo,
    scheduleSubtitleMarginSave,
    seekMixerPreview,
    seekSubtitleTimeline,
    selectedEndSceneCue,
    selectedEndSceneTextIndex,
    selectedSubtitleCue,
    selectedSubtitleCueTtsItem,
    selectedTextOverlay,
    selectedVoice,
    setActiveTextTrackId,
    setCharacterCardDrawMode,
    setCharacterCardDrawStart,
    setCharacterCardOcrDuration,
    setCharacterCardOcrError,
    setCharacterCardOcrStartOffset,
    setCharacterCardReferenceError,
    setCharacterCardReferenceFile,
    setCharacterCardReferenceScanJob,
    setCharacterCardRegion,
    setCharacterCardRegionDraft,
    setEndSceneAspectRatio,
    setEndSceneDurationSeconds,
    setEndSceneTextOverlays,
    setLogoEnabled,
    setLogoPaddingPx,
    setLogoPosition,
    setLogoWidthPercent,
    setPreviewError,
    setSelectedEndSceneTextIndex,
    setSelectedSubtitleCue,
    setSelectedTextOverlay,
    setSubtitleAudioDrafts,
    setSubtitleAudioFilterOpen,
    setSubtitleAudioMaxCharacterCount,
    setSubtitleAudioNonAlphabetFilterEnabled,
    setSubtitleAudioShortFilterEnabled,
    setSubtitleAudioSimilarFilterEnabled,
    setSubtitleAudioSpecialCharactersFilterEnabled,
    setSubtitleAudioTimingStepMs,
    setSubtitleBackgroundColor,
    setSubtitleBackgroundImage,
    setSubtitleBackgroundMode,
    setSubtitleBackgroundPickerOpen,
    setSubtitleMarginPx,
    setSubtitlePaddingPx,
    setSubtitlePosition,
    setSubtitlesEnabled,
    setTextOverlays,
    setTextTracks,
    setTimelineWorkspaceTab,
    setShowTtsMasterTimeline,
    showTtsMasterTimeline,
    setVideoPreviewReady,
    srt,
    startCharacterCardOcrWorker,
    startCharacterCardReferenceScan,
    startCharacterCardRegion,
    startEndSceneTextDrag,
    startSubtitleTimelineDrag,
    startTextOverlayPreviewDrag,
    stopCharacterCardOcrWorker,
    subtitleAudioDrafts,
    subtitleAudioError,
    subtitleAudioFilterOpen,
    subtitleAudioInput,
    subtitleAudioItems,
    subtitleAudioMasterBusy,
    subtitleAudioMaxCharacterCount,
    subtitleAudioNonAlphabetFilterEnabled,
    subtitleAudioPlayingId,
    subtitleAudioRegeneratingId,
    subtitleAudioShortFilterEnabled,
    subtitleAudioSimilarFilterEnabled,
    subtitleAudioSpecialCharactersFilterEnabled,
    subtitleAudioSyncing,
    subtitleAudioTimingStepMs,
    subtitleBackgroundColor,
    subtitleBackgroundImage,
    subtitleBackgroundMode,
    subtitleBackgroundTransparent,
    subtitleBackgrounds,
    subtitleBold,
    subtitleCharacterSpacingPx,
    subtitleColor,
    subtitleFontFamily,
    subtitleFontOptions,
    subtitleFontSize,
    subtitleItalic,
    subtitleLineSpacingPx,
    subtitleMarginPx,
    subtitleOutlineColor,
    subtitleOutlineEnabled,
    subtitleOutlineWidthPx,
    subtitleOverlayAlignment,
    subtitlePaddingPx,
    subtitlePosition,
    subtitleTextCase,
    subtitleTextStyleValue,
    subtitleTimelineCursor,
    subtitleTimelineDuration,
    subtitleTimelineItems,
    subtitleTimelineLaneEnds,
    subtitleTimelineMinZoom,
    subtitleTimelineScrollRef,
    subtitleTimelineTicks,
    subtitleTimelineTrackRef,
    subtitleTimelineWidth,
    subtitleTimelineZoom,
    subtitleUnderline,
    subtitlesEnabled,
    textOverlays,
    textTimelineLanes,
    textTracks,
    timelineWorkspaceTab,
    titleOverlay,
    titleOverlayIndex,
    updateEndSceneText,
    updateMixerSetting,
    updatePreviewSubtitleCues,
    updateSelectedEndSceneStyle,
    updateSelectedSubtitleCue,
    updateSelectedTextOverlay,
    updateSubtitleTextStyle,
    uploadOverlayLogo,
    video,
    videoExport,
    videoPreviewReady,
    videoWorkspaceTab,
  };

  return (
    <VideoDubbingProvider value={stageContextValue}>
      <section
        className={`grid w-full h-full max-w-none grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] items-stretch gap-0 p-0 text-slate-200 overflow-hidden ${settingsCollapsed ? "xl:grid-cols-[48px_minmax(0,1fr)]" : "xl:grid-cols-[minmax(390px,440px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(420px,470px)_minmax(0,1fr)]"}`}
      >
        {subtitleBackgroundPickerOpen && (
          <SubtitleBackgroundPickerModal
            setSubtitleBackgroundImage={setSubtitleBackgroundImage}
            setSubtitleBackgroundPickerOpen={setSubtitleBackgroundPickerOpen}
            subtitleBackgroundImage={subtitleBackgroundImage}
            subtitleBackgroundSliceUrl={subtitleBackgroundSliceUrl}
            subtitleBackgrounds={subtitleBackgrounds}
          />
        )}
        <VideoDubbingHeader
          autoPipelineTtsMasterEnabled={autoPipelineTtsMasterEnabled}
          setAutoPipelineTtsMasterEnabled={setAutoPipelineTtsMasterEnabled}
        />

        {historyExpanded && (
          <HistoryModal
            deleteHistoryJob={deleteHistoryJob}
            historyError={historyError}
            historyExpanded={historyExpanded}
            historyLoading={historyLoading}
            job={job}
            jobHistory={jobHistory}
            loadJobHistory={loadJobHistory}
            openHistoryJob={openHistoryJob}
            setHistoryExpanded={setHistoryExpanded}
          />
        )}

        {projectsExpanded && (
          <ProjectsModal
            activeProject={activeProject}
            createProject={createProject}
            defaultProjectId={defaultProjectId}
            deleteProject={deleteProject}
            openProject={openProject}
            projectBusy={projectBusy}
            projectError={projectError}
            projectSaveState={projectSaveState}
            projects={projects}
            renameProject={renameProject}
            setDefaultProject={setDefaultProject}
            setProjectsExpanded={setProjectsExpanded}
          />
        )}

        {guideOpen && <GuideModal setGuideOpen={setGuideOpen} />}

        {coverEditorTarget && (
          <CoverEditorModal
            chooseCoverFile={chooseCoverFile}
            confirmCoverEditor={confirmCoverEditor}
            coverEditorBusy={coverEditorBusy}
            coverEditorDragOver={coverEditorDragOver}
            coverEditorError={coverEditorError}
            coverEditorFile={coverEditorFile}
            coverEditorFrameCount={coverEditorFrameCount}
            coverEditorInputRef={coverEditorInputRef}
            coverEditorPreviewUrl={coverEditorPreviewUrl}
            coverEditorTarget={coverEditorTarget}
            removeCoverFromEditor={removeCoverFromEditor}
            setCoverEditorDragOver={setCoverEditorDragOver}
            setCoverEditorError={setCoverEditorError}
            setCoverEditorFile={setCoverEditorFile}
            setCoverEditorFrameCount={setCoverEditorFrameCount}
            setCoverEditorTarget={setCoverEditorTarget}
          />
        )}

        <QueueControlBar
          activeProject={activeProject}
          autoPipeline={autoPipeline}
          autoPipelineError={autoPipelineError}
          autoPipelineProgress={autoPipelineProgress}
          canStartQueue={canStartQueue}
          cancelFinalMix={cancelFinalMix}
          cancelMediaTask={cancelMediaTask}
          concatPreflight={concatPreflight}
          concatStatus={concatStatus}
          exportClockNow={exportClockNow}
          exportQuality={exportQuality}
          finalMix={finalMix}
          joinAfterQueue={joinAfterQueue}
          joinedVideo={joinedVideo}
          loadProjects={loadProjects}
          mediaError={mediaError}
          openProjectFolder={openProjectFolder}
          queueRowCount={queueRowCount}
          queueRows={queueRows}
          queueRunning={queueRunning}
          queueStates={queueStates}
          separation={separation}
          separationBackendLabel={separationBackendLabel}
          separationElapsedSeconds={separationElapsedSeconds}
          separationHeartbeatFresh={separationHeartbeatFresh}
          separationPhaseLabel={separationPhaseLabel}
          setExportQuality={setExportQuality}
          setGuideOpen={setGuideOpen}
          setProjectsExpanded={setProjectsExpanded}
          startQueue={startQueue}
          stopQueue={stopQueue}
          toggleJoinAfterQueue={toggleJoinAfterQueue}
          videoExport={videoExport}
        />

        <SourceFileInputs
          clearSelectedFiles={clearSelectedFiles}
          handleSrtChange={handleSrtChange}
          handleSrtFile={handleSrtFile}
          handleVideoChange={handleVideoChange}
          handleVideoFile={handleVideoFile}
          isBusy={isBusy}
          openSrtBrowser={openSrtBrowser}
          setFileDetailsOpen={setFileDetailsOpen}
          srt={srt}
          video={video}
          videoInputRef={videoInputRef}
        />

        <SourceInfoPanels
          cancelVideo={cancelVideo}
          clearSrt={clearSrt}
          clearVideo={clearVideo}
          handleSrtChange={handleSrtChange}
          handleVideoChange={handleVideoChange}
          isBusy={isBusy}
          job={job}
          masterGeneration={masterGeneration}
          openSrtBrowser={openSrtBrowser}
          srt={srt}
          video={video}
          videoInputRef={videoInputRef}
        />

        {fileDetailsOpen && detailRowIndex !== null && (
          <FileDetailsModal
            detailJob={detailJob}
            detailState={detailState}
            detailSubtitle={detailSubtitle}
            detailVideoFile={detailVideoFile}
            setDetailRowIndex={setDetailRowIndex}
            setFileDetailsOpen={setFileDetailsOpen}
          />
        )}

        <SettingsSidebar
          activeProject={activeProject}
          allSrtDownloadTargets={allSrtDownloadTargets}
          allVideosAction={allVideosAction}
          allVideosActionDisabled={allVideosActionDisabled}
          allVideosJobs={allVideosJobs}
          allVideosRunning={allVideosRunning}
          allVideosTtsReady={allVideosTtsReady}
          autoPipelineConfig={autoPipelineConfig}
          autoPipelineDemucsEnabled={autoPipelineDemucsEnabled}
          autoPipelineExpanded={autoPipelineExpanded}
          autoPipelineSaving={autoPipelineSaving}
          canGenerateMaster={canGenerateMaster}
          canStartSeparation={canStartSeparation}
          cancelMaster={cancelMaster}
          cancelSeparation={cancelSeparation}
          createMaster={createMaster}
          downloadAllSrts={downloadAllSrts}
          finalMix={finalMix}
          handleQueueDrop={handleQueueDrop}
          handleSrtChange={handleSrtChange}
          handleVideoChange={handleVideoChange}
          hasFinalMix={hasFinalMix}
          hasMasterAudio={hasMasterAudio}
          isAutoPipelineRunning={isAutoPipelineRunning}
          isFinalMixCurrent={isFinalMixCurrent}
          isMasterGenerating={isMasterGenerating}
          isSeparationProcessing={isSeparationProcessing}
          job={job}
          leftPanelTab={leftPanelTab}
          masterError={masterError}
          masterGeneration={masterGeneration}
          masterPanelExpanded={masterPanelExpanded}
          maxSpeed={maxSpeed}
          minSpeed={minSpeed}
          mixerError={mixerError}
          mixerSettings={mixerSettings}
          mixerSettingsSaved={mixerSettingsSaved}
          mixerTouchedRef={mixerTouchedRef}
          mixerTrackAvailability={mixerTrackAvailability}
          mixerVolumeDrafts={mixerVolumeDrafts}
          openSrtBrowser={openSrtBrowser}
          originalAudioVolumePercent={originalAudioVolumePercent}
          previewError={previewError}
          previewSourceVideo={previewSourceVideo}
          previewVideoRow={previewVideoRow}
          projectJobItems={projectJobItems}
          queueRowCount={queueRowCount}
          queueRows={queueRows}
          queueRunning={queueRunning}
          queueStates={queueStates}
          removeQueuedSource={removeQueuedSource}
          renderCoverEditorButton={renderCoverEditorButton}
          renderJobProcessingBar={renderJobProcessingBar}
          renderVideoActions={renderVideoActions}
          runAllVideosAction={runAllVideosAction}
          saveAutoPipelineConfig={saveAutoPipelineConfig}
          selectedVoiceId={selectedVoiceId}
          separation={separation}
          separationAvailability={separationAvailability}
          separationBackendLabel={separationBackendLabel}
          separationElapsedSeconds={separationElapsedSeconds}
          separationError={separationError}
          separationHeartbeatFresh={separationHeartbeatFresh}
          separationPanelExpanded={separationPanelExpanded}
          setAutoPipelineDemucsEnabled={setAutoPipelineDemucsEnabled}
          setAutoPipelineExpanded={setAutoPipelineExpanded}
          setDetailRowIndex={setDetailRowIndex}
          setFileDetailsOpen={setFileDetailsOpen}
          setLeftPanelTab={setLeftPanelTab}
          setMasterPanelExpanded={setMasterPanelExpanded}
          setMaxSpeed={setMaxSpeed}
          setMinSpeed={setMinSpeed}
          setMixerVolumeDrafts={setMixerVolumeDrafts}
          setOriginalAudioVolumePercent={setOriginalAudioVolumePercent}
          setQueueStates={setQueueStates}
          setSelectedVoiceId={setSelectedVoiceId}
          setSeparationPanelExpanded={setSeparationPanelExpanded}
          setSettingsCollapsed={setSettingsCollapsed}
          setSpeedPriority={setSpeedPriority}
          settingsCollapsed={settingsCollapsed}
          settingsSyncMessage={settingsSyncMessage}
          settingsSyncRunning={settingsSyncRunning}
          speedPriority={speedPriority}
          srtDownloadMessage={srtDownloadMessage}
          srtInputRef={srtInputRef}
          startSeparation={startSeparation}
          subtitleFiles={subtitleFiles}
          syncSettingsToAllVideos={syncSettingsToAllVideos}
          updateMixerSetting={updateMixerSetting}
          videoFiles={videoFiles}
          videoInputRef={videoInputRef}
          videoWorkspaceTab={videoWorkspaceTab}
          voices={voices}
          voicesError={voicesError}
        />
        <WorkspaceColumn />
      </section>
    </VideoDubbingProvider>
  );
}
