import { track } from '../../analytics/track';
import { getGold, grantGold } from '../economy/economy';
import { MAX_GOLD } from '../economy/config';
import { dayKey } from '../missions/store';

export const DAILY_SHOP_GIFT_STORAGE_KEY = 'moonwater:shop-daily-gift';
export const DAILY_SHOP_GIFT_GOLD = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyShopGiftState { dayKey: number; claimed: boolean }

let snapshot: DailyShopGiftState | null = null;
const listeners = new Set<() => void>();

function persist(state: DailyShopGiftState): boolean {
  try {
    localStorage.setItem(DAILY_SHOP_GIFT_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function load(now: number): DailyShopGiftState {
  try {
    const raw = localStorage.getItem(DAILY_SHOP_GIFT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DailyShopGiftState>;
      if (typeof parsed.dayKey === 'number' && Number.isFinite(parsed.dayKey)) {
        return { dayKey: parsed.dayKey, claimed: parsed.claimed === true };
      }
    }
  } catch { /* start from today's unclaimed state */ }
  return { dayKey: dayKey(now), claimed: false };
}

function emit(): void { for (const listener of [...listeners]) listener(); }

export function getDailyShopGiftState(now: number = Date.now()): DailyShopGiftState {
  if (!snapshot) snapshot = load(now);
  const currentDay = dayKey(now);
  if (snapshot.dayKey !== currentDay) {
    const next = { dayKey: currentDay, claimed: false };
    persist(next);
    snapshot = next;
    emit();
  }
  return snapshot;
}

export function subscribeDailyShopGift(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function claimDailyShopGift(now: number = Date.now()): boolean {
  const state = getDailyShopGiftState(now);
  if (state.claimed || getGold() >= MAX_GOLD) return false;
  const next = { dayKey: state.dayKey, claimed: true };
  if (!persist(next)) return false;
  snapshot = next;
  emit();
  const grant = grantGold(DAILY_SHOP_GIFT_GOLD, 'shop');
  track('shop_free_claimed', { giftId: 'daily-gold', gold: grant.gained, source: 'shop' });
  return grant.gained > 0;
}

export function dailyShopGiftResetsAt(state: DailyShopGiftState = getDailyShopGiftState()): number {
  return (state.dayKey + 1) * DAY_MS;
}

export function resetDailyShopGiftForTests(): void {
  snapshot = null;
  try { localStorage.removeItem(DAILY_SHOP_GIFT_STORAGE_KEY); } catch { /* ignore */ }
  emit();
}
