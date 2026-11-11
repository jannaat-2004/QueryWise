import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
export type WallpaperStyle = 'gradient' | 'aurora' | 'particles' | 'static';
export type WallpaperIntensity = 'low' | 'medium' | 'high';

export interface AppearanceSettings {
  theme: ThemeMode;
  wallpaperEnabled: boolean;
  wallpaperStyle: WallpaperStyle;
  wallpaperIntensity: WallpaperIntensity;
  wallpaperOpacity: number; // 0.1 to 1.0
}

const DEFAULT_SETTINGS: AppearanceSettings = {
  theme: 'dark',
  wallpaperEnabled: true,
  wallpaperStyle: 'gradient',
  wallpaperIntensity: 'medium',
  wallpaperOpacity: 0.85
};

const STORAGE_KEY = 'querywise_appearance_settings';

interface ThemeContextType extends AppearanceSettings {
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: ThemeMode) => void;
  setWallpaperEnabled: (enabled: boolean) => void;
  setWallpaperStyle: (style: WallpaperStyle) => void;
  setWallpaperIntensity: (intensity: WallpaperIntensity) => void;
  setWallpaperOpacity: (opacity: number) => void;
  resetAppearanceDefaults: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load saved appearance settings or fallback to defaults
  const [settings, setSettings] = useState<AppearanceSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          theme: parsed.theme || DEFAULT_SETTINGS.theme,
          wallpaperEnabled: parsed.wallpaperEnabled ?? DEFAULT_SETTINGS.wallpaperEnabled,
          wallpaperStyle: parsed.wallpaperStyle || DEFAULT_SETTINGS.wallpaperStyle,
          wallpaperIntensity: parsed.wallpaperIntensity || DEFAULT_SETTINGS.wallpaperIntensity,
          wallpaperOpacity: typeof parsed.wallpaperOpacity === 'number' ? parsed.wallpaperOpacity : DEFAULT_SETTINGS.wallpaperOpacity
        };
      }
    } catch {
      // Fallback
    }
    return DEFAULT_SETTINGS;
  });

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  // Listen to OS color scheme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, []);

  // Compute active resolved theme
  const resolvedTheme: 'dark' | 'light' = useMemo(() => {
    if (settings.theme === 'system') {
      return systemIsDark ? 'dark' : 'light';
    }
    return settings.theme;
  }, [settings.theme, systemIsDark]);

  // Sync DOM classes and styles immediately
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.style.colorScheme = 'dark';
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      root.style.colorScheme = 'light';
      root.setAttribute('data-theme', 'light');
    }
  }, [resolvedTheme]);

  // Persist settings whenever changed
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage failure
    }
  }, [settings]);

  const setTheme = useCallback((theme: ThemeMode) => {
    setSettings(prev => ({ ...prev, theme }));
  }, []);

  const setWallpaperEnabled = useCallback((wallpaperEnabled: boolean) => {
    setSettings(prev => ({ ...prev, wallpaperEnabled }));
  }, []);

  const setWallpaperStyle = useCallback((wallpaperStyle: WallpaperStyle) => {
    setSettings(prev => ({ ...prev, wallpaperStyle }));
  }, []);

  const setWallpaperIntensity = useCallback((wallpaperIntensity: WallpaperIntensity) => {
    setSettings(prev => ({ ...prev, wallpaperIntensity }));
  }, []);

  const setWallpaperOpacity = useCallback((wallpaperOpacity: number) => {
    setSettings(prev => ({ ...prev, wallpaperOpacity: Math.min(1, Math.max(0.1, wallpaperOpacity)) }));
  }, []);

  const resetAppearanceDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = useMemo(
    () => ({
      ...settings,
      resolvedTheme,
      setTheme,
      setWallpaperEnabled,
      setWallpaperStyle,
      setWallpaperIntensity,
      setWallpaperOpacity,
      resetAppearanceDefaults
    }),
    [
      settings,
      resolvedTheme,
      setTheme,
      setWallpaperEnabled,
      setWallpaperStyle,
      setWallpaperIntensity,
      setWallpaperOpacity,
      resetAppearanceDefaults
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
