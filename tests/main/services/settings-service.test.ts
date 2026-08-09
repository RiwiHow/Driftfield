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

describe('settings parsing and migration', () => {
  it('migrates a legacy dark theme to GitHub Dark', () => {
    expect(
      parseStoredSettings({
        closeWindowBehavior: 'minimize',
        editorFontSize: 20,
        theme: 'tokyo-night',
      }),
    ).toEqual({
      closeWindowBehavior: 'minimize',
      editorFontSize: 20,
      lastProjectDirectoryPath: null,
      language: 'en',
      theme: 'github-dark',
      version: 5,
    });

    expect(parseStoredSettings({ theme: 'one-dark' }).theme).toBe(
      'github-dark',
    );
  });

  it('rejects removed themes in settings updates', () => {
    expect(() => parseSettingsUpdate({ theme: 'one-dark' })).toThrow(
      'Unknown application theme',
    );
  });

  it('uses defaults for invalid stored fields', () => {
    expect(parseStoredSettings({ editorFontSize: 100 })).toMatchObject({
      editorFontSize: 17,
      lastProjectDirectoryPath: null,
      language: 'en',
      theme: 'github-light',
      version: 5,
    });
  });

  it('preserves a supported stored language and rejects unknown languages', () => {
    expect(parseStoredSettings({ language: 'zh-CN' }).language).toBe('zh-CN');
    expect(parseStoredSettings({ language: 'fr' }).language).toBe('en');
    expect(() => parseSettingsUpdate({ language: 'fr' })).toThrow(
      'Unknown application language',
    );
  });

  it('removes legacy global Agent settings from the current schema', () => {
    expect(
      parseStoredSettings({
        agent: {
          defaultModel: { providerId: 'anthropic', modelId: 'claude' },
          thinkingLevel: 'high',
        },
      }),
    ).not.toHaveProperty('agent');
  });

  it('migrates and validates the last project directory path', () => {
    expect(
      parseStoredSettings({ lastProjectDirectoryPath: '/Novels/Example' })
        .lastProjectDirectoryPath,
    ).toBe('/Novels/Example');
    expect(
      parseStoredSettings({ lastProjectDirectoryPath: '' })
        .lastProjectDirectoryPath,
    ).toBeNull();
    expect(
      parseStoredSettings({ lastProjectDirectoryPath: 'relative/project' })
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
    ).toMatchObject({ lastProjectDirectoryPath: '/Novels/Example', version: 5 });
  });
});
