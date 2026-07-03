import { fileURLToPath } from 'node:url';
import { isValidElement, type ReactElement } from 'react';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { canonicalStringify, hashSource } from '../hash.js';
import { serializeChildren } from '../react/serialize.js';
import { T } from '../react/T.js';
import { Fixtures } from './fixtures/parity.js';
import { scanSourceFile, type ScanResult } from './scan.js';

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/parity.tsx', import.meta.url));

/**
 * The core invariant of the whole system: the CLI's AST serialization and the
 * runtime's React-children serialization of the same JSX must be byte-identical
 * (same canonical form, same hash), or translations will never be found at
 * runtime. Every fixture <T> is serialized both ways and compared.
 */
describe('CLI ↔ runtime serialization parity', () => {
  const cliResult: ScanResult = { entries: [], errors: [] };
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  scanSourceFile(project.addSourceFileAtPath(FIXTURE_PATH), cliResult);

  const root = Fixtures() as ReactElement<{ children: ReactElement[] }>;
  const tElements = root.props.children.filter(
    (child): child is ReactElement<{ children?: React.ReactNode; id?: string; context?: string }> =>
      isValidElement(child) && child.type === T,
  );

  it('scans the fixture without errors', () => {
    expect(cliResult.errors).toEqual([]);
  });

  it('finds the same number of entries', () => {
    expect(cliResult.entries).toHaveLength(tElements.length);
  });

  tElements.forEach((element, index) => {
    it(`fixture <T> #${index + 1} serializes identically`, () => {
      const cliEntry = cliResult.entries[index]!;
      const { nodes } = serializeChildren(element.props.children);
      expect(canonicalStringify(nodes)).toBe(canonicalStringify(cliEntry.source));
      const runtimeHash = hashSource({ source: nodes, context: element.props.context, format: 'jsx' });
      expect(runtimeHash).toBe(cliEntry.contentHash);
    });
  });
});
