import { getHeroLevelState } from '../heroLevel/store';
import { legacyLevelGoldInvested } from '../cardMastery/model';
import { grantGoldOnce, hasGrant } from '../economy/economy';
import { track } from '../../analytics/track';

// Versioned save migrations for the card-combat release (docs/CARD-COMBAT-DESIGN.md, "Save migration").
//
// What the release changes in a save, and what it keeps:
//   - Collection, duplicates, decks, favourites, backgrounds, Campaign progress: untouched.
//   - Ascension rank: untouched; it IS the Card Mastery stage (rank 0..4 = Mastery I..V), so every card keeps its stage
//     and the copies already invested.
//   - Tactics (the old account "Mastery" loadout): untouched in the save; card combat doesn't read them.
//   - Legacy Hero Level: untouched in the save (never deleted), but it no longer affects anything, so the Gold the player
//     put into it is refunded once.
//
// Safety: each step is idempotent on its own. The refund is a one-time economy grant (economy.grantGoldOnce): the Gold
// and its grant id are one write, so an interrupted run can neither lose the refund nor pay it twice, and running the
// migration again (every launch) is a no-op. The version marker below only records what ran, for the Home notice.

export const SAVE_MIGRATION_KEY = 'moonwater:saveMigration';
/** Bump when a new step is added; every step must stay safe to re-run. */
export const SAVE_MIGRATION_VERSION = 1;
export const LEGACY_LEVEL_REFUND_GRANT = 'legacy-level-refund-v1';

export interface LegacyLevelRefund {
  gold: number;
  cards: number;
}

export interface SaveMigrationMarker {
  version: number;
  /** The Legacy Level refund this save received (0 Gold when nothing was levelled). */
  legacyLevelRefund: LegacyLevelRefund;
  /** Set once the player has seen the refund notice. */
  refundNoticeSeen: boolean;
}

function readMarker(): SaveMigrationMarker | null {
  try {
    const raw = localStorage.getItem(SAVE_MIGRATION_KEY);
    if (raw === null) return null;
    const v = JSON.parse(raw) as Partial<SaveMigrationMarker>;
    if (!v || typeof v !== 'object' || typeof v.version !== 'number') return null;
    const refund = v.legacyLevelRefund;
    return {
      version: v.version,
      legacyLevelRefund: { gold: Math.max(0, Math.floor(Number(refund?.gold) || 0)), cards: Math.max(0, Math.floor(Number(refund?.cards) || 0)) },
      refundNoticeSeen: v.refundNoticeSeen === true,
    };
  } catch {
    return null;
  }
}

function writeMarker(marker: SaveMigrationMarker): void {
  try {
    localStorage.setItem(SAVE_MIGRATION_KEY, JSON.stringify(marker));
  } catch {
    // best-effort: the refund itself is already recorded in the economy document
  }
}

/** Gold invested in Legacy Level across the save, and how many cards had any. */
export function legacyLevelRefundFor(levels = getHeroLevelState()): LegacyLevelRefund {
  let gold = 0;
  let cards = 0;
  for (const level of Object.values(levels.levels)) {
    const invested = legacyLevelGoldInvested(level);
    if (invested > 0) {
      gold += invested;
      cards += 1;
    }
  }
  return { gold, cards };
}

/**
 * Brings this save up to the card-combat release. Call once at startup, before anything renders. Safe to call any
 * number of times: a migrated save is left exactly as it is.
 */
export function runSaveMigrations(): SaveMigrationMarker {
  const marker = readMarker();
  if (marker && marker.version >= SAVE_MIGRATION_VERSION && hasGrant(LEGACY_LEVEL_REFUND_GRANT)) return marker;

  // Step 1: refund Legacy Level Gold, once. If an earlier run paid it but didn't get to write the marker, the grant id
  // already exists and this pays nothing; the marker then records the amount that run paid.
  const refund = legacyLevelRefundFor();
  const paid = grantGoldOnce(LEGACY_LEVEL_REFUND_GRANT, refund.gold, 'legacyLevelRefund');
  if (paid.paid && refund.gold > 0) track('legacy_level_refunded', { gold: refund.gold, cards: refund.cards });

  const next: SaveMigrationMarker = {
    version: SAVE_MIGRATION_VERSION,
    legacyLevelRefund: marker?.legacyLevelRefund ?? refund,
    refundNoticeSeen: marker?.refundNoticeSeen ?? refund.gold === 0,
  };
  writeMarker(next);
  return next;
}

/** The refund notice to show on Home, if the player hasn't dismissed it yet. */
export function pendingRefundNotice(): LegacyLevelRefund | null {
  const marker = readMarker();
  if (!marker || marker.refundNoticeSeen || marker.legacyLevelRefund.gold <= 0) return null;
  return marker.legacyLevelRefund;
}

export function dismissRefundNotice(): void {
  const marker = readMarker();
  if (marker) writeMarker({ ...marker, refundNoticeSeen: true });
}

/** Dev/test: forget the marker (the economy's grant record is reset with the economy). */
export function resetSaveMigrations(): void {
  try {
    localStorage.removeItem(SAVE_MIGRATION_KEY);
  } catch {
    // ignore
  }
}
