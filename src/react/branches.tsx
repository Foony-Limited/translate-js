import type { ReactNode } from 'react';
import { useLocale } from './provider.js';

type BranchProps = {
  /** The value that selects which branch renders; matched as `String(branch)`. */
  readonly branch: string | number | boolean;
  /** Fallback when no branch prop matches. */
  readonly children?: ReactNode;
} & { readonly [option: string]: ReactNode };

/**
 * Conditional content inside `<T>`: every possible variant is declared as a
 * prop, so the translation carries all branches and the runtime picks one.
 * This is why ternaries are not allowed inside `<T>` — the extractor could not
 * see both arms as one entry. Works standalone too.
 */
export function Branch(props: BranchProps) {
  const { branch, children, ...options } = props;
  const selected = selectBranchOption(options, branch);
  return <>{selected === undefined ? children : selected}</>;
}

type PluralProps = {
  /** The count that selects a plural form via CLDR rules for the locale. */
  readonly n: number;
  /** Fallback; used as the `other` form when no `other` prop is given. */
  readonly children?: ReactNode;
} & { readonly [category: string]: ReactNode };

/**
 * Count-based content inside `<T>`: declare CLDR plural categories (`zero`,
 * `one`, `two`, `few`, `many`, `other`) as props. Translations may carry
 * categories the English source lacks (e.g. `few`/`many` for Russian).
 * Works standalone too.
 */
export function Plural(props: PluralProps) {
  const { n, children, ...options } = props;
  const locale = useLocale();
  const selected = selectPluralOption(options, n, locale);
  return <>{selected === undefined ? children : selected}</>;
}

/** Picks a branch option by stringified value. Shared by the standalone component and translated rendering. */
export function selectBranchOption<V>(options: Readonly<Record<string, V>>, branch: unknown): V | undefined {
  return options[String(branch)];
}

/**
 * Picks a plural option: an explicit `zero` wins for n === 0 (useful in English,
 * where CLDR maps 0 to `other`), then the locale's CLDR category, then `other`.
 */
export function selectPluralOption<V>(options: Readonly<Record<string, V>>, n: number, locale: string): V | undefined {
  if (n === 0 && options['zero'] !== undefined) {
    return options['zero'];
  }
  return options[new Intl.PluralRules(locale).select(n)] ?? options['other'];
}
