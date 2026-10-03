/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';
import { getCollection, reloadCollection, setCollection } from '../collection/collection';
import { getEconomy, reloadEconomy, setGems, setTickets } from '../economy/economy';
import { ECONOMY_STORAGE_KEY } from '../economy/persistence';
import { buildPackTimeline, viewAt } from '../reveal/sequence';
import { packRevealOutcome } from '../reveal/outcome';
import { RevealStage } from '../../components/reveal/RevealStage';
import { PackResults } from '../../pages/shop/BoxDetail';
import { boxPackTickets, buyBoxPacks, hasOpenedPacks, MOONFALL_BOX } from './boxProduct';
import { prototypeBoxPacksRemaining, PROTOTYPE_BOX, PROTOTYPE_BOX_STORAGE_KEY, reloadPrototypeBox, resetPrototypeBox, type PrototypeBoxPull } from './prototypeBox';
import type { Rarity } from '../types';

// One card-acquisition model: packs opened from finite Boxes (paid with Gems or Pack Tickets), shown by the reveal
// ceremony that used to belong to the Moonwell Summon, then Pack Results. The Summon is gone as a second path.

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  reloadEconomy();
  reloadCollection();
  setCollection({});
  reloadPrototypeBox();
  resetPrototypeBox();
  clearQueuedEvents();
});

describe('Pack Tickets open packs of the same finite Box', () => {
  it('one Ticket opens one pack: Tickets are spent, Gems are not, and the cards come from the Box', () => {
    setGems(1000);
    setTickets(3);
    const result = buyBoxPacks(1, MOONFALL_BOX, 'tickets');
    expect(result.ok).toBe(true);
    expect(getEconomy()).toMatchObject({ gems: 1000, tickets: 2 });
    expect(prototypeBoxPacksRemaining()).toBe(PROTOTYPE_BOX.packCount - 1);
    expect(Object.values(getCollection()).reduce((sum, n) => sum + n, 0)).toBe(PROTOTYPE_BOX.cardsPerPack);
    expect(boxPackTickets(10)).toBe(10); // no bulk discount
  });
  it('without enough Tickets nothing is spent or opened, and Gems are never a silent fallback', () => {
    setGems(1000);
    setTickets(4);
    expect(buyBoxPacks(10, MOONFALL_BOX, 'tickets')).toEqual({ ok: false, reason: 'not-enough-tickets' });
    expect(getEconomy()).toMatchObject({ gems: 1000, tickets: 4 });
    expect(prototypeBoxPacksRemaining()).toBe(PROTOTYPE_BOX.packCount);
  });
  it('Gem prices, Box size and rarity counts are unchanged by the consolidation', () => {
    expect(MOONFALL_BOX.gemsPerPack).toBe(150);
    expect(PROTOTYPE_BOX).toMatchObject({ packCount: 100, cardsPerPack: 5, cardCounts: { common: 258, rare: 168, epic: 54, legendary: 20 } });
  });
  it('each pack fires pack_opened (what the "Open a pack" missions count), whichever way it was paid', () => {
    setGems(MOONFALL_BOX.gemsPerPack * 10);
    setTickets(1);
    buyBoxPacks(10);
    buyBoxPacks(1, MOONFALL_BOX, 'tickets');
    const names = getQueuedEvents().map((e) => e.name);
    expect(names.filter((n) => n === 'pack_opened')).toHaveLength(11);
    expect(names).toContain('pack_ticket_used');
    expect(names.some((n) => n.startsWith('summon_'))).toBe(false);
  });
});

describe('the Shop unlocks that used to wait for a first Summon', () => {
  it('open after a first pack, and stay open for a save that used the retired Summon', () => {
    localStorage.removeItem(PROTOTYPE_BOX_STORAGE_KEY); // a never-opened Box (the shared setup's reset counts as one)
    reloadPrototypeBox();
    expect(hasOpenedPacks(getEconomy())).toBe(false);
    setGems(MOONFALL_BOX.gemsPerPack);
    buyBoxPacks(1);
    expect(hasOpenedPacks(getEconomy())).toBe(true);
    localStorage.removeItem(PROTOTYPE_BOX_STORAGE_KEY);
    localStorage.setItem(ECONOMY_STORAGE_KEY, JSON.stringify({ version: 5, gems: 0, gold: 0, tickets: 0, grants: [], summon: { pity: {}, history: [{ cardId: 'kng-archer', rarity: 'common', at: 1, wasNew: true, bannerId: 'royal-vanguard' }] } }));
    reloadEconomy();
    reloadPrototypeBox();
    expect(hasOpenedPacks(getEconomy())).toBe(true);
  });
});

const pulls = (rarities: Rarity[]): PrototypeBoxPull[] => rarities.map((rarity, i) => ({ cardId: { common: 'kng-archer', rare: 'kng-royal-guard', epic: 'kng-battle-captain', legendary: 'kng-paladin' }[rarity], rarity, previousCopies: i % 2, ownedCopies: (i % 2) + 1, isNew: i % 2 === 0 }));

describe('the reveal ceremony for packs', () => {
  it('telegraphs the best rarity, gives the stage only to Epic and Legendary cards, then hands over to Pack Results', () => {
    const cards = pulls(['common', 'epic', 'rare', 'legendary', 'common']);
    const timeline = buildPackTimeline(cards.map((c) => ({ rarity: c.rarity, mainFeatured: false })));
    expect(timeline.slice(0, 3).map((s) => [s.phase, s.tier])).toEqual([['charging', 'legendary'], ['telegraph', 'legendary'], ['opening', 'legendary']]);
    expect([...new Set(timeline.filter((s) => s.stage).map((s) => s.slot))]).toEqual([1, 3]);
    expect(timeline.at(-1)?.phase).toBe('result');
  });
  it('ten packs of Commons and Rares stay a short ceremony (no fifty-beat show)', () => {
    const fifty = buildPackTimeline(Array.from({ length: 50 }, (_, i) => ({ rarity: (i % 3 ? 'common' : 'rare') as Rarity, mainFeatured: false })));
    expect(fifty.map((s) => s.phase)).toEqual(['charging', 'telegraph', 'opening', 'result']);
  });
  it('renders the stage card with its New seal and a Skip that jumps to the results', () => {
    const cards = pulls(['common', 'epic', 'common', 'common', 'common']);
    const outcome = packRevealOutcome(MOONFALL_BOX.name, 1, cards);
    const timeline = buildPackTimeline(outcome.cards.map((c) => ({ rarity: c.rarity, mainFeatured: false })));
    const html = renderToStaticMarkup(createElement(RevealStage, { outcome, view: viewAt(timeline, timeline.findIndex((s) => s.phase === 'reveal'), cards.length), onSkip: () => {}, onIntroFinished: () => {} }));
    expect(html).toContain('Moonfall Box · 1 pack');
    expect(html).toContain('rc rc-reveal r-epic');
    expect(html).toContain('aria-label="Skip to Pack Results"');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/Summon|Moonwell|guarantee/i);
  });
  it('Pack Results shows one grid for five cards or fifty, with New and owned counts', () => {
    const one = renderToStaticMarkup(createElement(PackResults, { pulls: pulls(['common', 'rare', 'epic', 'common', 'legendary']), packs: 1, onInspect: () => {}, onClose: () => {} }));
    expect(one).toContain('PACK RESULTS · 1 PACK OPENED');
    expect((one.match(/class="box-result /g) ?? []).length).toBe(5);
    const ten = renderToStaticMarkup(createElement(PackResults, { pulls: pulls(Array.from({ length: 50 }, () => 'common' as Rarity)), packs: 10, starterProgress: [{ deckId: 'starter-undead', name: 'Undead Starter', collected: 9, total: 15, unlockedNow: false }], onInspect: () => {}, onClose: () => {} }));
    expect((ten.match(/class="box-result /g) ?? []).length).toBe(50);
    expect(ten).toContain('Undead Starter · 9 / 15 cards');
  });
});

describe('the Moonwell Summon is retired as a second acquisition path', () => {
  it('no Summon screen, route, banner pool or pity code is left', () => {
    expect(existsSync(new URL('../summon', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../../pages/SummonPage.tsx', import.meta.url))).toBe(false);
    expect(read('../../App.tsx')).not.toMatch(/SummonPage|showSummon/);
    expect(read('../../pages/HomePage.tsx')).not.toMatch(/onOpenSummon|Moonwell</);
  });
  it('its reusable presentation lives on in neutral reveal modules', () => {
    for (const rel of ['../reveal/sequence.ts', '../reveal/meteors.ts', '../reveal/sound.ts', '../reveal/audio.ts', '../../components/reveal/RevealStage.tsx', '../../components/reveal/useRevealSequence.ts', '../../components/reveal/RevealFilm.tsx', '../../components/MoonwellVoyage.tsx']) expect(existsSync(new URL(rel, import.meta.url)), rel).toBe(true);
  });
});
