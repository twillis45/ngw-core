/**
 * useSettings — lightweight hook for reading user settings.
 *
 * Components that need to adapt behavior (not just CSS) can call:
 *   const { units, powerDisplay, showConfidenceScore, autoSaveSetups } = useSettings();
 *
 * Re-reads from localStorage on every render (cheap — single JSON parse).
 * For settings that only affect CSS (fontSize, fontFamily, density), use the
 * data-attribute approach in applySettings() instead.
 */
import { useSyncExternalStore } from 'react';
import { loadSettings } from '../data/settingsStore';

/** Simple version counter that bumps when saveSetting() is called from SettingsScreen. */
let _version = 0;
const _listeners = new Set();

function subscribe(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

/** Called by saveSetting / resetSettings to notify subscribers. */
export function notifySettingsChanged() {
  _version++;
  _listeners.forEach(cb => cb());
}

function getSnapshot() {
  return _version;
}

export default function useSettings() {
  useSyncExternalStore(subscribe, getSnapshot);
  return loadSettings();
}
