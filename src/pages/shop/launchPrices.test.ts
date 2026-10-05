import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { BOX_PULL_GEMS, STRUCTURE_DECK_GEMS } from '../../game/economy/config';
import { getEconomy, reloadEconomy, setGems, setTickets } from '../../game/economy/economy';
import { getCollection, reloadCollection, setCollection } from '../../game/collection/collection';
import { getArchetypeBox } from '../../game/box/archetypeBoxes';
import { boxCardsRemaining, clearArchetypeBoxes, pullFromBox } from '../../game/box/boxPool';
import { boxPullPrice, buyBoxPulls } from '../../game/box/boxProduct';
import { STRUCTURE_DECKS_ON_SALE } from '../../game/structureDecks/definitions';
import { buyStructureDeck, resetStructureDecks } from '../../game/structureDecks/store';
import { BoxDetail } from './BoxDetail';
import { StructureDeckDetail } from './StructureDeckDetail';
import { ShopPage } from '../ShopPage';

// Launch-set prices (ozi, 2026-10-05): 1 pull = 100 Gems, a 10-pull = 1,000 Gems, 1 Ticket = 1 pull = 1 card,
// Structure Decks 900 Gems. Pinned here and checked where the player sees them.

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ownedTotal = () => Object.values(getCollection()).reduce((sum, n) => sum + n, 0);
const boxPage = (id: Parameters<typeof getArchetypeBox>[0]) => renderToStaticMarkup(createElement(BoxDetail, { box: getArchetypeBox(id), onBack: () => {} }));

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  reloadEconomy();
  reloadCollection();
  setCollection({});
  clearArchetypeBoxes();
  resetStructureDecks();
});

describe('Box pull prices', () => {
  it('1 pull costs 100 Gems and a 10-pull 1,000 Gems', () => {
    expect(BOX_PULL_GEMS).toBe(100);
    expect(boxPullPrice(1)).toBe(100);
    expect(boxPullPrice(10)).toBe(1000);
  });
  it('a pull spends exactly 100 Gems for 1 card; a 10-pull exactly 1,000 Gems for 10 cards', () => {
    setGems(1100);
    expect(buyBoxPulls('wither', 1).ok).toBe(true);
    expect(getEconomy().gems).toBe(1000);
    expect(ownedTotal()).toBe(1);
    expect(buyBoxPulls('wither', 10).ok).toBe(true);
    expect(getEconomy().gems).toBe(0);
    expect(ownedTotal()).toBe(11);
  });
  it('999 Gems cannot buy a 10-pull, and nothing is charged', () => {
    setGems(999);
    expect(buyBoxPulls('wither', 10)).toEqual({ ok: false, reason: 'not-enough-gems' });
    expect(getEconomy().gems).toBe(999);
  });
  it('the Box page shows the pull buttons at 100 and 1,000 Gems', () => {
    setGems(5000);
    const page = text(boxPage('phantoms'));
    expect(page).toMatch(/Pull 1 100 /);
    expect(page).toMatch(/Pull 10 1,000 /);
    expect(page).toMatch(/1 CARD PER PULL/);
  });
  it('Pull 10 is disabled when fewer than 10 cards remain; Pull 1 still works', () => {
    setGems(5000);
    while (boxCardsRemaining('crusade') > 9) pullFromBox('crusade', 1);
    const html = boxPage('crusade');
    const pull10 = html.match(/<button[^>]*class="box-open ten"[^>]*>[\s\S]*?<\/button>/)![0];
    const pull1 = html.match(/<button[^>]*class="box-open "[^>]*>[\s\S]*?<\/button>/)![0];
    expect(pull10).toMatch(/disabled/);
    expect(text(pull10)).toMatch(/Not enough cards left/);
    expect(pull1).not.toMatch(/disabled/);
  });
});

describe('Pull Tickets: 1 Ticket = 1 pull = 1 card', () => {
  it('one Ticket performs exactly one pull: one card, one Ticket spent, no Gems', () => {
    setGems(500);
    setTickets(1);
    const before = boxCardsRemaining('hellpack');
    const result = buyBoxPulls('hellpack', 1, 'tickets');
    expect(result.ok && result.opening.pulls).toHaveLength(1);
    expect(getEconomy()).toMatchObject({ tickets: 0, gems: 500 });
    expect(boxCardsRemaining('hellpack')).toBe(before - 1);
    expect(ownedTotal()).toBe(1);
  });
  it('the Box page offers one Ticket for one pull, and hides the Ticket button on an empty Box', () => {
    setTickets(1);
    expect(text(boxPage('hellpack'))).toMatch(/Pull 1 with a Ticket 1 of 1 Pull Ticket/);
    while (boxCardsRemaining('hellpack') > 0) pullFromBox('hellpack', 1);
    expect(text(boxPage('hellpack'))).not.toMatch(/with a Ticket/);
  });
  it('the Shop and Box pages never describe packs', () => {
    setTickets(2);
    for (const html of [renderToStaticMarkup(createElement(ShopPage)), boxPage('vanguard')]) {
      expect(text(html)).not.toMatch(/open (a )?packs?|card packs?|Pack Ticket|5-card|Moonfall|Summon/i);
    }
  });
});

describe('Structure Deck prices', () => {
  it('every launch Structure Deck costs 900 Gems, and buying one spends exactly that', () => {
    expect(STRUCTURE_DECK_GEMS).toBe(900);
    for (const deck of STRUCTURE_DECKS_ON_SALE) expect(deck.priceGems).toBe(900);
    setGems(1000);
    expect(buyStructureDeck(STRUCTURE_DECKS_ON_SALE[0]).ok).toBe(true);
    expect(getEconomy().gems).toBe(100);
  });
  it('the Structure Deck page shows 900 Gems', () => {
    setGems(1000);
    const page = text(renderToStaticMarkup(createElement(StructureDeckDetail, { deck: STRUCTURE_DECKS_ON_SALE[0], onBack: () => {} })));
    expect(page).toMatch(/\b900\b/);
    expect(page).not.toMatch(/\b600\b/);
  });
});
