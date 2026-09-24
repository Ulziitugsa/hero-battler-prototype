import { getAccount } from '../game/progression/account';
import { getEconomy } from '../game/economy/economy';

// Common properties merged onto every analytics event (track.ts) - account level, currency balances and
// days-since-install, per the brief's "Define common context properties". Every read is try/catch-wrapped
// so analytics can never be the reason a screen throws, even if a store somehow isn't ready yet.

const FIRST_SEEN_KEY = 'skyloom:firstSeenAt';

/** The single source of truth for "when did this player first open the app" - Phase 6's 7-day journey
 * reads this too, rather than keeping a second install timestamp. Set once, on first read, ever. */
export function getFirstSeenAt(): number {
  try {
    const raw = localStorage.getItem(FIRST_SEEN_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const now = Date.now();
    localStorage.setItem(FIRST_SEEN_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

export function daysSinceFirstSeen(now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - getFirstSeenAt()) / (24 * 60 * 60 * 1000)));
}

// A random id, once per page load (in-memory only - never persisted, never tied to a real identity).
// Commercial Prototype Phase 9: "session id where appropriate" - lets a later analytics provider group
// this browser tab's events into one session without Claude inventing a heavier session-tracking system.
function makeSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
const SESSION_ID = makeSessionId();

export interface AnalyticsContext {
  accountLevel: number;
  gems: number;
  gold: number;
  tickets: number;
  daysSinceInstall: number;
  /** Always 'free' until Phase 12 wires real purchases - present now so no event schema changes later. */
  payerStatus: 'free' | 'payer';
  sessionId: string;
}

/** Best-effort snapshot of "who is this and where are they" - never throws, never blocks. */
export function buildContext(): AnalyticsContext {
  let accountLevel = 1;
  let gems = 0;
  let gold = 0;
  let tickets = 0;
  try {
    accountLevel = getAccount().level;
  } catch {
    // account store not ready (e.g. an isolated unit test) - default stands
  }
  try {
    const economy = getEconomy();
    gems = economy.gems;
    gold = economy.gold ?? 0;
    tickets = economy.tickets ?? 0;
  } catch {
    // economy store not ready - default stands
  }
  return { accountLevel, gems, gold, tickets, daysSinceInstall: daysSinceFirstSeen(), payerStatus: 'free', sessionId: SESSION_ID };
}
