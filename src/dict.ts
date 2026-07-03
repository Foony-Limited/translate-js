import { interpolate } from './interpolate.js';
import type { DotPaths, Translations } from './types.js';

/**
 * Marks a nested object of English source strings as a Foony Translate
 * dictionary. Identity at runtime; the CLI finds `defineDict` calls and
 * extracts each string leaf as an entry whose id is its dot-path and whose
 * translator context is the leaf's JSDoc comment plus its ancestors' JSDoc.
 */
export function defineDict<D extends object>(dictionary: D): D {
  return dictionary;
}

/**
 * Builds a lookup function over a dictionary for one locale. Framework-free so
 * it works anywhere — .astro frontmatter, server code, plain TS. React
 * components should prefer `useDict` from `@foony/translate/react`, which reads
 * locale and translations from the provider.
 *
 * Lookup order: the locale JSON entry keyed by the dot-path, else the English
 * source leaf. Interpolates `{{name}}` placeholders when `values` is given.
 */
export function createDict<D extends object>(
  dictionary: D,
  locale: string,
  translations?: Translations,
): (path: DotPaths<D>, values?: Record<string, string | number>) => string {
  return (path, values) => {
    const translated = translations?.[path];
    const text = typeof translated === 'string' ? translated : lookupSourceLeaf(dictionary, path);
    return values ? interpolate(text, values) : text;
  };
}

/** Walks the dictionary object by dot-path; returns the path itself on a miss so UI never crashes. */
function lookupSourceLeaf(dictionary: object, path: string): string {
  let node: unknown = dictionary;
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object') {
      break;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  if (typeof node === 'string') {
    return node;
  }
  console.warn(`[foony-translate] missing dictionary entry: ${path}`);
  return path;
}
