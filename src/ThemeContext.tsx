import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppThemeId, themes, applyTheme } from './themes';

export interface AppearanceConfig {
  themeId: AppThemeId;
  accentColor: string;
}

interface ThemeContextValue {
  appearance: AppearanceConfig;
  isLoaded: boolean;
  saveAppearance: (a: AppearanceConfig) => Promise<void>;
}

const DEFAULT_APPEARANCE: AppearanceConfig = {
  themeId: 'brutal',
  accentColor: '#f5f011',
};

const ThemeContext = createContext<ThemeContextValue>({
  appearance: DEFAULT_APPEARANCE,
  isLoaded: false,
  saveAppearance: async () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceConfig>(DEFAULT_APPEARANCE);
  const [isLoaded, setIsLoaded] = useState(false);

  const applyAndSet = useCallback((a: AppearanceConfig) => {
    const theme = themes[a.themeId] ?? themes.midnight;
    applyTheme(theme, a.accentColor || theme.defaultAccent);
    setAppearance({ themeId: a.themeId, accentColor: a.accentColor || theme.defaultAccent });
  }, []);

  useEffect(() => {
    fetch('/api/appearance')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.appearance) {
          applyAndSet(data.appearance as AppearanceConfig);
        } else {
          applyAndSet(DEFAULT_APPEARANCE);
        }
      })
      .catch(() => applyAndSet(DEFAULT_APPEARANCE))
      .finally(() => setIsLoaded(true));
  }, []);

  const saveAppearance = useCallback(async (a: AppearanceConfig) => {
    applyAndSet(a);
    try {
      await fetch('/api/appearance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a),
      });
    } catch {
      // Silently fail - UI already updated
    }
  }, [applyAndSet]);

  return (
    <ThemeContext.Provider value={{ appearance, isLoaded, saveAppearance }}>
      {children}
    </ThemeContext.Provider>
  );
}
