import type { GameEvent, GameState, Side } from '../game/types';
import { beginCardRound, createCardMatch, resolveCardRound } from '../game/cardCombat/engine';
import { chooseCardAiAction } from '../game/cardCombat/ai';
import { LAUNCH_DECKS, launchDeckList } from '../game/cards/launchDecks';
import { randomCardAction } from './randomPilot';
import { labMoments, type MomentKind } from './moments';
import { LAB_ARCHETYPES } from './archetypes';

// Card Discovery Lab, measurement only (scripts/lab-ai-report.mjs): how well the production AI plays each optimised
// archetype, measured against a pilot that plays its cards into random legal lanes. Both pilots play the same deck
// against the same AI-piloted field (all 21 reference decks), on the same seeds. When the AI does no better than random,
// the deck's results say little about its cards: the lab's AI notes are written from these numbers.

export type Pilot = 'ai' | 'random';

export interface PilotStats {
  games: number;
  /** Win share; draws count half. */
  winShare: number;
  /** Lab moments of this deck's side per game. */
  momentsPerGame: number;
  /** The archetype's signature moments per game. */
  signaturePerGame: number;
  /** Spells cast per game. */
  spellsPerGame: number;
}

export interface ArchetypeAiRow {
  deck: string;
  ai: PilotStats;
  random: PilotStats;
}

function play(deck: string[], foe: string[], seed: number, pilot: Pilot): { status: GameState['status']; events: GameEvent[] } {
  const built = createCardMatch({ seed, playerDeck: deck, enemyDeck: foe });
  let state = built.nextState;
  const events: GameEvent[] = [...built.events];
  while (state.status === 'IN_PROGRESS') {
    const p = pilot === 'ai' ? chooseCardAiAction(state, 'player', state.rngState) : randomCardAction(state, 'player', state.rngState);
    const e = chooseCardAiAction(state, 'enemy', p.nextRngState);
    const r = resolveCardRound(state, p.action, e.action, e.nextRngState);
    events.push(...r.events);
    state = r.nextState;
    if (state.status !== 'IN_PROGRESS') break;
    const b = beginCardRound(state);
    events.push(...b.events);
    state = b.nextState;
  }
  return { status: state.status, events };
}

function measure(deckId: string, pilot: Pilot, gamesPerOpponent: number, seed: number, signature: readonly MomentKind[]): PilotStats {
  const deck = launchDeckList(LAUNCH_DECKS.find((d) => d.id === deckId)!);
  const side: Side = 'player';
  let games = 0;
  let wins = 0;
  let moments = 0;
  let sig = 0;
  let spells = 0;
  for (const foe of LAUNCH_DECKS) {
    for (let g = 0; g < gamesPerOpponent; g++) {
      const r = play(deck, launchDeckList(foe), (seed + games * 7919) >>> 0, pilot);
      games += 1;
      wins += r.status === 'PLAYER_WIN' ? 1 : r.status === 'DRAW' ? 0.5 : 0;
      const mine = labMoments(r.events).filter((m) => m.side === side);
      moments += mine.length;
      sig += mine.filter((m) => signature.includes(m.kind)).length;
      spells += r.events.filter((e) => e.type === 'SPELL_RESOLVED' && e.side === side).length + r.events.filter((e) => e.type === 'SPELL_ENTERED' && e.side === side).length;
    }
  }
  const per = (n: number) => Math.round((n / games) * 100) / 100;
  return { games, winShare: Math.round((wins / games) * 1000) / 1000, momentsPerGame: per(moments), signaturePerGame: per(sig), spellsPerGame: per(spells) };
}

/** One row per optimised archetype: the AI and the random pilot on the same games. */
export function runLabAiReport(gamesPerOpponent: number, seed = 20261017): ArchetypeAiRow[] {
  return LAB_ARCHETYPES.map((a) => ({
    deck: a.deckId,
    ai: measure(a.deckId, 'ai', gamesPerOpponent, seed, a.signatureMoments),
    random: measure(a.deckId, 'random', gamesPerOpponent, seed, a.signatureMoments),
  }));
}
