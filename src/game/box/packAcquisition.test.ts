/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';
import { getCollection, reloadCollection, setCollection } from '../collection/collection';
import { getEconomy, reloadEconomy, setGems, setTickets } from '../economy/economy';
import { ECONOMY_STORAGE_KEY } from '../economy/persistence';
import { advanceTarget, buildPackTimeline, planPackReveal, viewAt } from '../reveal/sequence';
import { pullRevealOutcome, type RevealOutcome } from '../reveal/outcome';
import { RevealStage } from '../../components/reveal/RevealStage';
import { PullResults } from '../../pages/shop/BoxDetail';
import { boxPullPrice, boxPullTickets, buyBoxPulls, hasOpenedPacks } from './boxProduct';
import { boxSize, getArchetypeBox } from './archetypeBoxes';
import { boxCardsRemaining, clearArchetypeBoxes, getBoxesState, previewPulls, type BoxPull } from './boxPool';
import { LEGACY_MOONFALL_STORAGE_KEYS } from './legacyMoonfall';
import { runLaunchSetMigration } from '../save/launchSetMigration';
import { clearCoreAccess } from '../core/coreAccess';
import { getCard } from '../cards';
import { JOURNEY_DAYS } from '../journey/definitions';
import { ALL_MISSIONS, WEEKLY_MISSIONS } from '../missions/definitions';
import { claimMission, initMissions, resetMissions } from '../missions/store';
import { FIRST_PURCHASE_BONUS, OFFERS } from '../offers/definitions';
import { RANK_REWARDS } from '../ranked/store';
import { EVENTS } from '../events/definitions';
import { DEFAULT_CONFIG } from '../../config/defaults';
import type { Rarity } from '../types';

// One card-acquisition model: pulls from the nine finite archetype Boxes (1 pull = 1 card, a 10-pull = 10 cards, paid
// with Gems or Pull Tickets), shown by the reveal ceremony that used to belong to the Moonwell Summon, then Pull
// Results. The Summon and the Moonfall Box are gone.

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  reloadEconomy();
  reloadCollection();
  setCollection({});
  clearArchetypeBoxes();
  clearCoreAccess();
  clearQueuedEvents();
});

describe('Pull Tickets pay for pulls from the same finite Boxes', () => {
  it('one Ticket pays for one pull: Tickets are spent, Gems are not, and the card comes from the Box', () => {
    setGems(1000);
    setTickets(3);
    const result = buyBoxPulls('vanguard', 1, 'tickets');
    expect(result.ok).toBe(true);
    expect(getEconomy()).toMatchObject({ gems: 1000, tickets: 2 });
    expect(boxCardsRemaining('vanguard')).toBe(boxSize('vanguard') - 1);
    expect(Object.values(getCollection()).reduce((sum, n) => sum + n, 0)).toBe(1);
    expect(boxPullTickets(10)).toBe(10); // no bulk discount
  });
  it('without enough Tickets nothing is spent or pulled, and Gems are never a silent fallback', () => {
    setGems(1000);
    setTickets(4);
    expect(buyBoxPulls('vanguard', 10, 'tickets')).toEqual({ ok: false, reason: 'not-enough-tickets' });
    expect(getEconomy()).toMatchObject({ gems: 1000, tickets: 4 });
    expect(boxCardsRemaining('vanguard')).toBe(boxSize('vanguard'));
  });
  it('each pull fires box_pulled with its pull count (what event objectives count), whichever way it was paid', () => {
    setGems(boxPullPrice(10));
    setTickets(1);
    buyBoxPulls('arcane', 10);
    buyBoxPulls('wither', 1, 'tickets');
    const pulled = getQueuedEvents().filter((e) => e.name === 'box_pulled');
    expect(pulled.map((e) => [e.properties?.boxId, e.properties?.pullCount])).toEqual([['arcane', 10], ['wither', 1]]);
    const names = getQueuedEvents().map((e) => e.name);
    expect(names).toContain('pack_ticket_used');
    expect(names.some((n) => n.startsWith('summon_'))).toBe(false);
  });
});

describe('Pull Ticket rewards: 1 Ticket = 1 pull = 1 card (launch set)', () => {
  it('one Pull Ticket pulls exactly one card', () => {
    setTickets(1);
    const result = buyBoxPulls('crusade', 1, 'tickets');
    if (!result.ok) throw new Error('could not pull');
    expect(result.opening.pulls).toHaveLength(1);
    expect(getEconomy().tickets).toBe(0);
  });
  it('Journey Day 2 and the weekly "Complete 5 daily missions" mission each grant exactly one Pull Ticket', () => {
    expect(JOURNEY_DAYS.find((d) => d.day === 2)).toMatchObject({ title: 'A Pull Ticket', rewardTickets: 1 });
    expect(WEEKLY_MISSIONS.find((m) => m.id === 'weekly-daily-missions')).toMatchObject({ title: 'Complete 5 daily missions', metric: 'daily_mission_completed', target: 5, rewardTickets: 1, rewardGems: 100 });
  });
  it('pulling advances no recurring mission, so the weekly Ticket never asks the player to spend', () => {
    resetMissions();
    initMissions();
    setGems(0);
    setTickets(5);
    for (let i = 0; i < 5; i += 1) expect(buyBoxPulls('vanguard', 1, 'tickets').ok).toBe(true);
    expect(ALL_MISSIONS.some((m) => m.metric === 'box_pulled')).toBe(false);
    expect(claimMission('weekly-daily-missions')).toMatchObject({ ok: false, reason: 'Not complete yet.' });
    expect(getEconomy()).toMatchObject({ tickets: 0, gems: 0 });
  });
  it('the other weekly missions give no Ticket; recurring free income is still one Ticket a week, from one source', () => {
    expect(WEEKLY_MISSIONS.find((m) => m.id === 'weekly-campaign-wins')).toMatchObject({ rewardTickets: 0, rewardGold: 200 });
    expect(WEEKLY_MISSIONS.find((m) => m.id === 'weekly-battles')).toMatchObject({ rewardTickets: 0, rewardGold: 150 });
    expect(ALL_MISSIONS.reduce((n, m) => n + m.rewardTickets, 0)).toBe(1);
  });
  it('the Long Vigil holds exactly one Ticket, on login Day 6; Ranked 300 keeps its one', () => {
    const vigil = EVENTS.find((e) => e.id === 'long-vigil-2026')!;
    const all = [...vigil.loginRewards.map((l) => ({ id: `day-${l.day}`, reward: l.reward })), ...vigil.missions, ...vigil.milestones];
    expect(all.filter((r) => r.reward?.tickets).map((r) => [r.id, r.reward?.tickets])).toEqual([['day-6', 1]]);
    expect(RANK_REWARDS.filter((r) => r.tickets).map((r) => [r.id, r.tickets])).toEqual([['rating-300', 1]]);
  });
  it('paid offers keep their placeholder Tickets: Starter Pack 5, Growth Pack 3', () => {
    expect(OFFERS.find((o) => o.id === 'starter-pack')?.reward.tickets).toBe(5);
    expect(OFFERS.find((o) => o.id === 'growth-pack')?.reward.tickets).toBe(3);
    expect(read('../offers/definitions.ts')).toMatch(/PROTOTYPE PLACEHOLDERS/);
  });
  it('saved Summon Tickets carry over 1:1 as Pull Tickets (no conversion, no refund)', () => {
    localStorage.setItem(ECONOMY_STORAGE_KEY, JSON.stringify({ version: 5, gems: 40, gold: 0, tickets: 7, grants: [], summon: { pity: {}, history: [] } }));
    reloadEconomy();
    expect(getEconomy()).toMatchObject({ tickets: 7, gems: 40 });
    const result = buyBoxPulls('vanguard', 1, 'tickets');
    expect(result.ok && result.opening.pulls).toHaveLength(1);
    expect(getEconomy()).toMatchObject({ tickets: 6, gems: 40 });
  });
  it('every production Pull Ticket grant matches the audited table (docs/ECONOMY-BASELINE.md)', () => {
    const grants: Record<string, number> = {};
    for (const d of JOURNEY_DAYS) if (d.rewardTickets) grants[`journey:day-${d.day}`] = d.rewardTickets;
    for (const m of ALL_MISSIONS) if (m.rewardTickets) grants[`mission:${m.id}`] = m.rewardTickets;
    for (const o of OFFERS) if (o.reward.tickets) grants[`offer:${o.id}`] = o.reward.tickets;
    if (FIRST_PURCHASE_BONUS.tickets) grants['offer:first-purchase-bonus'] = FIRST_PURCHASE_BONUS.tickets;
    for (const r of RANK_REWARDS) if (r.tickets) grants[`ranked:${r.id}`] = r.tickets;
    for (const e of EVENTS) {
      for (const l of e.loginRewards) if (l.reward?.tickets) grants[`event:${e.id}:login-day-${l.day}`] = l.reward?.tickets;
      for (const m of e.missions) if (m.reward?.tickets) grants[`event:${e.id}:${m.id}`] = m.reward?.tickets;
      for (const m of e.milestones) if (m.reward?.tickets) grants[`event:${e.id}:${m.id}`] = m.reward?.tickets;
    }
    expect(grants).toEqual({
      'journey:day-2': 1, // one-time free
      'ranked:rating-300': 1, // one-time free
      'mission:weekly-daily-missions': 1, // recurring free
      'event:long-vigil-2026:login-day-6': 1, // event
      'offer:starter-pack': 5, // paid offer, placeholder
      'offer:growth-pack': 3, // paid offer, placeholder
    });
    expect(DEFAULT_CONFIG.economy.startingTickets).toBe(0);
    // ...and nothing else in the game hands out Tickets.
    const src = new URL('../../', import.meta.url);
    const callers = (readdirSync(src, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('economy.ts'))
      .filter((f) => /grantTickets\(/.test(readFileSync(new URL(f, src), 'utf8')))
      .map((f) => f.replace(/\\/g, '/'))
      .sort();
    expect(callers).toEqual(['game/collection/devTools.ts', 'game/events/store.ts', 'game/journey/store.ts', 'game/missions/store.ts', 'game/offers/store.ts', 'game/ranked/store.ts']);
  });
});

describe('the Shop unlocks that used to wait for a first Summon', () => {
  it('open after a first pull, and stay open for a save that opened Moonfall packs or used the retired Summon', () => {
    expect(hasOpenedPacks(getEconomy())).toBe(false);
    setGems(boxPullPrice(1));
    buyBoxPulls('vanguard', 1);
    expect(hasOpenedPacks(getEconomy())).toBe(true);
    // A save from before the launch set that had opened Moonfall packs: the migration records them, then deletes the Box.
    clearArchetypeBoxes();
    localStorage.setItem(LEGACY_MOONFALL_STORAGE_KEYS[0], JSON.stringify({ version: 1, openedPacks: 4, randomState: 7, remaining: {} }));
    expect(hasOpenedPacks(getEconomy())).toBe(false);
    runLaunchSetMigration();
    expect(localStorage.getItem(LEGACY_MOONFALL_STORAGE_KEYS[0])).toBeNull();
    expect(getBoxesState().legacyMoonfallPacksOpened).toBe(4);
    expect(hasOpenedPacks(getEconomy())).toBe(true);
    clearArchetypeBoxes();
    localStorage.setItem(ECONOMY_STORAGE_KEY, JSON.stringify({ version: 5, gems: 0, gold: 0, tickets: 0, grants: [], summon: { pity: {}, history: [{ cardId: 'kng-archer', rarity: 'common', at: 1, wasNew: true, bannerId: 'royal-vanguard' }] } }));
    reloadEconomy();
    expect(hasOpenedPacks(getEconomy())).toBe(true);
  });
});

const pulls = (rarities: Rarity[]): BoxPull[] => rarities.map((rarity, i) => ({ cardId: { common: 'kng-archer', rare: 'kng-royal-guard', epic: 'kng-battle-captain', legendary: 'kng-paladin' }[rarity], rarity, previousCopies: i % 2, ownedCopies: (i % 2) + 1, isNew: i % 2 === 0 }));

/** The ceremony rendered at one step, as BoxDetail renders it (RevealStage never sees the step after the result). */
const stageAt = (outcome: RevealOutcome, index: number): string => {
  const rarities = outcome.cards.map((c) => c.rarity);
  return renderToStaticMarkup(createElement(RevealStage, { outcome, plan: planPackReveal(rarities), view: viewAt(buildPackTimeline(rarities), index), onAdvance: () => {}, onSkip: () => {}, onIntroFinished: () => {} }));
};
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ');
/** Everything a reward could touch: owned copies, wallet, the finite Box and the analytics queue. */
const rewardState = () => JSON.stringify({ collection: getCollection(), economy: getEconomy(), boxes: getBoxesState(), events: getQueuedEvents().map((e) => [e.name, e.properties]) });

describe('the pull ceremony shows an outcome that was decided before it began', () => {
  it('a fresh Box deals a fixed order: the pull takes exactly the cards the saved state says are next', () => {
    const next = previewPulls('bone-legion', 10);
    setGems(boxPullPrice(10));
    const ten = buyBoxPulls('bone-legion', 10);
    expect(ten.ok && ten.opening.pulls.map((c) => c.cardId)).toEqual(next);
    expect(ten.ok && ten.opening.pulls).toHaveLength(10); // all ten cards are granted, not just the spotlit ones
  });
  it('watching, tapping through or skipping the ceremony changes nothing that was granted, saved or tracked', () => {
    setGems(boxPullPrice(10));
    const result = buyBoxPulls('hellfire', 10);
    if (!result.ok) throw new Error('could not pull');
    const pulled = result.opening.pulls;
    const outcome = pullRevealOutcome(getArchetypeBox('hellfire').name, pulled);
    const before = rewardState();
    const timeline = buildPackTimeline(outcome.cards.map((c) => c.rarity));
    for (let i = 0; i < timeline.length; i += 1) stageAt(outcome, i); // watched to the end
    for (let i = 0; i < timeline.length - 1; i = advanceTarget(timeline, i)) stageAt(outcome, i); // tapped through
    stageAt(outcome, timeline.length - 1); // skipped
    expect(rewardState()).toBe(before);
    // Pull Results lists the pull in the order it was drawn, whatever order the ceremony presented it in.
    const html = renderToStaticMarkup(createElement(PullResults, { pulls: pulled, onInspect: () => {}, onClose: () => {} }));
    const shown = [...html.matchAll(/class="box-result [^"]*" aria-label="([^"]+)"/g)].map((m) => m[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&'));
    expect(shown).toHaveLength(10);
    shown.forEach((label, i) => expect(label.startsWith(`${getCard(pulled[i].cardId).name}, `), label).toBe(true));
    expect(outcome.cards.map((c) => c.cardId)).toEqual(pulled.map((c) => c.cardId));
    expect(rewardState()).toBe(before);
  });
  it('a single pull shows its one card; a Legendary gets the hero reveal, then Pull Results', () => {
    const outcome = pullRevealOutcome('Vanguard Box', pulls(['legendary']));
    const timeline = buildPackTimeline(['legendary']);
    const lastStaged = timeline.findLastIndex((s) => s.stage && s.phase === 'reveal');
    expect(timeline[lastStaged]).toMatchObject({ card: 0, headline: true });
    const climax = stageAt(outcome, lastStaged);
    expect(climax).toContain('rc rc-reveal r-legendary rc-headline');
    expect(climax).toContain('Vanguard Box · 1 card');
    expect(climax).toContain('aria-label="Skip to Pull Results"');
    const grid = stageAt(outcome, 2);
    expect(grid).toContain('pack-grid one');
    expect(timeline.at(-1)?.phase).toBe('result');
  });
  it('a 10-pull shows ten card tiles and spotlights each Epic before the Legendary hero reveal', () => {
    const rarities: Rarity[] = Array.from({ length: 10 }, (_, i) => (i === 2 || i === 5 ? 'epic' : i === 8 ? 'legendary' : 'common'));
    const outcome = pullRevealOutcome('Vanguard Box', pulls(rarities));
    const timeline = buildPackTimeline(rarities);
    const staged = timeline.flatMap((s, i) => (s.stage && s.phase === 'reveal' ? [[s.card, s.headline, i] as const] : []));
    expect(staged.map(([card, headline]) => [card, headline])).toEqual([[2, false], [5, false], [8, true]]);
    const grid = stageAt(outcome, timeline.findIndex((s) => s.phase === 'slot'));
    expect(grid).toContain('pack-grid ten');
    expect((grid.match(/class="tile /g) ?? []).length).toBe(10);
    expect(text(grid)).toContain('Vanguard Box · 10 cards');
    expect(text(grid)).not.toMatch(/\bpacks?\b/i);
    expect(stageAt(outcome, staged[0][2])).toContain('rc rc-reveal r-epic rc-spotlight');
  });
  it('Pull Tickets and Gems pull the same cards and play the very same ceremony', () => {
    setGems(boxPullPrice(1));
    const gems = buyBoxPulls('vanguard', 1);
    clearArchetypeBoxes();
    setCollection({});
    setTickets(1);
    const tickets = buyBoxPulls('vanguard', 1, 'tickets');
    if (!gems.ok || !tickets.ok) throw new Error('could not pull');
    expect(tickets.opening.pulls).toEqual(gems.opening.pulls);
    const a = pullRevealOutcome('Vanguard Box', gems.opening.pulls);
    const b = pullRevealOutcome('Vanguard Box', tickets.opening.pulls);
    expect(b).toEqual(a); // the outcome does not even know how it was paid for
    expect(buildPackTimeline(b.cards.map((c) => c.rarity))).toEqual(buildPackTimeline(a.cards.map((c) => c.rarity)));
    const box = read('../../pages/shop/BoxDetail.tsx');
    expect(box.match(/reveal\.start\(/g)).toHaveLength(1);
    expect(box.match(/<RevealStage /g)).toHaveLength(1);
    expect(read('../reveal/outcome.ts')).not.toMatch(/payment|tickets/i);
  });
  it('Pull Results shows one grid for 1 card or 10, with New and owned counts', () => {
    const one = renderToStaticMarkup(createElement(PullResults, { pulls: pulls(['epic']), onInspect: () => {}, onClose: () => {} }));
    expect(one).toContain('PULL RESULTS');
    expect(one).toContain('1 card added');
    expect((one.match(/class="box-result /g) ?? []).length).toBe(1);
    const ten = renderToStaticMarkup(createElement(PullResults, { pulls: pulls(Array.from({ length: 10 }, () => 'common' as Rarity)), starterProgress: [{ deckId: 'starter-undead', name: 'Undead Starter', collected: 9, total: 15, unlockedNow: false }], onInspect: () => {}, onClose: () => {} }));
    expect((ten.match(/class="box-result /g) ?? []).length).toBe(10);
    expect(ten).toContain('10 cards added');
    expect(ten).toContain('Undead Starter · 9 / 15 cards');
    expect(text(one + ten)).not.toMatch(/\bpacks?\b/i);
  });
});

describe('the dev/QA reveal fixture can never reach a player', () => {
  it('only the fixture page reads it, and the app opens that page only in a dev build', () => {
    const app = read('../../App.tsx');
    expect(app).toMatch(/import\.meta\.env\.DEV \? new URLSearchParams\(window\.location\.search\)\.get\('revealFixture'\)/);
    const fixture = read('../reveal/fixtures.ts');
    expect(fixture).not.toMatch(/buyBoxPulls|pullFromBox|grantCard|setCollection|track\(/);
    for (const rel of ['../../pages/shop/BoxDetail.tsx', './boxProduct.ts', './boxPool.ts', '../reveal/outcome.ts', '../reveal/sequence.ts', '../../components/reveal/RevealStage.tsx', '../../components/reveal/useRevealSequence.ts']) expect(read(rel), rel).not.toMatch(/fixtures|revealFixture/);
  });
});

describe('the Moonwell Summon is retired as a second acquisition path', () => {
  it('no Summon screen, route, banner pool or pity code is left', () => {
    expect(existsSync(new URL('../summon', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../../pages/SummonPage.tsx', import.meta.url))).toBe(false);
    expect(read('../../App.tsx')).not.toMatch(/SummonPage|showSummon/);
    expect(read('../../pages/HomePage.tsx')).not.toMatch(/onOpenSummon|Moonwell</);
  });
  it('the pull ceremony keeps the Moonwell as its place but never says Summon, pity, banner or guarantee', () => {
    const outcome = pullRevealOutcome('Vanguard Box', pulls(['common', 'epic', 'rare', 'legendary', 'common', 'common', 'common', 'rare', 'common', 'common']));
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
