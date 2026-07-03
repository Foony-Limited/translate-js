import { Node, Project, SyntaxKind, ts, type JsxAttribute, type JsxChild, type SourceFile } from 'ts-morph';
import { hashSource } from '../hash.js';
import type { SourceEntry, TNode } from '../types.js';

export type ScanDiagnostic = { readonly file: string; readonly line: number; readonly message: string };
export type ScannedEntry = SourceEntry & { readonly file: string; readonly line: number };
export type ScanResult = { readonly entries: ScannedEntry[]; readonly errors: ScanDiagnostic[] };

const PACKAGE_NAMES = new Set(['@foony/translate', '@foony/translate/react']);
type SdkExport = 'T' | 'Var' | 'Num' | 'DateTime' | 'Branch' | 'Plural' | 'useT';
const SDK_EXPORTS = new Set<SdkExport>(['T', 'Var', 'Num', 'DateTime', 'Branch', 'Plural', 'useT']);

/** Props React never delivers to components; the runtime serializer can't see them. */
const NON_PROP_ATTRS = new Set(['key', 'ref']);

/**
 * Scans .ts/.tsx sources for `<T>` JSX and `useT()` string calls and serializes
 * them exactly like the React runtime does — the content hashes must match at
 * runtime, which the parity fixture tests enforce.
 */
export function scanPaths(paths: readonly string[]): ScanResult {
  const project = new Project({
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX },
    skipAddingFilesFromTsConfig: true,
  });
  for (const path of paths) {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      project.addSourceFilesAtPaths(path);
    } else {
      project.addSourceFilesAtPaths([`${path.replace(/\/$/, '')}/**/*.tsx`, `${path.replace(/\/$/, '')}/**/*.ts`]);
    }
  }
  const result: ScanResult = { entries: [], errors: [] };
  for (const sourceFile of project.getSourceFiles()) {
    scanSourceFile(sourceFile, result);
  }
  return result;
}

/** Scans a single parsed source file; exported for the parity tests. */
export function scanSourceFile(sourceFile: SourceFile, result: ScanResult): void {
  const locals = resolveSdkImports(sourceFile);
  if (locals.size === 0) {
    return;
  }
  const ctx: ScanContext = { file: String(sourceFile.getFilePath()), locals, result };

  const tBindings = new Set<string>();
  sourceFile.forEachDescendant((node, traversal) => {
    if ((Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node)) && sdkNameOf(node, locals) === 'T') {
      extractTElement(node, ctx);
      traversal.skip();
      return;
    }
    if (Node.isCallExpression(node)) {
      const callee = node.getExpression();
      if (Node.isIdentifier(callee) && locals.get(callee.getText()) === 'useT') {
        const declaration = node.getParent();
        if (Node.isVariableDeclaration(declaration) && Node.isIdentifier(declaration.getNameNode())) {
          tBindings.add(declaration.getNameNode().getText());
        } else {
          error(ctx, node, 'assign useT() to a const so the CLI can find its call sites, e.g. const t = useT()');
        }
      }
    }
  });

  if (tBindings.size > 0) {
    extractTFunctionCalls(sourceFile, ctx, tBindings);
  }
}

type ScanContext = {
  readonly file: string;
  readonly locals: Map<string, SdkExport>;
  readonly result: ScanResult;
};

/** Per-<T> numbering state; must advance in the same traversal order as the runtime registry. */
type Counters = { v: number; n: number; d: number; e: number; b: number };

function error(ctx: ScanContext, node: Node, message: string): void {
  ctx.result.errors.push({ file: ctx.file, line: node.getStartLineNumber(), message });
}

/** Maps local import names to SDK exports, following aliases. */
function resolveSdkImports(sourceFile: SourceFile): Map<string, SdkExport> {
  const locals = new Map<string, SdkExport>();
  for (const importDecl of sourceFile.getImportDeclarations()) {
    if (!PACKAGE_NAMES.has(importDecl.getModuleSpecifierValue())) {
      continue;
    }
    for (const named of importDecl.getNamedImports()) {
      const exported = named.getName();
      if (SDK_EXPORTS.has(exported as SdkExport)) {
        locals.set(named.getAliasNode()?.getText() ?? exported, exported as SdkExport);
      }
    }
  }
  return locals;
}

function sdkNameOf(element: Node, locals: Map<string, SdkExport>): SdkExport | undefined {
  const tagName = Node.isJsxElement(element)
    ? element.getOpeningElement().getTagNameNode().getText()
    : Node.isJsxSelfClosingElement(element)
      ? element.getTagNameNode().getText()
      : undefined;
  return tagName !== undefined ? locals.get(tagName) : undefined;
}

/** Attributes in source order; undefined (with an error) on spread attributes. */
function readAttributes(element: Node, ctx: ScanContext): Map<string, JsxAttribute> | undefined {
  const opening = Node.isJsxElement(element) ? element.getOpeningElement() : element;
  if (!Node.isJsxOpeningElement(opening) && !Node.isJsxSelfClosingElement(opening)) {
    return new Map();
  }
  const attrs = new Map<string, JsxAttribute>();
  for (const attr of opening.getAttributes()) {
    if (Node.isJsxSpreadAttribute(attr)) {
      error(ctx, attr, 'spread props are not allowed on translation components — the CLI cannot see their contents');
      return undefined;
    }
    const name = attr.getNameNode().getText();
    if (!NON_PROP_ATTRS.has(name)) {
      attrs.set(name, attr);
    }
  }
  return attrs;
}

/** The value of `name="x"` or `name={'x'}`; undefined when absent or not a static string. */
function staticStringAttrValue(attr: JsxAttribute): string | undefined {
  const initializer = attr.getInitializer();
  if (initializer && Node.isStringLiteral(initializer)) {
    return initializer.getLiteralValue();
  }
  if (initializer && Node.isJsxExpression(initializer)) {
    const expr = initializer.getExpression();
    if (expr && (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr))) {
      return expr.getLiteralValue();
    }
  }
  return undefined;
}

// --- <T> extraction ---------------------------------------------------------

function extractTElement(element: Node, ctx: ScanContext): void {
  const attrs = readAttributes(element, ctx);
  if (!attrs) {
    return;
  }
  let id: string | undefined;
  let context: string | undefined;
  for (const [name, attr] of attrs) {
    if (name !== 'id' && name !== 'context') {
      error(ctx, attr, `<T> does not accept a "${name}" prop`);
      return;
    }
    const value = staticStringAttrValue(attr);
    if (value === undefined) {
      error(ctx, attr, `<T> ${name} must be a static string literal`);
      return;
    }
    if (name === 'id') {
      id = value;
    } else {
      context = value;
    }
  }

  const counters: Counters = { v: 0, n: 0, d: 0, e: 0, b: 0 };
  const seenVariableNames = new Set<string>();
  const errorsBefore = ctx.result.errors.length;
  const nodes = Node.isJsxElement(element)
    ? serializeJsxChildren(element.getJsxChildren(), ctx, counters, seenVariableNames)
    : [];
  if (ctx.result.errors.length > errorsBefore) {
    return;
  }
  if (nodes.length === 0) {
    error(ctx, element, '<T> has no translatable content');
    return;
  }

  ctx.result.entries.push({
    contentHash: hashSource({ source: nodes, context, format: 'jsx' }),
    source: nodes,
    format: 'jsx',
    ...(context !== undefined ? { context } : {}),
    ...(id !== undefined ? { id } : {}),
    file: ctx.file,
    line: element.getStartLineNumber(),
  });
}

function serializeJsxChildren(
  children: readonly JsxChild[],
  ctx: ScanContext,
  counters: Counters,
  seenVariableNames: Set<string>,
): TNode[] {
  const nodes: TNode[] = [];
  const pushText = (text: string) => {
    if (!text) {
      return;
    }
    appendNode(nodes, text);
  };

  for (const child of children) {
    if (Node.isJsxText(child)) {
      // getLiteralText() is the raw token text; getText() would strip the
      // leading whitespace as trivia and break parity with the runtime.
      pushText(normalizeJsxText(child.getLiteralText()));
      continue;
    }
    if (Node.isJsxExpression(child)) {
      const expr = child.getExpression();
      if (!expr) {
        continue; // {/* comment */}
      }
      serializeExpression(expr, ctx, counters, seenVariableNames, nodes, pushText);
      continue;
    }
    if (Node.isJsxElement(child) || Node.isJsxSelfClosingElement(child) || Node.isJsxFragment(child)) {
      serializeJsxElement(child, ctx, counters, seenVariableNames, nodes);
    }
  }
  return nodes;
}

function serializeExpression(
  expr: Node,
  ctx: ScanContext,
  counters: Counters,
  seenVariableNames: Set<string>,
  nodes: TNode[],
  pushText: (text: string) => void,
): void {
  if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) {
    pushText(expr.getLiteralValue());
    return;
  }
  if (Node.isNumericLiteral(expr)) {
    pushText(String(expr.getLiteralValue()));
    return;
  }
  if (Node.isJsxElement(expr) || Node.isJsxSelfClosingElement(expr) || Node.isJsxFragment(expr)) {
    serializeJsxElement(expr, ctx, counters, seenVariableNames, nodes);
    return;
  }
  if (Node.isParenthesizedExpression(expr)) {
    serializeExpression(expr.getExpression(), ctx, counters, seenVariableNames, nodes, pushText);
    return;
  }
  if (Node.isConditionalExpression(expr)) {
    error(ctx, expr, 'conditional content inside <T> — use <Branch> or <Plural>, or move the condition outside <T>');
    return;
  }
  if (Node.isBinaryExpression(expr)) {
    const op = expr.getOperatorToken().getKind();
    if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken || op === SyntaxKind.QuestionQuestionToken) {
      error(ctx, expr, 'conditional content inside <T> — use <Branch> or <Plural>, or move the condition outside <T>');
      return;
    }
  }
  if (Node.isCallExpression(expr)) {
    error(ctx, expr, 'function calls are not allowed inside <T> — render lists outside <T> and wrap each item');
    return;
  }
  error(ctx, expr, 'dynamic value inside <T> — wrap it in <Var>, <Num>, or <DateTime>');
}

function serializeJsxElement(
  element: Node,
  ctx: ScanContext,
  counters: Counters,
  seenVariableNames: Set<string>,
  nodes: TNode[],
): void {
  // Fragments are transparent, matching the runtime serializer.
  if (Node.isJsxFragment(element)) {
    for (const node of serializeJsxChildren(element.getJsxChildren(), ctx, counters, seenVariableNames)) {
      appendNode(nodes, node);
    }
    return;
  }

  const sdkName = sdkNameOf(element, ctx.locals);
  if (sdkName === 'T') {
    error(ctx, element, '<T> cannot be nested inside another <T>');
    return;
  }

  if (sdkName === 'Var' || sdkName === 'Num' || sdkName === 'DateTime') {
    const attrs = readAttributes(element, ctx);
    if (!attrs) {
      return;
    }
    const prefix = sdkName === 'Var' ? 'v' : sdkName === 'Num' ? 'n' : 'd';
    counters[prefix]++;
    const nameAttr = attrs.get('name');
    let name = `_${prefix}${counters[prefix]}`;
    if (nameAttr) {
      const value = staticStringAttrValue(nameAttr);
      if (value === undefined) {
        error(ctx, nameAttr, `<${sdkName}> name must be a static string literal`);
        return;
      }
      name = value;
    }
    if (seenVariableNames.has(name)) {
      error(ctx, element, `duplicate variable name "${name}" inside one <T>`);
      return;
    }
    seenVariableNames.add(name);
    nodes.push(sdkName === 'Var' ? { v: name } : { v: name, f: sdkName === 'Num' ? 'num' : 'datetime' });
    return;
  }

  if (sdkName === 'Branch' || sdkName === 'Plural') {
    const isPlural = sdkName === 'Plural';
    const attrs = readAttributes(element, ctx);
    if (!attrs) {
      return;
    }
    const branchIndex = counters.b;
    counters.b++;
    const options: Record<string, TNode[]> = {};
    for (const [attrName, attr] of attrs) {
      if (attrName === 'name' || attrName === (isPlural ? 'n' : 'branch')) {
        continue;
      }
      const optionNodes = serializeAttributeValue(attr, ctx, counters, seenVariableNames);
      if (optionNodes === undefined) {
        return;
      }
      options[attrName] = optionNodes;
    }
    const jsxChildren = Node.isJsxElement(element) ? element.getJsxChildren() : [];
    const childNodes = serializeJsxChildren(jsxChildren, ctx, counters, seenVariableNames);
    if (childNodes.length > 0) {
      const fallbackKey = isPlural ? (options['other'] ? '_default' : 'other') : '_default';
      options[fallbackKey] = childNodes;
    }
    if (Object.keys(options).length === 0) {
      error(ctx, element, `<${sdkName}> needs at least one branch`);
      return;
    }
    nodes.push({ b: branchIndex, t: isPlural ? 'plural' : 'branch', o: options });
    return;
  }

  // Any other element: numbered placeholder + recurse into children.
  const elementIndex = counters.e;
  counters.e++;
  const children = Node.isJsxElement(element)
    ? serializeJsxChildren(element.getJsxChildren(), ctx, counters, seenVariableNames)
    : [];
  nodes.push(children.length > 0 ? { e: elementIndex, c: children } : { e: elementIndex });
}

function serializeAttributeValue(
  attr: JsxAttribute,
  ctx: ScanContext,
  counters: Counters,
  seenVariableNames: Set<string>,
): TNode[] | undefined {
  const initializer = attr.getInitializer();
  if (initializer && Node.isStringLiteral(initializer)) {
    return [initializer.getLiteralValue()];
  }
  if (initializer && Node.isJsxExpression(initializer)) {
    const expr = initializer.getExpression();
    if (expr) {
      const nodes: TNode[] = [];
      const errorsBefore = ctx.result.errors.length;
      serializeExpression(expr, ctx, counters, seenVariableNames, nodes, (text) => {
        if (text) {
          appendNode(nodes, text);
        }
      });
      return ctx.result.errors.length > errorsBefore ? undefined : nodes;
    }
  }
  error(ctx, attr, 'branch options must be static strings or JSX');
  return undefined;
}

/** Appends a node, merging adjacent text, mirroring the runtime serializer. */
function appendNode(nodes: TNode[], node: TNode): void {
  const last = nodes[nodes.length - 1];
  if (typeof node === 'string' && typeof last === 'string') {
    nodes[nodes.length - 1] = last + node;
  } else {
    nodes.push(node);
  }
}

/**
 * JSX text normalization, matching what the JSX transform does at compile time
 * (Babel's cleanJSXElementLiteralChild): tabs become spaces, lines are trimmed,
 * and interior newlines collapse to a single space. The runtime serializer gets
 * this for free because it sees post-transform strings.
 */
export function normalizeJsxText(text: string): string {
  const lines = text.split(/\r\n|\n|\r/);
  let lastNonEmptyLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i]!)) {
      lastNonEmptyLine = i;
    }
  }
  let result = '';
  for (let i = 0; i < lines.length; i++) {
    const isFirstLine = i === 0;
    const isLastLine = i === lines.length - 1;
    const isLastNonEmptyLine = i === lastNonEmptyLine;
    let trimmed = lines[i]!.replace(/\t/g, ' ');
    if (!isFirstLine) {
      trimmed = trimmed.replace(/^ +/, '');
    }
    if (!isLastLine) {
      trimmed = trimmed.replace(/ +$/, '');
    }
    if (trimmed) {
      if (!isLastNonEmptyLine) {
        trimmed += ' ';
      }
      result += trimmed;
    }
  }
  return result;
}

// --- t() extraction ---------------------------------------------------------

/** Extracts `t('...')` calls for every binding created by `const t = useT()` in this file. */
function extractTFunctionCalls(sourceFile: SourceFile, ctx: ScanContext, tBindings: Set<string>): void {
  sourceFile.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    const callee = node.getExpression();
    if (!Node.isIdentifier(callee) || !tBindings.has(callee.getText())) {
      return;
    }
    const [messageArg, , optsArg] = node.getArguments();
    if (!messageArg || !(Node.isStringLiteral(messageArg) || Node.isNoSubstitutionTemplateLiteral(messageArg))) {
      error(ctx, node, 't() messages must be static string literals — use a dictionary for structured or dynamic copy');
      return;
    }
    let id: string | undefined;
    let context: string | undefined;
    if (optsArg) {
      if (!Node.isObjectLiteralExpression(optsArg)) {
        error(ctx, node, 't() options must be an inline object literal');
        return;
      }
      for (const prop of optsArg.getProperties()) {
        if (!Node.isPropertyAssignment(prop)) {
          error(ctx, prop, 't() options must use plain literal properties');
          return;
        }
        const propName = prop.getName();
        const value = prop.getInitializer();
        if (!value || !(Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value))) {
          error(ctx, prop, `t() option "${propName}" must be a static string literal`);
          return;
        }
        if (propName === 'context') {
          context = value.getLiteralValue();
        } else if (propName === 'id') {
          id = value.getLiteralValue();
        }
      }
    }
    const message = messageArg.getLiteralValue();
    ctx.result.entries.push({
      contentHash: hashSource({ source: message, context, format: 'text' }),
      source: message,
      format: 'text',
      ...(context !== undefined ? { context } : {}),
      ...(id !== undefined ? { id } : {}),
      file: ctx.file,
      line: node.getStartLineNumber(),
    });
  });
}
