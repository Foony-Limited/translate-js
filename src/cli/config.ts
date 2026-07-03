import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const CONFIG_FILE_NAME = 'foony-translate.json';

/** Parsed foony-translate.json. Paths are relative to the config file's directory. */
export type CliConfig = {
  /** Target locales, e.g. ["fr", "de"]. */
  readonly locales: readonly string[];
  /** Source locale; only 'en' is supported in v1. */
  readonly defaultLocale: string;
  /** Directories scanned for <T> and t() usage (.ts/.tsx). */
  readonly src: readonly string[];
  /** Dictionary files (exported object literals / defineDict calls). */
  readonly dictionaries: readonly string[];
  /** Directory the per-locale JSON files are written to. */
  readonly out: string;
  readonly apiUrl: string;
};

/** Loads and validates foony-translate.json from `cwd` (or a parent). */
export function loadConfig(cwd: string): { readonly config: CliConfig; readonly rootDir: string } {
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, CONFIG_FILE_NAME);
    if (existsSync(candidate)) {
      loadDotEnv(dir);
      return { config: parseConfig(candidate), rootDir: dir };
    }
    const parent = resolve(dir, '..');
    if (parent === dir) {
      throw new Error(`${CONFIG_FILE_NAME} not found in ${cwd} or any parent directory; run "foony-translate init" first`);
    }
    dir = parent;
  }
}

/**
 * Loads KEY=VALUE pairs from a .env file next to the config into process.env,
 * so the API key can live with the project instead of the shell profile.
 * Real environment variables win over file values. Lines may carry an
 * `export ` prefix so a copied shell line still works, and values may be
 * single or double quoted.
 */
function loadDotEnv(rootDir: string): void {
  const envPath = join(rootDir, '.env');
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    let trimmed = line.trim();
    if (trimmed.startsWith('export ')) {
      trimmed = trimmed.slice('export '.length).trim();
    }
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const name = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    const isQuoted = value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0];
    if (isQuoted) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined) {
      process.env[name] = value;
    }
  }
}

function parseConfig(path: string): CliConfig {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<CliConfig>;
  const locales = raw.locales;
  if (!Array.isArray(locales) || locales.length === 0 || !locales.every((locale) => typeof locale === 'string')) {
    throw new Error(`${path}: "locales" must be a non-empty array of locale codes`);
  }
  const defaultLocale = raw.defaultLocale ?? 'en';
  if (defaultLocale !== 'en') {
    throw new Error(`${path}: only "en" is supported as defaultLocale for now`);
  }
  return {
    locales,
    defaultLocale,
    src: raw.src ?? ['src'],
    dictionaries: raw.dictionaries ?? [],
    out: raw.out ?? 'translations',
    apiUrl: (raw.apiUrl ?? 'https://translate-api.foony.io').replace(/\/$/, ''),
  };
}

/** The API key comes from the environment or the project .env, never the config file. */
export function requireApiKey(): string {
  const key = process.env['FOONY_TRANSLATE_API_KEY'];
  if (!key) {
    throw new Error('FOONY_TRANSLATE_API_KEY is not set. Put it in a .env next to foony-translate.json or export it (create a key in the Foony Translate dashboard)');
  }
  return key;
}
