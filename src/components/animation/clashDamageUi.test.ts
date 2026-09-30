/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, HeroInstance, LaneId, Side } from '../../game/types';
import { getCard } from '../../game/cards';
import { STARTER_DECKS } from '../../game/cards/starterDecks';
import { createCardMatch, resolveCardRound } from '../../game/cardCombat/engine';
import { buildAnimationSteps } from './buildAnimationSteps';
import { clashCalloutForStep, computeStepVisuals } from './chitEffects';

// Test 10 of the difference-damage batch: the Quick Battle card-mode feedback reads the ATK difference correctly.
// "145 vs 85 / Winner: 145 / Clash Damage: 60", then -60 on the losing player's HP meter and nothing on any Unit.

const KNIGHT = 'kng-common-knight';

function board(units: { side: Side; lane: LaneId; atk: number }[]): GameState {
  const s = createCardMatch({ seed: 3, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.infernal }).nextState;
  for (const side of ['player', 'enemy'] as Side[]) {
    s[side].hand = [];
    s[side].deck = [];
    s.cardCombat!.deckMarks[side] = [];
  }
  units.forEach(({ side, lane, atk }, i) => {
    const card = getCard(KNIGHT);
    const unit: HeroInstance = { instanceId: `u${i}`, cardId: KNIGHT, faction: card.faction, name: card.name, shortName: card.shortName, power: atk, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, enteredRound: 0, entryAtk: atk };
    s[side].heroZones[lane] = unit;
  });
  return s;
}

function play(units: { side: Side; lane: LaneId; atk: number }[]) {
  const s = board(units);
  const { events } = resolveCardRound(s, { plays: [] }, { plays: [] });
  return { s, events, steps: buildAnimationSteps(events) };
}

const calloutAt = (lane: LaneId, run: ReturnType<typeof play>, visual = 'combat-clash') => {
  const step = run.steps.find((st) => st.lane === lane && st.visualType === visual)!;
  return clashCalloutForStep(step, run.events, run.s);
};

describe('Quick Battle card mode: Clash Damage feedback', () => {
  it('145 vs 85: callout names the winner and the Clash Damage, and -60 lands on the losing player’s HP only', () => {
    const run = play([
      { side: 'player', lane: 'left', atk: 145 },
      { side: 'enemy', lane: 'left', atk: 85 },
    ]);
    expect(calloutAt('left', run)).toMatchObject({ kind: 'win', side: 'player', line1: '145 vs 85', line2: 'Winner: 145', line3: 'Clash Damage: 60' });
    const dmg = run.steps.find((st) => st.visualType === 'clash-damage')!;
    expect(dmg).toBeDefined();
    const v = computeStepVisuals(dmg, run.s);
    expect(v.hpFx).toEqual([{ side: 'enemy', kind: 'damage', amount: 60 }]);
    expect([...v.heroChit.values()].flatMap((c) => c.floaters)).toEqual([]);
    expect(calloutAt('left', run, 'clash-damage')).toMatchObject({ line3: 'Clash Damage: 60' });
  });

  it('145 vs 140: a near-even clash shows Clash Damage: 5', () => {
    const run = play([
      { side: 'player', lane: 'center', atk: 140 },
      { side: 'enemy', lane: 'center', atk: 145 },
    ]);
    expect(calloutAt('center', run)).toMatchObject({ kind: 'win', side: 'enemy', line1: '140 vs 145', line2: 'Winner: 145', line3: 'Clash Damage: 5' });
    const dmg = run.steps.find((st) => st.visualType === 'clash-damage')!;
    expect(computeStepVisuals(dmg, run.s).hpFx).toEqual([{ side: 'player', kind: 'damage', amount: 5 }]);
  });

  it('120 vs 120: "Tie · both destroyed", 0 Player damage and no HP flash', () => {
    const run = play([
      { side: 'player', lane: 'right', atk: 120 },
      { side: 'enemy', lane: 'right', atk: 120 },
    ]);
    expect(calloutAt('right', run)).toMatchObject({ kind: 'tie', line1: '120 vs 120', line2: 'Tie · both destroyed', line3: '0 Player damage' });
    expect(run.steps.some((st) => st.visualType === 'clash-damage')).toBe(false);
    expect(run.steps.flatMap((st) => computeStepVisuals(st, run.s).hpFx)).toEqual([]);
  });

  it('145 into an empty lane: "145 ATK / Direct hit · 145"', () => {
    const run = play([{ side: 'player', lane: 'left', atk: 145 }]);
    expect(calloutAt('left', run)).toMatchObject({ kind: 'direct', line1: '145 ATK', line2: 'Direct hit · 145' });
  });

  it('every lane’s Clash Damage beat commits only its own HP change (the displayed HP never jumps ahead)', () => {
    const run = play([
      { side: 'player', lane: 'left', atk: 145 },
      { side: 'enemy', lane: 'left', atk: 85 },
      { side: 'player', lane: 'center', atk: 95 },
      { side: 'enemy', lane: 'center', atk: 110 },
    ]);
    const dmg = run.steps.filter((st) => st.visualType === 'clash-damage');
    expect(dmg.map((st) => st.lane)).toEqual(['left', 'center']);
    const types = (st: (typeof dmg)[number]) => run.events.slice(0, st.maxEventIndex + 1).filter((e: GameEvent) => e.type === 'CLASH_DAMAGE').length;
    expect(dmg.map(types)).toEqual([1, 2]);
    // The left lane's loser leaves between the two lanes (Battle UX pass), and that exit commits no Clash Damage of its own.
    const destroyed = run.steps.findIndex((st) => st.visualType === 'hero-destroyed');
    expect(destroyed).toBeGreaterThan(run.steps.indexOf(dmg[0]));
    expect(destroyed).toBeLessThan(run.steps.indexOf(dmg[1]));
    expect(types(run.steps[destroyed])).toBe(1);
  });
});
