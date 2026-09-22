import type { GameState, LaneId, PlayerState, Side } from '../types/index.js';
import { getCard } from '../cards/index.js';

// Pure, engine-agnostic Power math - usable by resolveRound (for Combat/direct-damage/death checks)
// AND by the UI (for board display) without either one needing to duplicate the rule. A Hero's
// stored `power` is its permanent/base value; Continuous Spells never mutate it - they contribute a
// live overlay that is summed fresh every time effective Power is asked for, so removing the Spell
// makes its contribution disappear instantly rather than needing to be "un-applied".

function opposite(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}

/** Sum of every active Continuous Spell's contribution to the Hero at (side, lane), from either side's Spell zone at that lane. */
export function computeContinuousBonus(state: GameState, side: Side, lane: LaneId): number {
  let bonus = 0;
  const ownSpell = (side === 'player' ? state.player : state.enemy).spellZones[lane];
  if (ownSpell) bonus += continuousContribution(ownSpell.cardId, 'ALLY_SAME_LANE');
  const enemySpell = (opposite(side) === 'player' ? state.player : state.enemy).spellZones[lane];
  if (enemySpell) bonus += continuousContribution(enemySpell.cardId, 'ENEMY_SAME_LANE');
  return bonus;
}

function continuousContribution(cardId: string, target: 'ALLY_SAME_LANE' | 'ENEMY_SAME_LANE'): number {
  const card = getCard(cardId);
  let total = 0;
  for (const ability of card.abilities) {
    if (ability.trigger !== 'CONTINUOUS') continue;
    for (const action of ability.actions) {
      if (action.type === 'CHANGE_POWER' && action.target === target) total += action.amount;
    }
  }
  return total;
}

/** A Hero's true combat-relevant Power right now: its permanent/base value plus any active Continuous Spell overlay. */
export function effectivePower(state: GameState, side: Side, lane: LaneId): number {
  const hero = (side === 'player' ? state.player : state.enemy).heroZones[lane];
  if (!hero) return 0;
  return hero.power + computeContinuousBonus(state, side, lane);
}

/** A display-only copy of `side`'s PlayerState where every Hero's `power` has been replaced by its effective Power. UI components can render `.power` as usual and it will already be correct. */
export function withEffectivePowers(state: GameState, side: Side): PlayerState {
  const p = side === 'player' ? state.player : state.enemy;
  const heroZones = { ...p.heroZones };
  for (const lane of Object.keys(heroZones) as LaneId[]) {
    const hero = heroZones[lane];
    if (hero) heroZones[lane] = { ...hero, power: effectivePower(state, side, lane) };
  }
  return { ...p, heroZones };
}
