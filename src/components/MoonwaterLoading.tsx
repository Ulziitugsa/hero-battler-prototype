import { useEffect, useRef } from 'react';
import { track } from '../analytics/track';
import { LOADING_KICKER, LOADING_LINES } from './loadingCopy';

/**
 * The in-app loading screen, shown while a lazily-loaded screen is on its way. It is the same branded scene as the
 * boot screen in index.html (styles/boot.css): shuffling card backs before the moon, a travelling progress light and
 * the rotating status line. It only fades in if the wait is long enough to notice, so a fast load never flashes it.
 */
export function MoonwaterLoading() {
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
    track('app_loading_started', { source: 'lazy_module' });
    return () => { track('app_loading_completed', { source: 'lazy_module', durationMs: Date.now() - startedAt.current }); };
  }, []);

  return (
    <main className="mw-boot mw-boot-deferred" role="status" aria-live="polite" aria-label={`Loading Moonwater. ${LOADING_LINES[0]}`}>
      <div className="mw-boot-stage" aria-hidden="true">
        <span className="mw-boot-moon" />
        <span className="mw-boot-card c1" />
        <span className="mw-boot-card c3" />
        <span className="mw-boot-card c2" />
      </div>
      <p className="mw-boot-kicker">{LOADING_KICKER}</p>
      <h1 className="mw-boot-title">Moonwater</h1>
      <span className="mw-boot-rail" aria-hidden="true"><i /></span>
      <p className="mw-boot-lines" aria-hidden="true">
        {LOADING_LINES.map((line) => <span key={line}>{line}</span>)}
      </p>
    </main>
  );
}
