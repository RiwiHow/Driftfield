export const APP_THEMES = [
  'github-light',
  'github-dark',
] as const;

export type AppTheme = (typeof APP_THEMES)[number];

export const APP_THEME_COLOR_SCHEMES = {
  'github-dark': 'dark',
  'github-light': 'light',
} as const satisfies Record<AppTheme, 'dark' | 'light'>;

export const APP_THEME_WINDOW_BACKGROUNDS = {
  'github-dark': '#0d1117',
  'github-light': '#ffffff',
} as const satisfies Record<AppTheme, string>;

export const APP_THEME_WINDOW_CHROME = {
  'github-dark': {
    background: '#151b23',
    symbol: '#9198a1',
  },
  'github-light': {
    background: '#f6f8fa',
    symbol: '#59636e',
  },
} as const satisfies Record<
  AppTheme,
  { background: string; symbol: string }
>;

export const THEME_REQUIRED_CSS_VARIABLES = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--border',
  '--input',
  '--ring',
  '--destructive',
  '--destructive-foreground',
  '--df-sidebar',
  '--df-sidebar-muted',
  '--df-editor',
  '--df-editor-raised',
  '--df-hover',
  '--df-active',
  '--df-selection',
  '--df-positive',
  '--df-warning',
  '--df-warm',
  '--df-action-primary-background',
  '--df-action-primary-foreground',
  '--df-action-primary-hover',
  '--df-disabled-background',
  '--df-disabled-foreground',
  '--df-disabled-border',
  '--df-focus-ring',
  '--df-shadow-color',
] as const;

export const isDarkAppTheme = (theme: AppTheme): boolean =>
  APP_THEME_COLOR_SCHEMES[theme] === 'dark';
