import { AlertTriangle, PanelLeftClose, Sliders } from "lucide-react";
import CompletionChimeCard from "./CompletionChimeCard";
import NormalizationCard from "./NormalizationCard";
import ProjectConfigCard from "./ProjectConfigCard";
import SubtitleUploadCard from "./SubtitleUploadCard";
import TimelineSpeedCard from "./TimelineSpeedCard";
import VoiceSelectCard from "./VoiceSelectCard";

export default function SubtitlesSettingsPanel({
  activeJob,
  batchSizeChoice,
  customBatchSize,
  customPronunciationRules,
  dragFeedback,
  effectiveBatchSize,
  espeakStatus,
  fileInputRef,
  handleApplyPreset,
  handleDeletePreset,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  handleFileUpload,
  handlePreviewVoice,
  handleUpdateCurrentPreset,
  isDragging,
  maxSpeed,
  minSpeed,
  normalizeNumbers,
  outputFormat,
  parseWarnings,
  presetFeedback,
  previewLoadingVoiceId,
  previewVoiceId,
  projectPresets,
  selectedPreset,
  selectedPresetId,
  selectedVoice,
  setActiveJob,
  setBatchSizeChoice,
  setCustomBatchSize,
  setIsLeftPanelExpanded,
  setMaxSpeed,
  setMinSpeed,
  setNormalizeNumbers,
  setOutputFormat,
  setShowPresetManagerModal,
  setShowPronunciationModal,
  setShowSavePresetModal,
  setShowSettingsDrawer,
  setShowSrtEditor,
  setShowVoiceModal,
  setSoundNotificationEnabled,
  setSoundOnlyWhenUnfocused,
  setSpeedPriority,
  setSrtRawText,
  setTrimEndMs,
  setTrimStartMs,
  setUploadedFileName,
  setVideoDurationStr,
  showSettingsDrawer,
  showSrtEditor,
  soundNotificationEnabled,
  soundOnlyWhenUnfocused,
  speedPriority,
  srtRawText,
  subtitles,
  trimEndMs,
  trimStartMs,
  uploadedFileName,
  videoDurationStr,
  voices,
}) {
  return (
    <aside className="w-full lg:w-[360px] xl:w-[390px] 2xl:w-[420px] shrink-0 h-full overflow-y-auto border-r border-slate-800 bg-slate-900/40 flex flex-col divide-y divide-slate-800 rounded-none scrollbar-thin select-none">
      {/* Panel Header & Hide Button */}
      <div className="h-9 px-3 shrink-0 flex items-center justify-between bg-slate-950/80 border-b border-slate-800 rounded-none">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-amber-400" />
          <h2 className="text-xs font-bold text-white tracking-wide uppercase">
            Cài Đặt & Dữ Liệu
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setIsLeftPanelExpanded(false)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-none bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
          title="Ẩn cột cài đặt để mở rộng không gian bên phải"
        >
          <PanelLeftClose className="w-3.5 h-3.5 text-amber-400" />
          <span>Ẩn Cột</span>
        </button>
      </div>

      {/* 0. Project Settings Card (Lưu & Nạp Cấu Hình Dự Án - Requirement 2) */}
      <ProjectConfigCard
        effectiveBatchSize={effectiveBatchSize}
        handleApplyPreset={handleApplyPreset}
        handleDeletePreset={handleDeletePreset}
        handleUpdateCurrentPreset={handleUpdateCurrentPreset}
        maxSpeed={maxSpeed}
        minSpeed={minSpeed}
        outputFormat={outputFormat}
        presetFeedback={presetFeedback}
        projectPresets={projectPresets}
        selectedPreset={selectedPreset}
        selectedPresetId={selectedPresetId}
        selectedVoice={selectedVoice}
        setShowPresetManagerModal={setShowPresetManagerModal}
        setShowSavePresetModal={setShowSavePresetModal}
        speedPriority={speedPriority}
      />

      {/* 1. Voice Selection Card (Mở Panel Bảng Chọn Giọng Đọc) */}
      <VoiceSelectCard
        espeakStatus={espeakStatus}
        handlePreviewVoice={handlePreviewVoice}
        previewLoadingVoiceId={previewLoadingVoiceId}
        previewVoiceId={previewVoiceId}
        selectedVoice={selectedVoice}
        setShowVoiceModal={setShowVoiceModal}
        voices={voices}
      />

      {/* 2. Upload Subtitle & Presets Card (Requirement 1: Kéo thả phụ đề) */}
      <SubtitleUploadCard
        dragFeedback={dragFeedback}
        fileInputRef={fileInputRef}
        handleDragLeave={handleDragLeave}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        handleFileUpload={handleFileUpload}
        isDragging={isDragging}
        setActiveJob={setActiveJob}
        setShowSrtEditor={setShowSrtEditor}
        setSrtRawText={setSrtRawText}
        setUploadedFileName={setUploadedFileName}
        showSrtEditor={showSrtEditor}
        srtRawText={srtRawText}
        subtitles={subtitles}
        uploadedFileName={uploadedFileName}
      />

      {/* 3. Processing Parameters Card */}
      <TimelineSpeedCard
        activeJob={activeJob}
        batchSizeChoice={batchSizeChoice}
        customBatchSize={customBatchSize}
        effectiveBatchSize={effectiveBatchSize}
        maxSpeed={maxSpeed}
        minSpeed={minSpeed}
        outputFormat={outputFormat}
        setBatchSizeChoice={setBatchSizeChoice}
        setCustomBatchSize={setCustomBatchSize}
        setMaxSpeed={setMaxSpeed}
        setMinSpeed={setMinSpeed}
        setOutputFormat={setOutputFormat}
        setShowSettingsDrawer={setShowSettingsDrawer}
        setSpeedPriority={setSpeedPriority}
        setTrimEndMs={setTrimEndMs}
        setTrimStartMs={setTrimStartMs}
        setVideoDurationStr={setVideoDurationStr}
        showSettingsDrawer={showSettingsDrawer}
        speedPriority={speedPriority}
        trimEndMs={trimEndMs}
        trimStartMs={trimStartMs}
        videoDurationStr={videoDurationStr}
      />

      {/* 4. Pronunciation & Text Normalizer Card (Requirement 1) */}
      <NormalizationCard
        customPronunciationRules={customPronunciationRules}
        normalizeNumbers={normalizeNumbers}
        setNormalizeNumbers={setNormalizeNumbers}
        setShowPronunciationModal={setShowPronunciationModal}
      />

      {/* 5. Notification Sound & Panel Card */}
      <CompletionChimeCard
        setSoundNotificationEnabled={setSoundNotificationEnabled}
        setSoundOnlyWhenUnfocused={setSoundOnlyWhenUnfocused}
        soundNotificationEnabled={soundNotificationEnabled}
        soundOnlyWhenUnfocused={soundOnlyWhenUnfocused}
      />

      {/* Subtitle Warnings list if any */}
      {parseWarnings.length > 0 && (
        <div className="bg-amber-500/10 border-t border-amber-500/30 p-3 text-xs text-amber-300 space-y-1 rounded-none">
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
  );
}
