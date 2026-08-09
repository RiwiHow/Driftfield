export const APP_THEMES = [
  'github-light',
  'tokyo-night',
  'one-dark',
] as const;

export type AppTheme = (typeof APP_THEMES)[number];

export const APP_THEME_COLOR_SCHEMES = {
  'github-light': 'light',
  'one-dark': 'dark',
  'tokyo-night': 'dark',
} as const satisfies Record<AppTheme, 'dark' | 'light'>;

export const APP_THEME_WINDOW_BACKGROUNDS = {
  'github-light': '#ffffff',
  'one-dark': '#282c34',
  'tokyo-night': '#1a1b26',
} as const satisfies Record<AppTheme, string>;

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
  '--df-primary-hover',
  '--df-disabled-background',
  '--df-disabled-foreground',
  '--df-disabled-border',
  '--df-focus-ring',
  '--df-shadow-color',
] as const;

export const isDarkAppTheme = (theme: AppTheme): boolean =>
  APP_THEME_COLOR_SCHEMES[theme] === 'dark';
