import type { GameEvent, GameState, HandCard, HeroInstance, LaneId, Side, SpellZoneInstance } from '../game/types';
import { cardAtk, createCardMatch } from '../game/cardCombat/engine';
import { getCombatCard } from '../game/cardCombat/cards';

// Arranged positions on a real card match: the board, hands, Graveyards, deck order and Player HP an Arcane Trial (or a
// test) starts from. The match itself is the engine's own (createCardMatch: its state shape, its seeded RNG); only the
// position is set. Nothing about what happens next is arranged: from here the resolver decides everything.

export interface ArrangedUnit {
  cardId: string;
  /** Stored ATK, when the position says earlier rounds already changed it. */
  atk?: number;
  /** It already has a Shield (from an earlier Aegis Ward, say). */
  shielded?: boolean;
}

export interface ArrangedSide {
  /** Player HP (and its maximum). */
  hp: number;
  board?: Partial<Record<LaneId, ArrangedUnit>>;
  /** Continuous Spells in play; `attached` binds an Attached Spell to the Unit in its lane. */
  spells?: Partial<Record<LaneId, { cardId: string; attached?: boolean }>>;
  hand: string[];
  graveyard?: string[];
  /** The deck, top card first: what this side draws, in order. */
  deck?: string[];
}

export interface ArrangedPosition {
  round: number;
  seed: number;
  player: ArrangedSide;
  enemy: ArrangedSide;
}

const SIDES: Side[] = ['player', 'enemy'];
const LANES: LaneId[] = ['left', 'center', 'right'];

function arrangedUnit(side: Side, lane: LaneId, arranged: ArrangedUnit, round: number): HeroInstance {
  const card = getCombatCard(arranged.cardId);
  const printed = cardAtk(arranged.cardId);
  return {
    instanceId: `trial-h-${side}-${lane}`,
    cardId: card.id,
    faction: card.faction,
    name: card.name,
    shortName: card.shortName,
    power: arranged.atk ?? printed,
    tempPower: 0,
    shielded: !!arranged.shielded,
    silenced: false,
    usedThisRound: false,
    // On the board before this round: "from the round after you play it" lines are live.
    enteredRound: round - 1,
    entryAtk: printed,
  };
}

/** The arranged position as a real card match at the start of its round's Deploy step. Deterministic. */
export function arrange(position: ArrangedPosition): { state: GameState; events: GameEvent[] } {
  const filler = (s: ArrangedSide) => [...(s.deck ?? []), ...s.hand, ...LANES.flatMap((l) => (s.board?.[l] ? [s.board[l]!.cardId] : []))];
  const built = createCardMatch({ seed: position.seed, playerDeck: filler(position.player), enemyDeck: filler(position.enemy) });
  const state = structuredClone(built.nextState);
  state.round = position.round;
  for (const side of SIDES) {
    const spec = position[side];
    const p = state[side];
    p.hp = spec.hp;
    p.maxHp = spec.hp;
    state.cardCombat!.startingHp[side] = spec.hp;
    p.deck = [...(spec.deck ?? [])];
    state.cardCombat!.deckMarks[side] = p.deck.map(() => false);
    p.hand = spec.hand.map((cardId, i): HandCard => ({ handId: `trial-hand-${side}-${i}`, cardId }));
    p.graveyard = [...(spec.graveyard ?? [])];
    state.cardCombat!.graveMarks[side] = p.graveyard.map(() => false);
    for (const lane of LANES) {
      const arranged = spec.board?.[lane];
      p.heroZones[lane] = arranged ? arrangedUnit(side, lane, arranged, position.round) : null;
      const spell = spec.spells?.[lane];
      if (!spell) {
        p.spellZones[lane] = null;
        continue;
      }
      const card = getCombatCard(spell.cardId);
      const zone: SpellZoneInstance = { instanceId: `trial-s-${side}-${lane}`, cardId: card.id, faction: card.faction, name: card.name, shortName: card.shortName, usedThisRound: false };
      if (spell.attached && p.heroZones[lane]) zone.boundTo = p.heroZones[lane]!.instanceId;
      p.spellZones[lane] = zone;
    }
  }
  return { state, events: [{ type: 'ROUND_START', round: position.round }] };
}

/** The hand card of `side` holding `cardId` (the `nth` copy), for building a play. */
export function handIdOf(state: GameState, side: Side, cardId: string, nth = 0): string {
  const matches = state[side].hand.filter((h) => h.cardId === cardId);
  if (!matches[nth]) throw new Error(`${side} holds no ${cardId} #${nth}`);
  return matches[nth].handId;
}
