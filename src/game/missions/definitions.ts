import type { AnalyticsEventName } from '../../analytics/events';

// Mission content, as plain data - same "data, not code" convention as campaign/chapter1.ts. Every
// metric is an EXISTING analytics event name (Phases 0-4) rather than a new bespoke counter, per the
// brief's "integrate progress using analytics/game events where sensible rather than scattering bespoke
// counters." The brief's own example list included "use 3 spells", which has no analytics event yet
// (spell plays aren't instrumented) - substituted with "apply Ascension progress to a hero"
// (duplicate_progress_applied, Phase 2) so every mission stays backed by something that already fires,
// rather than adding a new instrumentation surface just for this. See
// docs/COMMERCIAL-PROTOTYPE-PLAN.md Phase 5 for the reasoning.

export type MissionPeriod = 'daily' | 'weekly';

export interface MissionDef {
  id: string;
  period: MissionPeriod;
  title: string;
  /** The analytics event name that advances this mission by 1 each time it fires. */
  metric: AnalyticsEventName;
  target: number;
  rewardGold: number;
  rewardGems: number;
}

export const DAILY_MISSIONS: MissionDef[] = [
  { id: 'daily-campaign-wins', period: 'daily', title: 'Win 2 Campaign battles', metric: 'campaign_won', target: 2, rewardGold: 40, rewardGems: 0 },
  { id: 'daily-hero-level', period: 'daily', title: 'Level up a Hero', metric: 'hero_levelled', target: 1, rewardGold: 30, rewardGems: 0 },
  { id: 'daily-summon', period: 'daily', title: 'Perform a Summon', metric: 'summon_performed', target: 1, rewardGold: 0, rewardGems: 20 },
  { id: 'daily-idle-claim', period: 'daily', title: 'Claim your idle reward', metric: 'idle_reward_claimed', target: 1, rewardGold: 20, rewardGems: 0 },
  { id: 'daily-ascension', period: 'daily', title: 'Advance a Hero with a duplicate', metric: 'duplicate_progress_applied', target: 1, rewardGold: 0, rewardGems: 15 },
];

export const WEEKLY_MISSIONS: MissionDef[] = [
  { id: 'weekly-campaign-wins', period: 'weekly', title: 'Win 10 Campaign battles', metric: 'campaign_won', target: 10, rewardGold: 200, rewardGems: 0 },
  { id: 'weekly-summons', period: 'weekly', title: 'Perform 5 Summons', metric: 'summon_performed', target: 5, rewardGold: 0, rewardGems: 100 },
  { id: 'weekly-hero-levels', period: 'weekly', title: 'Level up Heroes 5 times', metric: 'hero_levelled', target: 5, rewardGold: 150, rewardGems: 0 },
];

export const ALL_MISSIONS: MissionDef[] = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS];

const BY_ID = new Map(ALL_MISSIONS.map((m) => [m.id, m]));

export function getMissionDef(id: string): MissionDef | undefined {
  return BY_ID.get(id);
}

/** Every mission whose metric is this event name - a `track()` call can advance more than one at once. */
export function missionsForMetric(metric: AnalyticsEventName): MissionDef[] {
  return ALL_MISSIONS.filter((m) => m.metric === metric);
}
