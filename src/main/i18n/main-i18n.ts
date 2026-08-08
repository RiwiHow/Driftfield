import { createInstance, type ParseKeys } from 'i18next';

import type { AppLanguage } from '../../shared/i18n/languages';
import { APP_LANGUAGES } from '../../shared/i18n/languages';
import { I18N_RESOURCES } from '../../shared/i18n/resources';

const mainI18n = createInstance();

export const initializeMainI18n = async (): Promise<void> => {
  await mainI18n.init({
    defaultNS: 'common',
    fallbackLng: 'en',
    initAsync: false,
    interpolation: { escapeValue: false },
    lng: 'en',
    resources: I18N_RESOURCES,
    returnEmptyString: false,
    supportedLngs: [...APP_LANGUAGES],
  });
};

export const translateMain = (
  language: AppLanguage,
  key: ParseKeys<'main'>,
  options?: Record<string, unknown>,
): string =>
  mainI18n.t(key, {
    ...options,
    lng: language,
    ns: 'main',
  } as never) as unknown as string;
