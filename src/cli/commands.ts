import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TNode } from '../types.js';
import { createApiClient } from './api.js';
import { CONFIG_FILE_NAME, loadConfig, requireApiKey, type CliConfig } from './config.js';
import { extractDictionary } from './dictionary.js';
import { scanPaths, type ScannedEntry, type ScanResult } from './scan.js';

const POLL_INTERVAL_MS = 2000;

/** Writes a skeleton foony-translate.json and the output directory. */
export function init(cwd: string): void {
  const configPath = join(cwd, CONFIG_FILE_NAME);
  if (existsSync(configPath)) {
    throw new Error(`${configPath} already exists`);
  }
  const skeleton = {
    locales: ['fr', 'de', 'es'],
    defaultLocale: 'en',
    src: ['src'],
    dictionaries: [],
    out: 'src/translations',
    apiUrl: 'https://translate-api.foony.io',
  };
  writeFileSync(configPath, `${JSON.stringify(skeleton, null, 2)}\n`);
  mkdirSync(join(cwd, skeleton.out), { recursive: true });
  console.log(`Wrote ${configPath}. Put FOONY_TRANSLATE_API_KEY in a .env next to it (or export it) and run "foony-translate translate".`);
}

/** Scans the project and prints counts; exits non-zero on any diagnostic. */
export function scan(cwd: string): number {
  const { config, rootDir } = loadConfig(cwd);
  const result = runScan(config, rootDir);
  reportErrors(result);
  const jsxCount = result.entries.filter((entry) => entry.format === 'jsx').length;
  console.log(`${result.entries.length} entries (${jsxCount} <T>, ${result.entries.length - jsxCount} strings), ${result.errors.length} error(s)`);
  return result.errors.length > 0 ? 1 : 0;
}

/** Scan → upload → poll → download → write per-locale JSON. */
export async function translate(cwd: string, dryRun: boolean): Promise<number> {
  const { config, rootDir } = loadConfig(cwd);
  const result = runScan(config, rootDir);
  reportErrors(result);
  if (result.errors.length > 0) {
    return 1;
  }
  const entries = dedupeByHash(result.entries);
  console.log(`${entries.length} unique entries, ${config.locales.length} target locale(s)`);
  if (dryRun) {
    for (const entry of entries) {
      const label = entry.id ?? entry.contentHash;
      console.log(`  ${label}  ${previewSource(entry)}`);
    }
    return 0;
  }

  const api = createApiClient(config.apiUrl, requireApiKey());
  const upload = await api.upload(entries, config.locales);
  console.log(`Uploaded: ${upload.created} new, ${upload.existing} already translated or queued`);

  for (;;) {
    const status = await api.status(config.locales);
    const pending = Object.values(status).reduce((sum, locale) => sum + locale.pending, 0);
    const failed = Object.values(status).reduce((sum, locale) => sum + locale.failed, 0);
    if (pending === 0) {
      if (failed > 0) {
        console.error(`${failed} translation(s) failed — inspect and retry them in the dashboard`);
      }
      break;
    }
    console.log(`Waiting for ${pending} translation(s)...`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const outDir = resolve(rootDir, config.out);
  mkdirSync(outDir, { recursive: true });
  for (const locale of config.locales) {
    const byHash = await api.download(locale);
    const map: Record<string, string | TNode[]> = {};
    for (const entry of entries) {
      const value = byHash[entry.contentHash];
      if (value !== undefined) {
        map[entry.id ?? entry.contentHash] = value;
      }
    }
    const outPath = join(outDir, `${locale}.json`);
    writeFileSync(outPath, `${JSON.stringify(sortKeys(map), null, 2)}\n`);
    console.log(`Wrote ${outPath} (${Object.keys(map).length}/${entries.length} entries)`);
  }
  return 0;
}

/**
 * Offline CI gate: verifies every scanned entry has a translation in every
 * locale JSON. No network, no API key.
 */
export function check(cwd: string): number {
  const { config, rootDir } = loadConfig(cwd);
  const result = runScan(config, rootDir);
  reportErrors(result);
  let missingCount = 0;
  const entries = dedupeByHash(result.entries);
  for (const locale of config.locales) {
    const localePath = resolve(rootDir, config.out, `${locale}.json`);
    const translations = existsSync(localePath) ? (JSON.parse(readFileSync(localePath, 'utf8')) as Record<string, unknown>) : {};
    for (const entry of entries) {
      if (translations[entry.id ?? entry.contentHash] === undefined) {
        console.error(`${entry.file}:${entry.line}: missing ${locale} translation for ${entry.id ?? entry.contentHash} (${previewSource(entry)})`);
        missingCount++;
      }
    }
  }
  if (missingCount > 0 || result.errors.length > 0) {
    console.error(`${missingCount} missing translation(s), ${result.errors.length} scan error(s) — run "foony-translate translate" and commit the JSON`);
    return 1;
  }
  console.log(`All ${entries.length} entries translated in ${config.locales.length} locale(s)`);
  return 0;
}

function runScan(config: CliConfig, rootDir: string): ScanResult {
  const result = scanPaths(config.src.map((src) => resolve(rootDir, src)));
  for (const dictionary of config.dictionaries) {
    extractDictionary(resolve(rootDir, dictionary), result);
  }
  return result;
}

function reportErrors(result: ScanResult): void {
  for (const scanError of result.errors) {
    console.error(`${scanError.file}:${scanError.line}: ${scanError.message}`);
  }
}

/** Identical hashes anywhere in the codebase are one entry; the first occurrence wins for file/line/id. */
function dedupeByHash(entries: readonly ScannedEntry[]): ScannedEntry[] {
  const byHash = new Map<string, ScannedEntry>();
  for (const entry of entries) {
    const existing = byHash.get(entry.contentHash);
    if (!existing) {
      byHash.set(entry.contentHash, entry);
    } else if (existing.id === undefined && entry.id !== undefined) {
      byHash.set(entry.contentHash, entry);
    }
  }
  return [...byHash.values()];
}

function previewSource(entry: ScannedEntry): string {
  const text = typeof entry.source === 'string' ? entry.source : JSON.stringify(entry.source);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function sortKeys<V>(map: Record<string, V>): Record<string, V> {
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : 1)));
}
