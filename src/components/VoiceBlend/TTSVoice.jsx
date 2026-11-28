import {
  Box,
  ButtonGroup,
  Chip,
  Paper,
  Typography,
  Stack,
  Slider,
  TextField,
  Button,
} from "@mui/material";
import { UserCheck } from "lucide-react";

/**
 * @param {{
 *   disabled?: boolean,
 *   voices?: Array<{ id: string, name?: string, gender?: string, tag?: string }>,
 *   selectedVoice?: { id?: string, modelId?: string, speakerId?: number, name?: string, gender?: string, tag?: string },
 *   speed: number,
 *   text: string,
 *   profileId: string,
 *   audioUrl: string | null,
 *   elapsed: number | null,
 *   canSaveReference?: boolean,
 *   onOpenVoiceModal?: () => void,
 *   onSpeedChange?: (value: number) => void,
 *   onTextChange?: (value: string) => void,
 *   onGenerate?: () => void,
 *   onGenerateOriginal?: () => void,
 *   onSaveAsReference?: () => void,
 * }} props
 */
export default function TTSVoice({
  disabled = false,
  voices = [],
  selectedVoice,
  speed,
  text,
  profileId,
  audioUrl,
  elapsed,
  canSaveReference = false,

  onOpenVoiceModal,
  onSpeedChange,
  onTextChange,
  onGenerate,
  onGenerateOriginal,
  onSaveAsReference,
}) {
  return (
    <Paper sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2 }}>
      <Typography sx={{ fontWeight: "bold", textTransform: "capitalize" }}>
        Tạo giọng nói
      </Typography>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={3}
        alignItems={{ xs: "stretch", md: "center" }}
        sx={{ mb: 2, gap: 2 }}
      >
        <Box
          sx={(theme) => ({
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            px: 1.5,
            py: 1,
            borderRadius: 1,
            border: `1px solid ${theme.palette.divider}`,
            background: theme.palette.background.default,
          })}
        >
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
            <Chip
              size="small"
              label={selectedVoice?.gender === "female" ? "Nữ" : "Nam"}
              color={selectedVoice?.gender === "female" ? "secondary" : "info"}
              variant="outlined"
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {selectedVoice?.name || "Chưa chọn giọng đọc"}
              </Typography>
              {selectedVoice?.tag && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block" }}
                  noWrap
                >
                  {selectedVoice.tag}
                </Typography>
              )}
            </Box>
          </Stack>

          <Button
            variant="outlined"
            size="small"
            disabled={disabled}
            onClick={onOpenVoiceModal}
            startIcon={<UserCheck size={15} />}
            sx={{ shrink: 0, whiteSpace: "nowrap" }}
          >
            Đổi Giọng Đọc{voices.length > 0 ? ` (${voices.length})` : ""}
          </Button>
        </Box>

        <Stack spacing={1} sx={{ minWidth: 260 }}>
          <Typography variant="body2">Tốc độ: {speed.toFixed(2)}</Typography>

          <Slider
            min={0.7}
            max={1.4}
            step={0.05}
            value={speed}
            disabled={disabled}
            valueLabelDisplay="auto"
            onChange={(_, value) => onSpeedChange?.(Number(value))}
          />
        </Stack>
      </Stack>

      <TextField
        fullWidth
        multiline
        minRows={4}
        label="Nội dung"
        value={text}
        disabled={disabled}
        sx={(theme) => ({
          background: theme.palette.background.default,
          mb: 2,
        })}
        onChange={(e) => onTextChange?.(e.target.value)}
      />

      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 2 }}
      >
        <Button
          variant="contained"
          onClick={onGenerate}
          disabled={disabled || !profileId}
        >
          Generate
        </Button>

        <ButtonGroup variant="outlined" disabled={disabled}>
          <Button
            onClick={onGenerateOriginal}
            disabled={disabled || !text?.trim() || !selectedVoice?.modelId}
          >
            Generate Original
          </Button>
          <Button
            color="success"
            variant={canSaveReference ? "contained" : "outlined"}
            onClick={onSaveAsReference}
            disabled={disabled || !canSaveReference}
          >
            Save as Reference
          </Button>
        </ButtonGroup>

        {elapsed !== null && (
          <Typography variant="body2" color="success.main">
            Hoàn tất trong {elapsed.toFixed(1)} giây
          </Typography>
        )}
      </Stack>

      {audioUrl && (
        <Stack spacing={1}>
          <audio controls src={audioUrl} style={{ width: "100%" }} />

          <Button
            component="a"
            href={audioUrl}
            download="voice.wav"
            variant="outlined"
            size="small"
            sx={{
              width: "fit-content",
            }}
          >
            Tải về
          </Button>
        </Stack>
      )}
    </Paper>
  );
}
