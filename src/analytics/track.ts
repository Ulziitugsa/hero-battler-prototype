import type { AnalyticsEventName, AnalyticsProperties } from './events';
import { buildContext } from './context';

// The one place every commercial system reports what happened. No vendor lock-in and no bespoke backend:
// events are queued in memory (capped) and, in dev, logged to the console; a real provider can be attached
// later with setAnalyticsProvider() without any call site changing. This is deliberately the entire
// "analytics architecture" for the prototype phase - see docs/COMMERCIAL-PROTOTYPE-PLAN.md Phase 0/10.

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  properties: AnalyticsProperties;
  at: number;
}

export type AnalyticsProvider = (event: AnalyticsEvent) => void;

const QUEUE_LIMIT = 500;
const queue: AnalyticsEvent[] = [];
let provider: AnalyticsProvider | null = null;
const listeners = new Set<AnalyticsProvider>();

/** Attaches a real analytics backend later (Phase 10+). Every event tracked before this call is still in
 * getQueuedEvents() for the new provider to drain if it wants to; nothing is lost by attaching late. */
export function setAnalyticsProvider(next: AnalyticsProvider | null): void {
  provider = next;
}

/**
 * Internal-only, separate from setAnalyticsProvider: lets in-app systems react to events without
 * competing for the single external-provider slot. Commercial Prototype Phase 5 missions (and Phase 6's
 * journey) subscribe here instead of scattering bespoke counters through gameplay code - "integrate
 * progress using analytics/game events where sensible" (docs/COMMERCIAL-PROTOTYPE-PLAN.md Phase 5).
 */
export function subscribeTrack(listener: AnalyticsProvider): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Records one event with common context merged in. Never throws - a bad `properties` value degrades to
 * an empty bag rather than breaking the caller's actual feature. */
export function track(name: AnalyticsEventName, properties: AnalyticsProperties = {}): AnalyticsEvent {
  let context: ReturnType<typeof buildContext>;
  try {
    context = buildContext();
  } catch {
    context = { accountLevel: 1, gems: 0, gold: 0, daysSinceInstall: 0, payerStatus: 'free' };
  }
  const event: AnalyticsEvent = { name, properties: { ...context, ...properties }, at: Date.now() };
  queue.push(event);
  if (queue.length > QUEUE_LIMIT) queue.shift();
  if (import.meta.env.DEV) console.debug('[analytics]', event.name, event.properties);
  try {
    provider?.(event);
  } catch {
    // a misbehaving provider must never break the feature that just fired the event
  }
  for (const l of [...listeners]) {
    try {
      l(event);
    } catch {
      // one bad internal listener must never break another, or the feature that fired the event
    }
  }
  return event;
}

/** Test/dev inspection only - what track() has queued so far. */
export function getQueuedEvents(): readonly AnalyticsEvent[] {
  return queue;
}

export function clearQueuedEvents(): void {
  queue.length = 0;
}
