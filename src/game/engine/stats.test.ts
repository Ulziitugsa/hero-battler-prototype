import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, LaneId, Placement, Side } from '../types/index.js';
import { STARTER_DECKS } from '../cards/starterDecks.js';
import { cardAtk, createCardMatch, resolveCardRound } from '../cardCombat/engine.js';
import { summarizeBattle } from '../events/battleSummary.js';
import { computeMatchStats } from './stats.js';

// Post-match stats under card resolver v4, which no longer logs ON_PLAY: Units come from REVEAL placements, Continuous
// Spells from SPELL_ENTERED, one-time Spells from SPELL_RESOLVED - each card exactly once.

const KNIGHT = 'kng-common-knight'; // vanilla Unit
const WAR_CRY = 'spl-war-cry'; // one-time Spell: all allies +15 ATK this round
const BANNER = 'spl-battle-banner'; // Attached Spell (bound to its Unit)
const TOTEM = 'spl-growth-totem'; // lane-bound Continuous Spell

const stats = (events: GameEvent[]) => computeMatchStats(events, 0, 0, { player: 0, enemy: 0 });

function blankMatch(): GameState {
  const s = createCardMatch({ seed: 7, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).nextState;
  for (const side of ['player', 'enemy'] as Side[]) {
    s[side].hand = [];
    s[side].deck = [];
    s.cardCombat!.deckMarks[side] = [];
  }
  return s;
}

let uid = 0;
function play(s: GameState, cardId: string, lane: LaneId) {
  const handId = `h-${uid++}`;
  s.player.hand.push({ handId, cardId });
  return { handId, cardId, lane };
}

const unit = (side: Side, lane: LaneId, instanceId: string, cardId = KNIGHT, power?: number): Placement => ({ side, lane, zone: 'hero', instanceId, cardId, ...(power !== undefined ? { power } : {}) });
const reveal = (...placements: Placement[]): GameEvent => ({ type: 'REVEAL', handRemovals: [], placements });
const destroyed = (side: Side, lane: LaneId, instanceId: string): GameEvent => ({ type: 'HERO_DESTROYED', side, instanceId, cardId: KNIGHT, name: 'Knight', lane });

describe('computeMatchStats under card resolver v4', () => {
  it('counts a Unit, a one-time Spell and both kinds of Continuous Spell from a real v4 round', () => {
    const s = blankMatch();
    const plays = [play(s, KNIGHT, 'left'), play(s, BANNER, 'left'), play(s, WAR_CRY, 'center'), play(s, TOTEM, 'right')];
    const { events } = resolveCardRound(s, { plays }, { plays: [] });
    expect(events.some((e) => e.type === 'ON_PLAY')).toBe(false);
    expect(events.filter((e) => e.type === 'SPELL_ENTERED')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'SPELL_RESOLVED' && !e.fizzled)).toHaveLength(1);

    const st = stats(events);
    expect(st.heroesPlayed).toBe(1);
    expect(st.continuousSpellsPlayed).toBe(2);
    expect(st.spellsPlayed).toBe(3); // War Cry + Battle Banner + Growth Totem
    expect(st.cardsPlayed).toBe(4);
    for (const id of [KNIGHT, BANNER, WAR_CRY, TOTEM]) expect(st.perCard[id]?.played, id).toBe(1);
    expect(st.maxPowerReached).toBeGreaterThanOrEqual(cardAtk(KNIGHT)); // card-combat ATK, not legacy Power

    // Agrees with the mission/event summary, which already read v4 events.
    const summary = summarizeBattle('IN_PROGRESS', events, 'quick');
    expect(summary.unitsPlayed).toBe(st.heroesPlayed);
    expect(summary.spellsPlayed).toBe(st.spellsPlayed);
  });

  it('counts a one-time Spell once and a Continuous Spell once, whatever else the round logs about them', () => {
    const st = stats([
      { type: 'ROUND_START', round: 1 },
      reveal(unit('player', 'left', 'u1'), { side: 'player', lane: 'center', zone: 'spell', instanceId: 's1', cardId: TOTEM }),
      { type: 'TRIGGER', side: 'player', sourceName: 'War Cry', trigger: 'CAST', label: 'Cast' },
      { type: 'SPELL_RESOLVED', side: 'player', lane: 'right', cardId: WAR_CRY, name: 'War Cry', fizzled: false },
      { type: 'SPELL_ENTERED', side: 'player', instanceId: 's1', cardId: TOTEM, name: 'Growth Totem', lane: 'center' },
      { type: 'ROUND_END', round: 1 },
    ]);
    expect(st.heroesPlayed).toBe(1);
    expect(st.continuousSpellsPlayed).toBe(1);
    expect(st.spellsPlayed).toBe(2);
    expect(st.cardsPlayed).toBe(3);
    expect(st.perCard[TOTEM].played).toBe(1);
    expect(st.perCard[WAR_CRY].played).toBe(1);
    expect(st.perCard[KNIGHT].played).toBe(1);
  });

  it('averages how many rounds a Unit stays on the board from the round it was revealed', () => {
    const st = stats([
      { type: 'ROUND_START', round: 1 },
      reveal(unit('player', 'left', 'a')),
      { type: 'ROUND_END', round: 1 },
      { type: 'ROUND_START', round: 2 },
      reveal(unit('enemy', 'left', 'b')),
      destroyed('enemy', 'left', 'b'), // 1 round
      { type: 'ROUND_END', round: 2 },
      { type: 'ROUND_START', round: 3 },
      destroyed('player', 'left', 'a'), // rounds 1-3
      { type: 'ROUND_END', round: 3 },
    ]);
    expect(st.heroesDestroyed).toBe(2);
    expect(st.avgRoundsHeroStaysOnBoard).toBe(2);
  });

  it('counts a full-board moment each time a side fills its third lane', () => {
    const st = stats([
      { type: 'ROUND_START', round: 1 },
      reveal(unit('player', 'left', 'p1'), unit('player', 'center', 'p2'), unit('enemy', 'left', 'e1')),
      { type: 'ROUND_END', round: 1 },
      { type: 'ROUND_START', round: 2 },
      reveal(unit('player', 'right', 'p3')), // player full: 1
      destroyed('player', 'center', 'p2'),
      { type: 'ROUND_END', round: 2 },
      { type: 'ROUND_START', round: 3 },
      reveal(unit('player', 'center', 'p4')), // player full again: 2
      { type: 'ROUND_END', round: 3 },
    ]);
    expect(st.heroesPlayed).toBe(5);
    expect(st.fullBoardStates).toBe(2);
  });

  it('takes Max ATK from the ATK a Unit entered or returned with', () => {
    const st = stats([
      { type: 'ROUND_START', round: 1 },
      reveal(unit('player', 'left', 'a', KNIGHT, 45)),
      { type: 'REVIVED', side: 'enemy', instanceId: 'r', cardId: KNIGHT, name: 'Knight', lane: 'left', power: 60, graveyardIndex: 0 },
    ]);
    expect(st.maxPowerReached).toBe(60);
    expect(st.heroesRevived).toBe(1);
  });

  it('still reads legacy logs (REVEAL plus ON_PLAY) without double-counting', () => {
    const st = stats([
      { type: 'ROUND_START', round: 1 },
      reveal(unit('player', 'left', 'h1'), { side: 'player', lane: 'left', zone: 'spell', instanceId: 's1', cardId: TOTEM }),
      { type: 'ON_PLAY', side: 'player', instanceId: 's1', cardId: TOTEM, name: 'Growth Totem', lane: 'left', zone: 'spell' },
      { type: 'ON_PLAY', side: 'player', instanceId: 'h1', cardId: KNIGHT, name: 'Knight', lane: 'left', zone: 'hero' },
      { type: 'ROUND_END', round: 1 },
    ]);
    expect(st.heroesPlayed).toBe(1);
    expect(st.continuousSpellsPlayed).toBe(1);
    expect(st.cardsPlayed).toBe(2);
    expect(st.perCard[KNIGHT].played).toBe(1);
    expect(st.perCard[TOTEM].played).toBe(1);
  });
});
