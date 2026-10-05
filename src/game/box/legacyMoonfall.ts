// The retired Moonfall Box (one finite Box of 100 five-card packs over the whole 52-card roster), read only so the
// launch-set migration can retire it cleanly (save/launchSetMigration.ts). Its cards were granted when they were opened
// and stay owned; its unopened packs are not carried over into the archetype Boxes, and nothing is refunded.

export const LEGACY_MOONFALL_STORAGE_KEYS = ['moonwater:testBox:moonfall-v2', 'moonwater:testBox:moonfall-v1'] as const;

/** Packs a save had opened from the Moonfall Box, counting refills as at least one pack each (0 when there is none). */
export function readLegacyMoonfallPacksOpened(): number {
  let opened = 0;
  for (const key of LEGACY_MOONFALL_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { openedPacks?: unknown; resetCount?: unknown };
      const packs = typeof parsed.openedPacks === 'number' && parsed.openedPacks > 0 ? Math.floor(parsed.openedPacks) : 0;
      const resets = typeof parsed.resetCount === 'number' && parsed.resetCount > 0 ? Math.floor(parsed.resetCount) : 0;
      opened = Math.max(opened, packs + resets);
    } catch {
      /* unreadable: nothing to carry */
    }
  }
  return opened;
}

/** Removes the retired Moonfall Box's saved pool. */
export function clearLegacyMoonfallBox(): void {
  for (const key of LEGACY_MOONFALL_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* best effort */
    }
  }
}
