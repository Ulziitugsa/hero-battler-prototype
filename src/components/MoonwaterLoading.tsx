import { useEffect, useRef } from 'react';
import { track } from '../analytics/track';

const TIP = 'Place Heroes carefully — lanes decide their targets.';

export function MoonwaterLoading() {
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
    track('app_loading_started', { source: 'lazy_module' });
    return () => { track('app_loading_completed', { source: 'lazy_module', durationMs: Date.now() - startedAt.current }); };
  }, []);

  return <main className="moon-loading" role="status" aria-live="polite">
    <div className="moon-loading-orb" aria-hidden="true"><span>☾</span><i /></div>
    <p className="moon-loading-kicker">A WORLD WAKES</p>
    <h1>Moonwater</h1>
    <p className="moon-loading-tip">{TIP}</p>
    <span className="moon-loading-spinner" aria-hidden="true" />
    <span className="moon-loading-label">Gathering the moonlight</span>
  </main>;
}
