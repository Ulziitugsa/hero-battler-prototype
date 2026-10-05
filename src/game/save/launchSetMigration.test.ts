import { beforeEach, describe, expect, it } from 'vitest';
import { COLLECTION_STORAGE_KEY } from '../collection/persistence';
import { getCollection, reloadCollection } from '../collection/collection';
import { getEconomy, reloadEconomy } from '../economy/economy';
import { ECONOMY_STORAGE_KEY } from '../economy/persistence';
import { migrateToRealCollection } from '../campaign/collectionMigration';
import { corePackage } from '../core/corePackages';
import { CORE_ACCESS_STORAGE_KEY, getCoreAccess, needsStarterPick, reloadCoreAccess } from '../core/coreAccess';
import { ARCHETYPE_BOX_IDS, boxSize } from '../box/archetypeBoxes';
import { boxCardsRemaining, getBoxesState, reloadArchetypeBoxes } from '../box/boxPool';
import { LEGACY_MOONFALL_STORAGE_KEYS } from '../box/legacyMoonfall';
import { STRUCTURE_DECK_STORAGE_KEY, resetStructureDecks, structureDeckPurchases } from '../structureDecks/store';
import { legacyUnlockedPackages, runLaunchSetMigration } from './launchSetMigration';

// The launch-set save migration: old saves keep everything they own, Moonfall retires cleanly, nothing is converted.

let values: Map<string, string>;
beforeEach(() => {
  values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  reloadCoreAccess();
  reloadCollection();
  reloadEconomy();
  reloadArchetypeBoxes();
});

/** Startup order, as in main.tsx. */
function launch() {
  const result = runLaunchSetMigration();
  migrateToRealCollection();
  reloadCollection();
  return result;
}
const progress = (cleared: string[]) => localStorage.setItem('skyloom:campaignProgress', JSON.stringify({ clearedNodes: cleared, objectivesMet: {}, firstClearClaimed: cleared }));
const storedCollection = (owned: Record<string, number>, version = 3) => localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify({ version, owned }));

describe('a new account', () => {
  it('is recorded as not picked yet and starts on the provisional Kingdom package', () => {
    expect(launch()).toMatchObject({ coreAccess: 'fresh', packagesGranted: [] });
    expect(needsStarterPick()).toBe(true);
    expect(getCollection()).toEqual(corePackage('kingdom'));
    // a second launch (the collection now exists) does not turn it into a legacy save
    reloadCoreAccess();
    expect(launch().coreAccess).toBeNull();
    expect(needsStarterPick()).toBe(true);
  });
});

describe('a save from before the launch set', () => {
  it('becomes a Kingdom start with no pick, keeps every card it owns and gains the Kingdom package raise-only', () => {
    storedCollection({ 'kng-archer': 4, 'kng-common-knight': 1, 'und-mira': 2, 'spl-fireball': 3 });
    expect(launch()).toMatchObject({ coreAccess: 'legacy', packagesGranted: ['kingdom'] });
    expect(getCoreAccess()).toEqual({ version: 1, starterFaction: 'kingdom', unlocked: ['kingdom'] });
    expect(needsStarterPick()).toBe(false);
    const owned = getCollection();
    expect(owned['kng-archer']).toBe(4); // never lowered
    expect(owned['kng-common-knight']).toBe(2); // raised to the package count
    expect(owned['und-mira']).toBe(2);
    expect(owned['spl-fireball']).toBe(3);
    expect(owned['kng-paladin']).toBe(1);
  });
  it('gets the packages its cleared unlock stages earned, once', () => {
    progress(['story-road-home', 'battle-broken-palisade', 'battle-dust-crossing', 'battle-ford-of-ash']);
    storedCollection({ 'und-bone-soldier': 3 });
    expect(launch().packagesGranted).toEqual(['kingdom', 'undead', 'infernal']);
    const owned = getCollection();
    for (const f of ['kingdom', 'undead', 'infernal'] as const) for (const [id, n] of Object.entries(corePackage(f))) expect(owned[id], id).toBeGreaterThanOrEqual(n);
    expect(owned['und-bone-soldier']).toBe(3); // not 3 + 2: no duplicated ownership
    const before = JSON.stringify(getCollection());
    reloadCoreAccess();
    launch(); // every later launch is a no-op
    expect(JSON.stringify(getCollection())).toBe(before);
    expect(legacyUnlockedPackages(['battle-broken-palisade'])).toEqual(['kingdom', 'undead']);
  });
  it('an older-version collection is still topped up with its Campaign rewards, on top of the packages', () => {
    progress(['battle-broken-palisade']);
    storedCollection({ 'und-bone-soldier': 1 }, 1);
    launch();
    expect(getCollection()['und-bone-soldier']).toBe(3);
    expect(getCollection()['und-vharos']).toBe(1);
  });
  it('retires the Moonfall Box: its pool is deleted, its opened count recorded, every archetype Box starts full', () => {
    storedCollection({ 'kng-archer': 2 });
    localStorage.setItem(LEGACY_MOONFALL_STORAGE_KEYS[0], JSON.stringify({ version: 1, openedPacks: 12, randomState: 9, remaining: { 'kng-paladin': 3 }, resetCount: 1 }));
    localStorage.setItem(LEGACY_MOONFALL_STORAGE_KEYS[1], JSON.stringify({ version: 1, openedPacks: 2, randomState: 9, remaining: {} }));
    expect(launch().moonfallPacks).toBe(13);
    for (const key of LEGACY_MOONFALL_STORAGE_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(getBoxesState().legacyMoonfallPacksOpened).toBe(13);
    for (const id of ARCHETYPE_BOX_IDS) expect(boxCardsRemaining(id)).toBe(boxSize(id));
  });
  it('keeps Gems, Gold and Pack Tickets exactly (no conversion) and Structure Deck purchases', () => {
    storedCollection({ 'kng-archer': 2 });
    localStorage.setItem(ECONOMY_STORAGE_KEY, JSON.stringify({ version: 5, gems: 321, gold: 77, tickets: 6, grants: [], summon: { pity: {}, history: [] } }));
    resetStructureDecks(); // drops the in-memory snapshot
    localStorage.setItem(STRUCTURE_DECK_STORAGE_KEY, JSON.stringify({ version: 1, purchased: { 'graveborn-rising': 1 } }));
    reloadEconomy();
    launch();
    expect(getEconomy()).toMatchObject({ gems: 321, gold: 77, tickets: 6 });
    expect(structureDeckPurchases('graveborn-rising')).toBe(1);
  });
  it('a corrupt Core record is not mistaken for a pick: it is rebuilt', () => {
    localStorage.setItem(CORE_ACCESS_STORAGE_KEY, '{not json');
    storedCollection({ 'kng-archer': 2 });
    expect(launch().coreAccess).toBe('legacy');
  });
});
