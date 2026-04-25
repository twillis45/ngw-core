/**
 * ShotMatchAdapter — compatibility bridge for ShotMatchScreen in Studio Matte.
 *
 * The legacy ShotMatchScreen reads from AppContext (useAppState/useDispatch)
 * and usePaywall. This adapter provides minimal mock context so the legacy
 * component renders correctly without the full AppProvider + reducer.
 *
 * Props: result, imagePreview, user, isPaid, isAdmin, onBack
 */
import { useMemo } from 'react';
import { _StateCtx, _DispatchCtx } from '../../../context/AppContext';
import ShotMatchScreen from '../../ShotMatchScreen';

export default function ShotMatchAdapter({ result, imagePreview, user, isPaid, isAdmin, onBack }) {
  const mockState = useMemo(() => ({
    referenceImage: imagePreview ? { preview: imagePreview } : null,
    referenceImages: [],
    result: result || null,
    user: user || null,
    // usePaywall reads user.email from state — ensure it's available
  }), [result, imagePreview, user]);

  const mockDispatch = useMemo(() => (action) => {
    if (action.type === 'GO_BACK') {
      onBack?.();
    }
    // NAVIGATE to 'upgrade' — no SM equivalent yet; silently ignore.
    // The paywall gate itself handles free users before they reach
    // the upgrade button, so this is a safe no-op.
  }, [onBack]);

  return (
    <_StateCtx.Provider value={mockState}>
      <_DispatchCtx.Provider value={mockDispatch}>
        <ShotMatchScreen />
      </_DispatchCtx.Provider>
    </_StateCtx.Provider>
  );
}
