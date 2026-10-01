import { beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent } from '../types';
import type { MatchStats } from '../engine/stats';
import { STARTER_DECKS } from '../cards/starterDecks';
import { validateDeck } from '../engine/deckRules';
import { reloadCollection } from '../collection/collection';
import { reloadEconomy } from '../economy/economy';
import { reloadAscension, sanitizeAscension } from '../ascension/store';
import { reloadHeroLevels, setHeroLevel } from '../heroLevel/store';
import { resetProgression } from '../progression/account';
import { deckStartingHp } from '../cardCombat/stats';
import { createCardMatch } from '../cardCombat/engine';
import { runCardSeries } from '../cardCombat/simulate';
import { CHAPTER_1 } from './chapter1';
import { campaignEnemyDeck } from './encounterDecks';
import { campaignBattleHp, campaignBattlePlan } from './battleSetup';
import { evaluateObjective, loadProgress, recordBattleResult } from './progress';
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
  reloadAscension();
  reloadHeroLevels();
  resetProgression();
  clearQueuedEvents();
});

const ENCOUNTERS = CHAPTER_1.nodes.filter((n) => n.encounter);
const KINGDOM = STARTER_DECKS.kingdom;
const noAscension = sanitizeAscension(null);

describe('Campaign on card combat: every encounter', () => {
  it('has a legal enemy deck (15 cards, 8+ Units) of its own, and an authored difficulty', () => {
    expect(ENCOUNTERS.length).toBe(9);
    for (const node of ENCOUNTERS) {
      const deck = campaignEnemyDeck(node.id)!;
      expect(deck, node.id).toBeDefined();
      expect(validateDeck(deck), node.id).toMatchObject({ valid: true });
      expect(['easy', 'fair', 'hard'], node.id).toContain(node.encounter!.difficulty);
      expect(node.encounter, node.id).not.toHaveProperty('recommendedRosterPower');
    }
    // Every regular encounter teaches with its own list; only the boss plays the full Undead starter.
    const regular = ENCOUNTERS.filter((n) => n.type !== 'boss').map((n) => campaignEnemyDeck(n.id)!.join());
    expect(regular).not.toContain(STARTER_DECKS.undead.join());
  });

  it('progresses Easy -> Fair -> Hard along the main road, ending at the boss', () => {
    const order = { easy: 0, fair: 1, hard: 2 } as const;
    const road = ENCOUNTERS.filter((n) => !n.optional).map((n) => order[n.encounter!.difficulty]);
    expect(road).toEqual([...road].sort((a, b) => a - b));
    expect(ENCOUNTERS.at(-1)!.type).toBe('boss');
    expect(ENCOUNTERS.at(-1)!.encounter!.difficulty).toBe('hard');
  });

  it('Starting HP comes from the decks; the boss gets an HP pool, the challenge a reduced player start', () => {
    for (const node of ENCOUNTERS) {
      const hp = campaignBattleHp(node, KINGDOM, noAscension)!;
      const enc = node.encounter!;
      const own = deckStartingHp(KINGDOM).total;
      expect(hp.player, node.id).toBe(enc.playerStartingHpPct ? Math.round((own * enc.playerStartingHpPct) / 100) : own);
      expect(hp.enemy, node.id).toBe(enc.enemyStartingHp ?? deckStartingHp(campaignEnemyDeck(node.id)!).total);
    }
    const boss = ENCOUNTERS.find((n) => n.type === 'boss')!;
    expect(campaignBattleHp(boss, KINGDOM, noAscension)!.enemy).toBe(1200);
  });

  it('the battle starts at exactly the HP the stage sheet shows, on the card resolver', () => {
    for (const node of ENCOUNTERS) {
      const plan = campaignBattlePlan(node, KINGDOM, noAscension)!;
      const { nextState } = createCardMatch({ seed: 7, playerDeck: KINGDOM, enemyDeck: plan.enemyDeck, startingHpOverride: plan.startingHpOverride });
      expect(nextState.combatModel).toBe('card');
      expect({ player: nextState.player.hp, enemy: nextState.enemy.hp }, node.id).toEqual(campaignBattleHp(node, KINGDOM, noAscension));
    }
  });

  it('Card Mastery raises the player Starting HP shown and played; Legacy Level does nothing', () => {
    const node = ENCOUNTERS[0];
    const base = campaignBattleHp(node, KINGDOM, noAscension)!.player;
    setHeroLevel('kng-royal-guard', 60);
    expect(campaignBattleHp(node, KINGDOM, noAscension)!.player).toBe(base);
    const mastered = sanitizeAscension({ cards: { 'kng-royal-guard': { rank: 4, duplicatesSpent: 10 } } });
    expect(campaignBattleHp(node, KINGDOM, mastered)!.player).toBeGreaterThan(base);
  });

  it('deterministic simulation: no stalls, no auto-wins or auto-losses (Kingdom starter, 12 games each)', () => {
    for (const node of ENCOUNTERS) {
      const plan = campaignBattlePlan(node, KINGDOM, noAscension)!;
      const a = runCardSeries({ playerDeck: KINGDOM, enemyDeck: plan.enemyDeck, startingHpOverride: plan.startingHpOverride }, 12, 20261001);
      const b = runCardSeries({ playerDeck: KINGDOM, enemyDeck: plan.enemyDeck, startingHpOverride: plan.startingHpOverride }, 12, 20261001);
      expect(a, node.id).toEqual(b);
      expect(a.stalls, node.id).toBe(0);
      expect(a.winShare, node.id).toBeGreaterThan(0);
      expect(a.wins + a.losses + a.draws).toBe(12);
    }
  });
});

describe('Campaign objectives read card-combat numbers', () => {
  const events = (start: number, clash: number[]): GameEvent[] => [
    { type: 'STARTING_HP', side: 'player', hp: start, units: 11, masteryBonus: 0 },
    ...clash.map((amount): GameEvent => ({ type: 'CLASH_DAMAGE', lane: 'left', side: 'enemy', winner: 'player', playerAtk: 150, enemyAtk: 150 - amount, destroyed: [], clashDamage: amount, reduced: 0, prevented: 0, amount })),
  ];
  const stats = (o: Partial<MatchStats>): MatchStats => ({ roundsPlayed: 8, finalPlayerHp: 500, finalEnemyHp: 0, ...o }) as unknown as MatchStats;

  it('share of the HP the player started with, and Clash Damage dealt', () => {
    const hp = { id: 'x', text: '', check: 'healthPctAtLeast', value: 80 };
    expect(evaluateObjective(hp, { stats: stats({ finalPlayerHp: 800 }), events: events(1000, []), playerDeckFaction: 'kingdom' })).toBe(true);
    expect(evaluateObjective(hp, { stats: stats({ finalPlayerHp: 799 }), events: events(1000, []), playerDeckFaction: 'kingdom' })).toBe(false);
    const clash = { id: 'y', text: '', check: 'clashDamageDealtAtLeast', value: 150 };
    expect(evaluateObjective(clash, { stats: stats({}), events: events(1000, [60, 90]), playerDeckFaction: 'kingdom' })).toBe(true);
    expect(evaluateObjective(clash, { stats: stats({}), events: events(1000, [60, 89]), playerDeckFaction: 'kingdom' })).toBe(false);
  });

  it('recording a loss tracks no Power deficit any more', () => {
    const node = ENCOUNTERS[0];
    recordBattleResult(node.id, 'ENEMY_WIN', stats({ finalPlayerHp: 0 }), events(900, []), 'kingdom');
    expect(loadProgress().lastLossPower ?? {}).toEqual({});
    const names = getQueuedEvents().map((e) => e.name);
    expect(names).toContain('campaign_lost');
    expect(names).not.toContain('campaign_loss_at_power_deficit');
  });
});
