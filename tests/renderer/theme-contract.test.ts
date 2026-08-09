import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  APP_THEMES,
  APP_THEME_WINDOW_BACKGROUNDS,
  THEME_REQUIRED_CSS_VARIABLES,
} from '../../src/shared/theme-contract';

const stylesDirectory = resolve(process.cwd(), 'src/renderer/styles');
const themesCss = readFileSync(resolve(stylesDirectory, 'themes.css'), 'utf8');

const escapeForRegularExpression = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const readThemeVariables = (theme: (typeof APP_THEMES)[number]) => {
  const selector = `\\[data-theme="${escapeForRegularExpression(theme)}"\\]`;
  const block = themesCss.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`));
  expect(block, `missing CSS block for ${theme}`).not.toBeNull();

  return new Map(
    Array.from(block?.[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g) ?? []).map(
      ([, property, value]) => [property, value.trim()],
    ),
  );
};

const parseHexColor = (value: string): [number, number, number] => {
  expect(value).toMatch(/^#[0-9a-f]{6}$/i);
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
};

const relativeLuminance = (value: string): number => {
  const channels = parseHexColor(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrastRatio = (foreground: string, background: string): number => {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
};

describe('renderer theme contract', () => {
  it('offers only the two supported GitHub Primer themes', () => {
    expect(APP_THEMES).toEqual(['github-light', 'github-dark']);
  });

  it.each(APP_THEMES)('%s implements every required semantic variable', (theme) => {
    const variables = readThemeVariables(theme);

    expect(
      THEME_REQUIRED_CSS_VARIABLES.filter((property) => !variables.has(property)),
    ).toEqual([]);
  });

  it.each(APP_THEMES)('%s keeps its native-window background in sync', (theme) => {
    expect(readThemeVariables(theme).get('--background')).toBe(
      APP_THEME_WINDOW_BACKGROUNDS[theme],
    );
  });

  it.each(APP_THEMES)('%s meets contrast requirements for critical roles', (theme) => {
    const variables = readThemeVariables(theme);
    const expectContrast = (
      foreground: string,
      background: string,
      minimum: number,
    ): void => {
      const ratio = contrastRatio(
        variables.get(foreground) ?? '',
        variables.get(background) ?? '',
      );
      expect(
        ratio,
        `${theme}: ${foreground} on ${background} has ${ratio.toFixed(2)}:1 contrast`,
      ).toBeGreaterThanOrEqual(minimum);
    };

    expectContrast('--foreground', '--background', 4.5);
    expectContrast('--primary-foreground', '--primary', 4.5);
    expectContrast('--secondary-foreground', '--secondary', 4.5);
    expectContrast('--destructive-foreground', '--destructive', 4.5);
    expectContrast(
      '--df-action-primary-foreground',
      '--df-action-primary-background',
      4.5,
    );
    expectContrast('--muted-foreground', '--muted', 3);
  });

  it('keeps raw palette colors and theme branches in the theme stylesheet', () => {
    const violations = readdirSync(stylesDirectory)
      .filter((fileName) => fileName.endsWith('.css') && fileName !== 'themes.css')
      .flatMap((fileName) => {
        const source = readFileSync(resolve(stylesDirectory, fileName), 'utf8');
        return [
          ...Array.from(source.matchAll(/#[0-9a-f]{3,8}\b/gi), (match) =>
            `${fileName}: raw color ${match[0]}`,
          ),
          ...Array.from(source.matchAll(/\b(?:rgb|hsl)a?\(/gi), (match) =>
            `${fileName}: raw color function ${match[0]}`,
          ),
          ...Array.from(source.matchAll(/\[data-theme(?:=|\])/gi), () =>
            `${fileName}: theme-specific selector`,
          ),
        ];
      });

    expect(violations).toEqual([]);
  });
});
