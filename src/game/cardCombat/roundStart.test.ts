import { describe, expect, it, vi } from 'vitest';
import type { GameState, LaneId, PlayerAction, Side } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { STARTER_DECKS } from '../cards/starterDecks.js';

// No printed card uses Round Start after the timing cleanup (section 18), but the hook is part of the timing
// vocabulary. This test authors one Round Start effect on a vanilla Unit to prove the hook fires once per round per
// Unit in play, and never for a Unit that has left play.

const KNIGHT = 'kng-common-knight';

vi.mock('./cards.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./cards.js')>();
  return {
    ...mod,
    getCombatCard: (id: string) =>
      id === KNIGHT
        ? { ...mod.getCombatCard(id), abilities: [{ trigger: 'ROUND_START', actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'SELF' }], text: 'Round Start: gain +15 ATK this round.' }] }
        : mod.getCombatCard(id),
  };
});

const { beginCardRound, cardAtk, createCardMatch, resolveCardRound } = await import('./engine.js');

const NONE: PlayerAction = { plays: [] };

function blankMatch(): GameState {
  const s = createCardMatch({ seed: 5, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).nextState;
  for (const side of ['player', 'enemy'] as Side[]) {
    s[side].hand = [];
    s[side].deck = [];
    s.cardCombat!.deckMarks[side] = [];
  }
  return s;
}

function put(s: GameState, side: Side, lane: LaneId, cardId: string, atk: number) {
  const card = getCard(cardId);
  s[side].heroZones[lane] = { instanceId: `rs-${side}-${lane}`, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power: atk, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, enteredRound: 0, entryAtk: atk };
}

const roundStarts = (events: readonly { type: string; trigger?: string }[]) => events.filter((e) => e.type === 'TRIGGER' && e.trigger === 'ROUND_START').length;

describe('Round Start', () => {
  it('fires exactly once per round for each Unit in play, and not for a Unit that has left', () => {
    const s = blankMatch();
    put(s, 'player', 'left', KNIGHT, cardAtk(KNIGHT));
    put(s, 'enemy', 'left', 'und-bone-soldier', 10); // loses the clash, so the Knight stays
    put(s, 'player', 'right', KNIGHT, 10);
    put(s, 'enemy', 'right', 'und-bone-soldier', 300); // wins, so the right Knight leaves play
    const one = beginCardRound(s);
    expect(roundStarts(one.events)).toBe(2);
    expect(one.nextState.player.heroZones.left?.tempPower).toBe(15);
    const two = beginCardRound(resolveCardRound(one.nextState, NONE, NONE).nextState);
    expect(roundStarts(two.events)).toBe(1);
    expect(two.nextState.player.heroZones.right).toBeNull();
    expect(two.nextState.player.heroZones.left?.tempPower).toBe(15); // this round only: last round's +15 expired
  });
});
