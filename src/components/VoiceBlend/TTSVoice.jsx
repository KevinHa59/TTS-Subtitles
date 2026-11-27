import {
  Paper,
  Typography,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  TextField,
  Button,
} from "@mui/material";

export default function TTSVoice({
  disabled = false,
  voices,
  voiceId,
  speed,
  text,
  profileId,
  audioUrl,
  elapsed,

  onVoiceChange,
  onSpeedChange,
  onTextChange,
  onGenerate,
}) {
  return (
    <Paper sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2 }}>
      <Typography sx={{ fontWeight: "bold", textTransform: "capitalize" }}>
        Tạo giọng nói
      </Typography>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={3}
        sx={{ mb: 2, gap: 2 }}
      >
        <FormControl size="small" fullWidth disabled={disabled}>
          <InputLabel>Giọng nguồn</InputLabel>

          <Select
            label="Giọng nguồn"
            value={voiceId}
            sx={(theme) => ({ background: theme.palette.background.default })}
            onChange={(e) => onVoiceChange?.(e.target.value)}
          >
            {voices.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

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

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Button
          variant="contained"
          onClick={onGenerate}
          disabled={disabled || !profileId}
        >
          Generate
        </Button>

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
