/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';
import { getCollection, reloadCollection, setCollection } from '../collection/collection';
import { getEconomy, reloadEconomy, setGems, setTickets } from '../economy/economy';
import { ECONOMY_STORAGE_KEY } from '../economy/persistence';
import { advanceTarget, buildPackTimeline, planPackReveal, viewAt } from '../reveal/sequence';
import { packRevealOutcome, type RevealOutcome } from '../reveal/outcome';
import { RevealStage } from '../../components/reveal/RevealStage';
import { PackResults } from '../../pages/shop/BoxDetail';
import { boxPackTickets, buyBoxPacks, hasOpenedPacks, MOONFALL_BOX } from './boxProduct';
import { getPrototypeBoxState, prototypeBoxPacksRemaining, PROTOTYPE_BOX, PROTOTYPE_BOX_STORAGE_KEY, reloadPrototypeBox, resetPrototypeBox, type PrototypeBoxPull } from './prototypeBox';
import { getCard } from '../cards';
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

/** The ceremony rendered at one step, as BoxDetail renders it (RevealStage never sees the step after the result). */
const stageAt = (outcome: RevealOutcome, index: number): string => {
  const rarities = outcome.cards.map((c) => c.rarity);
  return renderToStaticMarkup(createElement(RevealStage, { outcome, plan: planPackReveal(rarities), view: viewAt(buildPackTimeline(rarities), index), onAdvance: () => {}, onSkip: () => {}, onIntroFinished: () => {} }));
};
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ');
/** Everything a reward could touch: owned copies, wallet, the finite Box and the analytics queue. */
const rewardState = () => JSON.stringify({ collection: getCollection(), economy: getEconomy(), box: getPrototypeBoxState(), events: getQueuedEvents().map((e) => [e.name, e.properties]) });

describe('the pack-opening ceremony shows an outcome that was decided before it began', () => {
  it('a fresh Box still deals the same first pack (and the same first ten) as before the reveal changes', () => {
    setGems(MOONFALL_BOX.gemsPerPack * 11);
    const one = buyBoxPacks(1);
    // The first pack of a fresh Box on master aa896d6, before PR #13: the reveal never draws or re-orders anything.
    expect(one.ok && one.opening.packs[0].map((c) => c.cardId)).toEqual(['spl-weakness', 'und-cursed-warrior', 'spl-aegis-ward', 'inf-flame-imp', 'kng-royal-guard']);
    resetPrototypeBox();
    setCollection({});
    const ten = buyBoxPacks(10);
    expect(ten.ok && ten.opening.packs.flat().map((c) => c.cardId).slice(0, 10)).toEqual(['spl-weakness', 'und-cursed-warrior', 'spl-aegis-ward', 'inf-flame-imp', 'kng-royal-guard', 'spl-fireball', 'kng-archmage-vael', 'inf-cultist', 'spl-hush', 'kng-paladin']);
    expect(ten.ok && ten.opening.packs.flat()).toHaveLength(50); // all fifty cards are granted, not just the spotlit ones
  });
  it('watching, tapping through or skipping the ceremony changes nothing that was granted, saved or tracked', () => {
    setGems(MOONFALL_BOX.gemsPerPack * 10);
    const result = buyBoxPacks(10);
    if (!result.ok) throw new Error('could not open');
    const pulls = result.opening.packs.flat();
    const outcome = packRevealOutcome(MOONFALL_BOX.name, 10, pulls);
    const before = rewardState();
    const timeline = buildPackTimeline(outcome.cards.map((c) => c.rarity));
    for (let i = 0; i < timeline.length; i += 1) stageAt(outcome, i); // watched to the end
    for (let i = 0; i < timeline.length - 1; i = advanceTarget(timeline, i)) stageAt(outcome, i); // tapped through
    stageAt(outcome, timeline.length - 1); // skipped
    expect(rewardState()).toBe(before);
    // Pack Results lists the opening in the order it was drawn, whatever order the ceremony presented it in.
    const html = renderToStaticMarkup(createElement(PackResults, { pulls, packs: 10, onInspect: () => {}, onClose: () => {} }));
    const shown = [...html.matchAll(/class="box-result [^"]*" aria-label="([^"]+)"/g)].map((m) => m[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&'));
    expect(shown).toHaveLength(50);
    shown.forEach((label, i) => expect(label.startsWith(`${getCard(pulls[i].cardId).name}, `), label).toBe(true));
    expect(outcome.cards.map((c) => c.cardId)).toEqual(pulls.map((c) => c.cardId));
    expect(rewardState()).toBe(before);
  });
  it('one pack presents all five cards on screen, the rarest last on the stage, then hands over to Pack Results', () => {
    const cards = pulls(['common', 'legendary', 'rare', 'common', 'epic']);
    const outcome = packRevealOutcome(MOONFALL_BOX.name, 1, cards);
    const timeline = buildPackTimeline(outcome.cards.map((c) => c.rarity));
    const frames = timeline.slice(0, -1).map((_, i) => text(stageAt(outcome, i)));
    for (const name of ['Archer', 'Royal Guard', 'Battle Captain', 'Paladin']) expect(frames.some((f) => f.includes(name)), name).toBe(true);
    const lastStaged = timeline.findLastIndex((s) => s.stage && s.phase === 'reveal');
    expect(timeline[lastStaged]).toMatchObject({ card: 1, headline: true });
    const climax = stageAt(outcome, lastStaged);
    expect(climax).toContain('rc rc-reveal r-legendary rc-headline');
    expect(climax).toContain('A rare card emerges');
    expect(climax).toContain('aria-label="Skip to Pack Results"');
    expect(timeline.at(-1)?.phase).toBe('result');
  });
  it('ten packs show ten pack tiles and spotlight each Epic before the Legendary hero reveal', () => {
    const rarities: Rarity[] = Array.from({ length: 50 }, (_, i) => (i === 7 || i === 23 ? 'epic' : i === 41 ? 'legendary' : 'common'));
    const outcome = packRevealOutcome(MOONFALL_BOX.name, 10, pulls(rarities));
    const timeline = buildPackTimeline(rarities);
    const staged = timeline.flatMap((s, i) => (s.stage && s.phase === 'reveal' ? [[s.card, s.headline, i] as const] : []));
    expect(staged.map(([card, headline]) => [card, headline])).toEqual([[7, false], [23, false], [41, true]]);
    const grid = stageAt(outcome, timeline.findIndex((s) => s.phase === 'slot'));
    expect((grid.match(/class="pack-tile /g) ?? []).length).toBe(10);
    expect(text(grid)).toContain('10 packs open');
    expect(stageAt(outcome, staged[0][2])).toContain('rc rc-reveal r-epic rc-spotlight');
  });
  it('Pack Tickets and Gems open the same packs and play the very same ceremony', () => {
    setGems(MOONFALL_BOX.gemsPerPack);
    const gems = buyBoxPacks(1);
    resetPrototypeBox();
    setCollection({});
    setTickets(1);
    const tickets = buyBoxPacks(1, MOONFALL_BOX, 'tickets');
    if (!gems.ok || !tickets.ok) throw new Error('could not open');
    expect(tickets.opening.packs).toEqual(gems.opening.packs);
    const a = packRevealOutcome(MOONFALL_BOX.name, 1, gems.opening.packs.flat());
    const b = packRevealOutcome(MOONFALL_BOX.name, 1, tickets.opening.packs.flat());
    expect(b).toEqual(a); // the outcome does not even know how it was paid for
    expect(buildPackTimeline(b.cards.map((c) => c.rarity))).toEqual(buildPackTimeline(a.cards.map((c) => c.rarity)));
    const box = read('../../pages/shop/BoxDetail.tsx');
    expect(box.match(/reveal\.start\(/g)).toHaveLength(1);
    expect(box.match(/<RevealStage /g)).toHaveLength(1);
    expect(read('../reveal/outcome.ts')).not.toMatch(/payment|tickets/i);
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

describe('the dev/QA reveal fixture can never reach a player', () => {
  it('only the fixture page reads it, and the app opens that page only in a dev build', () => {
    const app = read('../../App.tsx');
    expect(app).toMatch(/import\.meta\.env\.DEV \? new URLSearchParams\(window\.location\.search\)\.get\('revealFixture'\)/);
    const fixture = read('../reveal/fixtures.ts');
    expect(fixture).not.toMatch(/buyBoxPacks|openPrototypeBox|grantCard|setCollection|track\(/);
    for (const rel of ['../../pages/shop/BoxDetail.tsx', './boxProduct.ts', './prototypeBox.ts', '../reveal/outcome.ts', '../reveal/sequence.ts', '../../components/reveal/RevealStage.tsx', '../../components/reveal/useRevealSequence.ts']) expect(read(rel), rel).not.toMatch(/fixtures|revealFixture/);
  });
});

describe('the Moonwell Summon is retired as a second acquisition path', () => {
  it('no Summon screen, route, banner pool or pity code is left', () => {
    expect(existsSync(new URL('../summon', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../../pages/SummonPage.tsx', import.meta.url))).toBe(false);
    expect(read('../../App.tsx')).not.toMatch(/SummonPage|showSummon/);
    expect(read('../../pages/HomePage.tsx')).not.toMatch(/onOpenSummon|Moonwell</);
  });
  it('the pack ceremony keeps the Moonwell as its place but never says Summon, pity, banner or guarantee', () => {
    const outcome = packRevealOutcome(MOONFALL_BOX.name, 1, pulls(['common', 'epic', 'rare', 'legendary', 'common']));
    const steps = buildPackTimeline(outcome.cards.map((c) => c.rarity)).length;
    const words = Array.from({ length: steps - 1 }, (_, i) => text(stageAt(outcome, i))).join(' ');
    expect(words).toMatch(/Moonwell/);
    expect(words).not.toMatch(/Summon|pity|banner|guarantee/i);
    for (const rel of ['../reveal/sequence.ts', '../../components/reveal/useRevealSequence.ts', '../reveal/outcome.ts']) expect(read(rel), rel).not.toMatch(/pity|banner|commitSummon/i);
  });
  it('its reusable presentation lives on in neutral reveal modules', () => {
    for (const rel of ['../reveal/sequence.ts', '../reveal/meteors.ts', '../reveal/sound.ts', '../reveal/audio.ts', '../../components/reveal/RevealStage.tsx', '../../components/reveal/useRevealSequence.ts', '../../components/reveal/RevealFilm.tsx', '../../components/MoonwellVoyage.tsx']) expect(existsSync(new URL(rel, import.meta.url)), rel).toBe(true);
  });
});
