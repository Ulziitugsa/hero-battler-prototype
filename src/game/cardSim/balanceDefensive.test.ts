import { describe, expect, it } from 'vitest';
import { validateDeck } from '../engine/deckRules';
import { getCard as getLiveCard } from '../cards';
import { BULWARK_DECK, DEFENSIVE_OVERRIDES, overrideMap } from './balance/defensive';
import { getCard, withCardOverrides } from './cardSource';
import { BASE_RULES, createSimState, resolveRound } from './engine';
import { getStatModel } from './statModels';

const baseline = getStatModel('baseline');
const PRIEST = 'und-dark-priest'; // Power 3
const FIEND = 'inf-pit-fiend'; // Power 5

describe('defensive balance pass (sim-only overrides)', () => {
  it('builds a legal deck and leaves the live card data untouched outside the override scope', () => {
    expect(validateDeck(BULWARK_DECK).errors).toEqual([]);
    const map = overrideMap(DEFENSIVE_OVERRIDES);
    withCardOverrides(map, () => expect(getCard(PRIEST)).toBe(map.get(PRIEST)));
    expect(getCard(PRIEST)).toBe(getLiveCard(PRIEST));
  });

  it('Guard lets a blocking Dark Priest beat a Power 5 attacker it would otherwise lose to', () => {
    const clash = () => {
      const s = createSimState({ model: baseline, rules: BASE_RULES, sides: [{ deck: [PRIEST], policy: 'balanced' }, { deck: [FIEND], policy: 'balanced' }], seed: 1 });
      for (const p of s.players) p.deck = [];
      s.players[0].hand = [PRIEST];
      s.players[1].hand = [FIEND];
      resolveRound(s, [[{ cardId: PRIEST, lane: 0 }], [{ cardId: FIEND, lane: 0 }]]);
      return s;
    };
    const live = clash();
    expect(live.players[0].units[0]).toBeNull();
    const guarded = withCardOverrides(overrideMap(DEFENSIVE_OVERRIDES), clash);
    expect(guarded.players[0].units[0]?.cardId).toBe(PRIEST);
    expect(guarded.players[1].units[0]).toBeNull();
    // the Guard bonus lasts only for the round
    expect(guarded.players[0].units[0]?.atk).toBe(baseline.stats(getLiveCard(PRIEST)).atk);
  });
});
