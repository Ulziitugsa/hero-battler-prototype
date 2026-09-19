import { describe, expect, it } from 'vitest';
import { listDeckOptions, type DeckOption } from '../../game/engine/deckOptions';
import { STARTER_DECKS } from '../../game/cards/starterDecks';
import { buildStarterCollection } from '../../game/collection/starterCollection';
import { getDeckPresentation } from './deckPresentation';

const fresh = buildStarterCollection();
const starter = (f: 'kingdom' | 'undead' | 'infernal'): DeckOption => ({ id: `starter-${f}`, label: `${f} starter`, faction: f, cardIds: STARTER_DECKS[f] });
const custom = (cardIds: string[]): DeckOption => ({ id: 'deck-1', label: 'Mine', faction: 'kingdom', cardIds });

describe('deck presentation kinds', () => {
  it('Kingdom starter is ready and playable on a fresh profile', () => {
    expect(getDeckPresentation(starter('kingdom'), fresh)).toMatchObject({ kind: 'starter-ready', playable: true });
  });
  it('locked starters are progression content with goal wording, not validation errors', () => {
    const u = getDeckPresentation(starter('undead'), fresh);
    expect(u).toMatchObject({ kind: 'starter-locked', playable: false, progressText: '0/15' });
    expect(u.message).toBe('Collect the required Undead cards to unlock this deck.');
    expect(u.message).not.toMatch(/own|need|not owned/i);
    expect(getDeckPresentation(starter('infernal'), fresh).kind).toBe('starter-locked');
  });
  it('a starter becomes ready automatically once every requirement is owned', () => {
    const owned = { ...fresh };
    for (const id of STARTER_DECKS.undead) owned[id] = 2;
    expect(getDeckPresentation(starter('undead'), owned)).toMatchObject({ kind: 'starter-ready', playable: true });
  });
  it('custom decks use draft / invalid / ready - never the locked-starter kind', () => {
    expect(getDeckPresentation(custom(['kng-archer']), fresh).kind).toBe('custom-draft');
    expect(getDeckPresentation(custom(STARTER_DECKS.kingdom), fresh).kind).toBe('custom-ready');
    // full legal-by-the-rules Undead list the player doesn't own -> invalid custom, not locked
    const legacy = getDeckPresentation(custom(STARTER_DECKS.undead), fresh);
    expect(legacy.kind).toBe('custom-invalid');
    expect(legacy.playable).toBe(false);
    expect(legacy.unlock).toBeNull();
    expect(getDeckPresentation(custom(['kng-archer', 'kng-archer', 'kng-archer']), fresh).kind).toBe('custom-invalid');
  });
  it('locked starters are what Customise redirects to requirements for', () => {
    // DecksPage.openEdit sends any deck of kind starter-locked to the requirements view instead of the editor.
    const kinds = listDeckOptions().map((d) => [d.id, getDeckPresentation(d, fresh).kind]);
    expect(kinds.slice(0, 3)).toEqual([
      ['starter-kingdom', 'starter-ready'],
      ['starter-undead', 'starter-locked'],
      ['starter-infernal', 'starter-locked'],
    ]);
  });
});
