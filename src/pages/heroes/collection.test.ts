import { describe, expect, it } from 'vitest';
import { getCard } from '../../game/cards';
import { PLAYTEST_ROSTER } from '../../game/cards/roster';
import { displayRole, emptyCopy, filterHeroes, tally, type HeroFilters } from './collection';

const HEROES = PLAYTEST_ROSTER.map(getCard).filter((c) => c.type === 'hero');
const OWNED = new Set(['kng-paladin', 'und-mira', 'inf-cultist']);
const base: HeroFilters = { owned: 'all', faction: 'all', rarity: 'all', query: '' };

describe('filterHeroes', () => {
  it('combines ownership, faction and rarity', () => {
    const r = filterHeroes(HEROES, OWNED, { ...base, owned: 'owned', faction: 'kingdom' }, 'rarity');
    expect(r.map((c) => c.id)).toEqual(['kng-paladin']);
    const missingLegendary = filterHeroes(HEROES, OWNED, { ...base, owned: 'missing', rarity: 'legendary' }, 'rarity');
    expect(missingLegendary.length).toBeGreaterThan(0);
    expect(missingLegendary.every((c) => c.rarity === 'legendary' && !OWNED.has(c.id))).toBe(true);
  });
  it('is stable and total for every sort', () => {
    for (const s of ['rarity', 'power', 'name', 'faction'] as const) {
      const a = filterHeroes(HEROES, OWNED, base, s).map((c) => c.id);
      const b = filterHeroes([...HEROES].reverse(), OWNED, base, s).map((c) => c.id);
      expect(a).toEqual(b);
    }
  });
  it('searches names, tags and roles', () => {
    expect(filterHeroes(HEROES, OWNED, { ...base, query: 'paladin' }, 'name').length).toBeGreaterThan(0);
    expect(filterHeroes(HEROES, OWNED, { ...base, query: 'zzzz' }, 'name')).toEqual([]);
  });
});

describe('tally / empty copy', () => {
  it('counts the scope, not the ownership split', () => {
    expect(tally(HEROES, OWNED)).toEqual({ have: 3, total: HEROES.length, missing: HEROES.length - 3 });
  });
  it('picks the right empty state', () => {
    const all = new Set(HEROES.map((c) => c.id));
    expect(emptyCopy({ ...base, owned: 'missing' }, HEROES, all).title).toBe('Collection complete');
    expect(emptyCopy({ ...base, owned: 'missing', faction: 'kingdom' }, HEROES, OWNED).title).toBe('No missing Kingdom Heroes');
    expect(emptyCopy({ ...base, owned: 'owned' }, HEROES, new Set()).title).toBe('No Heroes yet');
    expect(emptyCopy({ ...base, query: 'zzzz' }, HEROES, OWNED).title).toBe('No Heroes found');
  });
  it('avoids "Undead · Undead"', () => {
    expect(displayRole(getCard('und-vharos'))).toBe('');
    expect(displayRole(getCard('kng-paladin'))).toBe('Tank');
  });
});

describe('driven by real collection state', () => {
  it('Owned / Missing filters and tallies follow what is granted', () => {
    const owned = new Set<string>();
    expect(filterHeroes(HEROES, owned, { ...base, owned: 'owned' }, 'rarity')).toEqual([]);
    expect(tally(HEROES, owned).have).toBe(0);
    owned.add('und-mira');
    expect(filterHeroes(HEROES, owned, { ...base, owned: 'owned' }, 'rarity').map((c) => c.id)).toEqual(['und-mira']);
    expect(filterHeroes(HEROES, owned, { ...base, owned: 'missing' }, 'rarity').some((c) => c.id === 'und-mira')).toBe(false);
    expect(tally(HEROES.filter((c) => c.faction === 'undead'), owned)).toMatchObject({ have: 1 });
  });
});
