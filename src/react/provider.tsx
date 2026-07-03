import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Translations } from '../types.js';
import { createDevStore, type DevStore } from './dev.js';

type TranslateContextValue = {
  readonly locale: string;
  readonly translations: Translations | undefined;
  readonly dev: DevStore | undefined;
};

const TranslateContext = createContext<TranslateContextValue>({ locale: 'en', translations: undefined, dev: undefined });

/**
 * Supplies locale + translations to `<T>`, `useT`, and `useDict`. The SDK holds
 * no locale state and loads nothing: the app decides the locale and passes the
 * parsed locale JSON, which makes this work identically in SPAs, SSR, and Astro
 * islands. No provider (or no translations) means everything renders the
 * English source.
 *
 * `dev` enables on-demand translation of missing entries against the Foony
 * Translate API — development only; gate it with `import.meta.env.DEV` so the
 * whole path is dead code in production builds.
 */
export function TranslateProvider(props: {
  readonly locale: string;
  readonly translations?: Translations;
  readonly dev?: { readonly apiKey: string; readonly apiUrl?: string };
  readonly children: ReactNode;
}) {
  const { locale, translations, dev, children } = props;
  const apiKey = dev?.apiKey;
  const apiUrl = dev?.apiUrl;
  const devStore = useMemo(() => (apiKey ? createDevStore({ apiKey, ...(apiUrl ? { apiUrl } : {}) }) : undefined), [apiKey, apiUrl]);
  const value = useMemo(() => ({ locale, translations, dev: devStore }), [locale, translations, devStore]);
  return <TranslateContext.Provider value={value}>{children}</TranslateContext.Provider>;
}

/** The full provider context; internal to the SDK. */
export function useTranslateContext(): TranslateContextValue {
  return useContext(TranslateContext);
}

/** The active locale, `'en'` when no provider is mounted. */
export function useLocale(): string {
  return useTranslateContext().locale;
}
