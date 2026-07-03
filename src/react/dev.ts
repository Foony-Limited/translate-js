import type { SourceEntry, TNode } from '../types.js';

const DEFAULT_API_URL = 'https://translate-api.foony.io';
const FLUSH_DELAY_MS = 500;
const MAX_BATCH = 20;
const MAX_ATTEMPTS = 3;

/**
 * Dev-mode on-demand translation store. `<T>` and `useT` report cache misses
 * here during render (safe: it only queues; re-renders happen asynchronously
 * when results land). Requests are debounced into batches against
 * `POST /v1/api/translate`, results swap in place via `useSyncExternalStore`.
 */
export type DevStore = {
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getVersion: () => number;
  readonly lookup: (locale: string, hash: string) => string | readonly TNode[] | undefined;
  /** Queues a missing entry for on-demand translation; deduped and attempt-capped. */
  readonly request: (locale: string, entry: SourceEntry) => void;
};

/** Creates the store backing a provider's `dev` config. One per provider. */
export function createDevStore(config: { readonly apiKey: string; readonly apiUrl?: string }): DevStore {
  const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, '');
  const cache = new Map<string, string | readonly TNode[]>();
  const attempts = new Map<string, number>();
  const inFlight = new Set<string>();
  const queue = new Map<string, { locale: string; entry: SourceEntry }>();
  const listeners = new Set<() => void>();
  let version = 0;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const notify = () => {
    version++;
    for (const listener of listeners) {
      listener();
    }
  };

  const itemKey = (item: { locale: string; entry: SourceEntry }) => `${item.locale}:${item.entry.contentHash}`;

  const flush = async () => {
    flushTimer = undefined;
    const pending = [...queue.values()];
    const byLocale = new Map<string, { locale: string; entry: SourceEntry }[]>();
    for (const item of pending) {
      const group = byLocale.get(item.locale) ?? [];
      group.push(item);
      byLocale.set(item.locale, group);
    }
    // One request per locale per flush; overflow beyond MAX_BATCH re-queues.
    for (const [locale, group] of byLocale) {
      const batch = group.slice(0, MAX_BATCH);
      for (const item of batch) {
        queue.delete(itemKey(item));
        inFlight.add(itemKey(item));
        attempts.set(itemKey(item), (attempts.get(itemKey(item)) ?? 0) + 1);
      }
      try {
        const response = await fetch(`${apiUrl}/v1/api/translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${btoa(config.apiKey)}`,
          },
          body: JSON.stringify({ locale, entries: batch.map((item) => item.entry) }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const results = (await response.json()) as Record<string, string | TNode[]>;
        for (const item of batch) {
          inFlight.delete(itemKey(item));
          const value = results[item.entry.contentHash];
          if (value !== undefined) {
            cache.set(itemKey(item), value);
          } else if ((attempts.get(itemKey(item)) ?? 0) < MAX_ATTEMPTS) {
            queue.set(itemKey(item), item);
            scheduleFlush(2000);
          }
        }
        notify();
      } catch (error) {
        for (const item of batch) {
          inFlight.delete(itemKey(item));
        }
        console.warn('[foony-translate] dev translation request failed:', error);
      }
    }
    if (queue.size > 0) {
      scheduleFlush(FLUSH_DELAY_MS);
    }
  };

  const scheduleFlush = (delayMs: number) => {
    if (!flushTimer) {
      flushTimer = setTimeout(() => void flush(), delayMs);
    }
  };

  return {
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getVersion: () => version,
    lookup: (locale, hash) => cache.get(`${locale}:${hash}`),
    request: (locale, entry) => {
      const cacheKey = `${locale}:${entry.contentHash}`;
      if (cache.has(cacheKey) || inFlight.has(cacheKey) || queue.has(cacheKey) || (attempts.get(cacheKey) ?? 0) >= MAX_ATTEMPTS) {
        return;
      }
      queue.set(cacheKey, { locale, entry });
      scheduleFlush(FLUSH_DELAY_MS);
    },
  };
}
