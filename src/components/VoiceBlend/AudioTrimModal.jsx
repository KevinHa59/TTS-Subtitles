import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Stack,
  Typography,
} from "@mui/material";
import { Play, Scissors, Square } from "lucide-react";

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00.0";
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

function encodeMonoWav(audioBuffer, startSec, endSec, targetSampleRate) {
  const srcRate = audioBuffer.sampleRate;
  const outRate = Math.min(srcRate, targetSampleRate || srcRate);
  const startSample = Math.max(0, Math.floor(startSec * srcRate));
  const endSample = Math.min(
    audioBuffer.length,
    Math.ceil(endSec * srcRate),
  );
  const srcLen = Math.max(1, endSample - startSample);

  // Mix down to mono
  const numChannels = audioBuffer.numberOfChannels;
  const mono = new Float32Array(srcLen);
  for (let ch = 0; ch < numChannels; ch++) {
    const chData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < srcLen; i++) {
      mono[i] += chData[startSample + i] / numChannels;
    }
  }

  // Linear resample if outRate < srcRate
  const ratio = srcRate / outRate;
  const outLen = Math.max(1, Math.floor(srcLen / ratio));
  const samples = new Float32Array(outLen);
  if (ratio === 1) {
    samples.set(mono);
  } else {
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = mono[idx] ?? 0;
      const s1 = mono[Math.min(idx + 1, srcLen - 1)] ?? s0;
      samples[i] = s0 + (s1 - s0) * frac;
    }
  }

  const dataBytes = outLen * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < outLen; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true,
    );
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export default function AudioTrimModal({
  open,
  file,
  maxFileSize = 25 * 1024 * 1024,
  onClose,
  onConfirm,
}) {
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [range, setRange] = useState([0, 0]);
  const [isPlaying, setIsPlaying] = useState(false);

  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);

  const stopPreview = () => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* ignore */
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    if (!open || !file) {
      stopPreview();
      setAudioBuffer(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const ctx =
          audioCtxRef.current ||
          new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;
        const ab = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab);
        if (cancelled) return;
        setAudioBuffer(decoded);
        const dur = decoded.duration;
        // Nếu file quá lớn, gợi ý đoạn đầu tối đa 60s để gọn nhẹ
        const initialEnd =
          file.size > maxFileSize ? Math.min(dur, 60) : dur;
        setRange([0, Number(initialEnd.toFixed(1))]);
      } catch (e) {
        if (!cancelled) {
          setError(
            "Không thể đọc file audio này trong trình duyệt. Hãy thử file WAV/MP3 khác.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      stopPreview();
    };
  }, [open, file, maxFileSize]);

  // Vẽ waveform đơn giản lên canvas
  const peaks = useMemo(() => {
    if (!audioBuffer) return [];
    const data = audioBuffer.getChannelData(0);
    const bars = 120;
    const step = Math.max(1, Math.floor(data.length / bars));
    const result = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      const start = i * step;
      const end = Math.min(data.length, start + step);
      for (let j = start; j < end; j++) {
        const abs = Math.abs(data[j]);
        if (abs > max) max = abs;
      }
      result.push(max);
    }
    return result;
  }, [audioBuffer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer || peaks.length === 0) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const dur = audioBuffer.duration || 1;
    const startRatio = range[0] / dur;
    const endRatio = range[1] / dur;

    const barW = w / peaks.length;
    peaks.forEach((p, idx) => {
      const ratio = idx / peaks.length;
      const inRange = ratio >= startRatio && ratio <= endRatio;
      ctx.fillStyle = inRange ? "#f59e0b" : "rgba(148, 163, 184, 0.35)";
      const barH = Math.max(4, p * (h - 8));
      ctx.fillRect(
        idx * barW + 1,
        (h - barH) / 2,
        Math.max(1, barW - 2),
        barH,
      );
    });
  }, [audioBuffer, peaks, range]);

  const targetRate = audioBuffer
    ? Math.min(audioBuffer.sampleRate, 24000)
    : 24000;
  const selectedDuration = Math.max(0, range[1] - range[0]);
  const estimatedBytes = 44 + Math.floor(selectedDuration * targetRate) * 2;
  const estimatedMB = estimatedBytes / (1024 * 1024);
  const maxMB = (maxFileSize / (1024 * 1024)).toFixed(0);
  const tooLargeAfterTrim = estimatedBytes > maxFileSize;

  const togglePlay = async () => {
    if (!audioBuffer) return;
    if (isPlaying) {
      stopPreview();
      return;
    }
    const ctx =
      audioCtxRef.current ||
      new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    src.onended = () => {
      setIsPlaying(false);
      sourceRef.current = null;
    };
    sourceRef.current = src;
    setIsPlaying(true);
    src.start(0, range[0], Math.max(0.1, range[1] - range[0]));
  };

  const handleConfirm = () => {
    if (!audioBuffer) return;
    stopPreview();
    if (selectedDuration < 3) {
      setError("Đoạn audio cắt ra nên dài tối thiểu 3 giây để trích âm sắc.");
      return;
    }
    const wavBlob = encodeMonoWav(audioBuffer, range[0], range[1], targetRate);
    if (wavBlob.size > maxFileSize) {
      setError(
        `File sau khi cắt (${(wavBlob.size / (1024 * 1024)).toFixed(2)} MB) vẫn vượt quá ${maxMB} MB. Hãy chọn đoạn ngắn hơn.`,
      );
      return;
    }
    const baseName = (file?.name || "reference").replace(/\.[^.]+$/, "");
    const trimmedFile = new File([wavBlob], `${baseName}_trimmed.wav`, {
      type: "audio/wav",
    });
    onConfirm?.(trimmedFile);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Scissors size={18} />
        <span>Cắt Audio Tham Chiếu</span>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          {file && file.size > maxFileSize && (
            <Alert severity="warning">
              File <strong>{file.name}</strong> (
              {(file.size / (1024 * 1024)).toFixed(2)} MB) vượt quá giới hạn{" "}
              {maxMB} MB. Hãy chọn đoạn cần dùng để cắt nhỏ lại.
            </Alert>
          )}

          {loading && (
            <Typography variant="body2" color="text.secondary">
              Đang giải mã audio...
            </Typography>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          {audioBuffer && (
            <>
              <Box
                sx={(theme) => ({
                  p: 1.5,
                  borderRadius: 1,
                  border: `1px solid ${theme.palette.divider}`,
                  background: theme.palette.background.default,
                })}
              >
                <canvas
                  ref={canvasRef}
                  width={520}
                  height={80}
                  style={{ width: "100%", height: 80, display: "block" }}
                />
              </Box>

              <Box sx={{ px: 1 }}>
                <Slider
                  value={range}
                  min={0}
                  max={Number(audioBuffer.duration.toFixed(1))}
                  step={0.1}
                  disableSwap
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => formatTime(v)}
                  onChange={(_, val) => {
                    if (Array.isArray(val)) {
                      stopPreview();
                      setError(null);
                      setRange(val);
                    }
                  }}
                />
              </Box>

              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                flexWrap="wrap"
                gap={1}
              >
                <Typography variant="body2">
                  Đoạn chọn: <strong>{formatTime(range[0])}</strong> →{" "}
                  <strong>{formatTime(range[1])}</strong> (
                  {selectedDuration.toFixed(1)}s)
                </Typography>

                <Typography
                  variant="body2"
                  color={tooLargeAfterTrim ? "error.main" : "text.secondary"}
                >
                  Dung lượng dự kiến:{" "}
                  <strong>{estimatedMB.toFixed(2)} MB</strong> / {maxMB} MB
                </Typography>
              </Stack>

              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={togglePlay}
                  startIcon={isPlaying ? <Square size={14} /> : <Play size={14} />}
                >
                  {isPlaying ? "Dừng nghe thử" : "Nghe thử đoạn chọn"}
                </Button>
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!audioBuffer || loading || tooLargeAfterTrim}
          startIcon={<Scissors size={16} />}
        >
          Cắt & Dùng
        </Button>
      </DialogActions>
    </Dialog>
  );
}
