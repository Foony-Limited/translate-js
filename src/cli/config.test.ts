import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

/** Minimal valid config so loadConfig succeeds in a temp project. */
const CONFIG_JSON = JSON.stringify({ locales: ['fr'] });

describe('loadConfig .env loading', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'foony-translate-test-'));
    writeFileSync(join(projectDir, 'foony-translate.json'), CONFIG_JSON);
    delete process.env['FOONY_TRANSLATE_API_KEY'];
    delete process.env['FOONY_TRANSLATE_TEST_EXTRA'];
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    delete process.env['FOONY_TRANSLATE_API_KEY'];
    delete process.env['FOONY_TRANSLATE_TEST_EXTRA'];
  });

  it('loads variables from a .env next to the config', () => {
    writeFileSync(join(projectDir, '.env'), [
      '# comment',
      'FOONY_TRANSLATE_API_KEY=from-dotenv',
      "FOONY_TRANSLATE_TEST_EXTRA='quoted value'",
      '',
    ].join('\n'));

    loadConfig(projectDir);

    expect(process.env['FOONY_TRANSLATE_API_KEY']).toBe('from-dotenv');
    expect(process.env['FOONY_TRANSLATE_TEST_EXTRA']).toBe('quoted value');
  });

  it('accepts export-prefixed lines pasted from a shell', () => {
    writeFileSync(join(projectDir, '.env'), 'export FOONY_TRANSLATE_API_KEY=exported\n');

    loadConfig(projectDir);

    expect(process.env['FOONY_TRANSLATE_API_KEY']).toBe('exported');
  });

  it('lets real environment variables win over the file', () => {
    process.env['FOONY_TRANSLATE_API_KEY'] = 'from-shell';
    writeFileSync(join(projectDir, '.env'), 'FOONY_TRANSLATE_API_KEY=from-dotenv\n');

    loadConfig(projectDir);

    expect(process.env['FOONY_TRANSLATE_API_KEY']).toBe('from-shell');
  });

  it('works without a .env file', () => {
    expect(() => loadConfig(projectDir)).not.toThrow();
    expect(process.env['FOONY_TRANSLATE_API_KEY']).toBeUndefined();
  });
});
