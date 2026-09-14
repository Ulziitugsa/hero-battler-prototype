import type { ActionDef, CardDefinition, DeployPlay, GameState, LaneId, PlayerState, Side } from '../types';
import { LANES } from '../types';
import { getCard } from '../cards';
import { nextRandom } from '../engine/rng';

// Deliberately simple heuristic AI: no search, no lookahead. Since placement IS targeting in this
// engine, the AI's only real decision per card is which lane to drop it in - it scores each legal
// (card, lane) pairing with a handful of readable rules and greedily takes the whole hand's worth.

export interface AiResult {
  action: { plays: DeployPlay[] };
  nextRngState: number;
}

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
  const takenHeroLanes = new Set<LaneId>(LANES.filter((l) => me.heroZones[l] !== null));
  const takenSpellLanes = new Set<LaneId>();

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
    // its own zone to be physically empty.
    const lanes = LANES.filter((l) => {
      if (takenSpellLanes.has(l)) return false;
      if (card.spellKind === 'CONTINUOUS' && me.spellZones[l] !== null) return false;
      return true;
    });
    if (lanes.length === 0) continue;
    const scored = lanes.map((lane) => ({ lane, score: scoreSpellLane(card, lane, me, enemy) + jitter() }));
    scored.sort((a, b) => b.score - a.score);
    if (scored[0].score < -50) continue; // nothing worthwhile to do with this card right now
    const lane = scored[0].lane;
    plays.push({ handId: hand.handId, cardId: card.id, lane });
    takenSpellLanes.add(lane);
  }

  return { action: { plays }, nextRngState: rng };
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
  return score;
}

/** Scores how well a Spell's automatic target scope lines up with placing it in `lane`. */
function scoreSpellLane(card: CardDefinition, lane: LaneId, me: PlayerState, enemy: PlayerState): number {
  const action = card.abilities[0]?.actions[0] as ActionDef | undefined;
  if (!action) return 0;

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
      return 1; // ALL_ALLIES / ALL_ENEMIES - lane doesn't affect the outcome, any empty slot is fine
    }
    case 'DESTROY': {
      const foe = enemy.heroZones[lane];
      if (!foe) return -100;
      if (action.maxPower !== undefined && foe.power > action.maxPower) return -100;
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
    case 'REVIVE_TO_LANE':
      return me.heroZones[lane] === null ? 6 : -100;
    default:
      return 1; // graveyard-sourced / player-targeted effects - lane doesn't affect the outcome
  }
}
