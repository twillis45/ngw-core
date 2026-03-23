/**
 * usePreviewMode — global "Preview As" state.
 *
 * Reads/writes ngw_preview_access and ngw_preview_role in sessionStorage.
 * Dispatches a custom 'ngw-preview-change' window event so all mounted
 * consumers re-render when the value changes from any screen.
 */
import { useState, useEffect, useCallback } from 'react';

const ACCESS_KEY = 'ngw_preview_access';
const ROLE_KEY   = 'ngw_preview_role';
const EVENT      = 'ngw-preview-change';

function readAccess() {
  try { return sessionStorage.getItem(ACCESS_KEY) || null; } catch { return null; }
}
function readRole() {
  try { return sessionStorage.getItem(ROLE_KEY) || null; } catch { return null; }
}
function writeAccess(v) {
  try { v ? sessionStorage.setItem(ACCESS_KEY, v) : sessionStorage.removeItem(ACCESS_KEY); } catch {}
  window.dispatchEvent(new Event(EVENT));
}
function writeRole(v) {
  try { v ? sessionStorage.setItem(ROLE_KEY, v) : sessionStorage.removeItem(ROLE_KEY); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export default function usePreviewMode() {
  const [access, _setAccess] = useState(readAccess);
  const [role,   _setRole]   = useState(readRole);

  // Keep in sync with changes from other hook instances (same tab)
  useEffect(() => {
    function sync() {
      _setAccess(readAccess());
      _setRole(readRole());
    }
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const setAccess = useCallback(v => { _setAccess(v); writeAccess(v); }, []);
  const setRole   = useCallback(v => { _setRole(v);   writeRole(v);   }, []);
  const clear     = useCallback(() => { setAccess(null); setRole(null); }, [setAccess, setRole]);

  return {
    access,            // 'guest' | 'free' | 'paid' | 'admin' | null
    role,              // 'photographer' | 'assistant' | null
    setAccess,
    setRole,
    clear,
    isPreviewing: access !== null || role !== null,
  };
}
