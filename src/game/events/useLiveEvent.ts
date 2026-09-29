import { useCallback, useState, useSyncExternalStore } from 'react';
import { useAppResume } from '../../platform/lifecycle';
import { useCollection } from '../collection/useCollection';
import { getLiveEvent } from './definitions';
import { claimableCount, getEventProgress, getEventsState, subscribeEvents, type EventProgress } from './store';
import type { EventDefinition } from './types';

export interface LiveEventView {
  def: EventDefinition;
  progress: EventProgress;
  claimable: number;
  now: number;
}

/** The live event and its progress, or null when nothing is running. Re-reads on resume so a day
 * rollover (new login reward) or the event ending is picked up without a reload. */
export function useLiveEvent(): LiveEventView | null {
  const [now, setNow] = useState(() => Date.now());
  const onResume = useCallback(() => setNow(Date.now()), []);
  useAppResume(onResume);
  const state = useSyncExternalStore(subscribeEvents, getEventsState, getEventsState);
  const owned = useCollection();
  const def = getLiveEvent(now);
  if (!def) return null;
  const progress = getEventProgress(def.id, state);
  return { def, progress, claimable: claimableCount(def, progress, now, owned), now };
}
