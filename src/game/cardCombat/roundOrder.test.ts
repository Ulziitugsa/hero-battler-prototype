import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, HeroInstance, LaneId, Side, SpellZoneInstance } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { STARTER_DECKS } from '../cards/starterDecks.js';
import { ROUND_STEPS } from '../cards/cardPresentation.js';
import { cardAtk, createCardMatch, resolveCardRound } from './engine.js';

// "How a round works" (Help, docs/CARD-TEXT.md) is checked against the real round resolver, including the answer to
// "if I destroy the enemy's +15 ATK Spell before lanes fight, does the enemy still get the +15 this round?" (no).

const KNIGHT = 'kng-common-knight'; // vanilla: no effect

function blankMatch(round = 1): GameState {
  const s = createCardMatch({ seed: 3, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).nextState;
  for (const side of ['player', 'enemy'] as Side[]) {
    s[side].hand = [];
    s[side].deck = [];
    s.cardCombat!.deckMarks[side] = [];
  }
  s.round = round;
  return s;
}

let uid = 0;
function put(s: GameState, side: Side, lane: LaneId, cardId: string): HeroInstance {
  const card = getCard(cardId);
  const atk = cardAtk(cardId);
  const unit: HeroInstance = { instanceId: `ro-${uid++}`, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power: atk, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, enteredRound: 0, entryAtk: atk };
  s[side].heroZones[lane] = unit;
  return unit;
}
function spellIn(s: GameState, side: Side, lane: LaneId, cardId: string): SpellZoneInstance {
  const card = getCard(cardId);
  const zone: SpellZoneInstance = { instanceId: `rz-${uid++}`, cardId, faction: card.faction, name: card.name, shortName: card.shortName, usedThisRound: false };
  s[side].spellZones[lane] = zone;
  return zone;
}
function hand(s: GameState, side: Side, cardId: string) {
  const h = { handId: `h-${side}-${uid++}`, cardId };
  s[side].hand.push(h);
  return h;
}
const combat = (events: readonly GameEvent[], lane: LaneId) => events.find((e): e is Extract<GameEvent, { type: 'COMBAT' }> => e.type === 'COMBAT' && e.lane === lane)!;

describe('how a round works', () => {
  it('Help lists the round in the resolver’s order', () => {
    expect(ROUND_STEPS.map((s) => s.term)).toEqual(['Round Start', 'Play', 'Spells', 'Before lanes fight', 'Lanes fight', 'Round End', 'Win check']);
  });

  for (const round of [1, 2]) {
    it(`an enemy Spell destroyed before lanes fight gives no ATK in that fight (round ${round})`, () => {
      const s = blankMatch(round);
      put(s, 'player', 'left', KNIGHT);
      put(s, 'enemy', 'left', KNIGHT);
      spellIn(s, 'enemy', 'left', 'spl-ghost-lantern'); // Your Unit in this lane gets +15 ATK.
      const kept = resolveCardRound(structuredClone(s), { plays: [] }, { plays: [] });
      expect(combat(kept.events, 'left').enemy!.power).toBe(cardAtk(KNIGHT) + 15);

      const dispel = hand(s, 'player', 'spl-dispel');
      const r = resolveCardRound(s, { plays: [{ handId: dispel.handId, cardId: 'spl-dispel', lane: 'left' }] }, { plays: [] });
      expect(r.nextState.enemy.spellZones.left).toBeNull();
      expect(combat(r.events, 'left')).toMatchObject({ outcome: 'TIE', enemy: { power: cardAtk(KNIGHT) } });
    });
  }

  it('in a lane where both players cast a Spell, the player with initiative goes first: you in odd rounds, the enemy in even rounds', () => {
    for (const [round, first] of [[1, 'player'], [2, 'enemy'], [3, 'player']] as const) {
      const s = blankMatch(round);
      spellIn(s, 'player', 'center', 'spl-ghost-lantern');
      spellIn(s, 'enemy', 'center', 'spl-ghost-lantern');
      const mine = hand(s, 'player', 'spl-dispel');
      const theirs = hand(s, 'enemy', 'spl-dispel');
      const r = resolveCardRound(s, { plays: [{ handId: mine.handId, cardId: 'spl-dispel', lane: 'center' }] }, { plays: [{ handId: theirs.handId, cardId: 'spl-dispel', lane: 'center' }] });
      const order = r.events.filter((e) => e.type === 'SPELL_RESOLVED').map((e) => (e as Extract<GameEvent, { type: 'SPELL_RESOLVED' }>).side);
      expect(order[0], `round ${round}`).toBe(first);
    }
  });

  it('Spells resolve lane by lane from left to right, before initiative', () => {
    const s = blankMatch(2); // the enemy has initiative
    spellIn(s, 'enemy', 'left', 'spl-ghost-lantern');
    spellIn(s, 'player', 'right', 'spl-ghost-lantern');
    const mine = hand(s, 'player', 'spl-dispel');
    const theirs = hand(s, 'enemy', 'spl-dispel');
    const r = resolveCardRound(s, { plays: [{ handId: mine.handId, cardId: 'spl-dispel', lane: 'left' }] }, { plays: [{ handId: theirs.handId, cardId: 'spl-dispel', lane: 'right' }] });
    const lanes = r.events.filter((e) => e.type === 'SPELL_RESOLVED').map((e) => (e as Extract<GameEvent, { type: 'SPELL_RESOLVED' }>).lane);
    expect(lanes).toEqual(['left', 'right']);
  });
});
