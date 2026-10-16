import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cancelRewardFlights, flyReward, flyRewards, landingDelay, planFlight, pulseRewardTarget, registerRewardTarget, resetRewardBusForTests, resolveRewardTarget, rewardLabel, STACK_DELAY_MS, subscribeRewardCancels, subscribeRewardFlights, type RewardFlight } from './rewardBus';

// A stand-in for a DOM element: just the parts the bus reads (position, connection, class list).
function fakeElement(rect: { left: number; top: number; width: number; height: number }, connected = true) {
  const classes = new Set<string>();
  return {
    isConnected: connected,
    offsetWidth: rect.width,
    getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top }),
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), contains: (c: string) => classes.has(c) },
  } as unknown as HTMLElement;
}

let reduced = false;
beforeEach(() => {
  reduced = false;
  (globalThis as unknown as { window: unknown }).window = { innerWidth: 390, innerHeight: 844, matchMedia: () => ({ matches: reduced }) };
  resetRewardBusForTests();
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('reward flights are presentation only', () => {
  it('labels say what was gained, singular and plural', () => {
    expect(rewardLabel('gold', 100)).toBe('+100 Gold');
    expect(rewardLabel('gems', 1)).toBe('+1 Gem');
    expect(rewardLabel('tickets', 1)).toBe('+1 Pull Ticket');
    expect(rewardLabel('cards', 10)).toBe('+10 cards');
    expect(rewardLabel('gold', 1250)).toBe('+1,250 Gold');
  });

  it('sends more tokens for more reward, never more than six, and none under reduced motion', () => {
    expect(planFlight('gold', 1, false).tokens).toBe(1);
    expect(planFlight('gold', 100, false).tokens).toBeGreaterThan(planFlight('gold', 10, false).tokens);
    expect(planFlight('gold', 1_000_000, false).tokens).toBe(6);
    expect(planFlight('cards', 3, false).tokens).toBe(3);
    expect(planFlight('cards', 10, false).tokens).toBe(6);
    expect(planFlight('gold', 100, true)).toEqual({ tokens: 0, durationMs: 0, staggerMs: 0, landsInMs: 0 });
    const plan = planFlight('gold', 100, false);
    expect(plan.landsInMs).toBe(plan.durationMs + plan.staggerMs * (plan.tokens - 1));
  });

  it('flies to the most recently registered counter that is on screen', () => {
    const header = fakeElement({ left: 300, top: 10, width: 60, height: 30 });
    const sheet = fakeElement({ left: 200, top: 400, width: 60, height: 30 });
    const offscreen = fakeElement({ left: 200, top: 2000, width: 60, height: 30 });
    registerRewardTarget('gold', header);
    const unregisterSheet = registerRewardTarget('gold', sheet);
    expect(resolveRewardTarget('gold')).toBe(sheet);
    registerRewardTarget('gold', offscreen);
    expect(resolveRewardTarget('gold')).toBe(sheet);
    unregisterSheet();
    expect(resolveRewardTarget('gold')).toBe(header);
    expect(resolveRewardTarget('gems')).toBeNull();
  });

  it('ignores a detached counter', () => {
    registerRewardTarget('gems', fakeElement({ left: 0, top: 0, width: 40, height: 20 }, false));
    expect(resolveRewardTarget('gems')).toBeNull();
  });

  it('does nothing without a listener (no layer mounted), and nothing for a zero amount', () => {
    registerRewardTarget('gold', fakeElement({ left: 300, top: 10, width: 60, height: 30 }));
    flyReward({ kind: 'gold', amount: 100, from: { x: 10, y: 10 } });
    expect(landingDelay('gold')).toBe(0);
    const seen: RewardFlight[] = [];
    subscribeRewardFlights((f) => seen.push(f));
    flyReward({ kind: 'gold', amount: 0, from: { x: 10, y: 10 } });
    expect(seen).toHaveLength(0);
  });

  it('a flight with a counter to land on holds that counter until it lands', () => {
    registerRewardTarget('gold', fakeElement({ left: 300, top: 10, width: 60, height: 30 }));
    const seen: RewardFlight[] = [];
    subscribeRewardFlights((f) => seen.push(f));
    flyReward({ kind: 'gold', amount: 100, from: fakeElement({ left: 100, top: 500, width: 80, height: 40 }) });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: 'gold', amount: 100, from: { x: 140, y: 520 }, label: '+100 Gold', stack: 0 });
    expect(landingDelay('gold')).toBeGreaterThan(0);
    expect(landingDelay('gold')).toBeLessThanOrEqual(seen[0].plan.landsInMs);
    // A reward whose counter is not on screen shows its label but delays nothing.
    flyReward({ kind: 'gems', amount: 20, from: { x: 0, y: 0 } });
    expect(landingDelay('gems')).toBe(0);
  });

  it('under reduced motion nothing travels and no counter waits', () => {
    reduced = true;
    registerRewardTarget('gold', fakeElement({ left: 300, top: 10, width: 60, height: 30 }));
    const seen: RewardFlight[] = [];
    subscribeRewardFlights((f) => seen.push(f));
    flyReward({ kind: 'gold', amount: 100, from: { x: 0, y: 0 } });
    expect(seen[0].plan.tokens).toBe(0);
    expect(landingDelay('gold')).toBe(0);
  });

  it('several rewards from one control stack in a fixed order and leave one after another', () => {
    const seen: RewardFlight[] = [];
    subscribeRewardFlights((f) => seen.push(f));
    flyRewards({ x: 50, y: 50 }, { tickets: 2, gold: 100, gems: 0, cards: 1 });
    expect(seen.map((f) => [f.kind, f.stack])).toEqual([
      ['gold', 0],
      ['tickets', 1],
      ['cards', 2],
    ]);
    const base = planFlight('tickets', 2, false).landsInMs;
    expect(seen[1].plan.landsInMs).toBe(base + STACK_DELAY_MS);
  });

  it('a delayed flight (a result screen still opening) holds its counter for the delay too, except under reduced motion', () => {
    const seen: RewardFlight[] = [];
    subscribeRewardFlights((f) => seen.push(f));
    registerRewardTarget('gold', fakeElement({ left: 300, top: 10, width: 60, height: 30 }));
    flyRewards({ x: 50, y: 400 }, { gold: 30 }, { delayMs: 900 });
    const base = planFlight('gold', 30, false).landsInMs;
    expect(seen[0].delayMs).toBe(900);
    expect(seen[0].plan.landsInMs).toBe(base + 900);
    expect(landingDelay('gold')).toBeGreaterThan(base + 800);
    reduced = true;
    flyReward({ kind: 'gems', amount: 20, from: { x: 50, y: 400 }, delayMs: 900 });
    expect(seen[1].delayMs).toBe(0);
    expect(seen[1].plan.landsInMs).toBe(0);
  });

  it('a screen that closes before its rewards land calls them off: the layer hears it and the counter stops waiting', () => {
    const cancelled: number[][] = [];
    subscribeRewardFlights(() => {});
    subscribeRewardCancels((ids) => cancelled.push(ids));
    registerRewardTarget('gold', fakeElement({ left: 300, top: 10, width: 60, height: 30 }));
    registerRewardTarget('gems', fakeElement({ left: 200, top: 10, width: 60, height: 30 }));
    const ids = flyRewards({ x: 50, y: 400 }, { gold: 30, gems: 5 }, { delayMs: 1300 });
    expect(ids).toHaveLength(2);
    expect(landingDelay('gold')).toBeGreaterThan(1300);
    // Another claim's Gold still in the air keeps its own hold.
    const other = flyReward({ kind: 'gold', amount: 10, from: { x: 50, y: 400 } });
    cancelRewardFlights(ids);
    expect(cancelled).toEqual([ids]);
    expect(landingDelay('gems')).toBe(0);
    expect(landingDelay('gold')).toBeGreaterThan(0);
    expect(landingDelay('gold')).toBeLessThanOrEqual(planFlight('gold', 10, false).landsInMs);
    cancelRewardFlights([other]);
    expect(landingDelay('gold')).toBe(0);
    // Nothing to call off (no layer was listening when it was announced): no event.
    cancelRewardFlights([0]);
    expect(cancelled).toHaveLength(2);
  });

  it('pulsing a counter restarts its arrival swell', () => {
    const el = fakeElement({ left: 300, top: 10, width: 60, height: 30 });
    registerRewardTarget('tickets', el);
    pulseRewardTarget('tickets');
    expect(el.classList.contains('mw-counter-hit')).toBe(true);
  });
});
