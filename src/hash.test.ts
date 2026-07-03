import { describe, expect, it } from 'vitest';
import { canonicalStringify, hashSource } from './hash.js';

describe('canonicalStringify', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('is insensitive to key insertion order', () => {
    expect(canonicalStringify({ x: [{ b: 1, a: 2 }] })).toBe(canonicalStringify({ x: [{ a: 2, b: 1 }] }));
  });

  it('preserves array order', () => {
    expect(canonicalStringify([2, 1])).toBe('[2,1]');
  });

  it('handles primitives and null', () => {
    expect(canonicalStringify('a')).toBe('"a"');
    expect(canonicalStringify(null)).toBe('null');
    expect(canonicalStringify(5)).toBe('5');
  });
});

describe('hashSource', () => {
  it('returns 16 hex chars', () => {
    expect(hashSource({ source: 'Save changes', format: 'text' })).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic', () => {
    const a = hashSource({ source: 'Save changes', format: 'text' });
    const b = hashSource({ source: 'Save changes', format: 'text' });
    expect(a).toBe(b);
  });

  it('changes when the context changes', () => {
    const plain = hashSource({ source: 'Save', format: 'text' });
    const contextual = hashSource({ source: 'Save', context: 'verb on a button', format: 'text' });
    expect(plain).not.toBe(contextual);
  });

  it('treats missing context as empty context', () => {
    expect(hashSource({ source: 'Save', format: 'text' })).toBe(hashSource({ source: 'Save', context: '', format: 'text' }));
  });

  it('separates text and jsx formats', () => {
    expect(hashSource({ source: 'Save', format: 'text' })).not.toBe(hashSource({ source: 'Save', format: 'jsx' }));
  });

  it('hashes TNode sources structurally, key-order independent', () => {
    const a = hashSource({ source: ['Hi ', { v: 'name', f: 'num' }], format: 'jsx' });
    const b = hashSource({ source: ['Hi ', { f: 'num', v: 'name' } as { v: string; f: 'num' }], format: 'jsx' });
    expect(a).toBe(b);
  });
});
