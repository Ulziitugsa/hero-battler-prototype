import { describe, expect, it } from 'vitest';
import { validateDeck } from '../engine/deckRules';
import { getCard as getLiveCard } from '../cards';
import { getCard, withCardOverrides } from './cardSource';
import { type MatchConfig, type Rules, createSimState, resolveRound } from './engine';
import { APPROVED_REBAND, APPROVED_RULES, BONE_SOLDIER, GROWTH_CAP_ATK, OUTLIER_VARIANTS, PROPOSED_RULES, STRESS_DECKS } from './outliers';
import { getStatModel } from './statModels';

const baseline = getStatModel('baseline');
const KNIGHT = 'kng-common-knight';
const IMP = 'inf-flame-imp';
const CURSED = 'und-cursed-warrior';

function state(rules: Rules, deck: string[] = [KNIGHT, KNIGHT, IMP]) {
  const cfg: MatchConfig = { model: baseline, rules, sides: [{ deck, policy: 'balanced' }, { deck: [KNIGHT, KNIGHT, IMP], policy: 'balanced' }], seed: 1 };
  const s = createSimState(cfg);
  for (const p of s.players) p.deck = [];
  return s;
}

describe('Thread D outlier rules', () => {
  it('builds legal stress decks', () => {
    for (const deck of STRESS_DECKS) expect(validateDeck(deck.cards).errors, deck.id).toEqual([]);
  });

  it('installs sim-only card overrides without touching the live cards', () => {
    withCardOverrides([BONE_SOLDIER, ...APPROVED_REBAND], () => {
      expect(getCard('und-vharos').power).toBe(6);
      expect(getCard('und-bone-soldier').abilities[1].actions[0].type).toBe('CHANGE_POWER');
    });
    expect(getCard('und-vharos').power).toBe(7);
    expect(getLiveCard('und-bone-soldier').abilities[1].actions[0].type).toBe('CHANGE_POWER_BY_COUNT');
  });

  it('caps permanent growth at +45 ATK above entry ATK', () => {
    const s = state({ ...APPROVED_RULES, growthCap: GROWTH_CAP_ATK }, ['spl-fortify', KNIGHT, IMP]);
    s.players[0].hand = [KNIGHT, 'spl-fortify'];
    s.players[1].hand = [];
    resolveRound(s, [[{ cardId: KNIGHT, lane: 0 }, { cardId: 'spl-fortify', lane: 0 }], []]);
    const unit = s.players[0].units[0]!;
    for (let r = 0; r < 6; r++) resolveRound(s, [[], []]);
    expect(unit.atk - unit.baseAtk).toBe(GROWTH_CAP_ATK);
    expect(s.totals[0].growthClipped).toBeGreaterThan(0);
  });

  it('fades a token after its first Combat when the token rule is on', () => {
    for (const [rules, survives] of [[PROPOSED_RULES, true], [{ ...PROPOSED_RULES, tokenLifetime: 'oneCombat' as const }, false]] as const) {
      const s = state(rules, ['spl-ward-circle', KNIGHT, IMP]);
      s.players[0].hand = ['spl-ward-circle'];
      s.players[1].hand = [];
      resolveRound(s, [[{ cardId: 'spl-ward-circle', lane: 0 }], []]);
      expect(s.totals[0].tokensSummoned).toBe(2);
      expect(s.players[0].units.filter(Boolean).length).toBe(survives ? 2 : 0);
    }
  });

  it('lets each copy return once when recursion is counted per copy', () => {
    for (const [scope, expected] of [['name', 1], ['copy', 2]] as const) {
      const s = state({ ...APPROVED_RULES, recursionScope: scope }, [CURSED, CURSED, IMP]);
      for (let i = 0; i < 3; i++) {
        s.players[0].hand = [CURSED];
        s.players[1].hand = [KNIGHT];
        resolveRound(s, [[{ cardId: CURSED, lane: 0 }], [{ cardId: KNIGHT, lane: 0 }]]);
        s.players[1].units[0] = null;
      }
      expect(s.totals[0].returns).toBe(expected);
    }
  });

  it('keeps every variant on the approved baseline', () => {
    for (const v of OUTLIER_VARIANTS) {
      expect(v.rules.clashDamage, v.id).toBe(false);
      expect(v.cards.find((c) => c.id === 'und-vharos')?.power, v.id).toBe(6);
    }
  });
});
