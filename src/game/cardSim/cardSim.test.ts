import { describe, expect, it } from 'vitest';
import { validateDeck } from '../engine/deckRules';
import { choosePlays } from './ai';
import { SIM_DECKS, getSimDeck } from './decks';
import { BASE_RULES, type MatchConfig, type Rules, beginRound, createSimState, playMatch, resolveRound, startingHp } from './engine';
import { deckProfiles, runSeries, summarize } from './experiments';
import { STAT_MODELS, baselineHpc, getMasteryOption, getStatModel, masteredStats } from './statModels';
import { getCard } from '../cards';

const baseline = getStatModel('baseline');
const KNIGHT = 'kng-common-knight'; // vanilla Power 6
const IMP = 'inf-flame-imp'; // Power 3, reacts only to its own direct damage

function duel(rules: Rules = BASE_RULES) {
  const cfg: MatchConfig = { model: baseline, rules, sides: [{ deck: [KNIGHT, KNIGHT, IMP], policy: 'balanced' }, { deck: [KNIGHT, KNIGHT, IMP], policy: 'balanced' }], seed: 1 };
  const s = createSimState(cfg);
  for (const p of s.players) {
    p.deck = [];
    p.hand = [KNIGHT, KNIGHT, IMP];
  }
  return s;
}

describe('card-combat simulator', () => {
  it('only plays legal 15-card decks built from the roster', () => {
    for (const deck of SIM_DECKS) expect(validateDeck(deck.cards).errors, deck.id).toEqual([]);
  });

  it('sets Starting HP to the sum of Unit HP Contributions, with Spells adding nothing', () => {
    const deck = getSimDeck('balanced').cards;
    const expected = deck.filter((id) => getCard(id).type === 'hero').reduce((hp, id) => hp + baseline.stats(getCard(id)).hpc, 0);
    expect(startingHp(baseline, deck)).toBe(expected);
    const s = createSimState({ model: baseline, rules: BASE_RULES, sides: [{ deck, policy: 'balanced' }, { deck, policy: 'balanced' }], seed: 3 });
    expect(s.players[0].hp).toBe(expected);
  });

  it('keeps the higher-ATK Unit unchanged and destroys the lower one, with no overflow by default', () => {
    const s = duel();
    const knightAtk = baseline.stats(getCard(KNIGHT)).atk;
    const hpB = s.players[1].hp;
    resolveRound(s, [[{ cardId: KNIGHT, lane: 0 }], [{ cardId: IMP, lane: 0 }]]);
    expect(s.players[0].units[0]?.atk).toBe(knightAtk);
    expect(s.players[1].units[0]).toBeNull();
    expect(s.players[1].grave).toEqual([IMP]);
    expect(s.players[1].hp).toBe(hpB);
  });

  it('applies overflow only when the alternative rule is on', () => {
    const s = duel({ ...BASE_RULES, overflow: true });
    const diff = baseline.stats(getCard(KNIGHT)).atk - baseline.stats(getCard(IMP)).atk;
    const hpB = s.players[1].hp;
    resolveRound(s, [[{ cardId: KNIGHT, lane: 0 }], [{ cardId: IMP, lane: 0 }]]);
    expect(s.players[1].hp).toBe(hpB - diff);
  });

  it('destroys both Units on equal ATK, or neither under the alternative tie rule', () => {
    const both = duel();
    resolveRound(both, [[{ cardId: KNIGHT, lane: 1 }], [{ cardId: KNIGHT, lane: 1 }]]);
    expect(both.players[0].units[1]).toBeNull();
    expect(both.players[1].units[1]).toBeNull();
    const none = duel({ ...BASE_RULES, tie: 'none' });
    resolveRound(none, [[{ cardId: KNIGHT, lane: 1 }], [{ cardId: KNIGHT, lane: 1 }]]);
    expect(none.players[0].units[1]).not.toBeNull();
    expect(none.players[1].units[1]).not.toBeNull();
  });

  it('deals an unopposed Unit\'s ATK to the opposing player', () => {
    const s = duel();
    const hpB = s.players[1].hp;
    resolveRound(s, [[{ cardId: KNIGHT, lane: 2 }], []]);
    expect(s.players[1].hp).toBe(hpB - baseline.stats(getCard(KNIGHT)).atk);
    expect(s.totals[0].directHits).toBe(1);
  });

  it('converts Power effects at 15 ATK per Power and expires "this round" changes', () => {
    const cfg: MatchConfig = { model: baseline, rules: BASE_RULES, sides: [{ deck: [IMP, 'spl-power-surge'], policy: 'balanced' }, { deck: [KNIGHT], policy: 'balanced' }], seed: 5 };
    const s = createSimState(cfg);
    s.players[0].deck = [];
    s.players[1].deck = [];
    s.players[0].hand = [IMP, 'spl-power-surge'];
    s.players[1].hand = [];
    resolveRound(s, [[{ cardId: IMP, lane: 0 }], []]);
    const base = s.players[0].units[0]!.atk;
    s.players[0].hand = ['spl-power-surge'];
    resolveRound(s, [[{ cardId: 'spl-power-surge', lane: 0 }], []]);
    // Imp hit the empty lane for base + 45 during the round, and is back to base afterwards.
    expect(s.players[0].units[0]!.atk).toBe(base);
    expect(s.totals[0].directDamage).toBe(base + (base + 45));
  });

  it('caps Graveyard recursion per card when the variant rule is on', () => {
    const warrior = 'und-cursed-warrior'; // On Death: return this card to hand
    const run = (recursionCap: number | null) => {
      const s = createSimState({ model: baseline, rules: { ...BASE_RULES, recursionCap }, sides: [{ deck: [warrior], policy: 'balanced' }, { deck: [KNIGHT], policy: 'balanced' }], seed: 2 });
      s.players[0].deck = [];
      s.players[1].deck = [];
      s.players[0].hand = [warrior];
      s.players[1].hand = [KNIGHT];
      resolveRound(s, [[{ cardId: warrior, lane: 0 }], [{ cardId: KNIGHT, lane: 0 }]]);
      resolveRound(s, [[{ cardId: warrior, lane: 0 }], []]);
      return s.players[0];
    };
    expect(run(null).hand).toEqual([warrior]);
    const capped = run(1);
    expect(capped.hand).toEqual([]);
    expect(capped.grave).toEqual([warrior]);
  });

  it('is deterministic for a seed', () => {
    const run = (seed: number) => {
      const a = getSimDeck('starter-kingdom');
      const b = getSimDeck('starter-undead');
      return playMatch({ model: baseline, rules: BASE_RULES, sides: [{ deck: a.cards, policy: 'balanced' }, { deck: b.cards, policy: 'aggressive' }], seed, log: true }, choosePlays);
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42).log).not.toEqual(run(43).log);
  });

  it('plays whole matches to a result for every deck and pilot without errors', () => {
    for (const deck of SIM_DECKS) {
      const res = runSeries({ model: baseline, a: { deck: deck.cards, policy: deck.pilot }, b: { deck: getSimDeck('balanced').cards, policy: 'random' }, games: 4, seed: 9 });
      expect(res.games).toBe(4);
      expect(res.rounds.every((r) => r >= 1 && r <= BASE_RULES.maxRounds)).toBe(true);
      expect(summarize(res).games).toBe(4);
    }
  });

  it('draws to the refill target at the start of each round', () => {
    const deck = getSimDeck('balanced').cards;
    const s = createSimState({ model: baseline, rules: BASE_RULES, sides: [{ deck, policy: 'balanced' }, { deck, policy: 'balanced' }], seed: 11 });
    beginRound(s);
    expect(s.players.map((p) => p.hand.length)).toEqual([3, 3]);
    expect(s.players.map((p) => p.deck.length)).toEqual([12, 12]);
  });
});

describe('stat models', () => {
  it('prints every roster Unit with positive ATK and HP Contribution under every model', () => {
    for (const model of STAT_MODELS) {
      for (const p of deckProfiles(model)) {
        expect(p.minAtk, `${model.id} ${p.deck}`).toBeGreaterThan(0);
        expect(p.startingHp, `${model.id} ${p.deck}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the baseline on an ATK-for-HP trade where rarity only adds HP', () => {
    for (const id of ['kng-common-knight', 'kng-royal-guard', 'kng-battle-captain', 'kng-paladin']) {
      const card = getCard(id);
      const { atk, hpc } = baseline.stats(card);
      expect(atk).toBeGreaterThanOrEqual(74);
      expect(atk).toBeLessThanOrEqual(146);
      expect(hpc).toBe(baselineHpc(atk, card.rarity));
      expect(baselineHpc(atk, 'common')).toBeGreaterThan(baselineHpc(atk + 15, 'common'));
      expect(baselineHpc(atk, 'legendary') - baselineHpc(atk, 'common')).toBeLessThanOrEqual(11);
    }
  });

  it('applies Mastery as rounded percentages of the Mastery I value', () => {
    const base = { atk: 100, hpc: 105 };
    expect(masteredStats(base, { option: getMasteryOption('MB'), stage: 5 })).toEqual({ atk: 108, hpc: 116 });
    expect(masteredStats(base, { option: getMasteryOption('MA-HP'), stage: 5 })).toEqual({ atk: 100, hpc: 116 });
    expect(masteredStats(base, { option: getMasteryOption('MB'), stage: 1 })).toEqual(base);
  });
});
