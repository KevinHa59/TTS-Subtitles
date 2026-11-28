import React, { useState } from "react";
import { useDropzone } from "react-dropzone";
// import CloudUploadIcon from "@mui/icons-material/CloudUpload";
// import CheckCircleIcon from "@mui/icons-material/CheckCircle";
// import AlertIcon from "@mui/icons-material/Alert";
import { styled } from "@mui/material/styles";
import { Button, Typography, Box, Alert, Paper, Stack } from "@mui/material";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  CloudUploadIcon,
  Trash,
} from "lucide-react";

const StyledDropZone = styled(Box)(({ theme, hasFile, isDragActive }) => ({
  border: `2px dashed ${isDragActive ? theme.palette.primary.main : "divider"}`,
  backgroundColor: isDragActive
    ? theme.palette.action.hover
    : hasFile
      ? theme.palette.success.main + "10" // Màu xanh nhạt khi có file
      : "transparent",
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(4),
  textAlign: "center",
  cursor: "pointer",
  transition: "all 0.2s ease-in-out",
  "&:hover": {
    borderColor: theme.palette.primary.main,
    backgroundColor: theme.palette.action.hover,
  },
}));

const IconWrapper = styled(Box)(({ theme }) => ({
  margin: theme.spacing(2, 0),
  color: theme.palette.primary.main,
  "& svg": {
    fontSize: 48,
  },
}));

const FileNameTypography = styled(Typography)(({ theme }) => ({
  marginTop: theme.spacing(1),
  color: theme.palette.text.secondary,
  wordBreak: "break-all",
}));

/**
 * Component kéo thả file audio
 * @param {Function} onFileSelect - Callback khi có file được chọn (nhận File object)
 * @param {Function} onFileClear - Callback khi xóa file
 * @param {string} acceptMimeTypes - MIME types cần chấp nhận (mặc định: audio/*)
 * @param {number} maxFileSize - Kích thước max (bytes). Mặc định: 50MB
 * @param {string} label - Text hiển thị khi chưa có file
 */
const AudioDropZone = ({
  onFileSelect,
  onFileClear,
  onFileTooLarge,
  externalFile,
  acceptMimeTypes = "audio/*",
  maxFileSize = 50 * 1024 * 1024, // 50MB
  label = "Kéo thả file audio vào đây hoặc click để chọn",
}) => {
  const [internalFile, setInternalFile] = useState(null);
  const [error, setError] = useState(null);
  const file = externalFile !== undefined ? externalFile : internalFile;

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop: (acceptedFiles, fileRejections) => {
        // Xử lý lỗi
        if (fileRejections.length > 0) {
          const rejection = fileRejections[0];
          const code = rejection.errors?.[0]?.code ?? rejection.code;
          if (code === "file-too-large") {
            if (onFileTooLarge && rejection.file) {
              setError(null);
              onFileTooLarge(rejection.file);
              return;
            }
            const maxMB = (maxFileSize / (1024 * 1024)).toFixed(0);
            setError(`File quá lớn. Tối đa ${maxMB}MB.`);
          } else if (code === "file-invalid-type") {
            setError("Định dạng file không hợp lệ. Vui lòng chọn file audio.");
          } else {
            setError("Không thể xử lý file.");
          }
          setInternalFile(null);
          return;
        }

        // Xử lý file hợp lệ
        const selectedFile = acceptedFiles[0];
        setError(null);
        setInternalFile(selectedFile);

        if (onFileSelect) {
          onFileSelect(selectedFile);
        }
      },
      accept: { [acceptMimeTypes]: [] },
      maxFileSize,
      multiple: false,
    });

  const handleClear = () => {
    setInternalFile(null);
    setError(null);
    if (onFileClear) {
      onFileClear();
    }
  };

  return (
    <Paper
      sx={(theme) => ({
        borderStyle: "dashed",
        position: "relative",
        background: theme.palette.background.default,
      })}
    >
      <StyledDropZone
        {...getRootProps()}
        hasFile={!!file}
        isDragActive={isDragActive}
      >
        <input {...getInputProps()} />

        <Stack sx={{ flex: 1, alignItems: "center" }}>
          {isDragReject ? (
            <IconWrapper>
              <AlertCircleIcon />
            </IconWrapper>
          ) : file ? (
            <IconWrapper>
              <CheckCircleIcon />
            </IconWrapper>
          ) : (
            <IconWrapper>
              <CloudUploadIcon />
            </IconWrapper>
          )}

          <Typography variant="body2">
            {isDragActive ? "Thả file vào đây" : file ? "" : label}
          </Typography>

          {file && (
            <FileNameTypography variant="body2">
              {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </FileNameTypography>
          )}

          {error && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </Stack>
      </StyledDropZone>

      {file && (
        <Box
          sx={{
            mt: 1,
            textAlign: "right",
            position: "absolute",
            right: 0,
            top: 0,
          }}
        >
          <Button
            size="small"
            color="error"
            onClick={handleClear}
            startIcon={<Trash />}
          >
            Xóa file
          </Button>
        </Box>
      )}
    </Paper>
  );
};

export default AudioDropZone;

// Sample use

// const [audioFile, setAudioFile] = useState(null);

//   const handleFileSelect = (file) => {
//     console.log('File đã chọn:', file);
//     // Xử lý upload, preview, v.v.
//     const url = URL.createObjectURL(file);
//     console.log('Preview URL:', url);
//   };

//   const handleFileClear = () => {
//     console.log('File đã bị xóa');
//   };

//   return (
//     <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
//       <h2>Upload Audio</h2>
//       <AudioDropZone
//         onFileSelect={handleFileSelect}
//         onFileClear={handleFileClear}
//         label="Kéo thả file audio vào đây"
//         maxFileSize={10 * 1024 * 1024} // 10MB
//       />
//     </div>
//   );
