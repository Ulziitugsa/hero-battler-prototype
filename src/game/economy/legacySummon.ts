// The retired Moonwell Summon left a record in every save that used it: a per-banner Legendary guarantee counter and a
// short pull history (PlayerEconomy.summon). Card acquisition is now pulls from finite Boxes only (docs/CARD-COMBAT-DESIGN.md
// section 19), so nothing writes that record any more, but it is still read, sanitised and saved unchanged, so a future
// task can honour or convert it. These are the limits the old Summon wrote it under.

export const LEGACY_SUMMON = {
  /** The banners that could hold a guarantee counter. */
  bannerIds: ['royal-vanguard', 'gravebound', 'infernal-hunt'] as readonly string[],
  /** A counter was always below this (the guarantee fired on this pull). */
  pityThreshold: 40,
  historyLimit: 50,
} as const;

export function isLegacyBannerId(id: unknown): id is string {
  return typeof id === 'string' && LEGACY_SUMMON.bannerIds.includes(id);
}
