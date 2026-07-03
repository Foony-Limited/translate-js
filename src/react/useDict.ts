import { useMemo } from 'react';
import { createDict } from '../dict.js';
import type { DotPaths } from '../types.js';
import { useTranslateContext } from './hooks.js';

/**
 * Dictionary lookup bound to the provider's locale and translations. Entries
 * are keyed by dot-path in the locale JSON; the entry's translator context
 * comes from its JSDoc comment (extracted by the CLI), which is why dictionary
 * entries are not dev-mode translated at runtime — the runtime can't see JSDoc.
 *
 * @example
 *   const d = useDict(dict);
 *   d('nav.pricing');
 *   d('user.greeting', { name });
 */
export function useDict<D extends object>(
  dictionary: D,
): (path: DotPaths<D>, values?: Record<string, string | number>) => string {
  const { locale, translations } = useTranslateContext();
  return useMemo(() => createDict(dictionary, locale, translations), [dictionary, locale, translations]);
}
