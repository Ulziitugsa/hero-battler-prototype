import { beforeEach, describe, expect, it } from 'vitest';
import { clearQueuedEvents, getQueuedEvents, setAnalyticsProvider, track } from './track';

function installLocalStoragePolyfill() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  installLocalStoragePolyfill();
  clearQueuedEvents();
  setAnalyticsProvider(null);
});

describe('track', () => {
  it('queues an event with common context merged in', () => {
    const event = track('session_started', { platform: 'web' });
    expect(event.name).toBe('session_started');
    expect(event.properties.platform).toBe('web');
    expect(event.properties).toHaveProperty('accountLevel');
    expect(event.properties).toHaveProperty('gems');
    expect(event.properties).toHaveProperty('gold');
    expect(event.properties).toHaveProperty('daysSinceInstall');
    expect(event.properties).toHaveProperty('payerStatus', 'free');
    expect(typeof event.at).toBe('number');
    expect(getQueuedEvents()).toHaveLength(1);
  });

  it('caller-supplied properties win over context when keys collide', () => {
    const event = track('campaign_won', { accountLevel: 999 });
    expect(event.properties.accountLevel).toBe(999);
  });

  it('caps the queue rather than growing unbounded', () => {
    for (let i = 0; i < 510; i++) track('session_started', { i });
    expect(getQueuedEvents()).toHaveLength(500);
    expect(getQueuedEvents()[0].properties.i).toBe(10);
    expect(getQueuedEvents()[499].properties.i).toBe(509);
  });

  it('forwards every event to an attached provider without throwing on a bad provider', () => {
    const seen: string[] = [];
    setAnalyticsProvider((e) => seen.push(e.name));
    track('summon_opened');
    expect(seen).toEqual(['summon_opened']);

    setAnalyticsProvider(() => {
      throw new Error('boom');
    });
    expect(() => track('summon_performed')).not.toThrow();
  });

  it('clearQueuedEvents empties the queue', () => {
    track('session_started');
    clearQueuedEvents();
    expect(getQueuedEvents()).toHaveLength(0);
  });
});
