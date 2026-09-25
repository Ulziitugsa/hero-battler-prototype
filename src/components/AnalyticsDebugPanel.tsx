import { useEffect, useState } from 'react';
import { getQueuedEvents, subscribeTrack, type AnalyticsEvent } from '../analytics/track';
import { Icon } from './Icon';
import '../styles/analyticsDebug.css';

/**
 * The "simple development/debug way to inspect emitted events" the brief asks for (Commercial Prototype
 * Phase 9) - not a real analytics dashboard, a floating panel that lists what track() has fired this
 * session, most recent first. Mounted once at the App root, gated by isDebugPanelEnabled() (dev builds
 * always; a playtest build only after visiting once with ?debug=1 - see analytics/track.ts and App.tsx)
 * so it's reachable from every screen, not just one page.
 */
export function AnalyticsDebugPanel() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<readonly AnalyticsEvent[]>(() => getQueuedEvents());
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    return subscribeTrack(() => setEvents(getQueuedEvents()));
  }, []);

  if (!open) {
    return (
      <button type="button" className="analytics-debug-toggle" onClick={() => setOpen(true)} aria-label="Open analytics debug panel">
        <Icon name="bug" size={16} />
        <span>{events.length}</span>
      </button>
    );
  }

  const recent = [...events].reverse().slice(0, 60);

  return (
    <div className="analytics-debug-panel">
      <div className="analytics-debug-header">
        <span>Analytics ({events.length})</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="analytics-debug-list">
        {recent.length === 0 && <p className="analytics-debug-empty">Nothing tracked yet.</p>}
        {recent.map((e, i) => (
          <div key={events.length - i} className="analytics-debug-row">
            <button type="button" className="analytics-debug-row-head" onClick={() => setExpanded(expanded === i ? null : i)}>
              <span className="analytics-debug-name">{e.name}</span>
              <span className="analytics-debug-time">{new Date(e.at).toLocaleTimeString()}</span>
            </button>
            {expanded === i && <pre className="analytics-debug-props">{JSON.stringify(e.properties, null, 2)}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}
