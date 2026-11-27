import React, { useState } from "react";

import Tooltip from "@mui/material/Tooltip";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
/**
 * 🔤 Lấy 2 ký tự đầu từ tên (Ví dụ: "Đức Trí" -> "ĐT", "Nguyễn Văn A" -> "NV")
 */
const getInitials = (name) => {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
};

import AudioDropZone from "../customs/AudioDropZone";
import {
  Button,
  TextField,
  Divider,
  Stack,
  FormControl,
  MenuItem,
  Select,
  Grid,
  Avatar,
  Typography,
  Box,
  Paper,
} from "@mui/material";

const API = import.meta.env.VITE_VOICE_API ?? "/api/voice-blend";

const LAST_KEY = "ov_last_profile";

async function api(path, init) {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) throw new Error(await errorMessage(res));
  return await res.json();
}

export default function ReferenceVoice({
  profiles,
  profileId,
  selected,
  disabled,
  setProfileId,
  setInfo,
  newName,
  setNewName,
  rename,
  remove,
  run,
  refreshProfiles,
}) {
  const [file, setFile] = useState(null);

  const upload = () =>
    run("Đang trích âm sắc...", async () => {
      if (!file) throw new Error("Hãy chọn file audio tham chiếu.");
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("name", newName.trim());
      const r = await api("/profiles", {
        method: "POST",
        body: fd,
      });
      await refreshProfiles(r.profile_id);
      setInfo(`Đã lưu giọng "${r.name}".`);
      setFile(null);
      setNewName("");
    });

  const handleFileSelect = (file) => {
    console.log("File đã chọn:", file);
    setFile(file);
    // Xử lý upload, preview, v.v.
    const url = URL.createObjectURL(file);
    console.log("Preview URL:", url);
  };

  const handleFileClear = () => {
    console.log("File đã bị xóa");
  };

  return (
    <Stack sx={{ width: "100%", height: "100%", gap: 1 }}>
      <Stack sx={{ gap: 1, padding: 2 }}>
        <Typography sx={{ fontWeight: "bold", textTransform: "capitalize" }}>
          Tạo giọng tham chiếu
        </Typography>
        <AudioDropZone
          onFileSelect={handleFileSelect}
          onFileClear={handleFileClear}
          label="Kéo thả file audio vào đây"
          maxFileSize={30 * 1024 * 1024} // 30MB
        />
        <Stack direction={"row"} sx={{ gap: 1 }}>
          <TextField
            sx={{ flex: 1 }}
            size="small"
            label="Tên giọng (tuỳ chọn)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          <Button
            variant="contained"
            onClick={upload}
            disabled={disabled || !file}
          >
            Upload & lưu
          </Button>
        </Stack>
      </Stack>
      <Divider />
      <Stack
        sx={{
          flex: 1,
          padding: 2,

          gap: 2,
          height: "100%",
        }}
      >
        <Typography sx={{ fontWeight: "bold", textTransform: "capitalize" }}>
          Danh Sách Tạo giọng tham chiếu
        </Typography>
        <Paper
          sx={(theme) => ({
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 2,
            paddingY: 1,
            paddingX: 2,
            borderRadius: "25px",
            background: theme.palette.background.default,
          })}
        >
          <Typography variant="body2" sx={{ fontWeight: "bold" }}>
            Giọng đã chọn:
          </Typography>
          <Divider orientation="vertical" />
          <Stack
            direction={"row"}
            sx={{
              flex: 1,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography variant="body1">
              {" "}
              {profileId ? selected.name : "Chưa chọn voice"}
            </Typography>
            <Button
              // variant="contained"
              size="small"
              disabled={!profileId}
              onClick={rename}
              sx={{
                display: "flex",
                justifyContent: "flex-start",
                fontWeight: "bold",
              }}
            >
              Đổi tên
            </Button>
          </Stack>
        </Paper>

        <Paper
          sx={(theme) => ({
            width: "100%",
            height: "100%",
            overflowY: "auto",
            background: theme.palette.background.default,
          })}
        >
          <Grid container spacing={1} sx={{ p: 1 }}>
            {profiles.map((p, index) => (
              <NameAvatar
                key={index}
                name={p.name}
                isSelected={p.id === profileId}
                onClick={() => setProfileId(p.id)}
              />
            ))}
          </Grid>
        </Paper>
      </Stack>
    </Stack>
    // <Paper>

    //   {/*

    //   <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
    //     <FormControl size="small" sx={{ minWidth: 280 }}>
    //       <Select
    //         value={profileId}
    //         onChange={(e) => setProfileId(e.target.value)}
    //         disabled={disabled}
    //         displayEmpty
    //       >
    //         {profiles.length === 0 && (
    //           <MenuItem value="">(chưa có giọng nào)</MenuItem>
    //         )}

    //         {profiles.map((p) => (
    //           <MenuItem key={p.id} value={p.id}>
    //             {p.name}
    //             {p.blend ? " (pha trộn)" : ""}
    //           </MenuItem>
    //         ))}
    //       </Select>
    //     </FormControl>

    //     <Button
    //       variant="outlined"
    //       onClick={rename}
    //       disabled={disabled || !profileId}
    //     >
    //       Đổi tên
    //     </Button>

    //     <Button
    //       variant="outlined"
    //       color="error"
    //       onClick={remove}
    //       disabled={disabled || !profileId}
    //     >
    //       Xóa
    //     </Button>
    //   </Stack>

    //   {selected?.blend && (
    //     <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
    //       Pha từ:{" "}
    //       {selected.blend
    //         .map((b) => `${nameOf(b.id)} ${Math.round(b.weight * 100)}%`)
    //         .join(" + ")}
    //     </Typography>
    //   )}

    //   <Stack
    //     direction={{ xs: "column", md: "row" }}
    //     spacing={1}
    //     alignItems="center"
    //     sx={{ mb: 1 }}
    //   >

    //   </Stack> */}

    //   {/* <Typography variant="caption" color="text.secondary">
    //     Audio sạch, một người nói, 10–30 giây. Chỉ cần upload một lần, lần sau
    //     chọn từ danh sách.
    //   </Typography> */}
    // </Paper>
  );
}

/**
 * 🧩 Component Item Grid: Avatar trên + Tên dưới
 * @param {string} name - Tên đầy đủ
 * @param {number} [size=60] - Kích thước avatar
 * @param {string} [xs=12] - Cột mặc định (responsive)
 */
const NameAvatar = ({
  name,
  size = 40,
  xs = 12,
  isSelected = false,
  onClick,
}) => {
  const initials = getInitials(name);

  return (
    <Grid item xs={xs}>
      <Button
        variant={isSelected ? "contained" : "outlined"}
        sx={{
          display: "flex",
          flexDirection: "column",
          textAlign: "center",
          mb: 1,
        }}
        onClick={onClick}
      >
        {/* Avatar tròn */}
        <Avatar
          sx={{
            width: size,
            height: size,
            bgcolor: "primary.main",
            color: "common.white",
            fontSize: size / 2,
            fontWeight: "bold",
          }}
        >
          {initials}
        </Avatar>

        {/* Tên đầy đủ */}
        <Typography
          variant="body2"
          component="div"
          sx={{ fontSize: 13, color: "text.primary" }}
        >
          {name}
        </Typography>
      </Button>
    </Grid>
  );
};
