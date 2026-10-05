import { track } from '../../analytics/track';
import { readStoredCollection, writeStoredCollection } from '../collection/persistence';
import { reloadCollection } from '../collection/collection';
import { COLLECTION_VERSION } from '../collection/types';
import { loadProgress } from '../campaign/progress';
import { CORE_UNLOCK_NODES, coreUnlockOrder, readCoreAccess, writeCoreAccess } from '../core/coreAccess';
import { withCorePackages } from '../core/corePackages';
import { recordLegacyMoonfallPacks } from '../box/boxPool';
import { clearLegacyMoonfallBox, readLegacyMoonfallPacksOpened } from '../box/legacyMoonfall';
import type { StarterFaction } from '../cards/starterDecks';

// The launch-set save migration (docs/BOX-ARCHITECTURE.md, "Migration"). Runs at startup, before the collection
// migration (campaign/collectionMigration.ts) and before anything renders. Safe to run on every launch.
//
//   Core access. A save from before the launch set has no Core record. If it has a stored collection or Campaign
//   progress it is an existing account, which started with the Kingdom starter: it is recorded as a Kingdom start
//   (no starter pick is shown), and it receives the Kingdom package plus the package of every Core unlock stage it has
//   already cleared. Packages only RAISE counts to the package amount, so nothing is duplicated and nothing owned is
//   lowered. A save with neither is a new account: it is recorded as "not picked yet" and picks on first launch.
//
//   Moonfall. The retired Moonfall Box's pool is read once (how many packs were opened, so what that unlocked, the Gem
//   bundles, stays unlocked) and then deleted. Cards opened from it stay owned; unopened packs are not carried over or
//   refunded; every archetype Box starts full.
//
//   Untouched: Gems, Gold, Pull Tickets (still 1 Ticket = 1 pull, no conversion), saved decks, Structure Deck purchases
//   (Graveborn Rising stays owned though it is no longer sold), Campaign progress, events and missions.

export interface LaunchSetMigrationResult {
  /** 'legacy' or 'fresh' when this run created the Core record; null when the save already had one. */
  coreAccess: 'legacy' | 'fresh' | null;
  /** Core packages granted to an existing account by this run. */
  packagesGranted: StarterFaction[];
  /** Moonfall packs recorded from the retired Box by this run (0 when there was none). */
  moonfallPacks: number;
}

/** The Core packages an existing (Kingdom-start) account has earned from the Campaign stages it already cleared. */
export function legacyUnlockedPackages(clearedNodes: readonly string[]): StarterFaction[] {
  const order = coreUnlockOrder('kingdom');
  return ['kingdom', ...CORE_UNLOCK_NODES.flatMap((nodeId, i) => (clearedNodes.includes(nodeId) && order[i] ? [order[i]] : []))];
}

export function runLaunchSetMigration(): LaunchSetMigrationResult {
  const result: LaunchSetMigrationResult = { coreAccess: null, packagesGranted: [], moonfallPacks: 0 };

  if (readCoreAccess() === null) {
    const stored = readStoredCollection();
    const cleared = loadProgress().clearedNodes;
    if (stored.status === 'ok' || cleared.length > 0) {
      const unlocked = legacyUnlockedPackages(cleared);
      // A current-version collection is raised here. An older one is topped up right after by the collection migration,
      // which builds the starter part from these same packages.
      if (stored.status === 'ok' && stored.version >= COLLECTION_VERSION) {
        writeStoredCollection(withCorePackages(stored.owned, unlocked));
        reloadCollection();
      }
      writeCoreAccess({ version: 1, starterFaction: 'kingdom', unlocked });
      result.coreAccess = 'legacy';
      result.packagesGranted = unlocked;
      track('core_package_unlocked', { faction: unlocked.join(','), source: 'launch-set-migration' });
    } else {
      writeCoreAccess({ version: 1, starterFaction: null, unlocked: [] });
      result.coreAccess = 'fresh';
    }
  }

  const moonfallPacks = readLegacyMoonfallPacksOpened();
  if (moonfallPacks > 0) recordLegacyMoonfallPacks(moonfallPacks);
  clearLegacyMoonfallBox();
  result.moonfallPacks = moonfallPacks;
  return result;
}
