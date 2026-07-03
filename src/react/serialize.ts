import { Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { TNode } from '../types.js';
import { Branch, Plural } from './branches.js';
import { DateTime, Num, Var } from './variables.js';

/**
 * Everything the serialized `TNode[]` refers back to, captured in source-tree
 * traversal order (branch option sub-trees included). Translated content is
 * re-materialized against this: `{e: n}` clones `elements[n]`, `{v: name}`
 * formats `variables[name]`, `{b: n}` selects a branch by `branches[n].value`.
 */
export type Registry = {
  readonly elements: ReactElement[];
  readonly variables: Record<string, { readonly value: unknown; readonly kind: 'var' | 'num' | 'datetime'; readonly options?: object }>;
  readonly branches: { readonly kind: 'branch' | 'plural'; readonly value: unknown }[];
};

/**
 * Serializes `<T>` children to the canonical `TNode[]` + registry. Must stay in
 * byte-for-byte parity with the CLI scanner's serialization of the same JSX —
 * the content hash is computed over this output (see the parity fixture tests).
 */
export function serializeChildren(children: ReactNode): { readonly nodes: readonly TNode[]; readonly registry: Registry } {
  const registry: Registry = { elements: [], variables: {}, branches: [] };
  const counters = { v: 0, n: 0, d: 0 };
  const nodes = serializeList(children, registry, counters);
  return { nodes, registry };
}

const VARIABLE_KINDS = new Map<unknown, { readonly kind: 'var' | 'num' | 'datetime'; readonly prefix: 'v' | 'n' | 'd'; readonly f?: 'num' | 'datetime' }>([
  [Var, { kind: 'var', prefix: 'v' }],
  [Num, { kind: 'num', prefix: 'n', f: 'num' }],
  [DateTime, { kind: 'datetime', prefix: 'd', f: 'datetime' }],
]);

function serializeList(children: ReactNode, registry: Registry, counters: { v: number; n: number; d: number }): TNode[] {
  const nodes: TNode[] = [];
  const pushText = (text: string) => {
    const last = nodes[nodes.length - 1];
    if (typeof last === 'string') {
      nodes[nodes.length - 1] = last + text;
    } else {
      nodes.push(text);
    }
  };

  const visit = (child: ReactNode): void => {
    if (child === null || child === undefined || typeof child === 'boolean') {
      return;
    }
    if (typeof child === 'string') {
      pushText(child);
      return;
    }
    if (typeof child === 'number' || typeof child === 'bigint') {
      pushText(String(child));
      return;
    }
    if (Array.isArray(child)) {
      for (const item of child) {
        visit(item);
      }
      return;
    }
    if (isValidElement(child)) {
      serializeElement(child, nodes, registry, counters);
      return;
    }
    console.warn('[foony-translate] <T> children contain an unserializable value; it will be dropped from translation:', child);
  };

  visit(children);
  return nodes;
}

function serializeElement(
  element: ReactElement,
  nodes: TNode[],
  registry: Registry,
  counters: { v: number; n: number; d: number },
): void {
  const props = element.props as Record<string, unknown>;

  // Fragments are transparent: their children serialize inline.
  if (element.type === Fragment) {
    for (const node of serializeList(props['children'] as ReactNode, registry, counters)) {
      appendNode(nodes, node);
    }
    return;
  }

  const variable = VARIABLE_KINDS.get(element.type);
  if (variable) {
    counters[variable.prefix]++;
    const name = typeof props['name'] === 'string' ? props['name'] : `_${variable.prefix}${counters[variable.prefix]}`;
    if (registry.variables[name]) {
      console.warn(`[foony-translate] duplicate variable name "${name}" inside one <T>; the later value wins`);
    }
    registry.variables[name] = {
      value: props['children'],
      kind: variable.kind,
      ...(props['options'] ? { options: props['options'] as object } : {}),
    };
    nodes.push(variable.f ? { v: name, f: variable.f } : { v: name });
    return;
  }

  if (element.type === Branch || element.type === Plural) {
    const isPlural = element.type === Plural;
    const branchIndex = registry.branches.length;
    registry.branches.push({ kind: isPlural ? 'plural' : 'branch', value: isPlural ? props['n'] : props['branch'] });
    const options: Record<string, TNode[]> = {};
    for (const [key, optionValue] of Object.entries(props)) {
      if (key === 'children' || key === 'name' || key === (isPlural ? 'n' : 'branch')) {
        continue;
      }
      options[key] = serializeList(optionValue as ReactNode, registry, counters);
    }
    if (props['children'] !== undefined) {
      const fallbackKey = isPlural ? (options['other'] ? '_default' : 'other') : '_default';
      options[fallbackKey] = serializeList(props['children'] as ReactNode, registry, counters);
    }
    nodes.push({ b: branchIndex, t: isPlural ? 'plural' : 'branch', o: options });
    return;
  }

  // Any other element (host or component): a numbered placeholder. Tags and
  // props stay in the registry; only the child structure is translatable.
  const elementIndex = registry.elements.length;
  registry.elements.push(element);
  const children = serializeList(props['children'] as ReactNode, registry, counters);
  nodes.push(children.length > 0 ? { e: elementIndex, c: children } : { e: elementIndex });
}

/** Appends a node, merging adjacent text (fragment inlining can create splits). */
function appendNode(nodes: TNode[], node: TNode): void {
  const last = nodes[nodes.length - 1];
  if (typeof node === 'string' && typeof last === 'string') {
    nodes[nodes.length - 1] = last + node;
  } else {
    nodes.push(node);
  }
}
