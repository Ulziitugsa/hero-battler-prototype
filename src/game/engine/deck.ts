import type { HandCard, LaneId, PlayerState, Side } from '../types/index.js';
import { nextRandom } from './rng.js';

// Hand-card ids are derived deterministically from (side, a local sequence number) rather than a
// module-global counter, so that two independent matches built from the same seed produce byte-for-byte
// identical state/event output - a shared mutable counter would make id sequencing depend on how many
// matches happened to run earlier in the process.
function makeHandId(side: Side, seq: string): string {
  return `hand-${side}-${seq}`;
}

/** Fisher-Yates shuffle using the seeded RNG. Returns a new array plus the advanced RNG state. */
export function shuffle<T>(items: T[], rngState: number): { result: T[]; nextState: number } {
  const arr = [...items];
  let state = rngState;
  for (let i = arr.length - 1; i > 0; i--) {
    const { value, nextState } = nextRandom(state);
    state = nextState;
    const j = Math.floor(value * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { result: arr, nextState: state };
}

const EMPTY_ZONES: Record<LaneId, null> = { left: null, center: null, right: null };

export function createPlayerState(side: Side, deckList: string[], hp: number, rngState: number): { player: PlayerState; nextState: number } {
  const { result: deck, nextState } = shuffle(deckList, rngState);
  return {
    player: {
      side,
      hp,
      deck,
      hand: [],
      graveyard: [],
      heroZones: { ...EMPTY_ZONES },
      spellZones: { ...EMPTY_ZONES },
    },
    nextState,
  };
}

export function makeDrawnHandCard(side: Side, round: number, seq: number, cardId: string): HandCard {
  return { handId: makeHandId(side, `r${round}-${seq}`), cardId };
}
