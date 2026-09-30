import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";

const KEY = "hallplan-theme-v2";

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

applyTheme(readTheme());

export const roomColors = {
  dark: {
    background: "#0c1016",
    cell: "#243244",
    section: "#34506a",
    cold: "#1d4d3d",
    sky: "#d5e4f2",
    ground: "#1a140f",
    shadow: 0.45,
  },
  light: {
    background: "#dfe7ef",
    cell: "#c5d2de",
    section: "#8ea3b6",
    cold: "#9ed9bc",
    sky: "#f7fbff",
    ground: "#d7e0d4",
    shadow: 0.18,
  },
} as const;

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  const value = useMemo(() => ({
    theme,
    setTheme: (next: Theme) => {
      applyTheme(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* navigation privée */
      }
      setThemeState(next);
    },
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("Thème indisponible");
  return value;
}
