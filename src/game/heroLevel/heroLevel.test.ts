import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '../types';
import { getCard } from '../cards';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { resolveRound, beginRound } from '../engine/resolveRound';
import { createMatch } from '../engine/match';
import { grantCard, reloadCollection } from '../collection/collection';
import { reloadEconomy, setGold } from '../economy/economy';
import { setLevel as setAccountLevel, resetProgression } from '../progression/account';
import { MAX_HERO_LEVEL, battlePowerBonusForLevel, goldCostForLevelUp, heroLevelCapForAccount, MAX_BATTLE_POWER_BONUS } from './config';
import { getHeroLevel, getHeroLevelState, HERO_LEVEL_STORAGE_KEY, heroLevelsFor, reloadHeroLevels, resetHeroLevels, sanitizeHeroLevel, setHeroLevel } from './store';
import { getHeroLevelStatus, levelUpHero } from './levelUp';
import { rosterPowerForCard, rosterPowerForDeck, rosterPowerForHero } from './rosterPower';
import { getAscensionState } from '../ascension/store';
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
  reloadEconomy();
  reloadHeroLevels();
  resetProgression();
  clearQueuedEvents();
});

// ---- config: the curve, the cap, the engine-safety invariant ----------------------------------

describe('battlePowerBonusForLevel - the ONLY numeric contribution to real combat', () => {
  it('is 0 below Level 30, 1 from Level 30, 2 (max) from Level 60', () => {
    expect(battlePowerBonusForLevel(1)).toBe(0);
    expect(battlePowerBonusForLevel(29)).toBe(0);
    expect(battlePowerBonusForLevel(30)).toBe(1);
    expect(battlePowerBonusForLevel(59)).toBe(1);
    expect(battlePowerBonusForLevel(60)).toBe(2);
    expect(battlePowerBonusForLevel(MAX_HERO_LEVEL)).toBe(MAX_BATTLE_POWER_BONUS);
  });
  it('is monotonic non-decreasing across the whole range', () => {
    let prev = -Infinity;
    for (let level = 1; level <= MAX_HERO_LEVEL; level++) {
      const bonus = battlePowerBonusForLevel(level);
      expect(bonus).toBeGreaterThanOrEqual(prev);
      prev = bonus;
    }
  });
  it('the max bonus is strictly smaller than the roster\'s widest meaningful Power gap, by design', () => {
    // The live playtest roster's Hero Power spans 3-7 (see docs/game/CARD-SYSTEM.md). A fully-levelled
    // Common (worst case: Power 3 + max bonus) must never reach a base Legendary at the top of that
    // range - Level narrows gaps, it must never invert the roster's widest ones.
    const heroes = PLAYTEST_ROSTER.map(getCard).filter((c) => c.type === 'hero' && c.power !== undefined);
    const minPower = Math.min(...heroes.map((c) => c.power!));
    const maxPower = Math.max(...heroes.map((c) => c.power!));
    expect(minPower + MAX_BATTLE_POWER_BONUS).toBeLessThan(maxPower);
  });
});

describe('heroLevelCapForAccount', () => {
  it('scales 3x with Account Level, capped at MAX_HERO_LEVEL', () => {
    expect(heroLevelCapForAccount(1)).toBe(3);
    expect(heroLevelCapForAccount(10)).toBe(30);
    expect(heroLevelCapForAccount(20)).toBe(MAX_HERO_LEVEL);
    expect(heroLevelCapForAccount(999)).toBe(MAX_HERO_LEVEL); // clamped, defensive
    expect(heroLevelCapForAccount(0)).toBe(1); // never below 1
  });
});

describe('goldCostForLevelUp', () => {
  it('rises with level so it is a genuine long-tail sink', () => {
    expect(goldCostForLevelUp(1)).toBeLessThan(goldCostForLevelUp(30));
    expect(goldCostForLevelUp(30)).toBeLessThan(goldCostForLevelUp(59));
  });
});

// ---- persistence --------------------------------------------------------------------------------

describe('Hero Level persistence', () => {
  it('starts every card at Level 1, stored as nothing', () => {
    expect(getHeroLevel('kng-royal-guard')).toBe(1);
    expect(getHeroLevelState().levels).toEqual({});
  });
  it('saves and reloads', () => {
    setHeroLevel('kng-royal-guard', 45);
    reloadHeroLevels();
    expect(getHeroLevel('kng-royal-guard')).toBe(45);
    expect(JSON.parse(localStorage.getItem(HERO_LEVEL_STORAGE_KEY)!)).toMatchObject({ levels: { 'kng-royal-guard': 45 } });
  });
  it('never stores Level 1 explicitly', () => {
    setHeroLevel('kng-royal-guard', 10);
    setHeroLevel('kng-royal-guard', 1);
    expect(getHeroLevelState().levels).toEqual({});
  });
  it('survives malformed storage and sanitises impossible values', () => {
    localStorage.setItem(HERO_LEVEL_STORAGE_KEY, '{nope');
    reloadHeroLevels();
    expect(getHeroLevelState().levels).toEqual({});
    const s = sanitizeHeroLevel({ levels: { 'kng-royal-guard': 999, ghost: 10, 'und-bone-soldier': 0, 'inf-hellhound': -5 } });
    expect(s.levels).toEqual({ 'kng-royal-guard': MAX_HERO_LEVEL }); // clamped; unknown card / level<=1 dropped
    expect(sanitizeHeroLevel(null).levels).toEqual({});
  });
  it('heroLevelsFor omits Level-1 entries, matching ascensionRanksFor\'s convention', () => {
    setHeroLevel('kng-royal-guard', 40);
    expect(heroLevelsFor(['kng-royal-guard', 'kng-archer'])).toEqual({ 'kng-royal-guard': 40 });
  });
});

// ---- levelling rules -----------------------------------------------------------------------------

describe('Hero Level rules', () => {
  it('an unowned card cannot be levelled', () => {
    expect(getHeroLevelStatus('und-bone-soldier', 100000, 20)).toMatchObject({ owned: false, canLevelUp: false, blocked: 'not-owned' });
  });
  it('an owned card is blocked without enough Gold', () => {
    grantCard('kng-royal-guard', 1);
    expect(getHeroLevelStatus('kng-royal-guard', 0, 20)).toMatchObject({ canLevelUp: false, blocked: 'no-gold' });
  });
  it('is capped by Account Level even with unlimited Gold', () => {
    grantCard('kng-royal-guard', 1);
    setAccountLevel(1); // cap = 3
    setHeroLevel('kng-royal-guard', 3);
    expect(getHeroLevelStatus('kng-royal-guard', 1000000, 1)).toMatchObject({ canLevelUp: false, blocked: 'account-cap', accountCap: 3 });
  });
  it('spends Gold and raises the level by exactly one step', () => {
    grantCard('kng-royal-guard', 1);
    setAccountLevel(20);
    setGold(1000);
    const cost = goldCostForLevelUp(1);
    const r = levelUpHero('kng-royal-guard');
    expect(r).toMatchObject({ ok: true, levelBefore: 1, levelAfter: 2, goldSpent: cost });
    expect(getHeroLevel('kng-royal-guard')).toBe(2);
  });
  it('refuses to spend Gold that is not there, changing nothing', () => {
    grantCard('kng-royal-guard', 1);
    setAccountLevel(20);
    setGold(0);
    expect(levelUpHero('kng-royal-guard')).toMatchObject({ ok: false, levelAfter: 1, goldSpent: 0 });
    expect(getHeroLevel('kng-royal-guard')).toBe(1);
  });
  it('stops at MAX_HERO_LEVEL', () => {
    grantCard('kng-royal-guard', 1);
    setAccountLevel(20);
    setHeroLevel('kng-royal-guard', MAX_HERO_LEVEL);
    expect(getHeroLevelStatus('kng-royal-guard', 1000000, 20)).toMatchObject({ canLevelUp: false, blocked: 'max-level', nextLevel: null, cost: null });
  });
});

describe('levelUpHero analytics (Commercial Prototype Phase 9)', () => {
  it('fires hero_levelled and roster_power_changed with a positive delta', () => {
    grantCard('kng-royal-guard', 1);
    setAccountLevel(20);
    setGold(1000);
    levelUpHero('kng-royal-guard');
    const levelled = getQueuedEvents().filter((e) => e.name === 'hero_levelled');
    const power = getQueuedEvents().filter((e) => e.name === 'roster_power_changed');
    expect(levelled).toHaveLength(1);
    expect(power).toHaveLength(1);
    expect(power[0].properties).toMatchObject({ cardId: 'kng-royal-guard', source: 'heroLevel' });
    expect(power[0].properties.delta as number).toBeGreaterThan(0);
  });
  it('a failed level-up (no Gold) fires neither event', () => {
    grantCard('kng-royal-guard', 1);
    setAccountLevel(20);
    setGold(0);
    levelUpHero('kng-royal-guard');
    expect(getQueuedEvents().filter((e) => e.name === 'hero_levelled')).toHaveLength(0);
    expect(getQueuedEvents().filter((e) => e.name === 'roster_power_changed')).toHaveLength(0);
  });
});

// ---- Roster Power (virtual, never read by the engine) --------------------------------------------

describe('Roster Power', () => {
  it('grows with Power, Level and Ascension rank', () => {
    const base = rosterPowerForHero(5, 1, 0);
    expect(rosterPowerForHero(5, 30, 0)).toBeGreaterThan(base);
    expect(rosterPowerForHero(5, 1, 2)).toBeGreaterThan(base);
  });
  it('rosterPowerForCard reads live Level/Ascension state and is 0 for a Spell', () => {
    setHeroLevel('kng-royal-guard', 30);
    const levelState = getHeroLevelState();
    const ascensionState = getAscensionState();
    expect(rosterPowerForCard('kng-royal-guard', levelState, ascensionState)).toBe(rosterPowerForHero(getCard('kng-royal-guard').power!, 30, 0));
    expect(rosterPowerForCard('spl-power-surge', levelState, ascensionState)).toBe(0);
  });
  it('rosterPowerForDeck sums heroes and adds one flat account-level term, not one per hero', () => {
    const levelState = getHeroLevelState();
    const ascensionState = getAscensionState();
    const threeCardDeck = ['kng-archer', 'kng-archer', 'kng-common-knight'];
    const oneCardDeck = ['kng-archer'];
    const heroSum = threeCardDeck.reduce((sum, id) => sum + rosterPowerForCard(id, levelState, ascensionState), 0);
    expect(rosterPowerForDeck(threeCardDeck, 0, levelState, ascensionState)).toBe(heroSum);
    // The account-level term is identical whether the deck has 1 or 3 Hero cards - it is added once, not per hero.
    const bump3 = rosterPowerForDeck(threeCardDeck, 11, levelState, ascensionState) - rosterPowerForDeck(threeCardDeck, 10, levelState, ascensionState);
    const bump1 = rosterPowerForDeck(oneCardDeck, 11, levelState, ascensionState) - rosterPowerForDeck(oneCardDeck, 10, levelState, ascensionState);
    expect(bump3).toBe(bump1);
    expect(bump3).toBeGreaterThan(0);
  });
});

// ---- engine: the bonus is baked in exactly once, at placement, and flows through the real match --

function playCard(state: GameState, cardId: string, lane: 'left' | 'center' | 'right' = 'left') {
  const withHand: GameState = { ...state, player: { ...state.player, hand: [{ handId: 'h1', cardId }] } };
  const play = { plays: [{ handId: 'h1', cardId, lane }] };
  return resolveRound(withHand, play, { plays: [] }, 1);
}

describe('Hero Level in the engine', () => {
  it('makes no difference to Battle Power below Level 30', () => {
    const s = createMatch({ seed: 1, playerDeck: ['kng-archer'], enemyDeck: ['kng-archer'] }).state;
    const base = playCard(s, 'kng-archer').nextState.player.heroZones.left?.power;
    const withLevels: GameState = { ...s, heroLevels: { player: { 'kng-archer': 15 } } };
    const levelled = playCard(withLevels, 'kng-archer').nextState.player.heroZones.left?.power;
    expect(levelled).toBe(base);
  });
  it('adds exactly the capped bonus at placement, and it is carried on the instance for display', () => {
    const s = createMatch({ seed: 1, playerDeck: ['kng-archer'], enemyDeck: ['kng-archer'] }).state;
    const withLevels: GameState = { ...s, heroLevels: { player: { 'kng-archer': 60 } } };
    const result = playCard(withLevels, 'kng-archer').nextState.player.heroZones.left;
    expect(result?.power).toBe(getCard('kng-archer').power! + MAX_BATTLE_POWER_BONUS);
    expect(result?.level).toBe(60);
  });
  it('applies per side: the enemy does not inherit the player\'s Level', () => {
    // Different lanes so both Heroes land unopposed rather than fighting each other - the point here is
    // the per-side Level lookup, not combat resolution.
    const s = createMatch({ seed: 1, playerDeck: ['kng-archer'], enemyDeck: ['kng-archer'] }).state;
    const withHands: GameState = { ...s, player: { ...s.player, hand: [{ handId: 'h1', cardId: 'kng-archer' }] }, enemy: { ...s.enemy, hand: [{ handId: 'h2', cardId: 'kng-archer' }] }, heroLevels: { player: { 'kng-archer': 60 } } };
    const play = { plays: [{ handId: 'h1', cardId: 'kng-archer', lane: 'left' as const }] };
    const enemyPlay = { plays: [{ handId: 'h2', cardId: 'kng-archer', lane: 'right' as const }] };
    const result = resolveRound(withHands, play, enemyPlay, 1).nextState;
    expect(result.player.heroZones.left?.power).toBe(getCard('kng-archer').power! + MAX_BATTLE_POWER_BONUS);
    expect(result.enemy.heroZones.right?.power).toBe(getCard('kng-archer').power!);
  });
  it('the weakest Common in the roster, fully levelled, still loses to the strongest Legendary at base', () => {
    const heroes = PLAYTEST_ROSTER.map(getCard).filter((c) => c.type === 'hero' && c.power !== undefined);
    const weakestCommon = Math.min(...heroes.filter((c) => c.rarity === 'common').map((c) => c.power!));
    const strongestLegendary = Math.max(...heroes.filter((c) => c.rarity === 'legendary').map((c) => c.power!));
    expect(weakestCommon + MAX_BATTLE_POWER_BONUS).toBeLessThan(strongestLegendary);
  });
  it('Friendly Battle style matches (no heroLevels set) behave exactly as before - Level is normalised away by omission', () => {
    const s = createMatch({ seed: 1, playerDeck: ['kng-archer'], enemyDeck: ['kng-archer'] }).state;
    expect(s.heroLevels).toBeUndefined();
    const result = playCard(s, 'kng-archer').nextState.player.heroZones.left?.power;
    expect(result).toBe(getCard('kng-archer').power);
  });
  it('does not change beginRound or Base behaviour when no Hero Level is set', () => {
    const s = createMatch({ seed: 1, playerDeck: ['kng-archer'], enemyDeck: ['kng-archer'] }).state;
    expect(beginRound(s).nextState.heroLevels).toBeUndefined();
  });
  it('is deterministic: identical state + seed give identical events and state', () => {
    const s = createMatch({ seed: 1, playerDeck: ['kng-archer'], enemyDeck: ['kng-archer'] }).state;
    const withLevels: GameState = { ...s, heroLevels: { player: { 'kng-archer': 45 } } };
    const a = playCard(withLevels, 'kng-archer');
    const b = playCard(withLevels, 'kng-archer');
    expect(b).toEqual(a);
  });
});

describe('resetHeroLevels', () => {
  it('clears everything back to Level 1', () => {
    setHeroLevel('kng-royal-guard', 40);
    resetHeroLevels();
    expect(getHeroLevelState().levels).toEqual({});
  });
});
