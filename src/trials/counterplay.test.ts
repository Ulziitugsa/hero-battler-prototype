import { beforeAll, describe, expect, it } from 'vitest';
import { registerTrialCards } from './cards';
import { COUNTERPLAY_CASES, signatureStats } from './counterplay';

// Part F, as a regression check: each combination against no specific answer, its intended counter and an unrelated
// strategy, in seeded AI-vs-AI battles on the production resolver. The full tables (200 battles per pairing) come from
// scripts/trials-counterplay.mjs and are in docs/design/POWER-FANTASY-P1.md; this checks their direction on 60.

beforeAll(registerTrialCards);

const GAMES = 60;
const byId = (id: string) => COUNTERPLAY_CASES.find((c) => c.id === id)!;

describe('counterplay', () => {
  it('every deck is a legal 15-card list with at least 8 Units', () => {
    for (const c of COUNTERPLAY_CASES) for (const deck of [c.combo, c.control, c.counter]) expect(deck.length).toBe(15);
  });

  it('The Immortal Army: the counter exiles the army and cuts how often it rises and how often it wins', () => {
    const c = byId('immortal-army');
    const open = signatureStats(c.combo, c.noAnswer, GAMES);
    const countered = signatureStats(c.combo, c.counter, GAMES);
    expect(open.rises).toBeGreaterThan(2);
    expect(countered.exiled).toBeGreaterThan(0.5);
    expect(countered.rises).toBeLessThan(open.rises);
    expect(countered.winShare).toBeLessThan(open.winShare);
  }, 120_000);

  it('The Unstoppable Champion: the counter breaks the Vow and exiles the Champion, and its peak ATK collapses', () => {
    const c = byId('champion');
    const open = signatureStats(c.combo, c.noAnswer, GAMES);
    const countered = signatureStats(c.combo, c.counter, GAMES);
    expect(open.thousandGames).toBeGreaterThan(GAMES / 5);
    expect(countered.spellsBroken).toBeGreaterThan(0.5);
    expect(countered.exiled).toBeGreaterThan(0.5);
    expect(countered.peakAtk).toBeLessThan(open.peakAtk / 2);
  }, 120_000);

  it('no combination wins every matchup: each loses most battles to an unrelated strategy', () => {
    for (const c of COUNTERPLAY_CASES) for (const o of c.unrelated) expect(signatureStats(c.combo, o.deck, GAMES).winShare, `${c.name} vs ${o.name}`).toBeLessThan(0.5);
  }, 240_000);

  it('The Apocalypse destroys several Units in one Spell in a plain AI’s hands too, though rarely', () => {
    const c = byId('apocalypse');
    const open = signatureStats(c.combo, c.noAnswer, GAMES);
    expect(open.cataclysmKills).toBeGreaterThan(0.5);
    expect(open.multiKills).toBeGreaterThan(0);
  }, 120_000);
});
