import { describe, expect, it } from 'vitest';
import { createDict, defineDict } from './dict.js';

const dict = defineDict({
  nav: {
    /** Top-navigation link to the pricing page. */
    pricing: 'Pricing',
  },
  user: {
    greeting: 'Hello, {{name}}!',
  },
});

describe('createDict', () => {
  it('falls back to the English source without translations', () => {
    const d = createDict(dict, 'en');
    expect(d('nav.pricing')).toBe('Pricing');
  });

  it('prefers the locale JSON entry keyed by dot-path', () => {
    const d = createDict(dict, 'fr', { 'nav.pricing': 'Tarifs' });
    expect(d('nav.pricing')).toBe('Tarifs');
  });

  it('interpolates values in both translated and source text', () => {
    const en = createDict(dict, 'en');
    const fr = createDict(dict, 'fr', { 'user.greeting': 'Bonjour, {{name}} !' });
    expect(en('user.greeting', { name: 'Ada' })).toBe('Hello, Ada!');
    expect(fr('user.greeting', { name: 'Ada' })).toBe('Bonjour, Ada !');
  });

  it('returns the path on a missing entry instead of crashing', () => {
    const d = createDict(dict, 'en');
    // @ts-expect-error deliberately missing path
    expect(d('nav.missing')).toBe('nav.missing');
  });
});
