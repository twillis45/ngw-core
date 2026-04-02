/**
 * useKit — reactive hook for reading the user's saved kit.
 *
 * Re-renders automatically when saveKit() or clearKit() is called anywhere
 * in the app (same tab), ensuring gear-aware cards stay in sync without
 * manual refreshes or prop drilling.
 *
 * Usage:
 *   const kit = useKit();   // kit | null
 */
import { useSyncExternalStore } from 'react';
import { loadKit, subscribeKit, getKitVersion } from '../data/kitStore';

export default function useKit() {
  useSyncExternalStore(subscribeKit, getKitVersion);
  return loadKit();
}
