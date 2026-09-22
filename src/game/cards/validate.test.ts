import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from './index';
import { PLAYTEST_ROSTER } from './roster';
import { validateAllCards } from './validate';
import { getCard } from './index';
import { TOKEN_CARDS } from './tokens';

describe('Card definitions', () => {
  it('every card in the game passes shape validation', () => {
    expect(validateAllCards(ALL_CARDS)).toEqual([]);
    expect(validateAllCards(TOKEN_CARDS)).toEqual([]);
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

  it('the roster is roughly 50 cards, split across exactly Kingdom/Undead/Infernal', () => {
    expect(PLAYTEST_ROSTER.length).toBeGreaterThanOrEqual(45);
    expect(PLAYTEST_ROSTER.length).toBeLessThanOrEqual(56);
    const factions = new Set(PLAYTEST_ROSTER.map((id) => getCard(id).faction));
    expect(factions).toEqual(new Set(['kingdom', 'undead', 'infernal']));
  });

  it('each roster faction has a comparable card count', () => {
    for (const faction of ['kingdom', 'undead', 'infernal'] as const) {
      const count = PLAYTEST_ROSTER.filter((id) => getCard(id).faction === faction).length;
      expect(count).toBeGreaterThanOrEqual(14);
      expect(count).toBeLessThanOrEqual(20);
    }
  });

  it('every faction has both Heroes and Spells, and every rarity appears in the roster', () => {
    for (const faction of ['kingdom', 'undead', 'infernal'] as const) {
      const cards = PLAYTEST_ROSTER.map(getCard).filter((c) => c.faction === faction);
      expect(cards.some((c) => c.type === 'hero')).toBe(true);
      expect(cards.some((c) => c.type === 'spell')).toBe(true);
    }
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) expect(PLAYTEST_ROSTER.some((id) => getCard(id).rarity === rarity)).toBe(true);
  });

  it('tokens resolve through getCard but are never collectible: not in ALL_CARDS, not in the roster', () => {
    for (const token of TOKEN_CARDS) {
      expect(getCard(token.id)).toBe(token);
      expect(ALL_CARDS.some((c) => c.id === token.id)).toBe(false);
      expect(PLAYTEST_ROSTER).not.toContain(token.id);
      expect(token.type).toBe('hero');
      expect(token.tags).toContain('Token');
    }
  });

  it('every SUMMON_TOKEN in the game names a real token card', () => {
    const tokenIds = new Set(TOKEN_CARDS.map((t) => t.id));
    for (const card of ALL_CARDS) {
      for (const ability of card.abilities) {
        for (const action of ability.actions) if (action.type === 'SUMMON_TOKEN') expect(tokenIds.has(action.tokenId), `${card.id} -> ${action.tokenId}`).toBe(true);
      }
    }
  });

  it('archetype tags are wired: Mage, Mage Slayer, Beast and Trickster each have several roster Heroes', () => {
    const heroesWith = (tag: string) => PLAYTEST_ROSTER.map(getCard).filter((c) => c.type === 'hero' && c.tags.includes(tag));
    expect(heroesWith('Mage').length).toBeGreaterThanOrEqual(3);
    expect(heroesWith('Mage Slayer').length).toBeGreaterThanOrEqual(3);
    expect(heroesWith('Beast').length).toBeGreaterThanOrEqual(4);
    expect(heroesWith('Trickster').length).toBeGreaterThanOrEqual(3);
  });
});
