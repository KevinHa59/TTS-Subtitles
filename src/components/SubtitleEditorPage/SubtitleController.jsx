import { Button, Divider, Stack } from "@mui/material";
import {
  Check,
  Globe,
  Languages,
  LoaderCircle,
  RefreshCw,
  Settings,
  Subtitles,
  Trash2,
} from "lucide-react";
import React from "react";
import DropMenu from "../customs/DropMenu";
import LabelComponent from "../customs/LabelComponent";

export default function SubtitleController(props) {
  // 1. Destructure toàn bộ props cần thiết
  const {
    items,
    setItems,
    selectedId,
    setSelectedId,
    batchMessage, // Lưu ý: Trong snippet bạn cung cấp, batchMessage được SET nhưng không hiển thị trong JSX return, giữ lại để tương thích
    setBatchMessage,
    translationProvider,
    setTranslationProvider,
    translationInProgress,
    geminiStatusLoading,
    freeLlmStatusLoading,
    geminiStatus,
    freeLlmStatus,
    langConfigLoading,
    sourceLanguage,
    setSourceLanguage,
    targetLanguage,
    setTargetLanguage,
    translationMode,
    selectedItem,
    SUPPORTED_LANGUAGES,
    openPromptDialog,
    onOpenSetup,
    saveTranslationConfig,
    detectLanguage,
    translateSelected,
    translateAll,
  } = props;
  return (
    <Stack
      sx={{ flexDirection: "column", overflowY: "auto", padding: 1, gap: 1 }}
    >
      <Button
        sx={{
          display: "flex",
          justifyContent: "flex-start",
          width: "max-content",
        }}
        variant="text"
        size="small"
        color="error"
        onClick={() => {
          setItems([]);
          setSelectedId("");
          setBatchMessage("");
        }}
        disabled={translationInProgress || !items.length}
        startIcon={<Trash2 className="h-4 w-4" />}
      >
        Xóa
      </Button>
      <Divider />
      <Button
        fullWidth
        sx={{ display: "flex", justifyContent: "flex-start" }}
        variant="text"
        size="small"
        color="secondary"
        onClick={() => void openPromptDialog()}
        disabled={translationInProgress}
        startIcon={<Subtitles className="h-4 w-4" />}
      >
        Prompt
      </Button>
      <Button
        fullWidth
        sx={{ display: "flex", justifyContent: "flex-start" }}
        variant="text"
        size="small"
        color="secondary"
        onClick={onOpenSetup}
        startIcon={<Settings className="h-4 w-4" />}
      >
        Cài đặt dịch
      </Button>
      <LabelComponent label={"Provider"}>
        <Stack direction={"row"} sx={{ gap: 1 }}>
          {translationProvider === "gemini" && geminiStatus?.configured && (
            <span className="text-xs text-emerald-400">
              <Check />
            </span>
          )}

          {translationProvider === "freellm" && freeLlmStatus?.configured && (
            <span className="text-xs text-emerald-400">
              <Check />
            </span>
          )}
          <DropMenu
            color="secondary"
            data={[
              {
                icon: "🏠",
                text: "Local (Qwen)",
                value: "local",
                disabled: false,
              },
              {
                icon: "⚡",
                text: "Gemini API",
                value: "gemini",
                disabled: !geminiStatus?.configured,
              },
              {
                icon: "🖥",
                text: "FreeLLM",
                value: "freellm",
                disabled: !freeLlmStatus?.configured,
              },
            ]}
            value={translationProvider}
            onSelect={setTranslationProvider}
          />
        </Stack>
      </LabelComponent>
      <LabelComponent label={"Nhận Diện Ngôn Ngữ"}>
        <Button
          size="small"
          variant="outlined"
          color="secondary"
          onClick={() => {
            const selected = items.find((item) => item.id === selectedId);
            if (selected?.cues?.length) {
              const allText = selected.cues.map((c) => c.text).join(" ");
              const detected = detectLanguage(allText);
              setSourceLanguage(detected);
              saveTranslationConfig(detected, targetLanguage);
              setBatchMessage(`Đã phát hiện ngôn ngữ: ${detected}`);
            } else {
              setBatchMessage("Chưa có phụ đề để phát hiện ngôn ngữ");
            }
          }}
          disabled={
            translationInProgress ||
            !selectedItem?.cues?.length ||
            langConfigLoading
          }
          startIcon={<RefreshCw className="h-3 w-3" />}
        >
          <span className="hidden sm:inline">Phát hiện</span>
          <Globe className="h-3 w-3 ml-1" />
        </Button>
      </LabelComponent>
      <LabelComponent label={"Dịch"}>
        <Stack direction={"row"}>
          <DropMenu
            color="secondary"
            data={SUPPORTED_LANGUAGES.map((i) => {
              return {
                icon: null,
                text: i.code,
                value: i.code,
                disabled: false,
              };
            })}
            value={sourceLanguage}
            onSelect={(lang) => {
              if (lang === "auto") {
                const selected = items.find((item) => item.id === selectedId);
                if (selected?.cues?.length) {
                  const allText = selected.cues.map((c) => c.text).join(" ");
                  const detected = detectLanguage(allText);
                  setSourceLanguage(detected);
                  saveTranslationConfig(detected, targetLanguage);
                }
              } else {
                setSourceLanguage(lang);
                saveTranslationConfig(lang, targetLanguage);
              }
            }}
          />
          {/* <select
            value={sourceLanguage}
            onChange={(e) => {
              const lang = e.target.value;
              if (lang === "auto") {
                const selected = items.find((item) => item.id === selectedId);
                if (selected?.cues?.length) {
                  const allText = selected.cues.map((c) => c.text).join(" ");
                  const detected = detectLanguage(allText);
                  setSourceLanguage(detected);
                  saveTranslationConfig(detected, targetLanguage);
                }
              } else {
                setSourceLanguage(lang);
                saveTranslationConfig(lang, targetLanguage);
              }
            }}
            disabled={translationInProgress || langConfigLoading}
            className="bg-slate-800 border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 focus:border-cyan-400 focus:outline-none disabled:opacity-40 cursor-pointer appearance-none w-[100px]"
            title="Ngôn ngữ nguồn (chọn 'Tự động phát hiện' để AI tự nhận diện)"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select> */}

          <span className="text-cyan-400 mx-1 hidden sm:inline">→</span>

          {/* Target Language */}
          <DropMenu
            color="secondary"
            data={SUPPORTED_LANGUAGES.filter((l) => l.code !== "auto").map(
              (i) => {
                return {
                  icon: null,
                  text: i.code,
                  value: i.code,
                  disabled: false,
                };
              },
            )}
            value={targetLanguage}
            onSelect={(lang) => {
              setTargetLanguage(lang);
              saveTranslationConfig(sourceLanguage, lang);
            }}
          />
          {/* <select
            value={targetLanguage}
            onChange={(e) => {
              setTargetLanguage(e.target.value);
              saveTranslationConfig(sourceLanguage, e.target.value);
            }}
            disabled={translationInProgress || langConfigLoading}
            className="bg-slate-800 border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 focus:border-emerald-400 focus:outline-none disabled:opacity-40 cursor-pointer appearance-none w-[100px]"
            title="Ngôn ngữ đích"
          >
            {SUPPORTED_LANGUAGES.filter((l) => l.code !== "auto").map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select> */}
        </Stack>
      </LabelComponent>
      <Divider />
      {/* ACTIONS */}
      <Stack direction="row" sx={{ gap: 1 }}>
        <Button
          variant="contained"
          color="secondary"
          disabled={
            !selectedItem?.video ||
            !selectedItem.cues.length ||
            translationInProgress
          }
          onClick={() => void translateSelected()}
          sx={{ flex: 1 }}
          startIcon={
            translationMode === "single" ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : (
              <Languages className="h-3 w-3" />
            )
          }
        >
          <span className="hidden lg:inline">
            {translationMode === "single" ? "Đang dịch…" : "Dịch"}
          </span>
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          disabled={
            !items.some(
              (item) =>
                item.video && item.cues.length && item.status !== "translated",
            ) || translationInProgress
          }
          onClick={() => void translateAll()}
          sx={{ width: "max-content" }}
          startIcon={
            translationMode === "all" ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : (
              <Languages className="h-3 w-3" />
            )
          }
        >
          <span className="hidden lg:inline">
            {translationMode === "all"
              ? "Đang dịch tất cả…"
              : `Dịch tất cả (${items.filter((item) => item.video && item.cues.length && item.status !== "translated").length})`}
          </span>
        </Button>
      </Stack>
    </Stack>
  );
}
