import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { extractDictionary } from './dictionary.js';
import type { ScanResult } from './scan.js';

const dir = mkdtempSync(join(tmpdir(), 'foony-translate-dict-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('extractDictionary', () => {
  it('extracts leaves with JSDoc and ancestor JSDoc as context', () => {
    const path = join(dir, 'dict.ts');
    writeFileSync(
      path,
      `import { defineDict } from '@foony/translate';
export default defineDict({
  /** Checkout flow. Keep terse. */
  checkout: {
    /** Button that completes the purchase. */
    pay: 'Pay now',
    total: 'Total: {{amount}}',
  },
});
`,
    );
    const result: ScanResult = { entries: [], errors: [] };
    extractDictionary(path, result);
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      id: 'checkout.pay',
      source: 'Pay now',
      format: 'text',
      context: 'Button that completes the purchase. | checkout: Checkout flow. Keep terse.',
    });
    expect(result.entries[1]).toMatchObject({ id: 'checkout.total', source: 'Total: {{amount}}' });
    expect(result.entries[1]!.context).toBe('checkout: Checkout flow. Keep terse.');
  });

  it('reads plain exported object literals (no defineDict marker needed)', () => {
    const path = join(dir, 'plain.ts');
    writeFileSync(
      path,
      `export const copy = {
  nav: {
    /** Link to the pricing page. */
    pricing: 'Pricing',
  },
} as const;
`,
    );
    const result: ScanResult = { entries: [], errors: [] };
    extractDictionary(path, result);
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ id: 'nav.pricing', source: 'Pricing', context: 'Link to the pricing page.' });
  });
});
