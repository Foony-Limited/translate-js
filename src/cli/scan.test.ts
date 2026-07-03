import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { scanSourceFile, type ScanResult } from './scan.js';

function scanCode(code: string): ScanResult {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile('test.tsx', code);
  const result: ScanResult = { entries: [], errors: [] };
  scanSourceFile(sourceFile, result);
  return result;
}

const IMPORTS = `import { T, Var, Num, Branch, Plural, useT } from '@foony/translate/react';\n`;

describe('scanner diagnostics', () => {
  it('errors on a ternary inside <T> with a pointer to <Branch>', () => {
    const result = scanCode(`${IMPORTS}export const x = <T>{true ? 'a' : 'b'}</T>;`);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('<Branch> or <Plural>');
    expect(result.errors[0]!.line).toBe(2);
    expect(result.entries).toHaveLength(0);
  });

  it('errors on && inside <T>', () => {
    const result = scanCode(`${IMPORTS}declare const show: boolean;\nexport const x = <T>{show && <p>hi</p>}</T>;`);
    expect(result.errors[0]!.message).toContain('conditional content');
  });

  it('errors on a bare dynamic expression with a pointer to <Var>', () => {
    const result = scanCode(`${IMPORTS}declare const name: string;\nexport const x = <T>Hello {name}</T>;`);
    expect(result.errors[0]!.message).toContain('<Var>');
  });

  it('errors on .map inside <T>', () => {
    const result = scanCode(`${IMPORTS}export const x = <T>{['a'].map((s) => <p>{s}</p>)}</T>;`);
    expect(result.errors[0]!.message).toContain('function calls');
  });

  it('errors on nested <T>', () => {
    const result = scanCode(`${IMPORTS}export const x = <T>outer <T>inner</T></T>;`);
    expect(result.errors[0]!.message).toContain('nested');
  });

  it('errors on a non-literal id', () => {
    const result = scanCode(`${IMPORTS}declare const k: string;\nexport const x = <T id={k}>hi</T>;`);
    expect(result.errors[0]!.message).toContain('static string literal');
  });

  it('errors on duplicate variable names', () => {
    const result = scanCode(`${IMPORTS}export const x = <T><Var name="a">1</Var><Var name="a">2</Var></T>;`);
    expect(result.errors[0]!.message).toContain('duplicate variable name');
  });

  it('errors on dynamic t() messages', () => {
    const result = scanCode(`${IMPORTS}declare const msg: string;\nexport function C() { const t = useT(); return <p>{t(msg)}</p>; }`);
    expect(result.errors[0]!.message).toContain('static string literals');
  });

  it('extracts t() calls with context and id, following import aliases', () => {
    const code = `import { useT as useTranslate, T as Trans } from '@foony/translate/react';
export function C() {
  const t = useTranslate();
  return <p>{t('Hello, {{name}}!', { name: 'x' }, { context: 'greeting', id: 'hello' })}<Trans>Bye</Trans></p>;
}`;
    const result = scanCode(code);
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(2);
    // <T> entries are collected in the first pass, t() calls in the second.
    const [jsxEntry, textEntry] = result.entries;
    expect(textEntry).toMatchObject({ source: 'Hello, {{name}}!', format: 'text', context: 'greeting', id: 'hello' });
    expect(jsxEntry).toMatchObject({ source: ['Bye'], format: 'jsx' });
  });

  it('ignores files without SDK imports', () => {
    const result = scanCode(`export const T = (p: {children: string}) => <b>{p.children}</b>;\nexport const x = <T>not ours</T>;`);
    expect(result.entries).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
