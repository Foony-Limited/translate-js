/**
 * Replaces `{{name}}` placeholders with values, leaving unknown placeholders
 * untouched. Same placeholder style and semantics as foony.com's shared i18n,
 * which lets the Foony Translate backend reuse its placeholder-preservation QA.
 */
export function interpolate(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = values[key];
    return value !== undefined ? String(value) : match;
  });
}
