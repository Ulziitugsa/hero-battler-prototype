import { beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent, GameState, HeroInstance, PlayerState } from '../types';
import { getCard } from '../cards';
import { STARTER_DECKS } from '../cards/starterDecks';
import { getCollection, getOwnedCount, grantCard, reloadCollection, resetCollection, setCollection } from '../collection/collection';
import { upsertSavedDeck } from '../engine/localDecks';
import { migrateToRealCollection } from '../campaign/collectionMigration';
import { recordBattleResult } from '../campaign/progress';
import { FUTURE_REGION_CARDS, getCardAcquisitionSources } from '../collection/acquisition';
import { isStarterDeckUnlocked } from '../collection/starterUnlock';
import { CHAPTER_1 } from '../campaign/chapter1';
import type { MatchStats } from '../engine/stats';
import { beginRound, resolveRound } from '../engine/resolveRound';
import { replayUpTo } from '../engine/replay';
import { ASCENSION_DUPLICATE_COST, MAX_ASCENSION_RANK } from './config';
import { CARD_ASCENSIONS, getCardAscension, supportsAscension } from './definitions';
import { effectiveAbilities, getEffectiveCardDefinition } from './effective';
import { ascendCard, getAscensionStatus } from './ascend';
import { ASCENSION_STORAGE_KEY, ascensionRanksFor, getAscensionRank, getAscensionState, getDuplicatesSpent, reloadAscension, resetAscension, sanitizeAscension, setAscensionRank } from './store';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';

function installLocalStoragePolyfill() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  installLocalStoragePolyfill();
  reloadCollection();
  reloadAscension();
  clearQueuedEvents();
});

// ---- persistence -----------------------------------------------------------------------------

describe('Ascension persistence', () => {
  it('starts every card at Base', () => {
    expect(getAscensionRank('kng-royal-guard')).toBe(0);
    expect(getAscensionState().cards).toEqual({});
  });
  it('saves and reloads rank and duplicates spent', () => {
    grantCard('kng-royal-guard', 1); // owns 3
    expect(ascendCard('kng-royal-guard').ok).toBe(true);
    reloadAscension();
    expect(getAscensionRank('kng-royal-guard')).toBe(1);
    expect(getDuplicatesSpent('kng-royal-guard')).toBe(1);
    expect(JSON.parse(localStorage.getItem(ASCENSION_STORAGE_KEY)!)).toMatchObject({ version: 1, cards: { 'kng-royal-guard': { rank: 1, duplicatesSpent: 1 } } });
  });
  it('survives malformed storage and sanitises impossible values', () => {
    localStorage.setItem(ASCENSION_STORAGE_KEY, '{nope');
    reloadAscension();
    expect(getAscensionState().cards).toEqual({});
    const s = sanitizeAscension({ cards: { 'kng-royal-guard': { rank: 99, duplicatesSpent: -4 }, 'kng-common-knight': { rank: 2 }, ghost: { rank: 1 }, 'und-bone-soldier': { rank: 0 } } });
    expect(s.cards).toEqual({ 'kng-royal-guard': { rank: MAX_ASCENSION_RANK, duplicatesSpent: 0 } }); // clamped; unsupported / unknown / rank-0 dropped
    expect(sanitizeAscension(null).cards).toEqual({});
  });
  it('a dev rank set is clamped to the card\'s path', () => {
    setAscensionRank('und-bone-soldier', 50);
    expect(getAscensionRank('und-bone-soldier')).toBe(3);
    setAscensionRank('und-bone-soldier', 0);
    expect(getAscensionRank('und-bone-soldier')).toBe(0);
    resetAscension();
    expect(getAscensionState().cards).toEqual({});
  });
  it('migrates cleanly: with no Ascension state everything is Base and no copies are touched', () => {
    const before = getCollection();
    expect(ascensionRanksFor(['kng-royal-guard', 'und-bone-soldier'])).toEqual({});
    expect(getCollection()).toBe(before);
  });
});

// ---- eligibility and spending ----------------------------------------------------------------

describe('Ascension eligibility and spending', () => {
  it('costs are a flat, centralised curve of 1 / 2 / 3 duplicates', () => {
    expect(ASCENSION_DUPLICATE_COST).toEqual([1, 2, 3]);
    expect(CARD_ASCENSIONS.every((c) => c.ranks.length === MAX_ASCENSION_RANK)).toBe(true);
  });
  it('a card without an Ascension path is unsupported; a missing one is not owned', () => {
    expect(getAscensionStatus('kng-common-knight')).toMatchObject({ supported: false, canAscend: false, blocked: 'unsupported', reason: 'Ascension coming later.' });
    expect(supportsAscension('und-mira')).toBe(false);
    expect(getAscensionStatus('und-bone-soldier')).toMatchObject({ blocked: 'not-owned', canAscend: false });
  });
  it('one copy cannot Ascend (the last usable copy is never spent)', () => {
    setCollection({ 'und-bone-soldier': 1 });
    const s = getAscensionStatus('und-bone-soldier');
    expect(s).toMatchObject({ canAscend: false, blocked: 'no-spare', spare: 0, cost: 1 });
    expect(ascendCard('und-bone-soldier')).toMatchObject({ ok: false, spent: 0 });
    expect(getOwnedCount('und-bone-soldier')).toBe(1);
  });
  it('two copies (no deck using them) can spend one duplicate and keep one', () => {
    setCollection({ 'und-bone-soldier': 2 });
    expect(getAscensionStatus('und-bone-soldier')).toMatchObject({ canAscend: true, spare: 1, nextRank: 1, cost: 1 });
    const r = ascendCard('und-bone-soldier');
    expect(r).toMatchObject({ ok: true, newRank: 1, spent: 1 });
    expect(getOwnedCount('und-bone-soldier')).toBe(1);
    expect(getAscensionRank('und-bone-soldier')).toBe(1);
  });
  it('insufficient duplicates block the next rank with a clear reason', () => {
    setCollection({ 'und-bone-soldier': 2 });
    ascendCard('und-bone-soldier'); // -> rank 1, owns 1
    grantCard('und-bone-soldier', 2); // owns 3, rank II costs 2 -> keeps 1: allowed
    expect(getAscensionStatus('und-bone-soldier').canAscend).toBe(true);
    removeOne('und-bone-soldier'); // owns 2, rank II needs 2 spare
    const s = getAscensionStatus('und-bone-soldier');
    expect(s).toMatchObject({ canAscend: false, blocked: 'no-spare', cost: 2 });
    expect(s.reason).toMatch(/spare cop/);
  });
  it('spends the correct cost per rank and blocks at max rank', () => {
    setCollection({ 'und-bone-soldier': 1 + 1 + 2 + 3 }); // enough for all three ranks
    expect(ascendCard('und-bone-soldier')).toMatchObject({ ok: true, newRank: 1, spent: 1 });
    expect(ascendCard('und-bone-soldier')).toMatchObject({ ok: true, newRank: 2, spent: 2 });
    expect(ascendCard('und-bone-soldier')).toMatchObject({ ok: true, newRank: 3, spent: 3 });
    expect(getOwnedCount('und-bone-soldier')).toBe(1); // one usable copy always remains
    expect(getDuplicatesSpent('und-bone-soldier')).toBe(6);
    const max = getAscensionStatus('und-bone-soldier');
    expect(max).toMatchObject({ canAscend: false, blocked: 'max-rank', nextRank: null, cost: null });
    expect(ascendCard('und-bone-soldier').ok).toBe(false);
    expect(getOwnedCount('und-bone-soldier')).toBe(1); // never negative, never below one
  });
  it('protects a usable deck: 2 copies both in the Kingdom starter cannot be spent', () => {
    // fresh profile: Royal Guard x2, Kingdom starter uses both
    const s = getAscensionStatus('kng-royal-guard');
    expect(s).toMatchObject({ owned: 2, canAscend: false, blocked: 'in-use', spare: 0, blockingDeck: 'Kingdom Starter' });
    expect(s.reason).toContain('Kingdom Starter uses 2');
    expect(ascendCard('kng-royal-guard').ok).toBe(false);
    expect(getOwnedCount('kng-royal-guard')).toBe(2); // nothing spent, decks untouched
  });
  it('with a spare third copy, Ascending leaves every deck legal', () => {
    grantCard('kng-royal-guard', 1);
    expect(getAscensionStatus('kng-royal-guard')).toMatchObject({ owned: 3, canAscend: true, spare: 1 });
    expect(ascendCard('kng-royal-guard').ok).toBe(true);
    expect(getOwnedCount('kng-royal-guard')).toBe(2);
    expect(STARTER_DECKS.kingdom.filter((id) => id === 'kng-royal-guard')).toHaveLength(2);
    const s = getAscensionStatus('kng-royal-guard');
    expect(s.canAscend).toBe(false); // rank II costs 2: nothing spare left, and the starter still needs both
  });
  it('a saved deck using the copies protects them too, and an invalid deck does not', () => {
    setCollection({ 'und-bone-soldier': 2 });
    upsertSavedDeck({ id: 'deck-x', name: 'Draft', faction: 'undead', cardIds: ['und-bone-soldier', 'und-bone-soldier'] });
    expect(getAscensionStatus('und-bone-soldier').canAscend).toBe(true); // an incomplete draft is not "in use"
  });
  it('a locked starter deck does not count as in use', () => {
    // Undead starter is locked on a fresh profile: 3 Bone Soldiers are all spendable down to one
    setCollection({ ...getCollection(), 'und-bone-soldier': 3 });
    expect(getAscensionStatus('und-bone-soldier')).toMatchObject({ spare: 2, canAscend: true });
  });
  it('a Campaign duplicate makes Ascension available (no automatic Ascension)', () => {
    resetCollection();
    expect(getAscensionStatus('kng-royal-guard').canAscend).toBe(false);
    grantCard('kng-royal-guard', 1);
    expect(getAscensionStatus('kng-royal-guard').canAscend).toBe(true);
    expect(getAscensionRank('kng-royal-guard')).toBe(0); // still Base until the player chooses
  });
});

function removeOne(cardId: string) {
  setCollection({ ...getCollection(), [cardId]: getOwnedCount(cardId) - 1 });
}

// ---- effective card definitions --------------------------------------------------------------

describe('effective card definitions', () => {
  it('Base is the card, untouched, and never mutated by resolving ranks', () => {
    const base = getCard('kng-royal-guard').abilities;
    expect(effectiveAbilities('kng-royal-guard', 0)).toBe(base);
    const snapshot = JSON.stringify(base);
    effectiveAbilities('kng-royal-guard', 3);
    expect(JSON.stringify(getCard('kng-royal-guard').abilities)).toBe(snapshot);
    expect(getCard('kng-royal-guard').power).toBe(5); // no stat inflation in the definition
  });
  it('ranks are cumulative and clamp to the path', () => {
    const n = (rank: number) => effectiveAbilities('kng-royal-guard', rank).length;
    expect(n(0)).toBe(2);
    expect(n(1)).toBe(2); // replaces the passive
    expect(n(2)).toBe(3);
    expect(n(3)).toBe(4);
    expect(n(99)).toBe(4);
    expect(getEffectiveCardDefinition('kng-royal-guard', 2).abilities).toHaveLength(3);
    expect(getEffectiveCardDefinition('kng-royal-guard', 0)).toBe(getCard('kng-royal-guard'));
  });
  it('a card with no path is always its base', () => {
    expect(effectiveAbilities('kng-common-knight', 3)).toBe(getCard('kng-common-knight').abilities);
  });
  it('no Ascension path is a raw stat bump: every rank changes abilities, not Power', () => {
    for (const def of CARD_ASCENSIONS) for (const r of def.ranks) expect(r.modifiers.length).toBeGreaterThan(0);
    for (const def of CARD_ASCENSIONS) expect(getEffectiveCardDefinition(def.cardId, 3).power).toBe(getCard(def.cardId).power);
  });
  it('the first slice is six cards, two per faction', () => {
    const factions = CARD_ASCENSIONS.map((c) => getCard(c.cardId).faction);
    expect(CARD_ASCENSIONS).toHaveLength(6);
    for (const f of ['kingdom', 'undead', 'infernal']) expect(factions.filter((x) => x === f)).toHaveLength(2);
  });
});

// ---- engine ----------------------------------------------------------------------------------

function hero(cardId: string, power: number, id: string): HeroInstance {
  const card = getCard(cardId);
  return { instanceId: id, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power, tempPower: 0, shielded: false, silenced: false, usedThisRound: false };
}
function player(side: 'player' | 'enemy', o: Partial<PlayerState> = {}): PlayerState {
  return { side, hp: 20, deck: [], hand: [], graveyard: [], heroZones: { left: null, center: null, right: null }, spellZones: { left: null, center: null, right: null }, ...o };
}
function state(o: Partial<GameState> & { p?: Partial<PlayerState>; e?: Partial<PlayerState> } = {}): GameState {
  const { p, e, ...rest } = o;
  return { round: 1, rngState: 9, player: player('player', p), enemy: player('enemy', e), status: 'IN_PROGRESS', ...rest };
}
const asc = (cardId: string, rank: number) => ({ ascensions: { player: { [cardId]: rank } } });
const NO = { plays: [] };
const types = (events: GameEvent[], t: GameEvent['type']) => events.filter((e) => e.type === t);

describe('Ascension in the engine', () => {
  it('Royal Guard II: On Play shields adjacent allies; Base does not', () => {
    const board = { heroZones: { left: hero('kng-archer', 4, 'a'), center: null, right: hero('kng-archer', 4, 'b') } };
    const play = { plays: [{ handId: 'h1', cardId: 'kng-royal-guard', lane: 'center' as const }] };
    const hand = { hand: [{ handId: 'h1', cardId: 'kng-royal-guard' }], ...board };
    const base = resolveRound(state({ p: hand }), play, NO, 1);
    const ranked = resolveRound(state({ p: hand, ...asc('kng-royal-guard', 2) }), play, NO, 1);
    expect(types(base.events, 'SHIELD_GRANTED')).toHaveLength(0);
    expect(types(ranked.events, 'SHIELD_GRANTED')).toHaveLength(2);
    expect(ranked.nextState.ascensions).toEqual({ player: { 'kng-royal-guard': 2 } }); // carried through the round
  });
  it('Royal Guard III: adjacent allies get +1 Power before combat', () => {
    const board = { heroZones: { left: hero('kng-archer', 4, 'a'), center: null, right: null } };
    const play = { plays: [{ handId: 'h1', cardId: 'kng-royal-guard', lane: 'center' as const }] };
    const hand = { hand: [{ handId: 'h1', cardId: 'kng-royal-guard' }], ...board };
    const powerEvents = (ev: GameEvent[]) => ev.filter((e) => e.type === 'POWER_CHANGED' && e.side === 'player' && e.name === 'Kingdom Archer' && !e.permanent).length;
    expect(powerEvents(resolveRound(state({ p: hand }), play, NO, 1).events)).toBe(0);
    expect(powerEvents(resolveRound(state({ p: hand, ...asc('kng-royal-guard', 3) }), play, NO, 1).events)).toBe(2); // +1 then the round-end expiry
  });
  it('Royal Guard I: Spell immunity now holds with any ally, not just a Kingdom one', () => {
    const undeadAlly = hero('und-bone-soldier', 4, 'u');
    const setup = (o: Partial<GameState>) =>
      state({ p: { heroZones: { left: hero('kng-royal-guard', 5, 'rg'), center: undeadAlly, right: null } }, e: { hand: [{ handId: 'w', cardId: 'spl-weakness' }] }, ...o });
    const play = { plays: [{ handId: 'w', cardId: 'spl-weakness', lane: 'left' as const }] };
    const base = resolveRound(setup({}), NO, play, 1);
    const ranked = resolveRound(setup(asc('kng-royal-guard', 1)), NO, play, 1);
    expect(types(base.events, 'IMMUNITY_BLOCKED')).toHaveLength(0); // no other KINGDOM Hero: not immune
    expect(types(ranked.events, 'IMMUNITY_BLOCKED')).toHaveLength(1);
  });
  it('Bone Soldier II: On Play returns a weak Hero from the Graveyard, only with a small hand', () => {
    const play = { plays: [{ handId: 'h1', cardId: 'und-bone-soldier', lane: 'left' as const }] };
    const s = (o: Partial<GameState>) => state({ p: { hand: [{ handId: 'h1', cardId: 'und-bone-soldier' }], graveyard: ['und-cursed-warrior'] }, ...o });
    expect(resolveRound(s({}), play, NO, 1).nextState.player.hand).toEqual([]);
    const ranked = resolveRound(s(asc('und-bone-soldier', 2)), play, NO, 1);
    expect(ranked.nextState.player.hand.map((h) => h.cardId)).toEqual(['und-cursed-warrior']);
    expect(types(ranked.events, 'RETURNED_TO_HAND')).toHaveLength(1);
  });
  it('Bone Soldier I / III only apply their conditions', () => {
    const play = { plays: [{ handId: 'h1', cardId: 'und-bone-soldier', lane: 'left' as const }] };
    const gy = ['und-cursed-warrior', 'und-dark-priest'];
    const run = (rank: number, graveyard: string[]) =>
      resolveRound(state({ p: { hand: [{ handId: 'h1', cardId: 'und-bone-soldier' }], graveyard }, ...(rank ? asc('und-bone-soldier', rank) : {}) }), play, NO, 1).events.filter((e) => e.type === 'POWER_CHANGED' && !e.permanent && e.side === 'player').length;
    expect(run(0, gy)).toBeGreaterThan(0); // base +1/graveyard card
    expect(run(1, gy)).toBeGreaterThan(run(0, gy)); // 2 Undead in the Graveyard: an extra +1
    expect(run(1, ['spl-fireball'])).toBe(run(0, ['spl-fireball'])); // condition not met: same as Base
  });
  it('Grave Knight I: the once-per-round heal also fires on an ally death (shared once-per-round flag)', () => {
    const s = (o: Partial<GameState>) => state({ p: { heroZones: { left: hero('und-grave-knight', 4, 'gk'), center: hero('kng-common-knight', 1, 'weak'), right: null } }, e: { heroZones: { left: null, center: hero('kng-common-knight', 9, 'big'), right: null } }, ...o });
    const heals = (o: Partial<GameState>) => resolveRound(s(o), NO, NO, 1).events.filter((e) => e.type === 'HEAL').length;
    expect(heals({})).toBe(0);
    expect(heals(asc('und-grave-knight', 1))).toBe(1);
  });
  it('Hellhound I: extra damage when its lane is unopposed; II adds a direct-damage rider', () => {
    const s = (o: Partial<GameState>) => state({ p: { heroZones: { left: hero('inf-hellhound', 5, 'hh'), center: null, right: null } }, ...o });
    const dmg = (o: Partial<GameState>) => resolveRound(s(o), NO, NO, 1).events.filter((e) => e.type === 'DIRECT_DAMAGE' && e.side === 'enemy');
    expect(dmg({}).reduce((n, e) => n + (e as { amount: number }).amount, 0)).toBe(5);
    expect(dmg(asc('inf-hellhound', 1)).reduce((n, e) => n + (e as { amount: number }).amount, 0)).toBe(6);
    expect(dmg(asc('inf-hellhound', 2)).reduce((n, e) => n + (e as { amount: number }).amount, 0)).toBe(7);
  });
  it('Pit Fiend I: an enemy death deals 1 damage to the enemy player', () => {
    const s = (o: Partial<GameState>) => state({ p: { heroZones: { left: hero('inf-pit-fiend', 9, 'pf'), center: null, right: null } }, e: { heroZones: { left: hero('kng-common-knight', 2, 'k'), center: null, right: null } }, ...o });
    const hp = (o: Partial<GameState>) => resolveRound(s(o), NO, NO, 1).nextState.enemy.hp;
    expect(hp(asc('inf-pit-fiend', 1))).toBe(hp({}) - 1);
  });
  it('Ascension applies per side: an enemy does not inherit the player\'s ranks', () => {
    const s = state({ p: { heroZones: { left: null, center: null, right: null } }, e: { heroZones: { left: hero('inf-hellhound', 5, 'hh'), center: null, right: null } }, ...asc('inf-hellhound', 3) });
    const dmg = resolveRound(s, NO, NO, 1).events.filter((e) => e.type === 'DIRECT_DAMAGE' && e.side === 'player').reduce((n, e) => n + (e as { amount: number }).amount, 0);
    expect(dmg).toBe(5);
  });
  it('is deterministic: identical state + seed give identical events and state; replay reconstructs it', () => {
    const s = state({ p: { hand: [{ handId: 'h1', cardId: 'kng-royal-guard' }], heroZones: { left: hero('kng-archer', 4, 'a'), center: null, right: null } }, ...asc('kng-royal-guard', 3) });
    const play = { plays: [{ handId: 'h1', cardId: 'kng-royal-guard', lane: 'center' as const }] };
    const a = resolveRound(s, play, NO, 77);
    const b = resolveRound(s, play, NO, 77);
    expect(b).toEqual(a);
    const replayed = replayUpTo(s, a.events, a.events.length - 1);
    expect(replayed.player.heroZones.left?.shielded).toBe(a.nextState.player.heroZones.left?.shielded);
    expect(a.nextState.player.heroZones.center?.ascension).toBe(3); // the played Hero carries its rank for display
  });
  it('does not change beginRound or Base behaviour when no Ascension is set', () => {
    const s = state({ p: { deck: ['kng-archer'] } });
    expect(beginRound(s).nextState.ascensions).toBeUndefined();
  });
});

// ---- accounting, migration and starter safety --------------------------------------------------

describe('duplicate accounting', () => {
  it('available copies are just the collection quantity: spending is subtracted exactly once', () => {
    setCollection({ 'und-bone-soldier': 6 });
    ascendCard('und-bone-soldier'); // -1
    ascendCard('und-bone-soldier'); // -2
    expect(getOwnedCount('und-bone-soldier')).toBe(3);
    expect(getDuplicatesSpent('und-bone-soldier')).toBe(3);
    // the spend record never feeds back into availability, at rest or after reloads
    reloadCollection();
    reloadAscension();
    expect(getOwnedCount('und-bone-soldier')).toBe(3);
    expect(getAscensionStatus('und-bone-soldier')).toMatchObject({ owned: 3, spare: 2 });
  });
  it('a reload or a migration run cannot double-spend or refund', () => {
    setCollection({ 'und-bone-soldier': 4 });
    ascendCard('und-bone-soldier');
    const before = getOwnedCount('und-bone-soldier');
    for (let i = 0; i < 3; i++) {
      reloadCollection();
      reloadAscension();
      migrateToRealCollection(); // current version: a no-op
    }
    expect(getOwnedCount('und-bone-soldier')).toBe(before);
    expect(getAscensionRank('und-bone-soldier')).toBe(1);
  });
  it('a rebuilt collection nets out what was already spent instead of refunding it', () => {
    const stats = { roundsPlayed: 3, finalPlayerHp: 20 } as unknown as MatchStats;
    recordBattleResult('battle-broken-palisade', 'PLAYER_WIN', stats, [], 'kingdom'); // Bone Soldier x3
    expect(getOwnedCount('und-bone-soldier')).toBe(3);
    ascendCard('und-bone-soldier'); // spends 1 -> owns 2
    localStorage.removeItem('skyloom:collection'); // collection lost, Campaign + Ascension progress kept
    reloadCollection();
    migrateToRealCollection();
    expect(getOwnedCount('und-bone-soldier')).toBe(2); // 3 acquired - 1 spent, not 3
    migrateToRealCollection();
    expect(getOwnedCount('und-bone-soldier')).toBe(2);
  });
  it('an older-version top-up does not add copies back that Ascension spent', () => {
    const stats = { roundsPlayed: 3, finalPlayerHp: 20 } as unknown as MatchStats;
    recordBattleResult('battle-broken-palisade', 'PLAYER_WIN', stats, [], 'kingdom');
    ascendCard('und-bone-soldier');
    const raw = JSON.parse(localStorage.getItem('skyloom:collection')!);
    localStorage.setItem('skyloom:collection', JSON.stringify({ ...raw, version: 2 })); // pretend an older stamp
    reloadCollection();
    migrateToRealCollection();
    expect(getOwnedCount('und-bone-soldier')).toBe(2);
  });
});

describe('Ascension never touches base Power or accumulates it', () => {
  it('every Ascension Power change is temporary (this round only) and no path edits Power', () => {
    for (const def of CARD_ASCENSIONS) {
      for (const r of def.ranks) {
        for (const m of r.modifiers) {
          for (const a of m.ability.actions) {
            if (a.type === 'CHANGE_POWER' || a.type === 'CHANGE_POWER_BY_COUNT' || a.type === 'SET_POWER') expect(a.duration, `${def.cardId} rank ${r.rank}`).toBe('UNTIL_ROUND_END');
          }
        }
      }
      expect(getCard(def.cardId).power).toBe(getEffectiveCardDefinition(def.cardId, 3).power);
    }
    expect(getCard('kng-royal-guard').power).toBe(5);
    expect(getCard('und-grave-knight').power).toBe(4);
    expect(getCard('inf-hellhound').power).toBe(5);
    expect(getCard('inf-pit-fiend').power).toBe(5);
  });
  it('Power does not creep across repeated rounds with rank III active', () => {
    const rounds = (s: GameState, n: number) => {
      let cur = s;
      for (let i = 0; i < n; i++) cur = beginRound(resolveRound(cur, NO, NO, 100 + i).nextState).nextState;
      return cur;
    };
    // Hellhound III + Pit Fiend III together (Pack Hunter / Legion trigger every combat), enemy lanes empty
    const infernal = state({ p: { heroZones: { left: hero('inf-hellhound', 5, 'hh'), center: hero('inf-pit-fiend', 5, 'pf'), right: null } }, ascensions: { player: { 'inf-hellhound': 3, 'inf-pit-fiend': 3 } } });
    const afterInf = rounds(infernal, 4);
    expect(afterInf.player.heroZones.left?.power).toBe(5);
    expect(afterInf.player.heroZones.center?.power).toBe(5);
    expect(afterInf.player.heroZones.left?.tempPower).toBe(0);
    // Royal Guard III buffs an adjacent ally every combat - the ally must not keep the bonus
    const kingdom = state({ p: { heroZones: { left: hero('kng-archer', 4, 'a'), center: hero('kng-royal-guard', 5, 'rg'), right: null } }, ascensions: { player: { 'kng-royal-guard': 3 } } });
    const afterK = rounds(kingdom, 4);
    expect(afterK.player.heroZones.left?.power).toBe(4);
    expect(afterK.player.heroZones.center?.power).toBe(5);
    // Grave Knight III: +2 only while an enemy has died THIS round; with no deaths it stays at base
    const undead = state({ p: { heroZones: { left: hero('und-grave-knight', 4, 'gk'), center: null, right: null } }, ascensions: { player: { 'und-grave-knight': 3 } } });
    expect(rounds(undead, 4).player.heroZones.left?.power).toBe(4);
  });
});

describe('Toll of the Ford, Fortify and starter safety', () => {
  it('Toll of the Ford deliberately awards a spare Royal Guard, and Fortify is an explicit future-region source', () => {
    const toll = CHAPTER_1.nodes.find((n) => n.id === 'challenge-toll-of-the-ford');
    expect(toll?.encounter?.firstClearReward).toMatchObject({ cardId: 'kng-royal-guard', label: 'Royal Guard' });
    expect(getCardAscension('kng-royal-guard')).toBeDefined(); // the spare exists to be Ascended
    expect(FUTURE_REGION_CARDS['spl-fortify']).toBe('region-2');
    expect(getCardAcquisitionSources('spl-fortify')).toEqual([{ kind: 'summon', bannerId: 'royal-vanguard' }, { kind: 'future', regionId: 'region-2' }]);
  });
  it('Ascension cannot re-lock an unlocked starter deck', () => {
    // Undead starter unlocked with exactly the cards it needs: Bone Soldier x2 (needed) cannot be spent
    const owned: Record<string, number> = { ...getCollection() };
    for (const id of STARTER_DECKS.undead) owned[id] = STARTER_DECKS.undead.filter((x) => x === id).length;
    setCollection(owned);
    expect(getAscensionStatus('und-bone-soldier')).toMatchObject({ canAscend: false, blocked: 'in-use', blockingDeck: 'Undead Starter' });
    expect(ascendCard('und-bone-soldier').ok).toBe(false);
    expect(getOwnedCount('und-bone-soldier')).toBe(2);
    // with one spare it may spend that one - and the starter is still fully covered afterwards
    setCollection({ ...owned, 'und-bone-soldier': 3 });
    expect(ascendCard('und-bone-soldier').ok).toBe(true);
    expect(getOwnedCount('und-bone-soldier')).toBe(2);
    expect(isStarterDeckUnlocked('starter-undead')).toBe(true);
  });
  it('Ascension cannot invalidate a playable saved deck', () => {
    const deck = [...STARTER_DECKS.kingdom.slice(0, 13), 'und-bone-soldier', 'und-bone-soldier'];
    setCollection({ ...getCollection(), 'und-bone-soldier': 3 });
    upsertSavedDeck({ id: 'deck-live', name: 'Live', faction: 'kingdom', cardIds: deck });
    const s = getAscensionStatus('und-bone-soldier');
    expect(s.spare).toBe(1);
    expect(s.canAscend).toBe(true); // 3 owned, deck uses 2, cost 1 keeps 2
    ascendCard('und-bone-soldier');
    expect(getAscensionStatus('und-bone-soldier')).toMatchObject({ canAscend: false }); // rank II (cost 2) would break the deck
    expect(getOwnedCount('und-bone-soldier')).toBe(2);
  });
});

// ---- analytics (Commercial Prototype Phase 9) --------------------------------------------------

describe('ascendCard analytics', () => {
  it('fires duplicate_progress_applied and hero_ascended together, with matching rank properties', () => {
    setCollection({ 'und-bone-soldier': 2 });
    ascendCard('und-bone-soldier');
    const dup = getQueuedEvents().filter((e) => e.name === 'duplicate_progress_applied');
    const asc = getQueuedEvents().filter((e) => e.name === 'hero_ascended');
    expect(dup).toHaveLength(1);
    expect(asc).toHaveLength(1);
    expect(asc[0].properties).toMatchObject({ cardId: 'und-bone-soldier', rankBefore: 0, rankAfter: 1 });
  });
  it('fires hero_star_changed when the Ascension rank crosses a star boundary', () => {
    setCollection({ 'und-bone-soldier': 1 + 1 + 2 + 3 }); // enough for all three ranks
    ascendCard('und-bone-soldier'); // rank 0 -> 1: stars 0 -> 2
    const events = getQueuedEvents().filter((e) => e.name === 'hero_star_changed');
    expect(events).toHaveLength(1);
    expect(events[0].properties).toMatchObject({ cardId: 'und-bone-soldier', starsBefore: 0, starsAfter: 2 });
  });
  it('fires roster_power_changed with a positive delta', () => {
    setCollection({ 'und-bone-soldier': 2 });
    ascendCard('und-bone-soldier');
    const events = getQueuedEvents().filter((e) => e.name === 'roster_power_changed');
    expect(events).toHaveLength(1);
    expect(events[0].properties.source).toBe('ascension');
    expect(events[0].properties.delta as number).toBeGreaterThan(0);
  });
  it('a failed Ascend (blocked) fires none of these events', () => {
    setCollection({ 'und-bone-soldier': 1 }); // no spare - blocked
    ascendCard('und-bone-soldier');
    expect(getQueuedEvents().filter((e) => e.name === 'hero_ascended')).toHaveLength(0);
    expect(getQueuedEvents().filter((e) => e.name === 'hero_star_changed')).toHaveLength(0);
    expect(getQueuedEvents().filter((e) => e.name === 'roster_power_changed')).toHaveLength(0);
  });
});
