import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from './index';
import { PLAYTEST_ROSTER } from './roster';
import { validateAllCards } from './validate';
import { getCard } from './index';

describe('Card definitions', () => {
  it('every card in the game passes shape validation', () => {
    expect(validateAllCards(ALL_CARDS)).toEqual([]);
  });

  it('has no duplicate card ids across the whole game', () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the Card Set v0.1 roster has no duplicate entries', () => {
    expect(new Set(PLAYTEST_ROSTER).size).toBe(PLAYTEST_ROSTER.length);
  });

  it('every roster id resolves to a real card', () => {
    for (const id of PLAYTEST_ROSTER) expect(() => getCard(id)).not.toThrow();
  });

  it('the roster is approximately 30 cards, split across exactly Kingdom/Undead/Infernal', () => {
    expect(PLAYTEST_ROSTER.length).toBeGreaterThanOrEqual(28);
    expect(PLAYTEST_ROSTER.length).toBeLessThanOrEqual(34);
    const factions = new Set(PLAYTEST_ROSTER.map((id) => getCard(id).faction));
    expect(factions).toEqual(new Set(['kingdom', 'undead', 'infernal']));
  });

  it('each roster faction has a reasonable card count (roughly 10)', () => {
    for (const faction of ['kingdom', 'undead', 'infernal'] as const) {
      const count = PLAYTEST_ROSTER.filter((id) => getCard(id).faction === faction).length;
      expect(count).toBeGreaterThanOrEqual(9);
      expect(count).toBeLessThanOrEqual(12);
    }
  });
});
