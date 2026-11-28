import {
  Button,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Check,
  Globe,
  Languages,
  LoaderCircle,
  RefreshCw,
  Settings,
  Subtitles,
  Trash2,
  X,
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
    chunkSize = -1,
    setChunkSize,
    fromCue = "",
    setFromCue,
    toCue = "",
    setToCue,
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

  const fromNum = fromCue.trim() ? Number(fromCue) : null;
  const toNum = toCue.trim() ? Number(toCue) : null;
  const isRangeInvalid =
    fromNum !== null &&
    toNum !== null &&
    Number.isFinite(fromNum) &&
    Number.isFinite(toNum) &&
    fromNum > toNum;

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
        </Stack>
      </LabelComponent>
      <Divider />
      <LabelComponent label={"Số câu / request"} sx={{ gap: 1 }}>
        <DropMenu
          color="secondary"
          value={chunkSize}
          onSelect={(val) => setChunkSize?.(Number(val))}
          data={[
            { icon: null, text: "All", value: -1, default: true },
            { icon: null, text: "50", value: 50 },
            { icon: null, text: "100", value: 100 },
            { icon: null, text: "200", value: 200 },
            { icon: null, text: "400", value: 400 },
            { icon: null, text: "800", value: 800 },
          ]}
        />
      </LabelComponent>
      <LabelComponent label={"Dịch Câu"}>
        <TextField
          size="small"
          type="number"
          placeholder="Đầu"
          value={fromCue}
          error={isRangeInvalid}
          disabled={translationInProgress}
          onChange={(e) => setFromCue?.(e.target.value)}
          slotProps={{
            htmlInput: { min: 1 },
            input: {
              endAdornment: (
                <InputAdornment
                  position="end"
                  sx={{
                    marginLeft: 0,
                    marginRight: 0,
                  }}
                >
                  <IconButton
                    size="small"
                    disabled={!fromCue || translationInProgress}
                    onClick={() => setFromCue?.("")}
                    aria-label="Xóa câu bắt đầu"
                    sx={{
                      p: 0,
                      minWidth: 0,
                    }}
                  >
                    <X className="size-4" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          sx={{
            width: "100px",
            "& .MuiOutlinedInput-input": {
              padding: "6px 8px",
              fontSize: "14px",
              textAlign: "center",
            },
            "& input[type=number]": {
              MozAppearance: "textfield",
            },
            "& input[type=number]::-webkit-outer-spin-button": {
              WebkitAppearance: "none",
              margin: 0,
            },
            "& input[type=number]::-webkit-inner-spin-button": {
              WebkitAppearance: "none",
              margin: 0,
            },
          }}
        />
        <span className="text-cyan-400 mx-1 hidden sm:inline">→</span>
        <TextField
          size="small"
          type="number"
          placeholder="Cuối"
          value={toCue}
          error={isRangeInvalid}
          disabled={translationInProgress}
          onChange={(e) => setToCue?.(e.target.value)}
          slotProps={{
            htmlInput: { min: 1 },
            input: {
              endAdornment: (
                <InputAdornment
                  position="end"
                  sx={{
                    marginLeft: 0,
                    marginRight: 0,
                  }}
                >
                  <IconButton
                    size="small"
                    disabled={!toCue || translationInProgress}
                    onClick={() => setToCue?.("")}
                    aria-label="Xóa câu kết thúc"
                    sx={{
                      p: 0,
                      minWidth: 0,
                    }}
                  >
                    <X className="size-4" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          sx={{
            width: "100px",
            "& .MuiOutlinedInput-input": {
              padding: "6px 8px",
              fontSize: "14px",
              textAlign: "center",
            },
            "& input[type=number]": {
              MozAppearance: "textfield",
            },
            "& input[type=number]::-webkit-outer-spin-button": {
              WebkitAppearance: "none",
              margin: 0,
            },
            "& input[type=number]::-webkit-inner-spin-button": {
              WebkitAppearance: "none",
              margin: 0,
            },
          }}
        />
      </LabelComponent>
      {/* ACTIONS */}
      <Stack direction="row" sx={{ gap: 1 }}>
        <Button
          variant="contained"
          color="secondary"
          disabled={
            !selectedItem?.video ||
            !selectedItem.cues.length ||
            translationInProgress ||
            isRangeInvalid
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
