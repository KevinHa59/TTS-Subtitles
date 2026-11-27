import { createRoot } from "react-dom/client";
import App from "./App.jsx";
// import { ThemeProvider } from "./context/ThemeContext.tsx";
import "./index.css";

import theme from "./theme";
import { ThemeProvider } from "@mui/material";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={theme}>
    <App />
  </ThemeProvider>,
);
