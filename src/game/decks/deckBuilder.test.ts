import { beforeEach, describe, expect, it } from 'vitest';
import { getCard } from '../cards';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { STARTER_DECKS } from '../cards/starterDecks';
import { deckLifePreview } from '../cards/cardStatsPreview';
import { validateDeck } from '../engine/deckRules';
import { deckSummary, hpContribution, startingHp } from './deckSummary';
import { DEFAULT_POOL_OPTIONS, activeFilterCount, availableSorts, queryCardPool, type CardPoolContext } from './cardPool';
import { getCardPopularity, popularCardIds, setCardPopularitySource } from './cardPopularity';
import { autoFillDeck } from './autoFill';
import { CARD_MARKS_STORAGE_KEY, getCardMarks, isFavorite, recordCardObtained, reloadCardMarks, sanitizeCardMarks, toggleFavorite } from '../collection/cardMarks';
import { grantCard, reloadCollection } from '../collection/collection';

function installLocalStoragePolyfill() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const roster = PLAYTEST_ROSTER.map(getCard);
const allOwned = (n = 2) => () => n;
const ctx = (over: Partial<CardPoolContext> = {}): CardPoolContext => ({
  ownedCount: allOwned(),
  favorites: [],
  obtainedAt: {},
  masteryRank: () => 0,
  popularity: { status: 'unavailable' },
  ...over,
});
const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe('Starting HP / deck summary', () => {
  it('sums Unit HP Contributions and ignores Spells', () => {
    expect(startingHp(['spl-power-surge'])).toBe(0);
    const unit = getCard('kng-common-knight');
    expect(startingHp([unit.id, unit.id, 'spl-power-surge'])).toBe(2 * hpContribution(unit));
  });

  it('matches the card-model prototype deck Life for every starter deck', () => {
    for (const deck of Object.values(STARTER_DECKS)) expect(startingHp(deck)).toBe(deckLifePreview(deck.map(getCard)));
  });

  it('summarises a starter deck', () => {
    const s = deckSummary(STARTER_DECKS.kingdom);
    expect(s).toMatchObject({ count: 15, units: 11, spells: 4 });
    expect(s.startingHp).toBe(921); // the approved model's typical ~900 HP deck
    expect(s.averageAtk).toBeGreaterThan(0);
    expect(s.factions).toEqual([{ faction: 'kingdom', units: 11 }]);
  });

  it('updates immediately when a card is added or removed', () => {
    const base = STARTER_DECKS.undead.slice(0, 14);
    const added = [...base, 'kng-common-knight'];
    expect(startingHp(added) - startingHp(base)).toBe(hpContribution(getCard('kng-common-knight')));
  });

  it('handles an empty deck', () => {
    expect(deckSummary([])).toEqual({ count: 0, units: 0, spells: 0, startingHp: 0, averageAtk: null, factions: [] });
  });
});

describe('card pool query', () => {
  it('searches names and effect text, all terms required', () => {
    expect(ids(queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, search: 'paladin' }, ctx()))).toContain('kng-paladin');
    const heal = queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, search: 'heal your player' }, ctx());
    expect(ids(heal)).toContain('kng-light-priest');
    expect(queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, search: 'paladin zzzz' }, ctx())).toEqual([]);
  });

  it('filters by type, faction and rarity together', () => {
    const r = queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, type: 'hero', faction: 'undead', rarity: 'common' }, ctx());
    expect(r.length).toBeGreaterThan(0);
    for (const c of r) expect(c).toMatchObject({ type: 'hero', faction: 'undead', rarity: 'common' });
  });

  it('filters by ownership', () => {
    const owned = (id: string) => (id === 'kng-archer' ? 1 : 0);
    expect(ids(queryCardPool(roster, DEFAULT_POOL_OPTIONS, ctx({ ownedCount: owned })))).toEqual(['kng-archer']);
    expect(queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, ownership: 'all' }, ctx({ ownedCount: owned }))).toHaveLength(roster.length);
    expect(ids(queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, ownership: 'missing' }, ctx({ ownedCount: owned })))).not.toContain('kng-archer');
  });

  it('filters to favorites', () => {
    const r = queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, favoritesOnly: true }, ctx({ favorites: ['kng-archer', 'spl-dispel'] }));
    expect(ids(r).sort()).toEqual(['kng-archer', 'spl-dispel']);
  });

  it('sorts by ATK and HP Contribution with Spells last', () => {
    const atk = queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, sort: 'atk' }, ctx());
    const units = atk.filter((c) => c.type === 'hero');
    expect(atk.slice(0, units.length).every((c) => c.type === 'hero')).toBe(true);
    for (let i = 1; i < units.length; i++) expect(units[i - 1].power!).toBeGreaterThanOrEqual(units[i].power!);
    const hp = queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, sort: 'hp', type: 'hero' }, ctx());
    for (let i = 1; i < hp.length; i++) expect(hpContribution(hp[i - 1])).toBeGreaterThanOrEqual(hpContribution(hp[i]));
  });

  it('sorts by rarity, name, mastery and recently obtained', () => {
    expect(queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, sort: 'rarity' }, ctx())[0].rarity).toBe('legendary');
    const byName = queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, sort: 'name' }, ctx()).map((c) => c.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
    expect(queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, sort: 'mastery' }, ctx({ masteryRank: (id) => (id === 'spl-dispel' ? 3 : 0) }))[0].id).toBe('spl-dispel');
    const recent = queryCardPool(roster, { ...DEFAULT_POOL_OPTIONS, sort: 'recent' }, ctx({ obtainedAt: { 'kng-archer': 10, 'und-mira': 20 } }));
    expect(ids(recent).slice(0, 2)).toEqual(['und-mira', 'kng-archer']);
  });

  it('counts active filters', () => {
    expect(activeFilterCount(DEFAULT_POOL_OPTIONS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_POOL_OPTIONS, rarity: 'epic', favoritesOnly: true, search: 'x', sort: 'atk' })).toBe(2);
  });
});

describe('Popular in Ranked placeholder', () => {
  it('is unavailable by default, so the sort is not offered', () => {
    expect(getCardPopularity()).toEqual({ status: 'unavailable' });
    expect(availableSorts(getCardPopularity())).not.toContain('popular');
    expect(popularCardIds(getCardPopularity(), PLAYTEST_ROSTER)).toEqual([]);
  });

  it('activates only when a source provides real aggregate data', () => {
    const restore = setCardPopularitySource(() => ({ status: 'available', sourceLabel: 'Test fixture', computedAt: 1, deckShare: { 'kng-archer': 0.4, 'und-mira': 0.6 } }));
    try {
      const p = getCardPopularity();
      expect(availableSorts(p)).toContain('popular');
      expect(popularCardIds(p, PLAYTEST_ROSTER)).toEqual(['und-mira', 'kng-archer']);
    } finally {
      restore();
    }
    expect(getCardPopularity().status).toBe('unavailable');
  });
});

describe('auto-fill', () => {
  it('completes a deck legally from owned cards only, keeping chosen cards', () => {
    const start = ['kng-paladin', 'spl-dispel'];
    const add = autoFillDeck(start, PLAYTEST_ROSTER, allOwned(), 'kingdom');
    const deck = [...start, ...add];
    expect(deck).toHaveLength(15);
    expect(validateDeck(deck).valid).toBe(true);
    expect(deck.filter((id) => getCard(id).type === 'hero')).toHaveLength(11);
    expect(add).not.toContain('kng-paladin');
  });

  it('prefers the deck faction and is deterministic', () => {
    const a = autoFillDeck([], PLAYTEST_ROSTER, allOwned(), 'undead');
    expect(a).toEqual(autoFillDeck([], PLAYTEST_ROSTER, allOwned(), 'undead'));
    expect(a.filter((id) => getCard(id).type === 'hero').every((id) => getCard(id).faction === 'undead')).toBe(true);
  });

  it('respects owned copies and leaves the deck short rather than invent cards', () => {
    const owned = (id: string) => (id === 'kng-archer' ? 1 : id === 'spl-dispel' ? 5 : 0);
    expect(autoFillDeck([], PLAYTEST_ROSTER, owned, 'kingdom').sort()).toEqual(['kng-archer', 'spl-dispel', 'spl-dispel']);
  });
});

describe('card marks (favorites + last obtained)', () => {
  beforeEach(() => {
    installLocalStoragePolyfill();
    reloadCardMarks();
    reloadCollection();
  });

  it('starts empty for an old save with no marks key', () => {
    expect(getCardMarks()).toMatchObject({ favorites: [], obtainedAt: {} });
  });

  it('toggles favorites and persists them', () => {
    expect(toggleFavorite('kng-archer')).toBe(true);
    reloadCardMarks();
    expect(isFavorite('kng-archer')).toBe(true);
    expect(toggleFavorite('kng-archer')).toBe(false);
    reloadCardMarks();
    expect(isFavorite('kng-archer')).toBe(false);
  });

  it('records the time a card was obtained through the collection grant path', () => {
    grantCard('und-mira', 1);
    expect(getCardMarks().obtainedAt['und-mira']).toBeGreaterThan(0);
    recordCardObtained('kng-archer', 1234);
    expect(JSON.parse(localStorage.getItem(CARD_MARKS_STORAGE_KEY)!).obtainedAt['kng-archer']).toBe(1234);
  });

  it('drops malformed stored data instead of throwing', () => {
    expect(sanitizeCardMarks({ favorites: ['a', 3, 'a', ''], obtainedAt: { x: 'no', y: -1, z: 5 } })).toEqual({ version: 1, favorites: ['a'], obtainedAt: { z: 5 } });
    localStorage.setItem(CARD_MARKS_STORAGE_KEY, '{not json');
    reloadCardMarks();
    expect(getCardMarks().favorites).toEqual([]);
  });
});
