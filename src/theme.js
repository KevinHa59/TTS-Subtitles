import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#5fd8f7"
    },
    secondary: {
      main: "#bdbdbd"
    },
    error: {
      main: "#ef4444"
    },
    warning: {
      main: "#f59e0b"
    },
    info: {
      main: "#e0e8f5"
    },
    success: {
      main: "#22c55e"
    },
    background: {
      default: "#0a0a0a",
      paper: "#212121"
    }
  },
  shape: {
    borderRadius: 8
  },
  spacing: 8,
  typography: {
    fontFamily: "'IBM Plex Sans', Helvetica, Arial, sans-serif",
    fontSize: 14,
    button: {
      textTransform: "none"
    }
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true
      }
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0
      },
      styleOverrides: {
        root: {
          border: "1px solid rgba(255,255,255,0.12)"
        }
      }
    }
  }
});

export default theme;
