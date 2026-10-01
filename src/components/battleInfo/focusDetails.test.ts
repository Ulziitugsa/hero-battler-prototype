import { describe, expect, it } from 'vitest';
import type { GameState, LaneId, Side } from '../../game/types';
import { focusDetails, handCardDetails } from './focusDetails';
import { buildBattleScene } from '../../pages/battleScenes';
import { matchHpContribution } from '../../game/cardCombat/engine';

// The focus panel's content (Info layers pass, layer 2) on the QA board at the start of round 3 (battleScenes.ts):
// Royal Guard in the center under Battle Banner with Common Knight and Light Priest beside it (both +15 ATK from its
// On Play), Vharos revived at 95 ATK and Dark Priest across the board.

const { state, events } = buildBattleScene('3');
const hpc = (cardId: string, owner: Side) => matchHpContribution(state, owner, cardId);
const unit = (side: Side, lane: LaneId, s: GameState = state) => focusDetails({ kind: 'unit', side, instanceId: s[side].heroZones[lane]!.instanceId }, s, events, hpc)!;

describe('focus panel details', () => {
  it('Royal Guard on the board: current ATK, full rules, its passive on, and the Banner’s bonus by name', () => {
    const guard = unit('player', 'center');
    expect(guard).toMatchObject({ name: 'Royal Guard', owner: 'player', place: 'board', lane: 'center', kind: 'unit', atk: 128, printedAtk: 113, hpContribution: hpc('kng-royal-guard', 'player') });
    expect(guard.effects).toEqual([
      { chip: 'On Play', text: 'Adjacent allied Units gain +15 ATK for the rest of the battle.' },
      { chip: 'Passive', text: 'While another Kingdom Unit is in play, enemy Spells can’t affect this Unit.', active: true },
    ]);
    expect(guard.changes).toEqual([{ amount: 15, source: 'Battle Banner', lasts: 'spell' }]);
    expect(guard.status).toEqual([]);
    expect(guard.entered).toBeUndefined();
  });

  it('an ally Royal Guard buffed: a lasting bonus, by source', () => {
    expect(unit('player', 'left')).toMatchObject({ name: 'Common Knight', atk: 143, printedAtk: 128, effects: [], changes: [{ amount: 15, source: 'Royal Guard', lasts: 'battle' }] });
  });

  it('a revived enemy Unit: how and at what ATK it came back', () => {
    expect(unit('enemy', 'left')).toMatchObject({ name: 'Vharos', owner: 'enemy', atk: 95, printedAtk: 130, entered: { atk: 95, how: 'revived' }, changes: [] });
  });

  it('a bonus that lasted only last round is gone', () => {
    // Dark Priest gained +30 ATK this round in round 2; at the start of round 3 it is back to 84 with nothing listed.
    expect(unit('enemy', 'right')).toMatchObject({ name: 'Dark Priest', atk: 84, changes: [] });
  });

  it('a passive whose condition fails reads as off', () => {
    const alone: GameState = { ...state, player: { ...state.player, heroZones: { left: null, center: state.player.heroZones.center, right: null } } };
    expect(unit('player', 'center', alone).effects[1]).toMatchObject({ chip: 'Passive', active: false });
  });

  it('a Continuous Spell: its rules and who stands in its lane', () => {
    const banner = state.player.spellZones.center!;
    expect(focusDetails({ kind: 'spell', side: 'player', instanceId: banner.instanceId }, state, events)).toMatchObject({
      name: 'Battle Banner',
      place: 'spellZone',
      lane: 'center',
      kind: 'continuous',
      effects: [{ chip: 'Passive', text: 'Your Unit in this lane has +15 ATK.' }],
      laneUnits: { yours: 'Royal Guard' },
    });
  });

  it('a card in hand: printed ATK, HP Contribution and every rule', () => {
    const paladin = state.player.hand.find((h) => h.cardId === 'kng-paladin')!;
    expect(focusDetails({ kind: 'hand', handId: paladin.handId, cardId: paladin.cardId }, state, events, hpc)).toEqual(handCardDetails('kng-paladin', hpc('kng-paladin', 'player')));
    const vael = handCardDetails('kng-archmage-vael', 98);
    expect(vael).toMatchObject({ kind: 'unit', atk: 94, printedAtk: 94, hpContribution: 98 });
    expect(vael.effects.map((e) => e.chip)).toEqual(['Passive', 'Your 2nd Spell', 'Round End']);
    expect(handCardDetails('spl-aegis-ward')).toMatchObject({ kind: 'spell', effects: [{ chip: 'On Play' }, { chip: 'On Play' }] });
    expect(handCardDetails('spl-aegis-ward').atk).toBeUndefined();
  });

  it('null once the card is gone', () => {
    expect(focusDetails({ kind: 'unit', side: 'enemy', instanceId: 'gone' }, state, events)).toBeNull();
    expect(focusDetails({ kind: 'hand', handId: 'gone', cardId: 'kng-paladin' }, state, events)).toBeNull();
  });
});
