import { useCallback } from 'react';
import { hashSource } from '../hash.js';
import { interpolate } from '../interpolate.js';
import { useDevVersion, useTranslateContext } from './hooks.js';

/**
 * String translation for non-JSX copy (placeholders, aria-labels, titles).
 * Messages must be static string literals — the CLI extracts them at build
 * time and errors on dynamic values. Identical message + context anywhere in
 * the codebase is one shared translation (content-hash identity), so there is
 * no registry file to maintain.
 *
 * @example
 *   const t = useT();
 *   t('Save changes');
 *   t('Hello, {{name}}!', { name });
 *   t('Delete?', undefined, { context: 'Confirm dialog title' });
 */
export function useT(): (
  message: string,
  values?: Record<string, string | number>,
  opts?: { readonly context?: string; readonly id?: string },
) => string {
  const { locale, translations, dev } = useTranslateContext();
  useDevVersion(dev);

  return useCallback(
    (message, values, opts) => {
      const hash = hashSource({ source: message, context: opts?.context, format: 'text' });
      const entry = (opts?.id !== undefined ? translations?.[opts.id] : undefined) ?? translations?.[hash] ?? dev?.lookup(locale, hash);
      let text = typeof entry === 'string' ? entry : undefined;
      if (text === undefined && dev) {
        dev.request(locale, {
          contentHash: hash,
          source: message,
          format: 'text',
          ...(opts?.context !== undefined ? { context: opts.context } : {}),
          ...(opts?.id !== undefined ? { id: opts.id } : {}),
        });
      }
      text ??= message;
      return values ? interpolate(text, values) : text;
    },
    [locale, translations, dev],
  );
}
