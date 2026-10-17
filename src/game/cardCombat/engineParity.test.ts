import { describe, expect, it } from 'vitest';
import { LAUNCH_DECKS, launchDeckList } from '../cards/launchDecks.js';
import { playCardAiMatch } from './simulate.js';

// Production parity (Power Fantasy Phase 1, docs/design/POWER-FANTASY-P1.md): the experimental combat rules added to the
// resolver (multiplication, Undying, Unmaking, Conduit, scaling destruction, the Ally Returns timing) are used by no
// production card, so every production battle must resolve exactly as it did before they existed. This plays one seeded
// AI-vs-AI battle for every ordered pair of the 21 reference decks and hashes every event and the final states. The
// expected hash was recorded on master (b41718c) before the engine changed.

const EXPECTED = '441:c7080c73';

function fnv1a(text: string, hash = 0x811c9dc5): number {
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

describe('production resolver parity', () => {
  it('every reference-deck pairing resolves exactly as it did before the experimental rules', () => {
    let hash = 0x811c9dc5;
    let games = 0;
    for (const a of LAUNCH_DECKS) {
      for (const b of LAUNCH_DECKS) {
        const r = playCardAiMatch({ seed: (games * 2654435761) >>> 0, playerDeck: launchDeckList(a), enemyDeck: launchDeckList(b) }, { keepEvents: true });
        hash = fnv1a(JSON.stringify(r.events), hash);
        hash = fnv1a(JSON.stringify(r.state), hash);
        games += 1;
      }
    }
    expect(games).toBe(LAUNCH_DECKS.length ** 2);
    expect(`${games}:${hash.toString(16)}`).toBe(EXPECTED);
  }, 120_000);
});
