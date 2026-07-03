import { useMemo, type ReactNode } from 'react';
import { hashSource } from '../hash.js';
import { renderTNodes } from './render.js';
import { serializeChildren } from './serialize.js';
import { useDevVersion, useTranslateContext } from './hooks.js';

/**
 * Marks static JSX for translation. Children are serialized and hashed; the
 * hash (or the explicit `id`) looks up the translated structure in the
 * provider's locale JSON. On a miss the English source renders unchanged (and
 * dev mode requests an on-demand translation).
 *
 * Dynamic values must be wrapped in `<Var>`/`<Num>`/`<DateTime>`; conditional
 * content in `<Branch>`/`<Plural>`. The CLI enforces this with file:line
 * errors.
 */
export function T(props: {
  readonly children: ReactNode;
  /** Stable lookup alias. Never part of the hash, so adding one never re-translates. */
  readonly id?: string;
  /** Disambiguation for the translator, e.g. "verb on a button, not a noun". */
  readonly context?: string;
}): ReactNode {
  const { children, id, context } = props;
  const { locale, translations, dev } = useTranslateContext();
  useDevVersion(dev);

  const { nodes, registry } = serializeChildren(children);
  // The serialized form is stable across re-renders even when branch values or
  // variable values change (those live in the registry), so keying the hash on
  // the canonical JSON avoids rehashing when nothing translatable changed.
  const nodesJson = JSON.stringify(nodes);
  const hash = useMemo(() => hashSource({ source: nodes, context, format: 'jsx' }), [nodesJson, context]);

  const translated = (id !== undefined ? translations?.[id] : undefined) ?? translations?.[hash] ?? dev?.lookup(locale, hash);
  if (translated === undefined) {
    if (dev) {
      dev.request(locale, { contentHash: hash, source: nodes, format: 'jsx', ...(context !== undefined ? { context } : {}), ...(id !== undefined ? { id } : {}) });
    }
    return children;
  }
  return renderTNodes(translated, registry, locale);
}
