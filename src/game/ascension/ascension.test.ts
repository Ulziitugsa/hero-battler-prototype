import { beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent, GameState, HeroInstance, PlayerState } from '../types';
import { getCard } from '../cards';
import { STARTER_DECKS } from '../cards/starterDecks';
import { getCollection, getOwnedCount, grantCard, reloadCollection, removeCard, setCollection } from '../collection/collection';
import { upsertSavedDeck } from '../engine/localDecks';
import { migrateToRealCollection } from '../campaign/collectionMigration';
import { recordBattleResult } from '../campaign/progress';
import { getCardAcquisitionSources } from '../collection/acquisition';
import { isStarterDeckUnlocked } from '../collection/starterUnlock';
import { CHAPTER_1 } from '../campaign/chapter1';
import type { MatchStats } from '../engine/stats';
import { beginRound, resolveRound } from '../engine/resolveRound';
import { replayUpTo } from '../engine/replay';
import { ASCENSION_DUPLICATE_COST, MAX_ASCENSION_RANK } from './config';
import { CARD_ASCENSIONS, getCardAscension, supportsAscension } from './definitions';
import { effectiveAbilities, getEffectiveCardDefinition } from './effective';
import { MASTERY_RETIRED_REASON, ascendCard } from './ascend';
import { hasMasteryPath } from './path';
import { getGold, reloadEconomy, setGold } from '../economy/economy';
import { ASCENSION_STORAGE_KEY, ascensionRanksFor, getAscensionRank, getAscensionState, getDuplicatesSpent, recordAscension, reloadAscension, resetAscension, sanitizeAscension, setAscensionRank } from './store';
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
  reloadEconomy();
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
    historicalAdvance('kng-royal-guard', 1, 1);
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
    // clamped to Mastery V; every collectible card has the path now; unknown ids and rank-0 entries dropped
    expect(s.cards).toEqual({ 'kng-royal-guard': { rank: MAX_ASCENSION_RANK, duplicatesSpent: 0 }, 'kng-common-knight': { rank: 2, duplicatesSpent: 0 } });
    expect(sanitizeAscension(null).cards).toEqual({});
  });
  it('a dev rank set is clamped to the card\'s path', () => {
    setAscensionRank('und-bone-soldier', 50);
    expect(getAscensionRank('und-bone-soldier')).toBe(4); // Mastery V
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

// ---- advancement is retired ---------------------------------------------------------------------

/** What an advance made before combat Card Mastery was retired left in the save: copies spent, rank and spend recorded. */
function historicalAdvance(cardId: string, toRank: number, spent: number) {
  removeCard(cardId, spent);
  recordAscension(cardId, toRank, spent);
}

describe('Card Mastery advancement is retired', () => {
  it('13 and 14. no advance can spend Gold or copies, at any stage, whatever the player owns', () => {
    setCollection({ ...getCollection(), 'und-bone-soldier': 11, 'kng-royal-guard': 6, 'spl-power-surge': 5 });
    setGold(10_000);
    localStorage.removeItem(ASCENSION_STORAGE_KEY);
    for (const id of ['und-bone-soldier', 'kng-royal-guard', 'spl-power-surge']) {
      for (let i = 0; i < 5; i++) expect(ascendCard(id), id).toEqual({ ok: false, cardId: id, newRank: 0, spent: 0, goldSpent: 0, reason: MASTERY_RETIRED_REASON });
    }
    expect(getGold()).toBe(10_000);
    expect(getOwnedCount('und-bone-soldier')).toBe(11);
    expect(getOwnedCount('kng-royal-guard')).toBe(6);
    expect(getAscensionState().cards).toEqual({});
    expect(localStorage.getItem(ASCENSION_STORAGE_KEY)).toBeNull(); // the store was never written
  });
  it('a card with historical progress cannot go further either, and keeps its record untouched', () => {
    setCollection({ ...getCollection(), 'und-bone-soldier': 9 });
    historicalAdvance('und-bone-soldier', 2, 3);
    setGold(5_000);
    expect(ascendCard('und-bone-soldier')).toMatchObject({ ok: false, newRank: 2, spent: 0, goldSpent: 0 });
    expect(getAscensionRank('und-bone-soldier')).toBe(2);
    expect(getDuplicatesSpent('und-bone-soldier')).toBe(3);
    expect(getOwnedCount('und-bone-soldier')).toBe(6);
    expect(getGold()).toBe(5_000);
  });
  it('fires no progression analytics', () => {
    setCollection({ ...getCollection(), 'und-bone-soldier': 5 });
    ascendCard('und-bone-soldier');
    for (const name of ['duplicate_progress_applied', 'hero_ascended', 'hero_star_changed', 'roster_power_changed']) expect(getQueuedEvents().filter((e) => e.name === name), name).toHaveLength(0);
  });
  it('the historical ladder stays documented (for a future Prestige study), and charges nothing', () => {
    expect(ASCENSION_DUPLICATE_COST).toEqual([1, 2, 3, 4]);
    expect(MAX_ASCENSION_RANK).toBe(4);
    // The legacy effect paths (historical resolver only) keep their three authored ranks.
    expect(CARD_ASCENSIONS.every((c) => c.ranks.length === 3)).toBe(true);
  });
  it('every collectible card can carry a historical record; a non-roster id cannot', () => {
    expect(supportsAscension('und-mira')).toBe(false); // no legacy effect path...
    expect(hasMasteryPath('und-mira')).toBe(true); // ...but its record is kept
    expect(hasMasteryPath('spl-power-surge')).toBe(true);
    expect(hasMasteryPath('wld-forest-wolf')).toBe(false); // not a collectible card
  });
});

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
  it('available copies are just the collection quantity: a historical spend is subtracted exactly once', () => {
    setCollection({ 'und-bone-soldier': 6 });
    historicalAdvance('und-bone-soldier', 1, 1);
    historicalAdvance('und-bone-soldier', 2, 2);
    expect(getOwnedCount('und-bone-soldier')).toBe(3);
    expect(getDuplicatesSpent('und-bone-soldier')).toBe(3);
    // the spend record never feeds back into availability, at rest or after reloads
    reloadCollection();
    reloadAscension();
    expect(getOwnedCount('und-bone-soldier')).toBe(3);
    expect(getDuplicatesSpent('und-bone-soldier')).toBe(3);
  });
  it('a reload or a migration run cannot double-spend or refund', () => {
    setCollection({ 'und-bone-soldier': 4 });
    historicalAdvance('und-bone-soldier', 1, 1);
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
    historicalAdvance('und-bone-soldier', 1, 1); // spent 1 before the retirement -> owns 2
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
    historicalAdvance('und-bone-soldier', 1, 1);
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
  it('Toll of the Ford deliberately awards a spare Royal Guard, and Fortify is a Crusade Box card', () => {
    const toll = CHAPTER_1.nodes.find((n) => n.id === 'challenge-toll-of-the-ford');
    expect(toll?.encounter?.firstClearReward).toMatchObject({ cardId: 'kng-royal-guard', label: 'Royal Guard' });
    expect(getCardAscension('kng-royal-guard')).toBeDefined(); // a legacy effect path (historical resolver only)
    expect(getCardAcquisitionSources('spl-fortify').map((s) => s.kind)).toEqual(['box']);
  });
  it('a retired advance can never re-lock a starter or break a saved deck: nothing is ever spent', () => {
    const owned: Record<string, number> = { ...getCollection() };
    for (const id of STARTER_DECKS.undead) owned[id] = STARTER_DECKS.undead.filter((x) => x === id).length;
    setCollection({ ...owned, 'und-bone-soldier': 3 });
    const deck = [...STARTER_DECKS.kingdom.slice(0, 13), 'und-bone-soldier', 'und-bone-soldier'];
    upsertSavedDeck({ id: 'deck-live', name: 'Live', faction: 'kingdom', cardIds: deck });
    expect(ascendCard('und-bone-soldier').ok).toBe(false);
    expect(getOwnedCount('und-bone-soldier')).toBe(3);
    expect(isStarterDeckUnlocked('starter-undead')).toBe(true);
  });
});
