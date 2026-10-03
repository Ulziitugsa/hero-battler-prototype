import type { DeployPlay, GameEvent, GameState, LaneId, Side } from '../game/types';
import { beginCardRound, createCardMatch, resolveCardRound } from '../game/cardCombat/engine';

/**
 * QA scenes for the dev-only ?battleScene= page (BattleSceneLabPage): a card-combat battle played through the real
 * resolver to the start of round 2 or 3, with set hands. Round 1 attaches Battle Banner to a Knight in the center; round
 * 2 opens with Royal Guard in hand beside the Banner's lane; round 3 has Royal Guard's aura on the Knight under the
 * Banner and a revived Vharos across the board, with Legendary Paladin in hand (scene 3) or Archmage Vael (scene vael).
 */

export const PLAYER_DECK = ['kng-common-knight', 'kng-common-knight', 'kng-royal-guard', 'kng-royal-guard', 'kng-light-priest', 'kng-archer', 'kng-archer', 'kng-battle-captain', 'kng-paladin', 'kng-archmage-vael', 'kng-apprentice-mage', 'spl-battle-banner', 'spl-power-surge', 'spl-war-cry', 'spl-aegis-ward'];
export const ENEMY_DECK = ['und-bone-soldier', 'und-bone-soldier', 'und-dark-priest', 'und-dark-priest', 'und-grave-knight', 'und-cursed-warrior', 'und-cursed-warrior', 'und-crypt-warden', 'und-mira', 'und-vharos', 'und-grave-sage', 'spl-hush', 'spl-stasis-field', 'spl-execute', 'spl-cursed-ground'];

type Play = [cardId: string, lane: LaneId];
type Hands = Record<Side, string[]>;
/** One scripted round: each side's hand, and what it plays from it. */
export interface ScriptedRound {
  hands: Hands;
  plays: Record<Side, Play[]>;
}

/** The scenes' rounds. */
const ROUNDS: ScriptedRound[] = [
  {
    hands: { player: ['kng-common-knight', 'spl-battle-banner', 'kng-archer'], enemy: ['und-bone-soldier', 'und-dark-priest', 'spl-hush'] },
    plays: { player: [['kng-common-knight', 'center'], ['spl-battle-banner', 'center']], enemy: [['und-bone-soldier', 'center'], ['und-dark-priest', 'right']] },
  },
  {
    hands: { player: ['kng-royal-guard', 'kng-light-priest', 'spl-power-surge'], enemy: ['und-vharos', 'und-cursed-warrior', 'spl-stasis-field'] },
    plays: { player: [['kng-royal-guard', 'left'], ['kng-light-priest', 'right']], enemy: [['und-vharos', 'center'], ['und-cursed-warrior', 'left']] },
  },
];

/**
 * Scene "expire": an Attached Spell leaving with its Unit. Battle Banner goes onto Light Priest facing Vharos; the
 * Priest's Shield saves it once, and in round 2 it falls, so the Banner expires and the center Spell slot is free again.
 */
const EXPIRE_ROUNDS: ScriptedRound[] = [
  {
    hands: { player: ['kng-light-priest', 'spl-battle-banner', 'kng-archer'], enemy: ['und-vharos', 'und-bone-soldier', 'spl-hush'] },
    plays: { player: [['kng-light-priest', 'center'], ['spl-battle-banner', 'center']], enemy: [['und-vharos', 'center']] },
  },
  {
    hands: { player: ['kng-common-knight', 'kng-archer', 'spl-power-surge'], enemy: ['und-bone-soldier', 'und-dark-priest', 'spl-hush'] },
    plays: { player: [['kng-common-knight', 'left']], enemy: [['und-bone-soldier', 'left']] },
  },
];

/** Each scene: the scripted rounds that come first, and the hands its round starts with. */
const SCENES: Record<string, { rounds: number; hands: Hands; script?: ScriptedRound[] }> = {
  '2': { rounds: 1, hands: ROUNDS[1].hands },
  '3': { rounds: 2, hands: { player: ['kng-paladin', 'spl-aegis-ward', 'spl-war-cry'], enemy: ['und-bone-soldier', 'und-mira', 'spl-stasis-field'] } },
  vael: { rounds: 2, hands: { player: ['kng-archmage-vael', 'spl-power-surge', 'spl-aegis-ward'], enemy: ['und-bone-soldier', 'und-mira', 'spl-stasis-field'] } },
  expire: { rounds: 2, script: EXPIRE_ROUNDS, hands: { player: ['kng-royal-guard', 'spl-fortify', 'spl-war-cry'], enemy: ['und-mira', 'und-cursed-warrior', 'spl-execute'] } },
};

function withHands(state: GameState, hands: Hands): GameState {
  const hand = (side: Side) => hands[side].map((cardId, i) => ({ handId: `scene-${side}-r${state.round}-${i}`, cardId }));
  return { ...state, player: { ...state.player, hand: hand('player') }, enemy: { ...state.enemy, hand: hand('enemy') } };
}

function playsFor(state: GameState, side: Side, plays: Play[]): DeployPlay[] {
  const hand = [...state[side].hand];
  return plays.map(([cardId, lane]) => {
    const [card] = hand.splice(
      hand.findIndex((h) => h.cardId === cardId),
      1,
    );
    return { handId: card.handId, cardId, lane };
  });
}

/**
 * A card-combat match played through the real resolver with set hands and plays: each round's hands replace what was
 * drawn, then the plays resolve; `hands` (if given) are the next round's. Returns the board at the start of the next
 * round and the whole event log.
 */
export function scriptedMatch({ playerDeck, enemyDeck, rounds, hands, seed = 20261001 }: { playerDeck: string[]; enemyDeck: string[]; rounds: ScriptedRound[]; hands?: Hands; seed?: number }): { state: GameState; events: GameEvent[] } {
  const built = createCardMatch({ seed, playerDeck, enemyDeck });
  let state = built.nextState;
  const events = [...built.events];
  for (const round of rounds) {
    state = withHands(state, round.hands);
    const result = resolveCardRound(state, { plays: playsFor(state, 'player', round.plays.player) }, { plays: playsFor(state, 'enemy', round.plays.enemy) });
    events.push(...result.events);
    if (result.nextState.status !== 'IN_PROGRESS') return { state: result.nextState, events };
    const begun = beginCardRound(result.nextState);
    events.push(...begun.events);
    state = begun.nextState;
  }
  return { state: hands ? withHands(state, hands) : state, events };
}

export function buildBattleScene(scene: string): { state: GameState; events: GameEvent[] } {
  const { rounds, hands, script = ROUNDS } = SCENES[scene] ?? SCENES['2'];
  return scriptedMatch({ playerDeck: PLAYER_DECK, enemyDeck: ENEMY_DECK, rounds: script.slice(0, rounds), hands });
}
