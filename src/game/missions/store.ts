import { grantGems, grantGold } from '../economy/economy';
import { subscribeTrack, track, type AnalyticsEvent } from '../../analytics/track';
import { ALL_MISSIONS, getMissionDef, missionsForMetric, type MissionDef } from './definitions';

// Missions store - same snapshot+listeners+sanitize shape as every other store in the repo (collection,
// economy, ascension, heroLevel). Reset is "lazy, on read", the same pattern energy.ts uses for regen:
// compare the current day/week key against the stored one, and if it moved on, wipe that bucket. No
// timer, no background job - a stale bucket only ever gets reset the next time something reads it.
//
// Deliberately NOT calendar-aligned (a "week" is not necessarily Monday-Sunday) - see WEEK_MS below.
// That's an intentional prototype simplification: deterministic and simple to test, revisit only if a
// real content-calendar need appears later.

export const MISSIONS_VERSION = 1;
export const MISSIONS_STORAGE_KEY = 'skyloom:missions';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function dayKey(now: number = Date.now()): number {
  return Math.floor(now / DAY_MS);
}
export function weekKey(now: number = Date.now()): number {
  return Math.floor(now / WEEK_MS);
}

export interface MissionProgress {
  count: number;
  claimed: boolean;
}

export interface MissionsState {
  version: number;
  dayKey: number;
  weekKey: number;
  daily: Record<string, MissionProgress>;
  weekly: Record<string, MissionProgress>;
}

const whole = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

function sanitizeBucket(raw: unknown, period: 'daily' | 'weekly'): Record<string, MissionProgress> {
  const out: Record<string, MissionProgress> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const def = getMissionDef(id);
    if (!def || def.period !== period || !v || typeof v !== 'object') continue;
    const r = v as { count?: unknown; claimed?: unknown };
    out[id] = { count: Math.min(def.target, whole(r.count)), claimed: r.claimed === true };
  }
  return out;
}

function defaultState(now: number = Date.now()): MissionsState {
  return { version: MISSIONS_VERSION, dayKey: dayKey(now), weekKey: weekKey(now), daily: {}, weekly: {} };
}

function sanitizeState(raw: unknown, now: number): MissionsState {
  if (!raw || typeof raw !== 'object') return defaultState(now);
  const r = raw as Partial<MissionsState>;
  return {
    version: MISSIONS_VERSION,
    dayKey: typeof r.dayKey === 'number' ? r.dayKey : dayKey(now),
    weekKey: typeof r.weekKey === 'number' ? r.weekKey : weekKey(now),
    daily: sanitizeBucket(r.daily, 'daily'),
    weekly: sanitizeBucket(r.weekly, 'weekly'),
  };
}

let snapshot: MissionsState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

function persist(state: MissionsState): void {
  try {
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort only
  }
}

function commit(next: MissionsState): void {
  snapshot = Object.freeze({ ...next, daily: Object.freeze({ ...next.daily }), weekly: Object.freeze({ ...next.weekly }) }) as MissionsState;
  persist(snapshot);
  emit();
}

function load(now: number): MissionsState {
  try {
    const raw = localStorage.getItem(MISSIONS_STORAGE_KEY);
    if (raw !== null) return sanitizeState(JSON.parse(raw), now);
  } catch {
    // malformed or unavailable storage: start clean rather than crash
  }
  return defaultState(now);
}

/** Rolls the daily/weekly buckets over if the period boundary has passed since the stored state. Pure - the caller decides whether to persist the result. */
function resolvePeriods(state: MissionsState, now: number): MissionsState {
  const dk = dayKey(now);
  const wk = weekKey(now);
  if (dk === state.dayKey && wk === state.weekKey) return state;
  return { ...state, dayKey: dk, weekKey: wk, daily: dk === state.dayKey ? state.daily : {}, weekly: wk === state.weekKey ? state.weekly : {} };
}

/** Live, reset-resolved state. Safe for useSyncExternalStore (stable reference until something changes). */
export function getMissionsState(now: number = Date.now()): MissionsState {
  if (!snapshot) snapshot = load(now);
  const resolved = resolvePeriods(snapshot, now);
  if (resolved !== snapshot) commit(resolved);
  return snapshot;
}

export function subscribeMissions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function bucketFor(state: MissionsState, def: MissionDef): Record<string, MissionProgress> {
  return def.period === 'daily' ? state.daily : state.weekly;
}

export function getMissionProgress(id: string, state: MissionsState = getMissionsState()): MissionProgress {
  const def = getMissionDef(id);
  if (!def) return { count: 0, claimed: false };
  return bucketFor(state, def)[id] ?? { count: 0, claimed: false };
}

export function isMissionComplete(id: string, state: MissionsState = getMissionsState()): boolean {
  const def = getMissionDef(id);
  if (!def) return false;
  return getMissionProgress(id, state).count >= def.target;
}

/** Advances every mission whose metric matches this event, capped at target, skipping already-claimed
 * missions (a claimed mission's counter is frozen for the rest of its period - claiming is terminal). */
function recordMetric(metric: AnalyticsEvent['name']): void {
  const matches = missionsForMetric(metric);
  if (matches.length === 0) return;
  const state = getMissionsState();
  let dailyChanged = false;
  let weeklyChanged = false;
  const nextDaily = { ...state.daily };
  const nextWeekly = { ...state.weekly };
  for (const def of matches) {
    const bucket = def.period === 'daily' ? nextDaily : nextWeekly;
    const current = bucket[def.id] ?? { count: 0, claimed: false };
    if (current.claimed || current.count >= def.target) continue;
    const nextCount = Math.min(def.target, current.count + 1);
    bucket[def.id] = { count: nextCount, claimed: false };
    if (def.period === 'daily') dailyChanged = true;
    else weeklyChanged = true;
    track('mission_progressed', { missionId: def.id, count: nextCount, target: def.target });
    if (nextCount >= def.target) track('mission_completed', { missionId: def.id });
  }
  if (dailyChanged || weeklyChanged) commit({ ...state, daily: nextDaily, weekly: nextWeekly });
}

let subscribed = false;
/** Wires the missions store to the analytics stream - call once, early (main.tsx), so progress is
 * tracked even if the player never opens the Missions sheet this session. Idempotent. */
export function initMissions(): void {
  if (subscribed) return;
  subscribed = true;
  subscribeTrack((event) => recordMetric(event.name));
}

export interface ClaimResult {
  ok: boolean;
  missionId: string;
  gold: number;
  gems: number;
  reason: string | null;
}

/** Grants the mission's reward and marks it claimed - only once per period, and only once complete. Re-validates everything itself rather than trusting the caller. */
export function claimMission(id: string): ClaimResult {
  const def = getMissionDef(id);
  if (!def) return { ok: false, missionId: id, gold: 0, gems: 0, reason: 'Unknown mission.' };
  const state = getMissionsState();
  const progress = getMissionProgress(id, state);
  if (progress.claimed) return { ok: false, missionId: id, gold: 0, gems: 0, reason: 'Already claimed.' };
  if (progress.count < def.target) return { ok: false, missionId: id, gold: 0, gems: 0, reason: 'Not complete yet.' };
  const claimedEntry: MissionProgress = { ...progress, claimed: true };
  if (def.period === 'daily') commit({ ...state, daily: { ...state.daily, [id]: claimedEntry } });
  else commit({ ...state, weekly: { ...state.weekly, [id]: claimedEntry } });
  const gold = def.rewardGold > 0 ? grantGold(def.rewardGold, 'mission').gained : 0;
  const gems = def.rewardGems > 0 ? grantGems(def.rewardGems, 'mission').gained : 0;
  track('mission_claimed', { missionId: id, gold, gems });
  return { ok: true, missionId: id, gold, gems, reason: null };
}

/** Every mission definition paired with its live progress - what the Missions sheet renders. */
export function listMissions(period?: 'daily' | 'weekly', state: MissionsState = getMissionsState()): { def: MissionDef; progress: MissionProgress }[] {
  return ALL_MISSIONS.filter((m) => !period || m.period === period).map((def) => ({ def, progress: getMissionProgress(def.id, state) }));
}

export function anyMissionClaimable(state: MissionsState = getMissionsState()): boolean {
  return ALL_MISSIONS.some((def) => {
    const p = getMissionProgress(def.id, state);
    return !p.claimed && p.count >= def.target;
  });
}

// ---- Dev / test helpers -------------------------------------------------------------------------

export function resetMissions(): void {
  try {
    localStorage.removeItem(MISSIONS_STORAGE_KEY);
  } catch {
    // ignore
  }
  commit(defaultState());
}

export function reloadMissions(): void {
  snapshot = null;
  emit();
}

export function setMissionProgress(id: string, count: number): void {
  const def = getMissionDef(id);
  if (!def) return;
  const state = getMissionsState();
  const value = { count: Math.min(def.target, Math.max(0, Math.floor(count))), claimed: false };
  commit(def.period === 'daily' ? { ...state, daily: { ...state.daily, [id]: value } } : { ...state, weekly: { ...state.weekly, [id]: value } });
}
