import type { TNode } from './types.js';

/**
 * JSON.stringify with recursively sorted object keys, so the same logical value
 * always produces the same string regardless of property order. This is the
 * canonical form everything is hashed over; the CLI scanner and the React
 * runtime must produce byte-identical output for the same JSX (enforced by the
 * parity fixture tests).
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`);
  return `{${parts.join(',')}}`;
}

/**
 * Identity of a translatable entry: content + context + format, never the id.
 * That way identical strings dedupe automatically across a codebase, and adding
 * an `id` to an existing entry never re-translates it.
 *
 * FNV-1a 64-bit rather than SHA-256 because `<T>` hashes at render time and
 * `crypto.subtle` is async; a sync, dependency-free hash keeps `<T>` a plain
 * synchronous component. The hash is a cache key, not a security boundary.
 */
export function hashSource(entry: {
  readonly source: string | readonly TNode[];
  readonly context?: string | undefined;
  readonly format: 'text' | 'jsx';
}): string {
  const canonical = canonicalStringify({ s: entry.source, c: entry.context ?? '', d: entry.format });
  return fnv1a64hex(canonical);
}

/** FNV-1a 64-bit over the UTF-16 code units of `text`, as 16 hex chars. */
function fnv1a64hex(text: string): string {
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}
