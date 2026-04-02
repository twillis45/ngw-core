/**
 * useFlag / useActiveExperiment — React hooks for feature flag evaluation.
 *
 * useFlag(name)
 *   Returns { enabled, config, variant, loading }
 *
 * useActiveExperiment(group)
 *   Returns { name, config, loading } — the active treatment in a mutually-exclusive group.
 *
 * Usage:
 *   const { enabled, config } = useFlag('pricing_v2_59_monthly');
 *   const { config: pricing } = useActiveExperiment('pricing');
 */

import { useState, useEffect } from 'react';
import { fetchFlags, getAllFlags } from '../data/flagsStore';

export function useFlag(flagName) {
  const [state, setState] = useState({
    enabled: false,
    config: null,
    variant: 'control',
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    fetchFlags().then(() => {
      if (cancelled) return;
      const flags = getAllFlags();
      const f = flags[flagName];
      setState({
        enabled: !!(f?.enabled && f?.variant === 'treatment'),
        config: (f?.variant === 'treatment' ? f?.config : null) || null,
        variant: f?.variant || 'control',
        loading: false,
      });
    });
    return () => { cancelled = true; };
  }, [flagName]);

  return state;
}

export function useActiveExperiment(group) {
  const [state, setState] = useState({ name: null, config: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    fetchFlags().then(() => {
      if (cancelled) return;
      const flags = getAllFlags();
      for (const [name, def] of Object.entries(flags)) {
        if (def.group === group && def.variant === 'treatment' && def.enabled) {
          setState({ name, config: def.config || {}, loading: false });
          return;
        }
      }
      setState({ name: null, config: null, loading: false });
    });
    return () => { cancelled = true; };
  }, [group]);

  return state;
}
