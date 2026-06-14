/**
 * App Theme System — Brutal only
 */

export type AppThemeId = 'brutal';

export interface AppTheme {
  id: AppThemeId;
  name: string;
  description: string;
  defaultAccent: string;
  /** CSS custom properties applied to :root */
  vars: Record<string, string>;
}

// ── Brutal ────────────────────────────────────────────────────────────────────
const brutal: AppTheme = {
  id: 'brutal',
  name: 'Brutal',
  description: 'Crudo, afilado, industrial.',
  defaultAccent: '#f5f011',
  vars: {
    '--app-bg': '#0a0a0a',
    '--card-bg': 'transparent',
    '--card-border': 'transparent',
    '--card-radius': '0px',
    '--field-bg-base': 'rgba(255,255,255,0.04)',
    '--field-border': 'rgba(255,255,255,0.22)',
    '--field-radius': '0px',
    '--btn-radius': '0px',
    '--pill-radius': '0px',
    '--text-primary': '#ffffff',
    '--text-secondary': '#cccccc',
    '--text-muted': '#888888',
    '--text-faint': '#333333',
    '--border-subtle': 'rgba(255,255,255,0.08)',
    '--border-medium': 'rgba(255,255,255,0.20)',
    '--border-width': '2px',
    '--heading-weight': '900',
    '--heading-tracking': '-0.04em',
    '--loader-bg': '#0a0a0a',
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────
export const themes: Record<AppThemeId, AppTheme> = { brutal };
export const themeIds: AppThemeId[] = ['brutal'];

/**
 * Apply theme + accent color to the document root.
 */
export function applyTheme(theme: AppTheme, accentColor: string): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v);
  }
  root.style.setProperty('--accent', accentColor);

  const hex = accentColor.replace('#', '').padEnd(6, '0');
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  root.style.setProperty('--accent-fg', lum > 0.55 ? '#000000' : '#ffffff');

  root.dataset.theme = theme.id;
  document.body.style.backgroundColor = theme.vars['--app-bg'];
}
