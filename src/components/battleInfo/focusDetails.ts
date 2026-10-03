import type { GameEvent, GameState, HeroInstance, LaneId, Side } from '../../game/types';
import { LANES } from '../../game/types';
import { getCard } from '../../game/cards';
import { continuousAtkBonus, passiveEffectStates } from '../../game/cardCombat/engine';
import { computeContinuousBonus } from '../../game/engine/power';
import { legacyPassiveEffectStates } from '../../game/engine/abilities';
import { battlePowerBonusForLevel } from '../../game/heroLevel/battlePower';
import { ATK_PER_POWER } from '../../game/cardCombat/stats';
import { cardEffects, legacyAtk, printedAtk, type CardRules } from '../../game/cards/cardPresentation';

/**
 * The focused card detail (layer 2 of a card's information, between its face and Card Inspect): a card's full rules
 * and what is true of it right now. One shape for every place a card can be picked out: a card in hand, a Unit or a
 * Spell on either side of the board in any battle mode, or a card outside battle (Collection, Deck Builder, Shop,
 * pack results, events). Pure: GamePage passes the board as shown (pending plays included) and the match log.
 *
 * In a legacy battle a Unit's ATK is the ATK its Power reads as (cardPresentation.ts legacyAtk), its effects are the
 * legacy rules with this copy's Card Mastery abilities, and HP Contribution is left out (legacy battles start at a
 * fixed HP).
 */

/** What the focus panel shows in battle: a card in hand, a Unit on the board, or a Spell in a Spell zone. */
export type BattleFocus = { kind: 'hand'; handId: string; cardId: string } | { kind: 'unit'; side: Side; instanceId: string } | { kind: 'spell'; side: Side; instanceId: string };

export interface FocusEffectLine {
  /** The label every surface prints ("On Play", "Guard 2"). */
  label: string;
  /** The full rule. */
  text: string;
  oncePerRound: boolean;
  /** Added by Card Mastery (legacy battles). */
  mastery: boolean;
  /** A conditional always-on effect of a Unit on the board: whether it is on right now. */
  active?: boolean;
}

export interface FocusAtkChange {
  amount: number;
  /** The card it came from, "its own effect", or "Legacy Level". */
  source: string;
  /** Until Round End; while that Continuous Spell stays in the lane; or for the rest of the battle. */
  lasts: 'round' | 'spell' | 'battle';
}

export interface FocusDetails {
  cardId: string;
  name: string;
  owner: Side;
  /** In hand, on the board, in a Spell zone, or a card outside battle. */
  place: 'hand' | 'board' | 'spellZone' | 'card';
  lane?: LaneId;
  kind: 'unit' | 'spell' | 'continuous';
  rules: CardRules;
  /** Legacy rules only: the legacy Ascension rank whose abilities a historical legacy match plays. Always 0 in card combat. */
  masteryRank: number;
  /** A Unit's ATK: on the board, its current clash ATK (Continuous Spells included); elsewhere, its printed ATK. */
  atk?: number;
  printedAtk?: number;
  /** The ATK it entered play with, when that is not its printed ATK, and how it came back (a revived Unit). */
  entered?: { atk: number; how: 'revived' | 'summoned' | 'entered' };
  /** A Unit's HP Contribution where it applies (card rules): what it adds to its player's Starting HP. */
  hpContribution?: number;
  effects: FocusEffectLine[];
  /** Where a board Unit's ATK differs from its printed ATK, by source. */
  changes: FocusAtkChange[];
  /** Standing states: "Shield", "Silenced this round", ... */
  status: string[];
  /** A Continuous Spell: the Units standing in its lane. */
  laneUnits?: { yours?: string; theirs?: string };
}

export interface FocusOptions {
  rules?: CardRules;
  /** HP Contribution of a copy (card rules only). */
  hpContribution?: (cardId: string, owner: Side) => number | undefined;
}

const other = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');

function kindOf(cardId: string): FocusDetails['kind'] {
  const card = getCard(cardId);
  return card.type === 'hero' ? 'unit' : card.spellKind === 'CONTINUOUS' ? 'continuous' : 'spell';
}

function effectLines(cardId: string, rules: CardRules, masteryRank: number, states?: ReadonlyMap<number, boolean>, silenced = false): FocusEffectLine[] {
  return cardEffects(cardId, { rules, masteryRank }).map((effect) => {
    const state = states?.get(effect.abilityIndex);
    return { label: effect.label, text: effect.full, oncePerRound: effect.oncePerRound, mastery: effect.mastery, ...(state !== undefined ? { active: state && !silenced } : {}) };
  });
}

/** The legacy Ascension rank `side` brought for this card (historical legacy matches only). */
const rankOf = (state: GameState, side: Side, cardId: string) => state.ascensions?.[side]?.[cardId] ?? 0;

/** ATK a Continuous Spell overlay adds to the Unit at (side, lane) right now, under these rules. */
function overlayAtk(state: GameState, side: Side, lane: LaneId, rules: CardRules): number {
  return rules === 'legacy' ? computeContinuousBonus(state, side, lane) * ATK_PER_POWER : continuousAtkBonus(state, side, lane);
}

/** The board without one side's Spell in `lane`, to split a lane's Continuous Spell ATK between the two Spells. */
function withoutSpell(state: GameState, side: Side, lane: LaneId): GameState {
  return { ...state, [side]: { ...state[side], spellZones: { ...state[side].spellZones, [lane]: null } } };
}

/**
 * Every ATK change a board Unit carries, by source: from the log, its lasting changes and this round's; from the board,
 * the Continuous Spells in its lane (they apply live and never log a change); in a legacy battle, its Legacy Level.
 */
function atkChanges(state: GameState, side: Side, lane: LaneId, log: readonly GameEvent[], rules: CardRules, levelBonus: number): FocusAtkChange[] {
  const unit = state[side].heroZones[lane];
  if (!unit) return [];
  const scale = rules === 'legacy' ? ATK_PER_POWER : 1;
  const battle = new Map<string, number>();
  let round = new Map<string, number>();
  for (const ev of log) {
    if (ev.type === 'ROUND_START' || ev.type === 'ROUND_END') round = new Map();
    if (ev.type !== 'POWER_CHANGED' || ev.instanceId !== unit.instanceId || ev.reason === 'Round End') continue;
    const into = ev.permanent ? battle : round;
    into.set(ev.reason, (into.get(ev.reason) ?? 0) + (ev.to - ev.from) * scale);
  }
  const source = (reason: string) => (reason === unit.name ? 'its own effect' : reason);
  const changes: FocusAtkChange[] = [];
  if (levelBonus !== 0) changes.push({ amount: levelBonus, source: 'Legacy Level', lasts: 'battle' });
  for (const [reason, amount] of battle) if (amount !== 0) changes.push({ amount, source: source(reason), lasts: 'battle' });
  for (const [reason, amount] of round) if (amount !== 0) changes.push({ amount, source: source(reason), lasts: 'round' });
  const total = overlayAtk(state, side, lane, rules);
  if (total !== 0) {
    const own = state[side].spellZones[lane];
    const foe = state[other(side)].spellZones[lane];
    const ownPart = own ? overlayAtk(withoutSpell(state, other(side), lane), side, lane, rules) : 0;
    if (own && ownPart !== 0) changes.push({ amount: ownPart, source: own.name, lasts: 'spell' });
    if (foe && total - ownPart !== 0) changes.push({ amount: total - ownPart, source: foe.name, lasts: 'spell' });
  }
  return changes;
}

/**
 * A card outside battle, or in the player's hand: its printed ATK, its HP Contribution where given, and every effect's
 * full rule.
 */
export function cardFocusDetails(cardId: string, options: { rules?: CardRules; masteryRank?: number; hpContribution?: number; place?: 'hand' | 'card' } = {}): FocusDetails {
  const kind = kindOf(cardId);
  const rules = options.rules ?? 'card';
  const masteryRank = rules === 'legacy' && kind === 'unit' ? (options.masteryRank ?? 0) : 0;
  const atk = printedAtk(cardId, rules) ?? undefined;
  return {
    cardId,
    name: getCard(cardId).name,
    owner: 'player',
    place: options.place ?? 'card',
    kind,
    rules,
    masteryRank,
    ...(kind === 'unit' ? { atk, printedAtk: atk, ...(options.hpContribution !== undefined && rules === 'card' ? { hpContribution: options.hpContribution } : {}) } : {}),
    effects: effectLines(cardId, rules, masteryRank),
    changes: [],
    status: [],
  };
}

/** How a Unit on the board entered play: the arrival event (revived, summoned) and the ATK it entered with. */
function arrivalOf(unit: HeroInstance, log: readonly GameEvent[], rules: CardRules): { atk: number; how: 'revived' | 'summoned' | 'entered' } | null {
  const arrival = log.find((ev) => (ev.type === 'REVIVED' || ev.type === 'TOKEN_SUMMONED') && ev.instanceId === unit.instanceId) as Extract<GameEvent, { type: 'REVIVED' | 'TOKEN_SUMMONED' }> | undefined;
  const how = arrival?.type === 'REVIVED' ? 'revived' : arrival ? 'summoned' : 'entered';
  if (rules === 'card') return unit.entryAtk !== undefined ? { atk: unit.entryAtk, how } : null;
  return arrival && 'power' in arrival && arrival.power !== undefined ? { atk: legacyAtk(arrival.power), how } : null;
}

/**
 * The focus panel's content for `focus`, read from `state` (the board as shown) and `log` (the match so far), or null
 * when the card is no longer there.
 */
export function focusDetails(focus: BattleFocus, state: GameState, log: readonly GameEvent[], options: FocusOptions = {}): FocusDetails | null {
  const rules = options.rules ?? (state.combatModel === 'card' ? 'card' : 'legacy');
  if (focus.kind === 'hand') {
    const card = state.player.hand.find((h) => h.handId === focus.handId);
    if (!card) return null;
    const rank = rankOf(state, 'player', card.cardId);
    const details = cardFocusDetails(card.cardId, {
      rules,
      masteryRank: rank,
      hpContribution: kindOf(card.cardId) === 'unit' ? options.hpContribution?.(card.cardId, 'player') : undefined,
      place: 'hand',
    });
    // A legacy Unit enters play with its Legacy Level's Power bonus: its card in hand already shows that ATK.
    const levelBonus = rules === 'legacy' && details.kind === 'unit' ? battlePowerBonusForLevel(state.heroLevels?.player?.[card.cardId] ?? 1) * ATK_PER_POWER : 0;
    return levelBonus === 0 ? details : { ...details, atk: (details.atk ?? 0) + levelBonus, changes: [{ amount: levelBonus, source: 'Legacy Level', lasts: 'battle' }] };
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
      rules,
      masteryRank: 0,
      effects: effectLines(spell.cardId, rules, 0),
      changes: [],
      status: [],
      laneUnits: { ...(mine ? { yours: mine.name } : {}), ...(theirs ? { theirs: theirs.name } : {}) },
    };
  }
  const unit = state[focus.side].heroZones[lane]!;
  const masteryRank = rules === 'legacy' ? (unit.ascension ?? rankOf(state, focus.side, unit.cardId)) : 0;
  const printed = printedAtk(unit.cardId, rules) ?? 0;
  const arrival = arrivalOf(unit, log, rules);
  // A legacy Unit placed from hand carries its Legacy Level's Power bonus from the start (never a revived one).
  const levelBonus = rules === 'legacy' && (!arrival || arrival.how === 'entered') ? battlePowerBonusForLevel(unit.level ?? 1) * ATK_PER_POWER : 0;
  const states = rules === 'legacy' ? legacyPassiveEffectStates(state, focus.side) : passiveEffectStates(state, focus.side);
  const status: string[] = [];
  if (unit.shielded) status.push('Shield');
  if (unit.silenced) status.push('Silenced this round');
  if (unit.pacified) status.push('Deals no damage this round');
  if (unit.stalled) status.push('No clash this round');
  const current = rules === 'legacy' ? legacyAtk(unit.power + computeContinuousBonus(state, focus.side, lane)) : unit.power + continuousAtkBonus(state, focus.side, lane);
  return {
    cardId: unit.cardId,
    name: unit.name,
    owner: focus.side,
    place: 'board',
    lane,
    kind: 'unit',
    rules,
    masteryRank,
    atk: current,
    printedAtk: printed,
    ...(arrival && arrival.atk !== printed ? { entered: arrival } : {}),
    ...(rules === 'card' ? { hpContribution: options.hpContribution?.(unit.cardId, focus.side) } : {}),
    effects: effectLines(unit.cardId, rules, masteryRank, states.get(unit.instanceId), unit.silenced),
    changes: atkChanges(state, focus.side, lane, log, rules, levelBonus),
    status,
  };
}
