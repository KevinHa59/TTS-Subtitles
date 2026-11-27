import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#8b5cf6",
    },
    secondary: {
      main: "#06b6d4",
    },
    error: {
      main: "#ef4444",
    },
    warning: {
      main: "#f59e0b",
    },
    info: {
      main: "#3b82f6",
    },
    success: {
      main: "#22c55e",
    },
    background: {
      default: "#020617",
      paper: "#0f172a",
    },
  },
  shape: {
    borderRadius: 15,
  },
  spacing: 8,
  typography: {
    fontFamily: "'IBM Plex Sans', Helvetica, Arial, sans-serif",
    fontSize: 14,
    button: {
      textTransform: "none",
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          border: "1px solid rgba(255,255,255,0.12)",
        },
      },
    },
  },
});

export default theme;
