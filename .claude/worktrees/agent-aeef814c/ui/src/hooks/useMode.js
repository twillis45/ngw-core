/**
 * useMode — reactive hook for the shoot-mode feedback display mode.
 *
 * Returns the current mode string and re-renders the consumer whenever
 * saveMode() is called (e.g. from SettingsScreen or ShootModeScreen).
 *
 * Usage:
 *   const mode = useMode();            // 'photographer' | 'assistant' | 'learning'
 *   const [mode, setMode] = useMode(); // writable form — saves + notifies on change
 */
import { useSyncExternalStore } from 'react';
import { loadMode, saveMode, subscribeModeChange, getModeVersion } from '../data/modeStore';

export default function useMode() {
  useSyncExternalStore(subscribeModeChange, getModeVersion);
  return loadMode();
}
