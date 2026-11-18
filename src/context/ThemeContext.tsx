import React, { createContext, useContext, useEffect, useState, useMemo } from "react";

export type ThemeMode =
  | "desktop-dark"
  | "desktop-zinc"
  | "desktop-light"
  | "high-contrast"
  | "system";

export interface ThemeOption {
  id: ThemeMode;
  name: string;
  description: string;
  colorPreview: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "desktop-dark",
    name: "Tối Slate (Mặc định)",
    description: "Giao diện tối chuẩn Studio nền Slate sâu thẳm, dịu mắt khi làm việc lâu",
    colorPreview: "#0f172a",
  },
  {
    id: "desktop-zinc",
    name: "Than Chì (Adobe / Zinc)",
    description: "Tông xám lạnh trung tính phong cách Adobe Premiere & DaVinci Resolve",
    colorPreview: "#18181b",
  },
  {
    id: "desktop-light",
    name: "Sáng Hiện Đại (Light)",
    description: "Giao diện sáng sủa, độ tương phản cao, phù hợp không gian nhiều ánh sáng",
    colorPreview: "#f8fafc",
  },
  {
    id: "high-contrast",
    name: "Tương Phản Cao (OLED)",
    description: "Nền đen thuần 100% tiết kiệm pin màn hình OLED, đường viền sắc nét",
    colorPreview: "#000000",
  },
  {
    id: "system",
    name: "Theo Hệ Điều Hành",
    description: "Tự động đồng bộ chế độ Sáng/Tối theo cài đặt của Windows / macOS",
    colorPreview: "#334155",
  },
];

export interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: "desktop-dark" | "desktop-zinc" | "desktop-light" | "high-contrast";
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  themes: ThemeOption[];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "piper_tts_desktop_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (
        stored === "desktop-dark" ||
        stored === "desktop-zinc" ||
        stored === "desktop-light" ||
        stored === "high-contrast" ||
        stored === "system"
      ) {
        return stored;
      }
    }
    return "desktop-dark";
  });

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });

  // Listen to system dark mode changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedTheme = useMemo(() => {
    if (theme === "system") {
      return systemIsDark ? "desktop-dark" : "desktop-light";
    }
    return theme;
  }, [theme, systemIsDark]);

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolvedTheme);

    // Sync Tailwind classes
    root.classList.remove(
      "dark",
      "light",
      "theme-dark",
      "theme-zinc",
      "theme-light",
      "theme-high-contrast"
    );

    if (resolvedTheme === "desktop-light") {
      root.classList.add("light", "theme-light");
    } else {
      root.classList.add("dark");
      if (resolvedTheme === "desktop-zinc") {
        root.classList.add("theme-zinc");
      } else if (resolvedTheme === "high-contrast") {
        root.classList.add("theme-high-contrast");
      } else {
        root.classList.add("theme-dark");
      }
    }
  }, [resolvedTheme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, newTheme);
    }
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "desktop-light" ? "desktop-dark" : "desktop-light");
  };

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
      themes: THEME_OPTIONS,
    }),
    [theme, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const DEFAULT_THEME_VALUE: ThemeContextValue = {
  theme: "desktop-dark",
  resolvedTheme: "desktop-dark",
  setTheme: () => {},
  toggleTheme: () => {},
  themes: THEME_OPTIONS,
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    return DEFAULT_THEME_VALUE;
  }
  return context;
}
