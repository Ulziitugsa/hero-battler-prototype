import type { GameEvent, GameState, LaneId, Side } from '../../game/types';
import { LANES } from '../../game/types';
import { getCard } from '../../game/cards';
import { cardAtk, continuousAtkBonus, passiveEffectStates } from '../../game/cardCombat/engine';
import { cardCombatBattleEffects } from '../../game/cardCombat/cardText';

/**
 * Card combat's focus panel (Info layers pass, layer 2): the card a tap picked out in battle, with its full rules and
 * what is true of it right now. Pure: GamePage passes the board as shown (pending plays included) and the match log.
 */

/** What the focus panel shows: a card in hand, a Unit on the board, or a Spell in a Spell zone. */
export type BattleFocus = { kind: 'hand'; handId: string; cardId: string } | { kind: 'unit'; side: Side; instanceId: string } | { kind: 'spell'; side: Side; instanceId: string };

export interface FocusEffectLine {
  /** The label the card face uses ("On Play", "Guard 2"). */
  chip: string;
  /** The full rule. */
  text: string;
  /** A conditional always-on effect of a Unit on the board: whether it is on right now. */
  active?: boolean;
}

export interface FocusAtkChange {
  amount: number;
  /** The card it came from, or "its own effect". */
  source: string;
  /** Until Round End; while that Continuous Spell stays in the lane; or for the rest of the battle. */
  lasts: 'round' | 'spell' | 'battle';
}

export interface FocusDetails {
  cardId: string;
  name: string;
  owner: Side;
  place: 'hand' | 'board' | 'spellZone';
  lane?: LaneId;
  kind: 'unit' | 'spell' | 'continuous';
  /** A Unit's ATK: on the board, its current clash ATK (Continuous Spells included); in hand, its printed ATK. */
  atk?: number;
  printedAtk?: number;
  /** The ATK it entered play with, when that is not its printed ATK, and how it came back (a revived Unit). */
  entered?: { atk: number; how: 'revived' | 'summoned' | 'entered' };
  hpContribution?: number;
  effects: FocusEffectLine[];
  /** Where a board Unit's ATK differs from what it entered with, by source. */
  changes: FocusAtkChange[];
  /** Standing states: "Shield", "Silenced this round", ... */
  status: string[];
  /** A Continuous Spell: the Units standing in its lane. */
  laneUnits?: { yours?: string; theirs?: string };
}

const other = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');

function kindOf(cardId: string): FocusDetails['kind'] {
  const card = getCard(cardId);
  return card.type === 'hero' ? 'unit' : card.spellKind === 'CONTINUOUS' ? 'continuous' : 'spell';
}

function effectLines(cardId: string, states?: ReadonlyMap<number, boolean>, silenced = false): FocusEffectLine[] {
  return cardCombatBattleEffects(cardId).map((effect) => {
    const state = states?.get(effect.abilityIndex);
    return { chip: effect.chip, text: effect.text, ...(state !== undefined ? { active: state && !silenced } : {}) };
  });
}

/** The board without one side's Spell in `lane`, to split a lane's Continuous Spell ATK between the two Spells. */
function withoutSpell(state: GameState, side: Side, lane: LaneId): GameState {
  return { ...state, [side]: { ...state[side], spellZones: { ...state[side].spellZones, [lane]: null } } };
}

/**
 * Every ATK change a board Unit carries, by source: from the log, its lasting changes and this round's; from the board,
 * the Continuous Spells in its lane (they apply live and never log a change).
 */
function atkChanges(state: GameState, side: Side, lane: LaneId, log: readonly GameEvent[]): FocusAtkChange[] {
  const unit = state[side].heroZones[lane];
  if (!unit) return [];
  const battle = new Map<string, number>();
  let round = new Map<string, number>();
  for (const ev of log) {
    if (ev.type === 'ROUND_START' || ev.type === 'ROUND_END') round = new Map();
    if (ev.type !== 'POWER_CHANGED' || ev.instanceId !== unit.instanceId || ev.reason === 'Round End') continue;
    const into = ev.permanent ? battle : round;
    into.set(ev.reason, (into.get(ev.reason) ?? 0) + ev.to - ev.from);
  }
  const source = (reason: string) => (reason === unit.name ? 'its own effect' : reason);
  const changes: FocusAtkChange[] = [];
  for (const [reason, amount] of battle) if (amount !== 0) changes.push({ amount, source: source(reason), lasts: 'battle' });
  for (const [reason, amount] of round) if (amount !== 0) changes.push({ amount, source: source(reason), lasts: 'round' });
  const total = continuousAtkBonus(state, side, lane);
  if (total !== 0) {
    const own = state[side].spellZones[lane];
    const foe = state[other(side)].spellZones[lane];
    const ownPart = own ? continuousAtkBonus(withoutSpell(state, other(side), lane), side, lane) : 0;
    if (own && ownPart !== 0) changes.push({ amount: ownPart, source: own.name, lasts: 'spell' });
    if (foe && total - ownPart !== 0) changes.push({ amount: total - ownPart, source: foe.name, lasts: 'spell' });
  }
  return changes;
}

/** A card in the player's hand: its printed ATK and HP Contribution, and every effect's full rule. */
export function handCardDetails(cardId: string, hpContribution?: number): FocusDetails {
  const kind = kindOf(cardId);
  return {
    cardId,
    name: getCard(cardId).name,
    owner: 'player',
    place: 'hand',
    kind,
    ...(kind === 'unit' ? { atk: cardAtk(cardId), printedAtk: cardAtk(cardId), hpContribution } : {}),
    effects: effectLines(cardId),
    changes: [],
    status: [],
  };
}

/**
 * The focus panel's content for `focus`, read from `state` (the board as shown) and `log` (the match so far), or null
 * when the card is no longer there.
 */
export function focusDetails(focus: BattleFocus, state: GameState, log: readonly GameEvent[], hpContribution?: (cardId: string, owner: Side) => number): FocusDetails | null {
  if (focus.kind === 'hand') {
    const card = state.player.hand.find((h) => h.handId === focus.handId);
    return card ? handCardDetails(card.cardId, kindOf(card.cardId) === 'unit' ? hpContribution?.(card.cardId, 'player') : undefined) : null;
  }
  const zones = focus.kind === 'unit' ? state[focus.side].heroZones : state[focus.side].spellZones;
  const lane = LANES.find((l) => zones[l]?.instanceId === focus.instanceId);
  if (!lane) return null;
  if (focus.kind === 'spell') {
    const spell = state[focus.side].spellZones[lane]!;
    const mine = state.player.heroZones[lane];
    const theirs = state.enemy.heroZones[lane];
    return {
      cardId: spell.cardId,
      name: spell.name,
      owner: focus.side,
      place: 'spellZone',
      lane,
      kind: kindOf(spell.cardId),
      effects: effectLines(spell.cardId),
      changes: [],
      status: [],
      laneUnits: { ...(mine ? { yours: mine.name } : {}), ...(theirs ? { theirs: theirs.name } : {}) },
    };
  }
  const unit = state[focus.side].heroZones[lane]!;
  const printed = cardAtk(unit.cardId);
  const entered = unit.entryAtk ?? printed;
  const arrival = log.find((ev) => (ev.type === 'REVIVED' || ev.type === 'TOKEN_SUMMONED') && ev.instanceId === unit.instanceId);
  const status: string[] = [];
  if (unit.shielded) status.push('Shield');
  if (unit.silenced) status.push('Silenced this round');
  if (unit.pacified) status.push('Deals no damage this round');
  if (unit.stalled) status.push('No clash this round');
  return {
    cardId: unit.cardId,
    name: unit.name,
    owner: focus.side,
    place: 'board',
    lane,
    kind: 'unit',
    atk: unit.power + continuousAtkBonus(state, focus.side, lane),
    printedAtk: printed,
    ...(entered !== printed ? { entered: { atk: entered, how: arrival?.type === 'REVIVED' ? 'revived' : arrival ? 'summoned' : 'entered' } } : {}),
    hpContribution: hpContribution?.(unit.cardId, focus.side),
    effects: effectLines(unit.cardId, passiveEffectStates(state, focus.side).get(unit.instanceId), unit.silenced),
    changes: atkChanges(state, focus.side, lane, log),
    status,
  };
}
