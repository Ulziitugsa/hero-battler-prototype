import type { DeployPlay, GameState, HandCard, LaneId, Side } from '../game/types';
import { LANES } from '../game/types';
import { nextRandom } from '../game/engine/rng';
import { getCombatCard } from '../game/cardCombat/cards';
import { cardSpellHasTarget } from '../game/cardCombat/engine';

// Card Discovery Lab, measurement only: a pilot that plays every card it legally can, into random lanes. The lab compares
// the production AI against it (scripts/lab-ai-report.mjs) to separate "the deck is weak" from "the AI can't play it".
// It never runs in a battle the player plays.

export function randomCardAction(state: GameState, side: Side, rngState: number): { action: { plays: DeployPlay[] }; nextRngState: number } {
  let rng = rngState;
  const rand = () => {
    const r = nextRandom(rng);
    rng = r.nextState;
    return r.value;
  };
  const me = side === 'player' ? state.player : state.enemy;
  const hand: HandCard[] = [...me.hand];
  for (let i = hand.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [hand[i], hand[j]] = [hand[j], hand[i]];
  }
  const plays: DeployPlay[] = [];
  const unitLanes = new Set<LaneId>();
  const spellLanes = new Set<LaneId>();
  for (const h of hand.filter((x) => getCombatCard(x.cardId).type === 'hero')) {
    const open = LANES.filter((l) => !me.heroZones[l] && !unitLanes.has(l));
    if (open.length === 0) break;
    const lane = open[Math.floor(rand() * open.length)];
    unitLanes.add(lane);
    plays.push({ handId: h.handId, cardId: h.cardId, lane });
  }
  for (const h of hand.filter((x) => getCombatCard(x.cardId).type !== 'hero')) {
    const card = getCombatCard(h.cardId);
    const legal = LANES.filter((l) => !spellLanes.has(l) && !(card.spellKind === 'CONTINUOUS' && me.spellZones[l]) && cardSpellHasTarget(state, side, card, l, [...unitLanes]));
    if (legal.length === 0) continue;
    const lane = legal[Math.floor(rand() * legal.length)];
    spellLanes.add(lane);
    plays.push({ handId: h.handId, cardId: h.cardId, lane });
  }
  return { action: { plays }, nextRngState: rng };
}
