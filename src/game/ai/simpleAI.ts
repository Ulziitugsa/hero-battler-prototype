import type { ActionDef, CardDefinition, DeployPlay, GameState, LaneId, PlayerState, Side } from '../types';
import { LANES } from '../types';
import { getCard } from '../cards';
import { nextRandom } from '../engine/rng';
import { HAND_REFILL_TARGET } from '../engine/constants';
import { spellHasAValidTarget } from '../engine/resolveRound';
import { spellWouldFire } from '../engine/abilities';

// Deliberately simple heuristic AI: no search, no lookahead. Since placement IS targeting in this
// engine, the AI's only real decision per card is which lane to drop it in - it scores each legal
// (card, lane) pairing with a handful of readable rules and greedily takes the whole hand's worth.
//
// Refill-to-3 awareness (the AI is NOT tuned to be clever about it, just to avoid obviously bad habits):
//  * Playing a card is how it gets replaced, so the AI plays freely and never sits on a full hand of
//    situational Spells (that would stall its own draws AND its board).
//  * A Spell that would do very little right now ("marginal") is held back instead of wasted - but only
//    while the hand is at or under the refill target (holding costs nothing then), and never if that would
//    leave the AI with no plays at all (it then plays its best marginal Spell so it keeps cycling).
//  * A hand ABOVE the target isn't refilling, so marginal Spells are dumped rather than hoarded.

export interface AiResult {
  action: { plays: DeployPlay[] };
  nextRngState: number;
}

/** Below this a Spell is "marginal": worth holding for a better moment when holding is free. */
const MARGINAL_SPELL_SCORE = 2;
const INVALID_SCORE = -50;

export function chooseAiAction(state: GameState, side: Side, rngState: number): AiResult {
  const me = side === 'player' ? state.player : state.enemy;
  const enemy = side === 'player' ? state.enemy : state.player;
  let rng = rngState;

  const jitter = (): number => {
    const r = nextRandom(rng);
    rng = r.nextState;
    return (r.value - 0.5) * 2; // [-1, 1)
  };

  const plays: DeployPlay[] = [];
  const held: { play: DeployPlay; score: number }[] = [];
  const takenHeroLanes = new Set<LaneId>(LANES.filter((l) => me.heroZones[l] !== null));
  const takenSpellLanes = new Set<LaneId>();
  const holdingIsFree = me.hand.length <= HAND_REFILL_TARGET;

  for (const hand of me.hand) {
    const card = getCard(hand.cardId);

    if (card.type === 'hero') {
      const lanes = LANES.filter((l) => !takenHeroLanes.has(l));
      if (lanes.length === 0) continue;
      const scored = lanes.map((lane) => ({ lane, score: scoreHeroLane(card, lane, enemy, me) + jitter() }));
      scored.sort((a, b) => b.score - a.score);
      const lane = scored[0].lane;
      plays.push({ handId: hand.handId, cardId: card.id, lane });
      takenHeroLanes.add(lane);
      continue;
    }

    // Spells - instant or persistent - always need a lane; a persistent Spell additionally needs
    // its own zone to be physically empty. Lanes with no valid target (or a Spell whose conditions
    // can't hold) are never offered - an illegal play would be rejected by the engine.
    const lanes = LANES.filter((l) => {
      if (takenSpellLanes.has(l)) return false;
      if (card.spellKind === 'CONTINUOUS' && me.spellZones[l] !== null) return false;
      return spellHasAValidTarget(state, side, card, l);
    });
    if (lanes.length === 0) continue;
    const scored = lanes.map((lane) => ({ lane, score: scoreSpellLane(state, side, card, lane, me, enemy) + jitter() }));
    scored.sort((a, b) => b.score - a.score);
    if (scored[0].score < INVALID_SCORE) continue; // nothing worthwhile to do with this card right now
    const play = { handId: hand.handId, cardId: card.id, lane: scored[0].lane };
    if (scored[0].score < MARGINAL_SPELL_SCORE && holdingIsFree) {
      held.push({ play, score: scored[0].score });
      continue;
    }
    plays.push(play);
    takenSpellLanes.add(play.lane);
  }

  // Never stall: with nothing else to do, cast the best marginal Spell rather than passing the round.
  if (plays.length === 0 && held.length > 0) {
    held.sort((a, b) => b.score - a.score);
    plays.push(held[0].play);
  }

  return { action: { plays }, nextRngState: rng };
}

function hasAction(card: CardDefinition, type: ActionDef['type']): boolean {
  return card.abilities.some((a) => a.actions.some((act) => act.type === type));
}

function scoreHeroLane(card: CardDefinition, lane: LaneId, enemy: PlayerState, me: PlayerState): number {
  const opposing = enemy.heroZones[lane];
  let score = card.power ?? 0;
  if (!opposing) score += 5; // guarantees direct damage next Combat until the enemy answers it
  else {
    score += 8; // stops an ongoing direct-damage threat in this lane right now
    score += (card.power ?? 0) > opposing.power ? 3 : (card.power ?? 0) < opposing.power ? -3 : 0;
  }
  // Mild faction-clustering preference - doesn't know what any specific synergy ability does, just
  // that "more of the same faction on board" is usually good in this roster (condition-gated buffs,
  // Graveyard-faction payoffs, ...).
  const allyFactionCount = LANES.filter((l) => me.heroZones[l]?.faction === card.faction).length;
  score += allyFactionCount * 1.5;
  // A Hero carrying a resilience tool (a one-time destruction shield, or a live PASSIVE
  // immunity/overflow-reduction) is worth placing a little more eagerly - it's likely to survive
  // whatever the opponent throws back.
  if (card.abilities.some((a) => a.trigger === 'PASSIVE' || a.actions.some((act) => act.type === 'GRANT_SHIELD'))) score += 2;
  // A bypass attacker is best aimed at a lane it could not win by fighting: it skips the clash and freezes the big Hero there.
  if (hasAction(card, 'GRANT_BYPASS')) score += opposing ? opposing.power * 0.7 : -2;
  // Pack Heroes count adjacent allies, so the middle lane (two neighbours) is where they pay off most.
  if (card.abilities.some((a) => a.actions.some((act) => act.type === 'CHANGE_POWER_BY_COUNT' && act.basis === 'ADJACENT_ALLY_TAG_COUNT')) && lane === 'center') score += 2;
  return score;
}

/** Rough damage the AI's player expects to take from lanes where the enemy is unopposed or winning - what a damage-prevention Spell would save. */
function expectedIncomingDamage(me: PlayerState, enemy: PlayerState): number {
  let total = 0;
  for (const lane of LANES) {
    const foe = enemy.heroZones[lane];
    if (!foe) continue;
    const mine = me.heroZones[lane];
    total += mine ? Math.max(0, foe.power - mine.power) : foe.power;
  }
  return total;
}

/** Scores how well a Spell's automatic target scope lines up with placing it in `lane`. */
function scoreSpellLane(state: GameState, side: Side, card: CardDefinition, lane: LaneId, me: PlayerState, enemy: PlayerState): number {
  if (!spellWouldFire(state, side, card, lane)) return -100; // its condition doesn't hold right now - don't waste it
  const action = card.abilities[0]?.actions[0] as ActionDef | undefined;
  if (!action) return 0;
  const fallback = card.spellKind === 'CONTINUOUS' ? 3 : 1;

  switch (action.type) {
    case 'CHANGE_POWER': {
      if (action.target === 'ENEMY_SAME_LANE') {
        const foe = enemy.heroZones[lane];
        if (!foe) return -100; // nothing to affect
        return action.amount < 0 ? foe.power : -foe.power; // debuff the biggest threat; a buff would never target the enemy
      }
      if (action.target === 'ALLY_SAME_LANE') {
        const ally = me.heroZones[lane];
        if (!ally) return -100;
        const foe = enemy.heroZones[lane];
        const losing = foe ? foe.power >= ally.power : false;
        return (losing ? 10 : 3) + ally.power * 0.1;
      }
      if (action.target === 'ALL_ALLIES') {
        const allies = LANES.filter((l) => me.heroZones[l]).length;
        return allies === 0 ? -100 : allies * 1.5; // lane doesn't matter, but it needs a board to buff
      }
      if (action.target === 'ALL_ENEMIES') {
        const foes = LANES.filter((l) => enemy.heroZones[l]).length;
        return foes === 0 ? -100 : foes * 1.5;
      }
      return fallback;
    }
    case 'DESTROY': {
      const foe = enemy.heroZones[lane];
      if (!foe) return -100;
      if (action.maxPower !== undefined && foe.power > action.maxPower) return -100;
      if (action.target === 'ALLY_SAME_LANE') {
        // A sacrifice card (Blood Pact): only worth it when the enemy Hero is clearly worth more than the ally it costs.
        const ally = me.heroZones[lane];
        if (!ally) return -100;
        const worth = foe.power - ally.power;
        return worth >= 2 ? worth + 4 : -100;
      }
      return foe.power;
    }
    case 'DESTROY_SPELL_ZONE': {
      const enemySpell = enemy.spellZones[lane]; // Dispel: only worth it where the enemy actually has an active Continuous Spell
      return enemySpell ? 12 : -100;
    }
    case 'SILENCE': {
      const foe = enemy.heroZones[lane]; // weaker than DESTROY, but only worth it against an actual threat
      return foe ? foe.power * 0.5 : -100;
    }
    case 'STALL_COMBAT': {
      const foe = enemy.heroZones[lane]; // only worth freezing a lane the AI would otherwise lose (or be hit through)
      if (!foe) return -100;
      const ally = me.heroZones[lane];
      return !ally || foe.power >= ally.power ? foe.power : -100;
    }
    case 'PREVENT_NEXT_DAMAGE': {
      const incoming = expectedIncomingDamage(me, enemy);
      return incoming >= 4 ? 3 + incoming * 0.5 : -100;
    }
    case 'SUMMON_TOKEN': {
      const empty = LANES.filter((l) => me.heroZones[l] === null);
      if (empty.length === 0) return -100;
      const facingFoe = empty.filter((l) => enemy.heroZones[l]).length;
      return 2 + facingFoe * 2 + empty.length * 0.5;
    }
    case 'PLAYER_DAMAGE':
      return 4; // chip damage is always useful; lane doesn't matter
    case 'RETURN_TO_HAND':
      return me.graveyard.some((id) => getCard(id).type === (action.cardType ?? 'hero')) ? 3 : -100;
    case 'REVIVE_TO_LANE':
      return me.heroZones[lane] === null && me.graveyard.some((id) => getCard(id).type === 'hero') ? 6 : -100;
    case 'EXILE_FROM_GRAVEYARD':
      return enemy.graveyard.some((id) => getCard(id).type === 'hero') ? 2 : -100;
    default:
      return fallback; // e.g. Grave Totem's reactive trigger - lane doesn't affect the outcome
  }
}
