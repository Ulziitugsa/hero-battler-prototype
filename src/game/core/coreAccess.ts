import { track } from '../../analytics/track';
import type { StarterFaction } from '../cards/starterDecks.js';
import { CORE_FACTIONS, corePackage, withCorePackages } from './corePackages.js';

// Which Core packages an account has (corePackages.ts), and which faction it started with.
//   - A new account picks its starter faction once (StarterFactionPick); until then it holds the Kingdom package
//     provisionally (the collection always has a playable deck), which the pick replaces.
//   - The other two packages unlock on the first clear of the first Campaign stages, in Kingdom -> Undead -> Infernal
//     order (skipping the starter): CORE_UNLOCK_NODES.
//   - A save from before the launch set started with the Kingdom starter: save/launchSetMigration.ts records it as a
//     Kingdom start and grants every package its progress already earned.
// Granting goes through the collection (collection.ts), raising counts only.

export const CORE_ACCESS_STORAGE_KEY = 'moonwater:coreAccess:v1';

/** The Campaign stages whose first clear unlocks the next Core package (the second, then the third). */
export const CORE_UNLOCK_NODES: readonly string[] = ['battle-broken-palisade', 'battle-ford-of-ash'];

export interface CoreAccess {
  version: 1;
  /** Null until a new account picks (the Kingdom package is held provisionally meanwhile). */
  starterFaction: StarterFaction | null;
  /** Packages owned, in the order they were granted. */
  unlocked: StarterFaction[];
}

let snapshot: CoreAccess | null = null;

const isFaction = (f: unknown): f is StarterFaction => typeof f === 'string' && (CORE_FACTIONS as readonly string[]).includes(f);

/** The stored record, or null when this save has none yet (a new account before its first launch, or an old save). */
export function readCoreAccess(): CoreAccess | null {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(CORE_ACCESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CoreAccess>;
    if (parsed?.version !== 1) return null;
    const unlocked = Array.isArray(parsed.unlocked) ? [...new Set(parsed.unlocked.filter(isFaction))] : [];
    snapshot = { version: 1, starterFaction: isFaction(parsed.starterFaction) ? parsed.starterFaction : null, unlocked };
    return snapshot;
  } catch {
    return null;
  }
}

/** The current record; a save without one reads as a new account that has not picked yet. */
export function getCoreAccess(): CoreAccess {
  return readCoreAccess() ?? { version: 1, starterFaction: null, unlocked: [] };
}

export function writeCoreAccess(access: CoreAccess): CoreAccess {
  snapshot = { version: 1, starterFaction: access.starterFaction, unlocked: [...new Set(access.unlocked)] };
  try {
    localStorage.setItem(CORE_ACCESS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* best effort */
  }
  return snapshot;
}

export function reloadCoreAccess(): void {
  snapshot = null;
}

/** Dev/playtest full wipe (game/devReset.ts). */
export function clearCoreAccess(): void {
  snapshot = null;
  try {
    localStorage.removeItem(CORE_ACCESS_STORAGE_KEY);
  } catch {
    /* best effort */
  }
}

/** True for a new account that has not picked its starter faction yet. */
export function needsStarterPick(access: CoreAccess = getCoreAccess()): boolean {
  return access.starterFaction === null;
}

/**
 * The Core packages the collection should hold right now: the unlocked ones, or the provisional Kingdom package while a
 * new account has not picked yet. (collection/starterCollection.ts builds a fresh collection from these.)
 */
export function heldCoreFactions(access: CoreAccess = getCoreAccess()): StarterFaction[] {
  return access.starterFaction === null && access.unlocked.length === 0 ? ['kingdom'] : access.unlocked;
}

/** The order the other two packages unlock in, after the starter. */
export function coreUnlockOrder(starter: StarterFaction): StarterFaction[] {
  return CORE_FACTIONS.filter((f) => f !== starter);
}

/** The package the first clear of `nodeId` unlocks for this account, or null. */
export function coreUnlockForNode(nodeId: string, access: CoreAccess = getCoreAccess()): StarterFaction | null {
  const index = CORE_UNLOCK_NODES.indexOf(nodeId);
  if (index < 0 || access.starterFaction === null) return null;
  const faction = coreUnlockOrder(access.starterFaction)[index];
  return faction && !access.unlocked.includes(faction) ? faction : null;
}

/** Pure: the collection after a new account picks `faction` (the provisional Kingdom package is swapped for it). */
export function collectionAfterPick(owned: Readonly<Record<string, number>>, faction: StarterFaction): Record<string, number> {
  if (faction === 'kingdom') return withCorePackages(owned, ['kingdom']);
  const next: Record<string, number> = { ...owned };
  for (const [id, n] of Object.entries(corePackage('kingdom'))) {
    const left = (next[id] ?? 0) - n;
    if (left > 0) next[id] = left;
    else delete next[id];
  }
  return withCorePackages(next, [faction]);
}

export interface CoreGrantPort {
  getOwned: () => Readonly<Record<string, number>>;
  setOwned: (owned: Record<string, number>) => void;
}

/** A new account picks its starter faction: it receives that package (in place of the provisional Kingdom one). */
export function chooseStarterFaction(faction: StarterFaction, port: CoreGrantPort): CoreAccess {
  const access = getCoreAccess();
  if (access.starterFaction !== null) return access;
  port.setOwned(collectionAfterPick(port.getOwned(), faction));
  track('starter_faction_chosen', { faction });
  return writeCoreAccess({ version: 1, starterFaction: faction, unlocked: [faction] });
}

/** Grants a Core package (raise-only) and records it. Does nothing when it is already unlocked. */
export function unlockCorePackage(faction: StarterFaction, port: CoreGrantPort, source: string): CoreAccess {
  const access = getCoreAccess();
  if (access.unlocked.includes(faction)) return access;
  port.setOwned(withCorePackages(port.getOwned(), [faction]));
  track('core_package_unlocked', { faction, source });
  return writeCoreAccess({ ...access, unlocked: [...access.unlocked, faction] });
}
