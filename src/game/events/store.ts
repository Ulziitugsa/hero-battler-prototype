import { subscribeTrack, track, type AnalyticsEvent } from '../../analytics/track';
import { grantGems, grantGold, grantTickets } from '../economy/economy';
import { getCollection, grantCard } from '../collection/collection';
import type { OwnedMap } from '../collection/types';
import { dayKey } from '../missions/store';
import { eventPhase, getEventDef, getLiveEvent } from './definitions';
import { unlockEventCosmetic } from './cosmetics';
import type { EventDefinition, EventMilestoneDef, EventMissionDef, EventObjective, EventRequirement, EventReward } from './types';

// Event progress store - the same snapshot + listeners + sanitize shape as missions/store.ts. It has its
// own storage key, so saves from before events existed load untouched and simply start with no
// progress. Mission progress is fed by the analytics stream (subscribeTrack), exactly like the regular
// missions, and only counts while the event is live.

export const EVENTS_VERSION = 1;
export const EVENTS_STORAGE_KEY = 'moonwater:events';

export interface EventMissionProgress {
  count: number;
  claimed: boolean;
}

export interface EventProgress {
  /** How many login-reward days have been claimed (day N is claimable once N-1 are claimed). */
  loginClaims: number;
  /** dayKey() of the most recent login claim - at most one login reward per day. */
  lastLoginDay: number | null;
  missions: Record<string, EventMissionProgress>;
  /** Claimed milestone ids, including the final reward's id. */
  claimed: string[];
}

export interface EventsState {
  version: number;
  events: Record<string, EventProgress>;
}

const whole = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

function emptyProgress(): EventProgress {
  return { loginClaims: 0, lastLoginDay: null, missions: {}, claimed: [] };
}

function sanitizeProgress(raw: unknown, def: EventDefinition): EventProgress {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyProgress();
  const r = raw as Partial<Record<keyof EventProgress, unknown>>;
  const missions: Record<string, EventMissionProgress> = {};
  if (r.missions && typeof r.missions === 'object' && !Array.isArray(r.missions)) {
    for (const [id, value] of Object.entries(r.missions as Record<string, unknown>)) {
      const mission = def.missions.find((m) => m.id === id);
      if (!mission || !value || typeof value !== 'object') continue;
      const v = value as { count?: unknown; claimed?: unknown };
      missions[id] = { count: Math.min(mission.target, whole(v.count)), claimed: v.claimed === true };
    }
  }
  const knownClaims = new Set([...def.milestones.map((m) => m.id), def.finalReward.id]);
  return {
    loginClaims: Math.min(def.loginRewards.length, whole(r.loginClaims)),
    lastLoginDay: typeof r.lastLoginDay === 'number' && Number.isFinite(r.lastLoginDay) ? r.lastLoginDay : null,
    missions,
    claimed: Array.isArray(r.claimed) ? [...new Set(r.claimed.filter((id): id is string => typeof id === 'string' && knownClaims.has(id)))] : [],
  };
}

function sanitizeState(raw: unknown): EventsState {
  const events: Record<string, EventProgress> = {};
  const stored = raw && typeof raw === 'object' ? (raw as { events?: unknown }).events : null;
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
      const def = getEventDef(id);
      if (def) events[id] = sanitizeProgress(value, def);
    }
  }
  return { version: EVENTS_VERSION, events };
}

let snapshot: EventsState | null = null;
const listeners = new Set<() => void>();

function load(): EventsState {
  try {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    if (raw !== null) return sanitizeState(JSON.parse(raw));
  } catch {
    // malformed or unavailable storage: start clean rather than crash
  }
  return { version: EVENTS_VERSION, events: {} };
}

function commit(next: EventsState): void {
  snapshot = next;
  try {
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // best effort only
  }
  for (const listener of [...listeners]) listener();
}

export function getEventsState(): EventsState {
  if (!snapshot) snapshot = load();
  return snapshot;
}

export function subscribeEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getEventProgress(eventId: string, state: EventsState = getEventsState()): EventProgress {
  return state.events[eventId] ?? emptyProgress();
}

function withProgress(state: EventsState, eventId: string, progress: EventProgress): EventsState {
  return { ...state, events: { ...state.events, [eventId]: progress } };
}

// ---- Mission tracking ---------------------------------------------------------------------------

function matchesFilter(event: AnalyticsEvent, objective: EventObjective): boolean {
  if (objective.event !== event.name) return false;
  return Object.entries(objective.where ?? {}).every(([key, value]) => event.properties[key] === value);
}

/** How much one analytics event advances an objective (0 if it doesn't match). */
export function objectiveIncrement(objective: EventObjective, event: AnalyticsEvent): number {
  if (!matchesFilter(event, objective)) return 0;
  if (objective.kind === 'count') return 1;
  return whole(event.properties[objective.property]);
}

function recordAnalyticsEvent(event: AnalyticsEvent): void {
  const def = getLiveEvent(event.at);
  if (!def) return;
  const state = getEventsState();
  const progress = getEventProgress(def.id, state);
  const reports: { missionId: string; count: number; target: number }[] = [];
  const missions = { ...progress.missions };
  for (const mission of def.missions) {
    const current = missions[mission.id] ?? { count: 0, claimed: false };
    if (current.claimed || current.count >= mission.target) continue;
    const increment = objectiveIncrement(mission.objective, event);
    if (increment <= 0) continue;
    const count = Math.min(mission.target, current.count + increment);
    missions[mission.id] = { count, claimed: false };
    reports.push({ missionId: mission.id, count, target: mission.target });
  }
  if (reports.length === 0) return;
  // Commit before reporting: track() re-enters this listener synchronously.
  commit(withProgress(state, def.id, { ...progress, missions }));
  for (const report of reports) {
    track('event_mission_progressed', { eventId: def.id, ...report });
    if (report.count >= report.target) track('event_mission_completed', { eventId: def.id, missionId: report.missionId });
  }
}

let subscribed = false;
/** Wires event missions to the analytics stream - call once, early (main.tsx). Idempotent. */
export function initEvents(): void {
  if (subscribed) return;
  subscribed = true;
  subscribeTrack(recordAnalyticsEvent);
}

// ---- Derived state ------------------------------------------------------------------------------

export function isMissionComplete(mission: EventMissionDef, progress: EventProgress): boolean {
  return (progress.missions[mission.id]?.count ?? 0) >= mission.target;
}

export function missionsCompleted(def: EventDefinition, progress: EventProgress): number {
  return def.missions.filter((m) => isMissionComplete(m, progress)).length;
}

/** Current / needed for a milestone requirement - used for both the progress bar and the claim check. */
export function requirementProgress(def: EventDefinition, requirement: EventRequirement, progress: EventProgress, owned: OwnedMap = getCollection()): { current: number; needed: number } {
  switch (requirement.kind) {
    case 'missionsCompleted':
      return { current: Math.min(requirement.count, missionsCompleted(def, progress)), needed: requirement.count };
    case 'allMissionsCompleted':
      return { current: missionsCompleted(def, progress), needed: def.missions.length };
    case 'cardsOwned': {
      const have = requirement.cardIds.filter((id) => (owned[id] ?? 0) > 0).length;
      return { current: Math.min(requirement.count, have), needed: requirement.count };
    }
  }
}

export function loginRewardClaimable(def: EventDefinition, progress: EventProgress, now: number = Date.now()): boolean {
  return eventPhase(def, now) === 'active' && progress.loginClaims < def.loginRewards.length && progress.lastLoginDay !== dayKey(now);
}

function milestoneClaimable(def: EventDefinition, milestone: EventMilestoneDef, progress: EventProgress, owned: OwnedMap): boolean {
  if (progress.claimed.includes(milestone.id)) return false;
  const { current, needed } = requirementProgress(def, milestone.requirement, progress, owned);
  return current >= needed;
}

/** How many rewards on the event page can be claimed right now - drives the Home entry's attention dot. */
export function claimableCount(def: EventDefinition, progress: EventProgress, now: number = Date.now(), owned: OwnedMap = getCollection()): number {
  if (eventPhase(def, now) !== 'active') return 0;
  const missions = def.missions.filter((m) => isMissionComplete(m, progress) && !progress.missions[m.id]?.claimed).length;
  const milestones = [...def.milestones, def.finalReward].filter((m) => milestoneClaimable(def, m, progress, owned)).length;
  return missions + milestones + (loginRewardClaimable(def, progress, now) ? 1 : 0);
}

/** Share of all the event's rewards already claimed, 0-1 - the event's completion state. */
export function completionRatio(def: EventDefinition, progress: EventProgress): number {
  const total = def.loginRewards.length + def.missions.length + def.milestones.length + 1;
  const done = progress.loginClaims + def.missions.filter((m) => progress.missions[m.id]?.claimed).length + progress.claimed.length;
  return Math.min(1, done / total);
}

// ---- Claims -------------------------------------------------------------------------------------

export interface EventClaimResult {
  ok: boolean;
  reason: string | null;
  granted: EventReward;
}

function fail(reason: string): EventClaimResult {
  return { ok: false, reason, granted: {} };
}

/** Grants a reward through the existing economy/collection/background paths and reports what landed. */
export function grantEventReward(reward: EventReward): EventReward {
  const granted: EventReward = {};
  if (reward.gold) granted.gold = grantGold(reward.gold, 'event').gained;
  if (reward.gems) granted.gems = grantGems(reward.gems, 'event').gained;
  if (reward.tickets) granted.tickets = grantTickets(reward.tickets, 'event').gained;
  if (reward.cardIds?.length) granted.cardIds = reward.cardIds.filter((id) => grantCard(id) !== null);
  if (reward.backgroundId) {
    unlockEventCosmetic(reward.backgroundId);
    granted.backgroundId = reward.backgroundId;
  }
  return granted;
}

function rewardProps(reward: EventReward) {
  return { gold: reward.gold ?? 0, gems: reward.gems ?? 0, tickets: reward.tickets ?? 0, cards: reward.cardIds?.join(',') ?? '', backgroundId: reward.backgroundId ?? '' };
}

function activeDef(eventId: string, now: number): EventDefinition | string {
  const def = getEventDef(eventId);
  if (!def) return 'Unknown event.';
  if (eventPhase(def, now) !== 'active') return eventPhase(def, now) === 'ended' ? 'This event has ended.' : 'This event has not started.';
  return def;
}

export function claimLoginReward(eventId: string, now: number = Date.now()): EventClaimResult {
  const def = activeDef(eventId, now);
  if (typeof def === 'string') return fail(def);
  const progress = getEventProgress(def.id);
  if (!loginRewardClaimable(def, progress, now)) return fail(progress.loginClaims >= def.loginRewards.length ? 'Every login reward is claimed.' : 'Come back tomorrow for the next reward.');
  const day = def.loginRewards[progress.loginClaims];
  commit(withProgress(getEventsState(), def.id, { ...progress, loginClaims: progress.loginClaims + 1, lastLoginDay: dayKey(now) }));
  const granted = grantEventReward(day.reward);
  track('event_login_claimed', { eventId: def.id, day: day.day, ...rewardProps(granted) });
  return { ok: true, reason: null, granted };
}

export function claimEventMission(eventId: string, missionId: string, now: number = Date.now()): EventClaimResult {
  const def = activeDef(eventId, now);
  if (typeof def === 'string') return fail(def);
  const mission = def.missions.find((m) => m.id === missionId);
  if (!mission) return fail('Unknown mission.');
  const progress = getEventProgress(def.id);
  const current = progress.missions[mission.id] ?? { count: 0, claimed: false };
  if (current.claimed) return fail('Already claimed.');
  if (current.count < mission.target) return fail('Not complete yet.');
  commit(withProgress(getEventsState(), def.id, { ...progress, missions: { ...progress.missions, [mission.id]: { ...current, claimed: true } } }));
  const granted = grantEventReward(mission.reward);
  track('event_reward_claimed', { eventId: def.id, rewardId: mission.id, kind: 'mission', ...rewardProps(granted) });
  return { ok: true, reason: null, granted };
}

/** Claims a milestone or the final reward (both are EventMilestoneDefs). */
export function claimEventMilestone(eventId: string, milestoneId: string, now: number = Date.now()): EventClaimResult {
  const def = activeDef(eventId, now);
  if (typeof def === 'string') return fail(def);
  const milestone = [...def.milestones, def.finalReward].find((m) => m.id === milestoneId);
  if (!milestone) return fail('Unknown reward.');
  const progress = getEventProgress(def.id);
  if (progress.claimed.includes(milestone.id)) return fail('Already claimed.');
  if (!milestoneClaimable(def, milestone, progress, getCollection())) return fail('Not complete yet.');
  commit(withProgress(getEventsState(), def.id, { ...progress, claimed: [...progress.claimed, milestone.id] }));
  const granted = grantEventReward(milestone.reward);
  const kind = milestone.id === def.finalReward.id ? 'final' : 'milestone';
  track('event_reward_claimed', { eventId: def.id, rewardId: milestone.id, kind, ...rewardProps(granted) });
  if (kind === 'final') track('event_completed', { eventId: def.id });
  return { ok: true, reason: null, granted };
}

// ---- Dev / test helpers -------------------------------------------------------------------------

export function resetEvents(): void {
  try {
    localStorage.removeItem(EVENTS_STORAGE_KEY);
  } catch {
    // ignore
  }
  commit({ version: EVENTS_VERSION, events: {} });
}

export function reloadEvents(): void {
  snapshot = null;
  for (const listener of [...listeners]) listener();
}

