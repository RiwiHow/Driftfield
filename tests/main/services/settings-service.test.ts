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
        closeWindowBehavior: 'minimize',
        editorFontSize: 20,
        language: 'zh-CN',
        lastProjectDirectoryPath: '/Novels/Example',
        theme: 'github-dark',
        version: 1,
      }),
    ).toEqual({
      closeWindowBehavior: 'minimize',
      editorFontSize: 20,
      language: 'zh-CN',
      lastProjectDirectoryPath: '/Novels/Example',
      theme: 'github-dark',
      version: 1,
    });
  });

  it('rejects unknown themes in settings updates', () => {
    expect(() => parseSettingsUpdate({ theme: 'unknown-theme' })).toThrow(
      'Unknown application theme',
    );
  });

  it('uses defaults for invalid stored fields', () => {
    expect(parseStoredSettings({ editorFontSize: 100 })).toMatchObject({
      editorFontSize: 17,
      lastProjectDirectoryPath: null,
      language: 'en',
      theme: 'github-light',
      version: 1,
    });
  });

  it('defaults incomplete files and rejects unknown language updates', () => {
    expect(parseStoredSettings({ language: 'zh-CN' })).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings({ language: 'fr' }).language).toBe('en');
    expect(() => parseSettingsUpdate({ language: 'fr' })).toThrow(
      'Unknown application language',
    );
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
    expect(() => parseSettingsUpdate({ version: 2 })).toThrow(
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
    ).toMatchObject({ lastProjectDirectoryPath: '/Novels/Example', version: 1 });
  });
});

const DEFAULT_SETTINGS = {
  closeWindowBehavior: 'quit',
  editorFontSize: 17,
  language: 'en',
  lastProjectDirectoryPath: null,
  theme: 'github-light',
  version: 1,
} as const;
