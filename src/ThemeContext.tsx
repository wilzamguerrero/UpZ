import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppThemeId, themes, applyTheme } from './themes';

export interface AppearanceConfig {
  themeId: AppThemeId;
  accentColor: string;
  homeTitle: string;
  homeMessage: string;
  homeIcon: string;
  homeBgColor: string;
}

interface ThemeContextValue {
  appearance: AppearanceConfig;
  isLoaded: boolean;
  saveAppearance: (a: AppearanceConfig) => Promise<void>;
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  themeId: 'brutal',
  accentColor: '#f5f011',
  homeTitle: 'Comparte tus archivos directo a Notion.',
  homeMessage: 'Accede al enlace directo de tu proyecto para cargar archivos. Desde esta portada solo se muestra el acceso de administración.',
  homeIcon: 'Sparkles',
  homeBgColor: '#050505',
};

const normalizeAppearance = (raw?: Partial<AppearanceConfig> | null): AppearanceConfig => {
  const themeId = raw?.themeId === 'brutal' ? raw.themeId : DEFAULT_APPEARANCE.themeId;
  const accentColor = (raw?.accentColor || DEFAULT_APPEARANCE.accentColor || '').trim() || DEFAULT_APPEARANCE.accentColor;
  const homeTitle = (raw?.homeTitle || '').trim() || DEFAULT_APPEARANCE.homeTitle;
  const homeMessage = (raw?.homeMessage || '').trim() || DEFAULT_APPEARANCE.homeMessage;
  const homeIcon = (raw?.homeIcon || '').trim() || DEFAULT_APPEARANCE.homeIcon;
  const homeBgColor = (raw?.homeBgColor || '').trim() || DEFAULT_APPEARANCE.homeBgColor;

  return {
    themeId,
    accentColor,
    homeTitle,
    homeMessage,
    homeIcon,
    homeBgColor,
  };
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

  const applyAndSet = useCallback((a?: Partial<AppearanceConfig> | null) => {
    const normalized = normalizeAppearance(a);
    const theme = themes[normalized.themeId] ?? themes.brutal;
    applyTheme(theme, normalized.accentColor || theme.defaultAccent);
    setAppearance({
      ...normalized,
      accentColor: normalized.accentColor || theme.defaultAccent,
    });
  }, []);

  useEffect(() => {
    fetch('/api/appearance')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.appearance) {
          applyAndSet(data.appearance as Partial<AppearanceConfig>);
        } else {
          applyAndSet(DEFAULT_APPEARANCE);
        }
      })
      .catch(() => applyAndSet(DEFAULT_APPEARANCE))
      .finally(() => setIsLoaded(true));
  }, []);

  const saveAppearance = useCallback(async (a: AppearanceConfig) => {
    const normalized = normalizeAppearance(a);
    applyAndSet(normalized);
    try {
      await fetch('/api/appearance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
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
