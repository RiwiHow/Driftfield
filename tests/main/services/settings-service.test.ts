import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  parseSettingsUpdate,
  parseStoredSettings,
  SettingsService,
} from '../../../src/main/services/settings-service';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('settings parsing and validation', () => {
  it('accepts only the current complete settings schema', () => {
    expect(
      parseStoredSettings({
        agent: {
          defaultModel: { modelId: 'model-a', providerId: 'anthropic' },
          thinkingLevel: 'high',
        },
        closeWindowBehavior: 'minimize',
        editorFontSize: 20,
        language: 'zh-CN',
        lastProjectDirectoryPath: '/Novels/Example',
        theme: 'github-dark',
        zoomPercent: 125,
        version: 3,
      }),
    ).toEqual({
      agent: {
        defaultModel: { modelId: 'model-a', providerId: 'anthropic' },
        thinkingLevel: 'high',
      },
      closeWindowBehavior: 'minimize',
      editorFontSize: 20,
      language: 'zh-CN',
      lastProjectDirectoryPath: '/Novels/Example',
      theme: 'github-dark',
      zoomPercent: 125,
      version: 3,
    });
  });

  it('rejects unknown themes in settings updates', () => {
    expect(() => parseSettingsUpdate({ theme: 'unknown-theme' })).toThrow(
      'Unknown application theme',
    );
  });

  it('accepts the system theme preference', () => {
    expect(parseSettingsUpdate({ theme: 'system' })).toEqual({
      theme: 'system',
    });
    expect(
      parseStoredSettings({ ...DEFAULT_SETTINGS, theme: 'system' }).theme,
    ).toBe('system');
  });

  it('uses defaults for invalid stored fields', () => {
    expect(parseStoredSettings({ editorFontSize: 100 })).toMatchObject({
      editorFontSize: 17,
      lastProjectDirectoryPath: null,
      language: 'en',
      theme: 'github-light',
      zoomPercent: 100,
      version: 3,
    });
  });

  it('defaults incomplete files and rejects unknown language updates', () => {
    expect(parseStoredSettings({ language: 'zh-CN' })).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings({ language: 'fr' }).language).toBe('en');
    expect(() => parseSettingsUpdate({ language: 'fr' })).toThrow(
      'Unknown application language',
    );
  });

  it('uses defaults for outdated settings versions', () => {
    expect(parseStoredSettings(PREVIOUS_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings(LEGACY_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('accepts only supported application zoom levels', () => {
    expect(parseSettingsUpdate({ zoomPercent: 150 })).toEqual({
      zoomPercent: 150,
    });
    expect(() => parseSettingsUpdate({ zoomPercent: 123 })).toThrow(
      'Unknown application zoom level',
    );
  });

  it('validates global Agent settings updates', () => {
    expect(parseSettingsUpdate({
      agent: {
        defaultModel: { modelId: 'model-a', providerId: 'anthropic' },
        thinkingLevel: 'high',
      },
    })).toEqual({
      agent: {
        defaultModel: { modelId: 'model-a', providerId: 'anthropic' },
        thinkingLevel: 'high',
      },
    });
    expect(() => parseSettingsUpdate({
      agent: { defaultModel: null, thinkingLevel: 'turbo' },
    })).toThrow('Invalid global Agent settings');
  });

  it('validates the last project directory path', () => {
    expect(
      parseStoredSettings({
        ...DEFAULT_SETTINGS,
        lastProjectDirectoryPath: '/Novels/Example',
      })
        .lastProjectDirectoryPath,
    ).toBe('/Novels/Example');
    expect(
      parseStoredSettings({ ...DEFAULT_SETTINGS, lastProjectDirectoryPath: '' })
        .lastProjectDirectoryPath,
    ).toBeNull();
    expect(
      parseStoredSettings({
        ...DEFAULT_SETTINGS,
        lastProjectDirectoryPath: 'relative/project',
      })
        .lastProjectDirectoryPath,
    ).toBeNull();
    expect(() =>
      parseSettingsUpdate({ lastProjectDirectoryPath: '/Novels/Example' }),
    ).toThrow('Unknown application setting');
  });

  it('rejects unknown update fields, including the schema version', () => {
    expect(() => parseSettingsUpdate({ version: 3 })).toThrow(
      'Unknown application setting',
    );
  });

  it('persists the last project without exposing it to renderer updates', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'driftfield-settings-'),
    );
    temporaryDirectories.push(directory);
    const service = await SettingsService.create(directory);

    await service.setLastProjectDirectoryPath('/Novels/Example');
    await service.update({ editorFontSize: 20 });

    expect(service.get()).toMatchObject({
      editorFontSize: 20,
      lastProjectDirectoryPath: '/Novels/Example',
    });
    expect(
      JSON.parse(await readFile(path.join(directory, 'settings.json'), 'utf8')),
    ).toMatchObject({ lastProjectDirectoryPath: '/Novels/Example', version: 3 });
  });
});

const DEFAULT_SETTINGS = {
  agent: {
    defaultModel: null,
    thinkingLevel: 'medium',
  },
  closeWindowBehavior: 'quit',
  editorFontSize: 17,
  language: 'en',
  lastProjectDirectoryPath: null,
  theme: 'github-light',
  zoomPercent: 100,
  version: 3,
} as const;

const LEGACY_SETTINGS = {
  closeWindowBehavior: 'minimize',
  editorFontSize: 20,
  language: 'zh-CN',
  lastProjectDirectoryPath: '/Novels/Legacy',
  theme: 'github-dark',
  version: 1,
} as const;

const PREVIOUS_SETTINGS = {
  ...DEFAULT_SETTINGS,
  version: 2,
} as const;
