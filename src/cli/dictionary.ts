import { Node, Project } from 'ts-morph';
import { hashSource } from '../hash.js';
import type { ScannedEntry, ScanResult } from './scan.js';

/**
 * Extracts dictionary entries from a TS file: every string leaf of every
 * exported object literal (or `defineDict(...)` call). Entry id = dot-path,
 * translator context = the leaf's JSDoc comment plus its ancestors' JSDoc —
 * the same convention as foony.com's generateLocalizations pipeline.
 */
export function extractDictionary(filePath: string, result: ScanResult): void {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const seenPaths = new Set<string>();

  for (const [, declarations] of sourceFile.getExportedDeclarations()) {
    for (const declaration of declarations) {
      // `export const x = {...}` exports a VariableDeclaration;
      // `export default defineDict({...})` exports the expression itself.
      const objectLiteral = Node.isVariableDeclaration(declaration)
        ? unwrapObjectLiteral(declaration.getInitializer())
        : unwrapObjectLiteral(declaration);
      if (!objectLiteral) {
        continue;
      }
      traverse(objectLiteral, [], [], filePath, seenPaths, result);
    }
  }
}

function unwrapObjectLiteral(expr: Node | undefined): Node | undefined {
  if (!expr) {
    return undefined;
  }
  if (Node.isObjectLiteralExpression(expr)) {
    return expr;
  }
  if (Node.isAsExpression(expr) || Node.isSatisfiesExpression(expr)) {
    return unwrapObjectLiteral(expr.getExpression());
  }
  if (Node.isCallExpression(expr)) {
    // defineDict({...}) — the identity marker from @foony/translate.
    const callee = expr.getExpression();
    if (Node.isIdentifier(callee) && callee.getText() === 'defineDict') {
      return unwrapObjectLiteral(expr.getArguments()[0]);
    }
  }
  return undefined;
}

function traverse(
  node: Node,
  currentPath: string[],
  ancestorJsdocs: { readonly path: string; readonly jsdoc: string }[],
  file: string,
  seenPaths: Set<string>,
  result: ScanResult,
): void {
  if (!Node.isObjectLiteralExpression(node)) {
    return;
  }
  for (const prop of node.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) {
      continue;
    }
    const nameNode = prop.getNameNode();
    const name = Node.isStringLiteral(nameNode) ? nameNode.getLiteralValue() : prop.getName();
    const fullPath = [...currentPath, name];
    const dotPath = fullPath.join('.');
    const jsdoc = getJsdocComment(prop);
    const initializer = prop.getInitializer();

    if (initializer && (Node.isStringLiteral(initializer) || Node.isNoSubstitutionTemplateLiteral(initializer))) {
      if (seenPaths.has(dotPath)) {
        result.errors.push({ file, line: prop.getStartLineNumber(), message: `duplicate dictionary path "${dotPath}" (multiple exports collide)` });
        continue;
      }
      seenPaths.add(dotPath);
      const context = [jsdoc, ...ancestorJsdocs.map((ancestor) => `${ancestor.path}: ${ancestor.jsdoc}`)]
        .filter(Boolean)
        .join(' | ');
      const source = initializer.getLiteralValue();
      const entry: ScannedEntry = {
        contentHash: hashSource({ source, context: context || undefined, format: 'text' }),
        source,
        format: 'text',
        ...(context ? { context } : {}),
        id: dotPath,
        file,
        line: prop.getStartLineNumber(),
      };
      result.entries.push(entry);
    } else if (initializer && Node.isObjectLiteralExpression(initializer)) {
      const nextAncestors = jsdoc ? [...ancestorJsdocs, { path: dotPath, jsdoc }] : ancestorJsdocs;
      traverse(initializer, fullPath, nextAncestors, file, seenPaths, result);
    }
  }
}

/**
 * The JSDoc block comment immediately preceding a property, if any. Reads the
 * source text directly because object-literal properties don't carry JSDoc
 * nodes in the TS AST (same approach as generateLocalizations.ts).
 */
function getJsdocComment(node: Node): string {
  const sourceText = node.getSourceFile().getFullText();
  const nodeStart = node.getStart();
  const searchStart = Math.max(0, nodeStart - 500);
  const beforeText = sourceText.substring(searchStart, nodeStart);

  const regex = /\/\*\*([^*]|\*(?!\/))*\*\//gs;
  let closest: { readonly text: string; readonly endPos: number } | undefined;
  let match;
  while ((match = regex.exec(beforeText)) !== null) {
    closest = { text: match[0], endPos: searchStart + match.index + match[0].length };
  }
  if (!closest || !/^\s*$/.test(sourceText.substring(closest.endPos, nodeStart))) {
    return '';
  }
  return closest.text
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .replace(/^\s*\*/gm, '')
    .trim();
}
