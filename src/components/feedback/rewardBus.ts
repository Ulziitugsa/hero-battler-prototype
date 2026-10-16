// The reward feedback channel: how "you just got something" travels from the control that earned it to the counter
// that holds it. React-free and synchronous, so any screen (or plain function) can announce a reward and any counter
// can receive one, without the two knowing about each other:
//
//   a claim handler      flyReward({ kind: 'gold', amount: 100, from: button })
//   a counter            registerRewardTarget('gold', element)   (useRewardTarget does this)
//   the flight layer     subscribeRewardFlights(...)             (RewardFlightLayer, mounted once at the app root)
//
// Presentation only. Nothing here grants, spends or reads a balance: the economy stores have already changed by the
// time (or in the same handler as) a flight is announced, and a flight that cannot be drawn costs the player nothing.

export type RewardKind = 'gold' | 'gems' | 'tickets' | 'cards';

export interface Point {
  x: number;
  y: number;
}

/** How a flight is drawn: how many tokens travel, how long each takes, and when the last one lands. */
export interface FlightPlan {
  tokens: number;
  durationMs: number;
  staggerMs: number;
  /** From dispatch until the last token reaches its counter. 0 when nothing travels (reduced motion). */
  landsInMs: number;
}

export interface RewardFlight {
  id: number;
  kind: RewardKind;
  amount: number;
  /** Viewport coordinates of the control that earned the reward. */
  from: Point;
  /** "+100 Gold": what was gained, in words, shown at `from`. */
  label: string;
  plan: FlightPlan;
  /** Position among rewards announced together from one control (flyRewards): labels stack, tokens leave in turn. */
  stack: number;
  /** Wait before the label shows and the first token leaves (a result screen lets its own entrance finish first). */
  delayMs: number;
}

/** Extra wait before the next reward in a group leaves, so Gold, then Gems, then Tickets read as separate arrivals. */
export const STACK_DELAY_MS = 140;

const LABEL: Record<RewardKind, [singular: string, plural: string]> = {
  gold: ['Gold', 'Gold'],
  gems: ['Gem', 'Gems'],
  tickets: ['Pull Ticket', 'Pull Tickets'],
  cards: ['card', 'cards'],
};

export const FLIGHT_DURATION_MS = 640;
export const FLIGHT_STAGGER_MS = 70;
const MAX_TOKENS = 6;

/** "+100 Gold", "+1 Pull Ticket", "+10 cards". */
export function rewardLabel(kind: RewardKind, amount: number): string {
  const [one, many] = LABEL[kind];
  return `+${amount.toLocaleString('en-US')} ${amount === 1 ? one : many}`;
}

/**
 * More reward, more tokens - but never a swarm: a card reward sends one token per card (up to six), a currency sends
 * one for a small amount and up to six for a large one. Reduced motion sends none (the label and the counter's own
 * change still say what happened).
 */
export function planFlight(kind: RewardKind, amount: number, reducedMotion: boolean): FlightPlan {
  if (reducedMotion || amount <= 0) return { tokens: 0, durationMs: 0, staggerMs: 0, landsInMs: 0 };
  const tokens = kind === 'cards' ? Math.min(MAX_TOKENS, amount) : Math.min(MAX_TOKENS, Math.max(1, Math.ceil(Math.log10(amount + 1) * 2)));
  return { tokens, durationMs: FLIGHT_DURATION_MS, staggerMs: FLIGHT_STAGGER_MS, landsInMs: FLIGHT_DURATION_MS + FLIGHT_STAGGER_MS * (tokens - 1) };
}

// ---- Targets -------------------------------------------------------------------------------------------------------

const targets = new Map<RewardKind, HTMLElement[]>();

/**
 * A counter offers itself as the landing spot for one kind of reward. Several can be mounted at once (Home's header
 * and an open Missions sheet both show Gold); the most recently registered one that is actually on screen wins, which
 * is the one the player is looking at. Returns the unregister function.
 */
export function registerRewardTarget(kind: RewardKind, element: HTMLElement): () => void {
  const list = targets.get(kind) ?? [];
  targets.set(kind, [...list.filter((el) => el !== element), element]);
  return () => {
    const current = targets.get(kind);
    if (current) targets.set(kind, current.filter((el) => el !== element));
  };
}

function onScreen(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const r = element.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  return r.bottom > 0 && r.right > 0 && r.top < h && r.left < w;
}

/** The counter a reward of this kind should fly to right now, or null when none is on screen. */
export function resolveRewardTarget(kind: RewardKind): HTMLElement | null {
  const list = targets.get(kind) ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (onScreen(list[i])) return list[i];
  return null;
}

/** Re-triggers the counter's arrival swell (styles/feedback/rewards.css .mw-counter-hit). */
export function pulseRewardTarget(kind: RewardKind): void {
  const el = resolveRewardTarget(kind);
  if (!el) return;
  el.classList.remove('mw-counter-hit');
  // Reading layout restarts the CSS animation when the class goes back on.
  void el.offsetWidth;
  el.classList.add('mw-counter-hit');
}

// ---- Landing coordination ------------------------------------------------------------------------------------------

// When each flight that has somewhere to land arrives, by flight id: a cancelled flight stops holding its counter back.
const landings = new Map<number, { kind: RewardKind; at: number }>();
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * How long a counter of this kind should wait before counting up, so the number rises as the reward arrives rather
 * than before it has left the button. 0 when nothing is in flight.
 */
export function landingDelay(kind: RewardKind, at: number = now()): number {
  let latest = 0;
  for (const [id, landing] of landings) {
    if (landing.at <= at) landings.delete(id);
    else if (landing.kind === kind) latest = Math.max(latest, landing.at);
  }
  return Math.max(0, latest - at);
}

// ---- Flights -------------------------------------------------------------------------------------------------------

const listeners = new Set<(flight: RewardFlight) => void>();
const cancelListeners = new Set<(ids: number[]) => void>();
let nextId = 1;

export function subscribeRewardFlights(listener: (flight: RewardFlight) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The flight layer hears here when flights are called off (their screen closed before they landed). */
export function subscribeRewardCancels(listener: (ids: number[]) => void): () => void {
  cancelListeners.add(listener);
  return () => {
    cancelListeners.delete(listener);
  };
}

/**
 * Calls off flights still in the air - a result screen that closes before its rewards have landed (Play again at once)
 * takes its coins with it instead of leaving them to fly at a counter that is gone. The rewards themselves were granted
 * long before; only the drawing stops. Safe to call with flights that have already landed.
 */
export function cancelRewardFlights(ids: number[]): void {
  const live = ids.filter((id) => id > 0);
  if (live.length === 0) return;
  for (const id of live) landings.delete(id);
  for (const l of [...cancelListeners]) l(live);
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function pointOf(from: Element | Point): Point {
  if ('getBoundingClientRect' in from) {
    const r = from.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return from;
}

/**
 * Announces a reward the player just received. `from` is the control (or point) it came from. Safe to call anywhere,
 * any number of times: with no flight layer mounted (tests, a screen outside the app shell) it does nothing.
 */
export function flyReward({ kind, amount, from, label, stack = 0, delayMs = 0 }: { kind: RewardKind; amount: number; from: Element | Point; label?: string; stack?: number; delayMs?: number }): number {
  if (amount <= 0 || listeners.size === 0) return 0;
  const base = planFlight(kind, amount, reducedMotion());
  // Reduced motion: nothing travels, so nothing waits either - the label and the counter answer at once.
  const delay = base.landsInMs > 0 ? Math.max(0, delayMs) : 0;
  const offset = base.landsInMs > 0 ? stack * STACK_DELAY_MS : 0;
  const plan = { ...base, landsInMs: base.landsInMs + offset + delay };
  // Only a flight with somewhere to land delays the counter; a reward whose counter is off screen just shows its label.
  const id = nextId++;
  if (plan.landsInMs > 0 && resolveRewardTarget(kind)) landings.set(id, { kind, at: now() + plan.landsInMs });
  const flight: RewardFlight = { id, kind, amount, from: pointOf(from), label: label ?? rewardLabel(kind, amount), plan, stack, delayMs: delay };
  for (const l of [...listeners]) l(flight);
  return id;
}

/**
 * Several rewards earned by one control at once (a mission's Gold and Gems, a Journey day's Tickets and card): each
 * kind flies to its own counter, one after another, with their labels stacked at the source. Zero amounts are skipped.
 * Returns the ids of the flights it started (for cancelRewardFlights).
 */
export function flyRewards(from: Element | Point, rewards: Partial<Record<RewardKind, number>>, { delayMs = 0 }: { delayMs?: number } = {}): number[] {
  const order: RewardKind[] = ['gold', 'gems', 'tickets', 'cards'];
  const ids: number[] = [];
  let stack = 0;
  for (const kind of order) {
    const amount = rewards[kind] ?? 0;
    if (amount > 0) ids.push(flyReward({ kind, amount, from, stack: stack++, delayMs }));
  }
  return ids;
}

/** Test helper: forget every target, listener and pending landing. */
export function resetRewardBusForTests(): void {
  targets.clear();
  listeners.clear();
  cancelListeners.clear();
  landings.clear();
  nextId = 1;
}
