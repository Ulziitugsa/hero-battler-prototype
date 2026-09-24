import { grantGems, grantGold, grantTickets } from '../economy/economy';
import { grantCard } from '../collection/collection';
import { track } from '../../analytics/track';
import { getFirstSeenAt } from '../../analytics/context';
import { getConfig } from '../../config/config';
import { JOURNEY_DAYS, JOURNEY_LENGTH_DAYS, getJourneyDayDef } from './definitions';

// The 7-day journey's persisted state - a dedicated storage key nothing else in the codebase reads or
// resets, so "journey state cannot be accidentally reset by ordinary local changes" (brief acceptance
// criterion) holds by construction: no other reset* helper touches skyloom:journey, and the day math is
// anchored to analytics/context.ts's getFirstSeenAt() (Phase 0's single source of truth for "when did
// this player first open the app"), not a second install timestamp that could drift from it.

export const JOURNEY_VERSION = 1;
export const JOURNEY_STORAGE_KEY = 'skyloom:journey';
const DAY_MS = 24 * 60 * 60 * 1000;
const DROP_OFF_GAP_MS = 48 * 60 * 60 * 1000;

export interface JourneyState {
  version: number;
  claimedDays: number[];
  lastClaimAt: number | null;
  /** Set once journey_dropped_off has fired, so a stalled player is only ever reported once, not on every read. */
  dropOffReported: boolean;
}

function defaultState(): JourneyState {
  return { version: JOURNEY_VERSION, claimedDays: [], lastClaimAt: null, dropOffReported: false };
}

const whole = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0);

function sanitizeState(raw: unknown): JourneyState {
  if (!raw || typeof raw !== 'object') return defaultState();
  const r = raw as Partial<JourneyState>;
  const claimedDays = Array.isArray(r.claimedDays) ? [...new Set(r.claimedDays.map(whole).filter((d) => d >= 1 && d <= JOURNEY_LENGTH_DAYS))].sort((a, b) => a - b) : [];
  return {
    version: JOURNEY_VERSION,
    claimedDays,
    lastClaimAt: typeof r.lastClaimAt === 'number' && Number.isFinite(r.lastClaimAt) ? r.lastClaimAt : null,
    dropOffReported: r.dropOffReported === true,
  };
}

let snapshot: JourneyState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

function persist(state: JourneyState): void {
  try {
    localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort only
  }
}

function commit(next: JourneyState): void {
  snapshot = Object.freeze({ ...next, claimedDays: [...next.claimedDays] }) as JourneyState;
  persist(snapshot);
  emit();
}

function load(): JourneyState {
  try {
    const raw = localStorage.getItem(JOURNEY_STORAGE_KEY);
    if (raw !== null) return sanitizeState(JSON.parse(raw));
  } catch {
    // malformed or unavailable storage: start clean rather than crash
  }
  return defaultState();
}

/** The day (1..JOURNEY_LENGTH_DAYS) the player's journey has reached, from real elapsed time since first launch. */
export function currentJourneyDay(now: number = Date.now()): number {
  const elapsedDays = Math.floor((now - getFirstSeenAt()) / DAY_MS);
  return Math.max(1, Math.min(JOURNEY_LENGTH_DAYS, elapsedDays + 1));
}

export interface JourneyView {
  currentDay: number;
  claimedDays: number[];
  complete: boolean;
  /** True when a day is unlocked (<= currentDay) and not yet claimed - what the UI highlights. */
  claimableDays: number[];
}

function toView(state: JourneyState, now: number): JourneyView {
  const currentDay = currentJourneyDay(now);
  const claimableDays = JOURNEY_DAYS.map((d) => d.day).filter((day) => day <= currentDay && !state.claimedDays.includes(day));
  return { currentDay, claimedDays: state.claimedDays, complete: state.claimedDays.length >= JOURNEY_LENGTH_DAYS, claimableDays };
}

/** Live, drop-off-checked state. Reports journey_dropped_off at most once per gap, computed here (lazily, on read) rather than tracked live by a running timer. */
export function getJourneyState(now: number = Date.now()): JourneyView {
  if (!snapshot) snapshot = load();
  if (!snapshot.dropOffReported && snapshot.lastClaimAt !== null && snapshot.claimedDays.length < JOURNEY_LENGTH_DAYS && now - snapshot.lastClaimAt > DROP_OFF_GAP_MS) {
    const lastDay = Math.max(...snapshot.claimedDays);
    track('journey_dropped_off', { lastClaimedDay: lastDay, gapMs: now - snapshot.lastClaimAt });
    commit({ ...snapshot, dropOffReported: true });
  }
  return toView(snapshot, now);
}

export function subscribeJourney(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface JourneyClaimResult {
  ok: boolean;
  day: number;
  gold: number;
  gems: number;
  tickets: number;
  cardGranted: string | null;
  reason: string | null;
}

/** Claims one day's reward. Days may be claimed out of order and a missed day is never lost - the journey
 * is generous by design (see brief: "Do not gate the reward behind spending or ads"; "Day 7 is reachable
 * free-to-play"). Re-validates everything itself rather than trusting the caller. */
export function claimJourneyDay(day: number, now: number = Date.now()): JourneyClaimResult {
  const def = getJourneyDayDef(day);
  if (!def) return { ok: false, day, gold: 0, gems: 0, tickets: 0, cardGranted: null, reason: 'Unknown day.' };
  const view = getJourneyState(now);
  if (day > view.currentDay) return { ok: false, day, gold: 0, gems: 0, tickets: 0, cardGranted: null, reason: 'Not unlocked yet.' };
  if (view.claimedDays.includes(day)) return { ok: false, day, gold: 0, gems: 0, tickets: 0, cardGranted: null, reason: 'Already claimed.' };

  // Commercial Prototype Phase 8: a remote-config override can replace a day's reward amount without
  // touching journey/definitions.ts - see config/schema.ts's JourneyConfig header note.
  const override = getConfig().journey.rewardOverrides[day];
  const rewardGold = override?.gold ?? def.rewardGold;
  const rewardGems = override?.gems ?? def.rewardGems;
  const rewardTickets = override?.tickets ?? def.rewardTickets;
  const gold = rewardGold > 0 ? grantGold(rewardGold, 'journey').gained : 0;
  const gems = rewardGems > 0 ? grantGems(rewardGems, 'journey').gained : 0;
  const tickets = rewardTickets > 0 ? grantTickets(rewardTickets, 'journey').gained : 0;
  let cardGranted: string | null = null;
  if (def.rewardCardId) {
    grantCard(def.rewardCardId, def.rewardCardCount ?? 1);
    cardGranted = def.rewardCardId;
  }

  const state = snapshot ?? load();
  const claimedDays = [...state.claimedDays, day].sort((a, b) => a - b);
  commit({ ...state, claimedDays, lastClaimAt: now, dropOffReported: false });

  track('journey_day_claimed', { day, gold, gems, tickets, cardGranted });
  track('journey_reward_claimed', { day, gold, gems, tickets, cardGranted });
  if (claimedDays.length >= JOURNEY_LENGTH_DAYS) track('journey_completed', { days: claimedDays.length });

  return { ok: true, day, gold, gems, tickets, cardGranted, reason: null };
}

// ---- Dev / test helpers -------------------------------------------------------------------------

export function resetJourney(): void {
  try {
    localStorage.removeItem(JOURNEY_STORAGE_KEY);
  } catch {
    // ignore
  }
  commit(defaultState());
}

export function reloadJourney(): void {
  snapshot = null;
  emit();
}
