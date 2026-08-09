import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isAppLanguage } from '../../shared/i18n/languages';

import {
  APP_THEMES,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type CloseWindowBehavior,
  type UpdateAppSettingsRequest,
} from '../../shared/contracts/settings';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTheme = (value: unknown): value is AppSettings['theme'] =>
  typeof value === 'string' && APP_THEMES.includes(value as AppSettings['theme']);

const LEGACY_DARK_THEMES = new Set(['one-dark', 'tokyo-night']);

const parseStoredTheme = (value: unknown): AppSettings['theme'] => {
  if (isTheme(value)) return value;
  if (typeof value === 'string' && LEGACY_DARK_THEMES.has(value)) {
    return 'github-dark';
  }
  return DEFAULT_APP_SETTINGS.theme;
};

const isEditorFontSize = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 14 &&
  value <= 24;

const isCloseWindowBehavior = (
  value: unknown,
): value is CloseWindowBehavior => value === 'quit' || value === 'minimize';

const parseLastProjectDirectoryPath = (value: unknown): string | null =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 4096 &&
  path.isAbsolute(value)
    ? value
    : null;

export const parseStoredSettings = (value: unknown): AppSettings => {
  if (!isRecord(value)) {
    return { ...DEFAULT_APP_SETTINGS };
  }

  return {
    closeWindowBehavior: isCloseWindowBehavior(value.closeWindowBehavior)
      ? value.closeWindowBehavior
      : DEFAULT_APP_SETTINGS.closeWindowBehavior,
    editorFontSize: isEditorFontSize(value.editorFontSize)
      ? value.editorFontSize
      : DEFAULT_APP_SETTINGS.editorFontSize,
    lastProjectDirectoryPath: parseLastProjectDirectoryPath(
      value.lastProjectDirectoryPath,
    ),
    language: isAppLanguage(value.language)
      ? value.language
      : DEFAULT_APP_SETTINGS.language,
    theme: parseStoredTheme(value.theme),
    version: 5,
  };
};

export const parseSettingsUpdate = (
  value: unknown,
): UpdateAppSettingsRequest => {
  if (!isRecord(value)) {
    throw new Error('Invalid settings update');
  }

  const allowedKeys = new Set([
    'closeWindowBehavior',
    'editorFontSize',
    'language',
    'theme',
  ]);

  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error('Unknown application setting');
  }

  const update: UpdateAppSettingsRequest = {};

  if ('closeWindowBehavior' in value) {
    if (!isCloseWindowBehavior(value.closeWindowBehavior)) {
      throw new Error('Unknown close window behavior');
    }

    update.closeWindowBehavior = value.closeWindowBehavior;
  }

  if ('editorFontSize' in value) {
    if (!isEditorFontSize(value.editorFontSize)) {
      throw new Error('Editor font size must be an integer from 14 to 24');
    }

    update.editorFontSize = value.editorFontSize;
  }

  if ('language' in value) {
    if (!isAppLanguage(value.language)) {
      throw new Error('Unknown application language');
    }
    update.language = value.language;
  }

  if ('theme' in value) {
    if (!isTheme(value.theme)) {
      throw new Error('Unknown application theme');
    }

    update.theme = value.theme;
  }

  return update;
};

export class SettingsService {
  private settings: AppSettings = { ...DEFAULT_APP_SETTINGS };
  private updateQueue: Promise<void> = Promise.resolve();

  private constructor(private readonly settingsPath: string) {}

  static async create(userDataPath: string): Promise<SettingsService> {
    const service = new SettingsService(
      path.join(userDataPath, 'settings.json'),
    );
    await service.load();
    return service;
  }

  get(): AppSettings {
    return { ...this.settings };
  }

  async update(update: UpdateAppSettingsRequest): Promise<AppSettings> {
    const operation = this.updateQueue.then(async () => {
      const nextSettings = { ...this.settings, ...update };
      await this.persist(nextSettings);
      this.settings = nextSettings;
      return this.get();
    });

    this.updateQueue = operation.then(
      () => undefined,
      () => undefined,
    );

    return operation;
  }

  async setLastProjectDirectoryPath(directoryPath: string): Promise<void> {
    if (parseLastProjectDirectoryPath(directoryPath) === null) {
      throw new Error('Invalid last project directory path');
    }
    await this.updateInternal({ lastProjectDirectoryPath: directoryPath });
  }

  private async updateInternal(update: Partial<AppSettings>): Promise<void> {
    const operation = this.updateQueue.then(async () => {
      const nextSettings = { ...this.settings, ...update };
      await this.persist(nextSettings);
      this.settings = nextSettings;
    });

    this.updateQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async load(): Promise<void> {
    try {
      const storedSettings = JSON.parse(
        await readFile(this.settingsPath, 'utf8'),
      ) as unknown;
      this.settings = parseStoredSettings(storedSettings);
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code;

      if (errorCode !== 'ENOENT' && !(error instanceof SyntaxError)) {
        throw error;
      }
    }
  }

  private async persist(settings: AppSettings): Promise<void> {
    await mkdir(path.dirname(this.settingsPath), { recursive: true });
    const temporaryPath = `${this.settingsPath}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(settings, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    await rename(temporaryPath, this.settingsPath);
  }
}
