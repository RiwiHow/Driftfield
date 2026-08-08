import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { AppLanguage } from '../../shared/i18n/languages';
import { APP_LANGUAGES } from '../../shared/i18n/languages';
import { I18N_RESOURCES } from '../../shared/i18n/resources';

export const rendererI18n = createInstance();

export const applyDocumentLanguage = (language: AppLanguage): void => {
  document.documentElement.lang = language;
  document.documentElement.dir = rendererI18n.dir(language);
};

export const initializeRendererI18n = async (
  language: AppLanguage,
): Promise<void> => {
  await rendererI18n.use(initReactI18next).init({
    defaultNS: 'common',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    lng: language,
    resources: I18N_RESOURCES,
    returnEmptyString: false,
    supportedLngs: [...APP_LANGUAGES],
  });
  applyDocumentLanguage(language);
};

export const changeRendererLanguage = async (
  language: AppLanguage,
): Promise<void> => {
  await rendererI18n.changeLanguage(language);
  applyDocumentLanguage(language);
};
