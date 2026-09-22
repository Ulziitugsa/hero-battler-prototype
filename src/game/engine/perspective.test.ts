import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, PlayerState } from '../types';
import { validateDeployment } from './resolveRound';
import { orientEventsForViewer, orientStateForViewer, toCanonicalAction } from './perspective';

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    side: 'player',
    hp: 20,
    deck: ['kng-common-knight'],
    hand: [{ handId: 'p-h1', cardId: 'kng-common-knight' }],
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
    player: player({ hand: [{ handId: 'p-h1', cardId: 'kng-common-knight' }] }),
    enemy: player({ side: 'enemy', hand: [{ handId: 'e-h1', cardId: 'und-bone-soldier' }] }),
    status: 'IN_PROGRESS',
    masteries: { player: { id: 'valor', rank: 2 } },
    ascensions: { player: { 'kng-common-knight': 1 } },
    ...overrides,
  };
}

describe('orientStateForViewer', () => {
  it('host (player) viewpoint is the canonical state, just redacted', () => {
    const s = state();
    const view = orientStateForViewer(s, 'player');
    expect(view.player.hand[0].cardId).toBe('kng-common-knight'); // own hand, real
    expect(view.enemy.hand[0].cardId).toBe('__hidden__'); // opponent hand, hidden
    expect(view.masteries).toEqual({ player: { id: 'valor', rank: 2 } });
  });

  it("guest (enemy) viewpoint relabels the guest's own data under .player", () => {
    const s = state();
    const view = orientStateForViewer(s, 'enemy');
    expect(view.player.hand[0].cardId).toBe('und-bone-soldier'); // guest's own real hand, now under .player
    expect(view.enemy.hand[0].cardId).toBe('__hidden__'); // host's hand, hidden
    expect(view.player.hp).toBe(s.enemy.hp);
    expect(view.enemy.hp).toBe(s.player.hp);
  });

  it('flips Side-keyed masteries/ascensions maps for the guest viewpoint', () => {
    const s = state();
    const view = orientStateForViewer(s, 'enemy');
    expect(view.masteries).toEqual({ enemy: { id: 'valor', rank: 2 } });
    expect(view.ascensions).toEqual({ enemy: { 'kng-common-knight': 1 } });
  });

  it('is NOT safe to apply twice - re-orienting an already-guest-oriented view hides the wrong side', () => {
    const s = state();
    const guestView = orientStateForViewer(s, 'enemy');
    const doubleOriented = orientStateForViewer(guestView, 'enemy');
    // The guest's own real hand (correctly visible after one orientation) gets wrongly hidden by a second pass.
    expect(doubleOriented.player.hand[0].cardId).toBe('__hidden__');
    expect(doubleOriented).not.toEqual(guestView);
  });
});

describe('orientEventsForViewer', () => {
  const combatEvent: GameEvent = {
    type: 'COMBAT',
    lane: 'left',
    outcome: 'PLAYER_WINS',
    player: { name: 'Knight', power: 7 },
    enemy: { name: 'Ghoul', power: 4 },
  };
  const matchEndEvent: GameEvent = { type: 'MATCH_END', winner: 'player', reason: 'HP reached 0' };
  const drawEvent: GameEvent = { type: 'DRAW', side: 'enemy', cardId: 'und-bone-soldier', cardName: 'Ghoul', fizzled: false };

  it('host viewpoint keeps COMBAT/MATCH_END orientation unchanged (only redaction applies)', () => {
    const view = orientEventsForViewer([combatEvent, matchEndEvent], 'player');
    expect(view[0]).toEqual(combatEvent);
    expect(view[1]).toEqual(matchEndEvent);
  });

  it('guest viewpoint swaps COMBAT player/enemy keys AND flips the outcome so the winning side stays consistent', () => {
    const [flipped] = orientEventsForViewer([combatEvent], 'enemy');
    expect(flipped).toEqual({ type: 'COMBAT', lane: 'left', outcome: 'ENEMY_WINS', player: { name: 'Ghoul', power: 4 }, enemy: { name: 'Knight', power: 7 } });
  });

  it("guest viewpoint flips MATCH_END.winner but leaves 'draw' alone", () => {
    const [flipped] = orientEventsForViewer([matchEndEvent], 'enemy');
    expect(flipped).toEqual({ type: 'MATCH_END', winner: 'enemy', reason: 'HP reached 0' });
    const draw: GameEvent = { type: 'MATCH_END', winner: 'draw', reason: 'Both at 0' };
    expect(orientEventsForViewer([draw], 'enemy')[0]).toEqual(draw);
  });

  it('redacts the true opponent draw before flipping side labels', () => {
    // Viewer is the host ('player'); the DRAW event belongs to the true opponent (enemy) - must be redacted.
    const [redacted] = orientEventsForViewer([drawEvent], 'player');
    expect(redacted).toEqual({ type: 'DRAW', side: 'enemy', fizzled: false });
  });
});

describe('toCanonicalAction + validateDeployment (both viewpoints)', () => {
  it("a guest's locally-built PlayerAction (against its own oriented view) validates correctly as canonical 'enemy'", () => {
    const s = state();
    const guestView = orientStateForViewer(s, 'enemy');
    // Guest sees its own real hand card under .player (per orientStateForViewer) and plays it.
    const guestHandId = guestView.player.hand[0].handId;
    const localAction = { plays: [{ handId: guestHandId, cardId: 'und-bone-soldier', lane: 'left' as const }] };

    const canonicalAction = toCanonicalAction('enemy', localAction);
    const result = validateDeployment(s, 'enemy', canonicalAction);
    expect(result.legal).toBe(true);
  });

  it("a host's locally-built PlayerAction validates correctly as canonical 'player'", () => {
    const s = state();
    const hostView = orientStateForViewer(s, 'player');
    const hostHandId = hostView.player.hand[0].handId;
    const localAction = { plays: [{ handId: hostHandId, cardId: 'kng-common-knight', lane: 'left' as const }] };

    const canonicalAction = toCanonicalAction('player', localAction);
    const result = validateDeployment(s, 'player', canonicalAction);
    expect(result.legal).toBe(true);
  });
});
