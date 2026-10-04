import { describe, expect, it } from 'vitest';
import type { GameState, LaneId, Side } from '../../game/types';
import { cardFocusDetails, focusDetails } from './focusDetails';
import { legacyAtk } from '../../game/cards/cardPresentation';
import { buildBattleScene } from '../../pages/battleScenes';
import { matchHpContribution } from '../../game/cardCombat/engine';

// The focus panel's content (Info layers pass, layer 2) on the QA board at the start of round 3 (battleScenes.ts):
// Royal Guard on the left beside Common Knight, who carries the attached Battle Banner in the center (+15 from the
// Banner, +15 from Royal Guard's aura), Light Priest on the right with its Shield used, Vharos revived at 95 ATK and Dark
// Priest across the board.

const { state, events } = buildBattleScene('3');
const hpc = (cardId: string) => matchHpContribution(cardId);
const unit = (side: Side, lane: LaneId, s: GameState = state) => focusDetails({ kind: 'unit', side, instanceId: s[side].heroZones[lane]!.instanceId }, s, events, { rules: 'card', hpContribution: hpc })!;

describe('focus panel details', () => {
  it('Royal Guard on the board: current ATK, full rules, its passive on', () => {
    const guard = unit('player', 'left');
    expect(guard).toMatchObject({ name: 'Royal Guard', owner: 'player', place: 'board', lane: 'left', kind: 'unit', atk: 113, printedAtk: 113, hpContribution: hpc('kng-royal-guard') });
    expect(guard.effects).toMatchObject([
      { label: 'Passive', text: 'Adjacent allied Units have +15 ATK.' },
      { label: 'Destroyed', text: 'Adjacent allied Units gain +15 ATK for the rest of the battle.' },
      { label: 'Passive', text: 'While another Kingdom Unit is in play, enemy Spells can’t affect this Unit.', active: true },
    ]);
    expect(guard.changes).toEqual([]);
    expect(guard.status).toEqual([]);
    expect(guard.entered).toBeUndefined();
  });

  it('a Unit under an Attached Spell and an aura: each bonus by source, and how long it lasts', () => {
    expect(unit('player', 'center')).toMatchObject({
      name: 'Common Knight',
      atk: 158,
      printedAtk: 128,
      effects: [],
      changes: [
        { amount: 15, source: 'Battle Banner', lasts: 'spell' },
        { amount: 15, source: 'Royal Guard', lasts: 'aura' },
      ],
    });
  });

  it('a printed Shield shows until it is used', () => {
    expect(unit('player', 'right')).toMatchObject({ name: 'Light Priest', status: [] });
    const fresh: GameState = { ...state, player: { ...state.player, heroZones: { ...state.player.heroZones, right: { ...state.player.heroZones.right!, printedShieldUsed: false } } } };
    expect(unit('player', 'right', fresh).status).toEqual(['Shield']);
  });

  it('a revived enemy Unit: how and at what ATK it came back', () => {
    expect(unit('enemy', 'center')).toMatchObject({ name: 'Vharos', owner: 'enemy', atk: 95, printedAtk: 130, entered: { atk: 95, how: 'revived' }, changes: [] });
  });

  it('a bonus that lasted only last round is gone', () => {
    expect(unit('enemy', 'right')).toMatchObject({ name: 'Dark Priest', atk: 84, changes: [] });
  });

  it('a passive whose condition fails reads as off', () => {
    const alone: GameState = { ...state, player: { ...state.player, heroZones: { left: state.player.heroZones.left, center: null, right: null } } };
    expect(unit('player', 'left', alone).effects[2]).toMatchObject({ label: 'Passive', active: false });
  });

  it('an Attached Spell: its rules, its Unit and who stands in its lane', () => {
    const banner = state.player.spellZones.center!;
    expect(focusDetails({ kind: 'spell', side: 'player', instanceId: banner.instanceId }, state, events)).toMatchObject({
      name: 'Battle Banner',
      place: 'spellZone',
      lane: 'center',
      kind: 'attached',
      effects: [{ label: 'Passive', text: 'The Unit it is attached to has +15 ATK.' }],
      laneUnits: { yours: 'Common Knight', theirs: 'Vharos' },
      attachedTo: 'Common Knight',
    });
  });

  it('a card in hand: printed ATK, HP Contribution and every rule', () => {
    const paladin = state.player.hand.find((h) => h.cardId === 'kng-paladin')!;
    expect(focusDetails({ kind: 'hand', handId: paladin.handId, cardId: paladin.cardId }, state, events, { rules: 'card', hpContribution: hpc })).toEqual(
      cardFocusDetails('kng-paladin', { rules: 'card', place: 'hand', hpContribution: hpc('kng-paladin') }),
    );
    const vael = cardFocusDetails('kng-archmage-vael', { place: 'hand', hpContribution: 98 });
    expect(vael).toMatchObject({ kind: 'unit', atk: 94, printedAtk: 94, hpContribution: 98 });
    expect(vael.effects.map((e) => e.label)).toEqual(['Passive', 'Your 2nd Spell', 'Round End']);
    expect(cardFocusDetails('spl-aegis-ward')).toMatchObject({ kind: 'spell', effects: [{ label: 'Cast' }, { label: 'Cast' }] });
    expect(cardFocusDetails('spl-burning-ground').kind).toBe('continuous');
    expect(cardFocusDetails('spl-fortify').kind).toBe('attached');
    expect(cardFocusDetails('spl-aegis-ward').atk).toBeUndefined();
    expect(cardFocusDetails('spl-aegis-ward').hpContribution).toBeUndefined();
  });

  it('null once the card is gone', () => {
    expect(focusDetails({ kind: 'unit', side: 'enemy', instanceId: 'gone' }, state, events)).toBeNull();
    expect(focusDetails({ kind: 'hand', handId: 'gone', cardId: 'kng-paladin' }, state, events)).toBeNull();
  });

  it('a legacy battle: the Power band as ATK, the legacy rules and no HP Contribution', () => {
    const priest = cardFocusDetails('kng-light-priest', { rules: 'legacy', place: 'hand', hpContribution: 99 });
    expect(priest).toMatchObject({ rules: 'legacy', atk: legacyAtk(3), printedAtk: legacyAtk(3) });
    expect(priest.hpContribution).toBeUndefined();
    expect(priest.effects.map((e) => e.text).join(' ')).toContain('3 HP');
    // Card Mastery effects are listed and marked in a legacy battle only.
    expect(cardFocusDetails('kng-royal-guard', { rules: 'legacy', masteryRank: 1 }).effects.some((e) => e.mastery)).toBe(true);
    expect(cardFocusDetails('kng-royal-guard', { rules: 'card', masteryRank: 1 }).effects.some((e) => e.mastery)).toBe(false);
  });
});
