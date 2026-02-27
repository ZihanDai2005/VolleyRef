type ThemeMode = "light" | "dark";

function normalizeTheme(theme: string | undefined): ThemeMode {
  return theme === "dark" ? "dark" : "light";
}

export function getSystemThemeMode(): ThemeMode {
  const info: any = wx.getSystemInfoSync();
  return normalizeTheme(info && info.theme);
}

export function applyNavigationBarTheme(theme?: ThemeMode): void {
  const mode = theme || getSystemThemeMode();
  const isDark = mode === "dark";
  wx.setNavigationBarColor({
    frontColor: isDark ? "#ffffff" : "#000000",
    backgroundColor: isDark ? "#131416" : "#ffffff",
    animation: {
      duration: 120,
      timingFunc: "easeIn",
    },
  });
}

export function bindThemeChange(onChange: (theme: ThemeMode) => void): () => void {
  const host: any = wx as any;
  if (!host.onThemeChange) {
    return function () {};
  }
  const listener = (res: { theme?: string }) => {
    onChange(normalizeTheme(res && res.theme));
  };
  host.onThemeChange(listener);
  return function () {
    if (host.offThemeChange) {
      host.offThemeChange(listener);
    }
  };
}
