import {
  Paper,
  Typography,
  Stack,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Button,
  Checkbox,
  FormControlLabel,
  TextField,
} from "@mui/material";

export default function BlendVoices({
  disabled = false,
  profiles,

  blendA,
  blendB,
  weightA,
  keepNorm,
  blendName,

  previewUrl,
  previewElapsed,

  onBlendAChange,
  onBlendBChange,
  onWeightAChange,
  onKeepNormChange,
  onBlendNameChange,

  onPreview,
  onBlend,
}) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        3. Pha trộn hai giọng (tuỳ chọn)
      </Typography>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <FormControl size="small" sx={{ minWidth: 200 }} disabled={disabled}>
          <InputLabel>Giọng A</InputLabel>

          <Select
            value={blendA}
            label="Giọng A"
            onChange={(e) => onBlendAChange?.(e.target.value)}
          >
            {profiles.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Typography variant="body2" sx={{ minWidth: 48 }}>
          {weightA}%
        </Typography>

        <Slider
          sx={{ flex: 1 }}
          min={5}
          max={95}
          step={5}
          value={weightA}
          disabled={disabled}
          valueLabelDisplay="auto"
          onChange={(_, value) => onWeightAChange?.(Number(value))}
        />

        <Typography variant="body2" sx={{ minWidth: 48 }}>
          {100 - weightA}%
        </Typography>

        <FormControl size="small" sx={{ minWidth: 200 }} disabled={disabled}>
          <InputLabel>Giọng B</InputLabel>

          <Select
            value={blendB}
            label="Giọng B"
            onChange={(e) => onBlendBChange?.(e.target.value)}
          >
            {profiles.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          onClick={onPreview}
          disabled={disabled || profiles.length < 2}
        >
          ▶ Nghe thử
        </Button>

        <FormControlLabel
          control={
            <Checkbox
              checked={keepNorm}
              onChange={(e) => onKeepNormChange?.(e.target.checked)}
            />
          }
          label="keep_norm"
        />

        {previewElapsed !== null && (
          <Typography variant="body2" color="success.main">
            Hoàn tất trong {previewElapsed.toFixed(1)} giây
          </Typography>
        )}
      </Stack>

      {previewUrl && (
        <Box sx={{ mb: 2 }}>
          <audio
            controls
            src={previewUrl}
            style={{
              width: "100%",
            }}
          />
        </Box>
      )}

      <Stack
        direction={{
          xs: "column",
          sm: "row",
        }}
        spacing={2}
        sx={{ mb: 1 }}
      >
        <TextField
          fullWidth
          size="small"
          label="Tên giọng mới"
          value={blendName}
          onChange={(e) => onBlendNameChange?.(e.target.value)}
        />

        <Button
          variant="contained"
          onClick={onBlend}
          disabled={disabled || profiles.length < 2}
        >
          Lưu thành giọng mới
        </Button>
      </Stack>

      <Typography variant="caption" color="text.secondary">
        Nghe thử dùng văn bản, giọng nguồn và tốc độ ở mục 2 và không lưu gì cả.
        Kéo thanh tỉ lệ rồi nghe lại cho tới khi ưng ý, sau đó đặt tên và lưu.
      </Typography>
    </Paper>
  );
}
