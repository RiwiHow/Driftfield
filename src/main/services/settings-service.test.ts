import { describe, expect, it } from 'vitest';

import {
  parseSettingsUpdate,
  parseStoredSettings,
} from './settings-service';

describe('settings parsing and migration', () => {
  it('migrates unversioned settings to version 1', () => {
    expect(
      parseStoredSettings({
        closeWindowBehavior: 'minimize',
        editorFontSize: 20,
        theme: 'tokyo-night',
      }),
    ).toEqual({
      closeWindowBehavior: 'minimize',
      editorFontSize: 20,
      theme: 'tokyo-night',
      version: 1,
    });
  });

  it('uses defaults for invalid stored fields', () => {
    expect(parseStoredSettings({ editorFontSize: 100 })).toMatchObject({
      editorFontSize: 17,
      theme: 'github-light',
      version: 1,
    });
  });

  it('rejects unknown update fields, including the schema version', () => {
    expect(() => parseSettingsUpdate({ version: 2 })).toThrow(
      'Unknown application setting',
    );
  });
});
