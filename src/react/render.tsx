import { cloneElement, Fragment, isValidElement, type ReactNode } from 'react';
import type { TNode } from '../types.js';
import { selectBranchOption, selectPluralOption } from './branches.js';
import { formatDateTime, formatNum } from './variables.js';
import type { Registry } from './serialize.js';

/**
 * Re-materializes a translated `TNode[]` against the registry captured while
 * serializing the source children: element placeholders clone the original
 * elements (all their props survive), variable placeholders format the live
 * values for the locale, branch placeholders select by the live branch value.
 */
export function renderTNodes(nodes: string | readonly TNode[], registry: Registry, locale: string): ReactNode {
  if (typeof nodes === 'string') {
    return nodes;
  }
  return nodes.map((node, index) => renderNode(node, registry, locale, index));
}

function renderNode(node: TNode, registry: Registry, locale: string, key: number): ReactNode {
  if (typeof node === 'string') {
    return node;
  }

  if ('e' in node) {
    const element = registry.elements[node.e];
    if (!element) {
      console.warn(`[foony-translate] translation refers to unknown element ${node.e}; dropping it`);
      return null;
    }
    return node.c ? cloneElement(element, { key }, renderTNodes(node.c, registry, locale)) : cloneElement(element, { key });
  }

  if ('v' in node) {
    const variable = registry.variables[node.v];
    if (!variable) {
      console.warn(`[foony-translate] translation refers to unknown variable "${node.v}"; dropping it`);
      return null;
    }
    if (variable.kind === 'num') {
      return formatNum(variable.value, locale, variable.options);
    }
    if (variable.kind === 'datetime') {
      return formatDateTime(variable.value, locale, variable.options);
    }
    return isValidElement(variable.value) ? cloneElement(variable.value, { key }) : String(variable.value ?? '');
  }

  const branch = registry.branches[node.b];
  if (!branch) {
    console.warn(`[foony-translate] translation refers to unknown branch ${node.b}; dropping it`);
    return null;
  }
  const selected =
    branch.kind === 'plural'
      ? (selectPluralOption(node.o, Number(branch.value), locale) ?? node.o['_default'])
      : (selectBranchOption(node.o, branch.value) ?? node.o['_default']);
  if (!selected) {
    return null;
  }
  return <Fragment key={key}>{renderTNodes(selected, registry, locale)}</Fragment>;
}
