import { useState } from 'react';
import { getJourneyState } from './store';
import type { JourneyView } from './store';

/**
 * Journey state, recomputed on demand. Deliberately NOT a useSyncExternalStore subscription:
 * getJourneyState() derives a fresh view (current day from real elapsed time, drop-off check) on every
 * call rather than returning a stable stored reference, so it can't satisfy useSyncExternalStore's
 * snapshot-caching contract - same reasoning as useHubState's unmemoized idle read (Phase 4). The
 * returned `refresh()` forces a recompute after a claim, without needing a subscribed store underneath.
 */
export function useJourney(): JourneyView & { refresh: () => void } {
  const [, setTick] = useState(0);
  const view = getJourneyState();
  return { ...view, refresh: () => setTick((t) => t + 1) };
}
