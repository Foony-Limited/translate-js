#!/usr/bin/env node
import { check, init, scan, translate } from './commands.js';

/**
 * foony-translate CLI: scans source for <T>/t()/dictionary entries, uploads
 * them to the Foony Translate API, and downloads per-locale JSON.
 *
 *   foony-translate init                 write a skeleton foony-translate.json
 *   foony-translate scan                 extract entries and report errors
 *   foony-translate translate [--dry-run]  upload, wait, download locale JSON
 *   foony-translate check                offline CI gate: everything translated?
 */
async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const cwd = process.cwd();
  switch (command) {
    case 'init':
      init(cwd);
      return 0;
    case 'scan':
      return scan(cwd);
    case 'translate':
      return translate(cwd, rest.includes('--dry-run'));
    case 'check':
      return check(cwd);
    default:
      console.error('Usage: foony-translate <init|scan|translate|check> [--dry-run]');
      return command === undefined || command === '--help' || command === '-h' ? 0 : 1;
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
