// Campaign Energy - a real-time "stamina" resource gating how many Campaign stages can be started.
// Distinct from the deprecated per-card ENERGY_ENABLED flag in game/engine/constants.ts (a mana-like
// in-match cost system that was tested and removed) - this is a meta-progression resource, not
// something spent during a battle. No purchase/refill path exists or is planned for this prototype.
//
// All the numbers below are the design's own placeholders (see "Open points": "42/60, 5/7/10, 1 per 5
// min are placeholders for balancing"), centralized here so retuning is a one-line change.
export const CAMPAIGN_ENERGY_MAX = 60;
export const CAMPAIGN_ENERGY_REGEN_INTERVAL_MS = 5 * 60 * 1000; // +1 every 5 minutes
export const CAMPAIGN_ENERGY_REGEN_AMOUNT = 1;
export const CAMPAIGN_ENERGY_STARTING = 42;

export const CAMPAIGN_NODE_ENERGY_COST: Record<string, number> = {
  battle: 5,
  elite: 7,
  boss: 10,
  challenge: 5,
  story: 0,
  reward: 0,
};

const STORAGE_KEY = 'skyloom:campaignEnergy';

interface StoredEnergy {
  current: number;
  /** ISO timestamp of the last time `current` was written - regen is recomputed from the gap between
   * this and "now" on every load, so it keeps counting while the app is closed. */
  updatedAt: string;
}

export interface EnergyState {
  current: number;
  max: number;
  /** ms until the next +1 tick; 0 once at max. */
  msUntilNextTick: number;
}

function readStored(): StoredEnergy {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { current: CAMPAIGN_ENERGY_STARTING, updatedAt: new Date().toISOString() };
    const parsed = JSON.parse(raw) as StoredEnergy;
    if (typeof parsed.current !== 'number' || typeof parsed.updatedAt !== 'string') throw new Error('malformed');
    return parsed;
  } catch {
    return { current: CAMPAIGN_ENERGY_STARTING, updatedAt: new Date().toISOString() };
  }
}

function write(stored: StoredEnergy): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // best-effort only
  }
}

/** Recomputes `current` from elapsed real time since `updatedAt`, capped at max, and persists the
 * recomputed value with a fresh timestamp for any *whole* ticks consumed (a partial tick's elapsed
 * time is preserved via the remainder, not rounded away) - this is what makes regen survive a
 * refresh/reopen rather than resetting the clock every time the page loads. */
function resolve(stored: StoredEnergy): StoredEnergy {
  if (stored.current >= CAMPAIGN_ENERGY_MAX) return stored;
  const elapsedMs = Date.now() - new Date(stored.updatedAt).getTime();
  if (elapsedMs < CAMPAIGN_ENERGY_REGEN_INTERVAL_MS) return stored;
  const ticks = Math.floor(elapsedMs / CAMPAIGN_ENERGY_REGEN_INTERVAL_MS);
  const gained = ticks * CAMPAIGN_ENERGY_REGEN_AMOUNT;
  const next = Math.min(CAMPAIGN_ENERGY_MAX, stored.current + gained);
  const consumedMs = ticks * CAMPAIGN_ENERGY_REGEN_INTERVAL_MS;
  const resolved: StoredEnergy = { current: next, updatedAt: new Date(new Date(stored.updatedAt).getTime() + consumedMs).toISOString() };
  write(resolved);
  return resolved;
}

export function loadEnergy(): EnergyState {
  const resolved = resolve(readStored());
  const msUntilNextTick = resolved.current >= CAMPAIGN_ENERGY_MAX ? 0 : CAMPAIGN_ENERGY_REGEN_INTERVAL_MS - (Date.now() - new Date(resolved.updatedAt).getTime());
  return { current: resolved.current, max: CAMPAIGN_ENERGY_MAX, msUntilNextTick: Math.max(0, msUntilNextTick) };
}

export function canAffordEnergy(cost: number): boolean {
  return loadEnergy().current >= cost;
}

/** Spends `cost` immediately (Campaign's "spend up front" model - see the stage sheet's Fight action).
 * Never refunded on an early battle exit; only a completed match ever credits progress back. */
export function spendEnergy(cost: number): EnergyState {
  const resolved = resolve(readStored());
  const next: StoredEnergy = { current: Math.max(0, resolved.current - cost), updatedAt: resolved.updatedAt };
  write(next);
  return loadEnergy();
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
