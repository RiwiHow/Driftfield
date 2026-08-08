import type { en } from './locales/en';

type DeepWidenStrings<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepWidenStrings<T[K]>;
};

export type LocaleShape = DeepWidenStrings<typeof en>;
