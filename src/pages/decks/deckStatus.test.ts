import { describe, expect, it } from 'vitest';
import { STARTER_DECKS } from '../../game/cards/starterDecks';
import { deckComposition, getDeckStatus, plural, sortedEntries } from './deckStatus';

describe('getDeckStatus', () => {
  it('reads a full starter deck as ready', () => {
    const s = getDeckStatus(STARTER_DECKS.kingdom);
    expect(s).toMatchObject({ state: 'ready', valid: true, count: 15, missing: 0 });
  });

  it('reads a short deck as still being built, not invalid', () => {
    const s = getDeckStatus(STARTER_DECKS.kingdom.slice(0, 14));
    expect(s.state).toBe('building');
    expect(s.valid).toBe(false);
    expect(s.message).toBe('1 more card to go');
  });

  it('flags a card over its copy limit', () => {
    const ids = [...STARTER_DECKS.infernal.slice(0, 14), 'inf-flame-imp'];
    const s = getDeckStatus(['inf-flame-imp', 'inf-flame-imp', 'inf-flame-imp', ...ids.slice(3)]);
    expect(s.state).toBe('invalid');
    expect(s.overLimit).toContain('inf-flame-imp');
    expect(s.message).toContain('max 2');
  });

  it('calls out the Legendary limit', () => {
    const s = getDeckStatus(['kng-paladin', 'kng-paladin']);
    expect(s.state).toBe('invalid');
    expect(s.message).toContain('Legendary');
  });
});

describe('helpers', () => {
  it('pluralises', () => {
    expect(plural(1, 'card')).toBe('1 card');
    expect(plural(15, 'card')).toBe('15 cards');
    expect(plural(11, 'hero')).toBe('11 heroes');
  });
  it('sorts heroes before spells, legendary first', () => {
    const e = sortedEntries(STARTER_DECKS.kingdom);
    expect(e[0].card.id).toBe('kng-paladin');
    expect(e[e.length - 1].card.type).toBe('spell');
  });
  it('counts composition', () => {
    expect(deckComposition(STARTER_DECKS.kingdom)).toEqual({ heroes: 11, spells: 4, legendary: 1 });
  });
});

describe('ownership-aware status', () => {
  const owned = { 'kng-archer': 1, 'kng-paladin': 1, 'und-mira': 2 };

  it('flags a card the player does not own, calmly and without ids', () => {
    const s = getDeckStatus(['und-vharos'], owned);
    expect(s).toMatchObject({ state: 'invalid', valid: false, unowned: ['und-vharos'] });
    expect(s.message).toBe('Vharos: not owned');
  });
  it('flags insufficient copies (own 1, deck uses 2)', () => {
    const s = getDeckStatus(['kng-archer', 'kng-archer'], owned);
    expect(s.state).toBe('invalid');
    expect(s.message).toBe('You own 1 Archer, deck needs 2');
  });
  it('copy limit and Legendary rule still apply on top of ownership', () => {
    const many = { 'inf-flame-imp': 5, 'kng-paladin': 5 };
    expect(getDeckStatus(['inf-flame-imp', 'inf-flame-imp', 'inf-flame-imp'], many).message).toContain('max 2');
    expect(getDeckStatus(['kng-paladin', 'kng-paladin'], many).message).toContain('Legendary');
  });
  it('keeps a legacy deck saved-but-invalid rather than valid by accident', () => {
    const legacy = STARTER_DECKS.undead; // legal by the rules, unowned by a fresh profile
    expect(getDeckStatus(legacy, { 'kng-archer': 2 }).valid).toBe(false);
    expect(getDeckStatus(legacy, Object.fromEntries(legacy.map((id) => [id, 2]))).valid).toBe(true);
  });
});
