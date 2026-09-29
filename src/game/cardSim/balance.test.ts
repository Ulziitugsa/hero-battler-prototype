import { describe, expect, it } from 'vitest';
import { getCard } from '../cards';
import { choosePlays } from './ai';
import { ARCHETYPES, APPROVED_RULES, MAX_PRINTED_POWER, MIN_UNITS, approvedModel, getDeck, matrixJobs, unitCount } from './balance';
import { BALANCE_VARIANTS } from './balance/proposal';
import { getSimDeck } from './decks';
import { playMatch } from './engine';
import { getStatModel } from './statModels';

const model = approvedModel();

describe('balance pass setup', () => {
  it('re-bands Power 7 Legendaries to Power 6 and leaves every other card on the baseline', () => {
    const baseline = getStatModel('baseline');
    for (const id of ['und-vharos', 'inf-infernal-lord']) {
      const card = getCard(id);
      expect(card.power).toBe(7);
      expect(model.stats(card).atk).toBe(baseline.stats({ ...card, power: MAX_PRINTED_POWER }).atk);
    }
    const knight = getCard('kng-common-knight');
    expect(model.stats(knight)).toEqual(baseline.stats(knight));
  });

  it('only measures decks that meet the 8-Unit minimum', () => {
    for (const { id } of ARCHETYPES) expect(unitCount(getDeck(id).cards), id).toBeGreaterThanOrEqual(MIN_UNITS);
    for (const variant of BALANCE_VARIANTS) {
      for (const [id, cards] of Object.entries(variant.decks ?? {})) {
        expect(cards, `${variant.id}/${id}`).toHaveLength(15);
        expect(unitCount(cards), `${variant.id}/${id}`).toBeGreaterThanOrEqual(MIN_UNITS);
      }
    }
  });

  it('covers every archetype pair once, mirrors included', () => {
    expect(matrixJobs('m', 10, 1)).toHaveLength((ARCHETYPES.length * (ARCHETYPES.length + 1)) / 2);
  });

  it('plays the search pilot deterministically for a fixed seed', () => {
    const deck = getSimDeck('starter-undead').cards;
    const run = () => playMatch({ model, rules: APPROVED_RULES, sides: [{ deck, policy: 'expert' }, { deck, policy: 'random' }], seed: 11 }, choosePlays);
    const a = run();
    const b = run();
    expect(a.winner).toBe(b.winner);
    expect(a.rounds).toBe(b.rounds);
    expect(a.endHp).toEqual(b.endHp);
  });
});
