import { grantGold } from '../economy/economy';
import { track } from '../../analytics/track';
import { loadProgress } from './progress';
import { getConfig } from '../../config/config';
import { DEFAULT_CONFIG } from '../../config/defaults';

// Idle / offline rewards (Commercial Prototype Phase 4) - deliberately copies energy.ts's own pattern
// (last-timestamp -> elapsed -> rate -> cap -> claim), because that pattern already solves the hard part
// (surviving a refresh/reopen without a running timer) and there's no reason to invent a second one.
// Local-only for this prototype, same as every other progression store - see
// docs/COMMERCIAL-PROTOTYPE-PLAN.md Phase 4 ("local authority is acceptable for this phase").
//
// Commercial Prototype Phase 8: the rate/cap are now read live from config/config.ts (see goldPerHour and
// loadIdleReward below) so a remote provider can retune them without a release. These exported constants
// stay as the DEFAULT_CONFIG-mirrored values other modules/tests already import by name.

export const IDLE_CAP_HOURS = DEFAULT_CONFIG.idle.capHours;
/** Gold/hour with zero Campaign nodes cleared. */
export const IDLE_GOLD_PER_HOUR_BASE = DEFAULT_CONFIG.idle.goldPerHourBase;
/** Extra Gold/hour per Campaign node ever cleared - ties the passive rate to Campaign progress, per the brief. */
export const IDLE_GOLD_PER_HOUR_PER_NODE = DEFAULT_CONFIG.idle.goldPerHourPerNode;

export const IDLE_REWARDS_STORAGE_KEY = 'skyloom:idleRewards';
const STORAGE_KEY = IDLE_REWARDS_STORAGE_KEY;

interface StoredIdle {
  /** Epoch ms of the last claim (or first launch, before any claim). */
  lastClaimAt: number;
}

function readStored(): StoredIdle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { lastClaimAt: Date.now() };
    const parsed = JSON.parse(raw) as Partial<StoredIdle>;
    if (typeof parsed.lastClaimAt !== 'number' || !Number.isFinite(parsed.lastClaimAt)) throw new Error('malformed');
    return { lastClaimAt: parsed.lastClaimAt };
  } catch {
    return { lastClaimAt: Date.now() };
  }
}

function write(stored: StoredIdle): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // best-effort only
  }
}

/** Gold/hour for a roster that has cleared this many Campaign nodes - the "Campaign progress determines rate" rule from the brief, as a flat linear scale (PROTOTYPE value, like every other tuning constant in this codebase). Reads live config, not the module constants above. */
export function goldPerHour(clearedNodeCount: number): number {
  const cfg = getConfig().idle;
  return cfg.goldPerHourBase + Math.max(0, clearedNodeCount) * cfg.goldPerHourPerNode;
}

export interface IdleRewardState {
  /** Whole Gold claimable right now. */
  availableGold: number;
  /** Hours of accrual actually counted (never above IDLE_CAP_HOURS). */
  cappedHours: number;
  /** True once elapsed time has reached the cap - waiting longer adds nothing more until claimed. */
  atCap: boolean;
  goldPerHour: number;
}

/** Read-only: what's available to claim right now. Never mutates storage - see claimIdleReward for that. */
export function loadIdleReward(clearedNodeCount: number = loadProgress().clearedNodes.length, now: number = Date.now()): IdleRewardState {
  const stored = readStored();
  const capHours = getConfig().idle.capHours;
  const elapsedMs = Math.max(0, now - stored.lastClaimAt);
  const elapsedHours = elapsedMs / (60 * 60 * 1000);
  const cappedHours = Math.min(capHours, elapsedHours);
  const rate = goldPerHour(clearedNodeCount);
  return { availableGold: Math.floor(cappedHours * rate), cappedHours, atCap: elapsedHours >= capHours, goldPerHour: rate };
}

export interface IdleClaimResult {
  gold: number;
}

/** Claims whatever is currently available and resets the clock to now - always, even when the available
 * amount is 0, so a player who checks constantly can never "bank" partial minutes by claiming early. */
export function claimIdleReward(clearedNodeCount: number = loadProgress().clearedNodes.length): IdleClaimResult {
  const state = loadIdleReward(clearedNodeCount);
  write({ lastClaimAt: Date.now() });
  if (state.availableGold <= 0) return { gold: 0 };
  const result = grantGold(state.availableGold, 'idle');
  track('idle_reward_claimed', { gold: result.gained, cappedHours: state.cappedHours, atCap: state.atCap, goldPerHour: state.goldPerHour });
  return { gold: result.gained };
}

/** Dev/test only. */
export function resetIdleRewards(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
