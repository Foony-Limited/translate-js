import type { SourceEntry, TNode } from '../types.js';

export type UploadResponse = {
  readonly created: number;
  readonly existing: number;
  readonly quota?: { readonly usedWords: number; readonly includedWords: number };
};

export type StatusResponse = Readonly<Record<string, { readonly pending: number; readonly failed: number; readonly completed: number }>>;

/** Thin client for the Foony Translate CLI endpoints (Basic key auth). */
export function createApiClient(apiUrl: string, apiKey: string) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(apiKey).toString('base64')}`,
  };

  async function request<R>(method: string, path: string, body?: unknown): Promise<R> {
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${method} ${path} failed: HTTP ${response.status}${text ? ` — ${text.slice(0, 300)}` : ''}`);
    }
    return (await response.json()) as R;
  }

  return {
    upload: (entries: readonly SourceEntry[], targetLocales: readonly string[]) =>
      request<UploadResponse>('POST', '/v1/api/translations', { targetLocales, entries }),
    status: (locales: readonly string[]) =>
      request<StatusResponse>('GET', `/v1/api/status?locales=${encodeURIComponent(locales.join(','))}`),
    download: (locale: string) =>
      request<Record<string, string | TNode[]>>('GET', `/v1/api/translations/${encodeURIComponent(locale)}`),
  };
}
