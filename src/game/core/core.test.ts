import { beforeEach, describe, expect, it } from 'vitest';
import { getCard } from '../cards';
import { LAUNCH_ROSTER } from '../cards/launchRoster';
import { getCollection, reloadCollection, setCollection } from '../collection/collection';
import { buildStarterCollection } from '../collection/starterCollection';
import { isStarterDeckUnlocked } from '../collection/starterUnlock';
import { CORE_FACTIONS, coreCardIds, corePackage, isCoreCard, withCorePackages } from './corePackages';
import { chooseStarterFaction, collectionAfterPick, coreUnlockForNode, getCoreAccess, heldCoreFactions, needsStarterPick, reloadCoreAccess, unlockCorePackage, writeCoreAccess } from './coreAccess';

// Core (docs/BOX-ARCHITECTURE.md): 30 free cards in three faction packages of 10. A new account picks one; the other
// two unlock in the first Campaign stages. Packages only ever raise counts.

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  reloadCoreAccess();
  reloadCollection();
});

const port = { getOwned: getCollection, setOwned: setCollection };

describe('Core packages', () => {
  it('are 30 cards, 10 per faction, and Paladin, Vharos and Infernal Lord are Core', () => {
    expect(LAUNCH_ROSTER.filter((c) => c.source === 'core')).toHaveLength(30);
    for (const faction of CORE_FACTIONS) {
      expect(coreCardIds(faction)).toHaveLength(10);
      for (const id of coreCardIds(faction)) expect(getCard(id).faction).toBe(faction);
    }
    for (const id of ['kng-paladin', 'und-vharos', 'inf-infernal-lord']) expect(isCoreCard(id), id).toBe(true);
  });
  it('hold every card at its deck limit: 2 copies, a Legendary 1', () => {
    for (const faction of CORE_FACTIONS) for (const [id, n] of Object.entries(corePackage(faction))) expect(n, id).toBe(getCard(id).rarity === 'legendary' ? 1 : 2);
  });
  it('granting is raise-only: never lowers, never adds on top', () => {
    const owned = withCorePackages({ 'kng-archer': 5, 'kng-paladin': 0, 'und-mira': 1 }, ['kingdom']);
    expect(owned['kng-archer']).toBe(5);
    expect(owned['kng-paladin']).toBe(1);
    expect(owned['und-mira']).toBe(1);
    expect(withCorePackages(owned, ['kingdom'])).toEqual(owned);
  });
});

describe('the starter faction pick', () => {
  it('a new account holds the Kingdom package provisionally until it picks', () => {
    expect(needsStarterPick()).toBe(true);
    expect(heldCoreFactions()).toEqual(['kingdom']);
    expect(buildStarterCollection()).toEqual(corePackage('kingdom'));
  });
  for (const faction of CORE_FACTIONS) {
    it(`picking ${faction} gives exactly that package and its starter deck`, () => {
      getCollection();
      chooseStarterFaction(faction, port);
      expect(getCollection()).toEqual(corePackage(faction));
      expect(getCoreAccess()).toEqual({ version: 1, starterFaction: faction, unlocked: [faction] });
      expect(isStarterDeckUnlocked(`starter-${faction}`)).toBe(true);
      for (const other of CORE_FACTIONS.filter((f) => f !== faction)) expect(isStarterDeckUnlocked(`starter-${other}`)).toBe(false);
      expect(needsStarterPick()).toBe(false);
    });
  }
  it('the swap keeps cards earned before the pick and never removes more than the provisional package', () => {
    expect(collectionAfterPick({ ...corePackage('kingdom'), 'kng-archer': 3, 'und-mira': 1 }, 'undead')).toEqual({ ...corePackage('undead'), 'kng-archer': 1, 'und-mira': 1 });
  });
  it('picks only once', () => {
    chooseStarterFaction('undead', port);
    chooseStarterFaction('infernal', port);
    expect(getCoreAccess().starterFaction).toBe('undead');
    expect(getCollection()['inf-infernal-lord']).toBeUndefined();
  });
  it('survives a reload', () => {
    chooseStarterFaction('infernal', port);
    reloadCoreAccess();
    expect(getCoreAccess()).toMatchObject({ starterFaction: 'infernal', unlocked: ['infernal'] });
  });
});

describe('Campaign unlocks', () => {
  it('the first two unlock stages give the other two packages, in Kingdom, Undead, Infernal order skipping the starter', () => {
    writeCoreAccess({ version: 1, starterFaction: 'undead', unlocked: ['undead'] });
    expect(coreUnlockForNode('battle-broken-palisade')).toBe('kingdom');
    expect(coreUnlockForNode('battle-ford-of-ash')).toBe('infernal');
    expect(coreUnlockForNode('battle-dust-crossing')).toBeNull();
  });
  it('an unlocked package is granted once and recorded', () => {
    writeCoreAccess({ version: 1, starterFaction: 'kingdom', unlocked: ['kingdom'] });
    setCollection(corePackage('kingdom'));
    unlockCorePackage('undead', port, 'test');
    expect(getCollection()).toEqual({ ...corePackage('kingdom'), ...corePackage('undead') });
    unlockCorePackage('undead', port, 'test');
    expect(getCoreAccess().unlocked).toEqual(['kingdom', 'undead']);
    expect(coreUnlockForNode('battle-broken-palisade')).toBeNull();
  });
});
