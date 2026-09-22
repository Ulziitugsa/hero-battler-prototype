import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { redactEventsForViewer, redactStateForViewer } from './redact';

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    side: 'player',
    hp: 20,
    deck: ['kng-common-knight', 'und-bone-soldier'],
    hand: [
      { handId: 'h1', cardId: 'kng-common-knight' },
      { handId: 'h2', cardId: 'und-bone-soldier' },
    ],
    graveyard: [],
    heroZones: { left: null, center: null, right: null },
    spellZones: { left: null, center: null, right: null },
    ...overrides,
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    round: 1,
    rngState: 42,
    player: player(),
    enemy: { ...player(), side: 'enemy' },
    status: 'IN_PROGRESS',
    ...overrides,
  };
}

describe('redactStateForViewer', () => {
  it('hides the opponent hand contents and deck contents, keeping array lengths', () => {
    const s = state();
    const view = redactStateForViewer(s, 'player');
    expect(view.enemy.hand).toHaveLength(2);
    expect(view.enemy.hand.every((h) => h.cardId === '__hidden__')).toBe(true);
    expect(view.enemy.hand.map((h) => h.handId)).toEqual(['h1', 'h2']);
    expect(view.enemy.deck).toHaveLength(2);
    expect(view.enemy.deck.every((id) => id === '__hidden__')).toBe(true);
  });

  it("never touches the viewer's own hand/deck", () => {
    const s = state();
    const view = redactStateForViewer(s, 'player');
    expect(view.player).toEqual(s.player);
  });

  it('flips which side is hidden for the enemy viewer', () => {
    const s = state();
    const view = redactStateForViewer(s, 'enemy');
    expect(view.enemy).toEqual(s.enemy);
    expect(view.player.hand.every((h) => h.cardId === '__hidden__')).toBe(true);
  });
});

describe('redactEventsForViewer', () => {
  it("strips cardId/cardName off the opponent's DRAW and CARD_DRAWN events only", () => {
    const events = [
      { type: 'DRAW' as const, side: 'player' as const, cardId: 'kng-common-knight', cardName: 'Knight', fizzled: false },
      { type: 'DRAW' as const, side: 'enemy' as const, cardId: 'und-bone-soldier', cardName: 'Ghoul', fizzled: false },
      { type: 'CARD_DRAWN' as const, side: 'enemy' as const, cardId: 'und-bone-soldier', cardName: 'Ghoul', handId: 'h9' },
    ];
    const view = redactEventsForViewer(events, 'player');
    expect(view[0]).toEqual(events[0]); // own draw, untouched
    expect(view[1]).toEqual({ type: 'DRAW', side: 'enemy', fizzled: false });
    expect(view[2]).toMatchObject({ type: 'CARD_DRAWN', side: 'enemy', cardId: '__hidden__', cardName: '???', handId: 'h9' });
  });

  it('passes every other event type through unchanged', () => {
    const events = [
      { type: 'COMBAT' as const, lane: 'left' as const, outcome: 'PLAYER_WINS' as const, player: { name: 'Knight', power: 5 }, enemy: { name: 'Ghoul', power: 3 } },
      { type: 'ROUND_START' as const, round: 2 },
    ];
    expect(redactEventsForViewer(events, 'enemy')).toEqual(events);
  });
});
