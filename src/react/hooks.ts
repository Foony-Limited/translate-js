import { useSyncExternalStore } from 'react';
import type { DevStore } from './dev.js';

export { useTranslateContext } from './provider.js';

const noopSubscribe = () => () => {};
const zero = () => 0;

/**
 * Subscribes a component to dev-store updates so on-demand translations swap
 * in as they arrive. No-op (and no re-renders) when dev mode is off.
 */
export function useDevVersion(dev: DevStore | undefined): number {
  return useSyncExternalStore(dev?.subscribe ?? noopSubscribe, dev?.getVersion ?? zero, dev?.getVersion ?? zero);
}
