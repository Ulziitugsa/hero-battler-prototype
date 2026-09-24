import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { reloadAscension } from '../ascension/store';
import { CHAPTER_1 } from '../campaign/chapter1';
import type { CampaignProgress } from '../campaign/progress';
import { buildStarterCollection } from '../collection/starterCollection';
import { STARTER_DECKS } from '../cards/starterDecks';
import { getBanner } from '../summon/banners';
import { ContinueCampaign, EventSlot, FeaturedSummon, GemPlate, HubNoteLine } from '../../pages/home/HomeSections';
import { RECENT_CARD_MS, STARTER_CLOSE_FRACTION, anyAscensionReady, attentionState, campaignHub, closestStarter, navDots, pickHubNote } from './hubState';

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

beforeEach(() => {
  installLocalStoragePolyfill();
  reloadAscension();
});

const ids = CHAPTER_1.nodes.map((n) => n.id);
const progress = (cleared: string[]): CampaignProgress => ({ clearedNodes: cleared, objectivesMet: {}, firstClearClaimed: cleared, lastLossPower: {} });
const starter = buildStarterCollection();
const undeadCards = (n: number): Record<string, number> => {
  const out: Record<string, number> = {};
  let left = n;
  for (const id of STARTER_DECKS.undead) {
    if (left <= 0) break;
    out[id] = (out[id] ?? 0) + 1;
    left--;
  }
  return out;
};

describe('Continue Campaign state', () => {
  it('fresh: nothing cleared, the first node is next', () => {
    const h = campaignHub(progress([]));
    expect(h).toMatchObject({ status: 'fresh', cleared: 0, total: CHAPTER_1.nodes.length, region: 'The Ashen Road', chapterLine: 'The Ashen Road · Chapter 1' });
    expect(h.nextName).toBe(CHAPTER_1.nodes[0].name);
  });
  it('in progress: names the next main-road node and its real Energy cost', () => {
    const h = campaignHub(progress(ids.slice(0, 4)));
    const next = CHAPTER_1.nodes[4];
    expect(h).toMatchObject({ status: 'progress', cleared: 4, nextName: next.name, energyCost: next.encounter?.energyCost ?? 0 });
  });
  it('complete: no next stage, no cost', () => {
    const h = campaignHub(progress(ids));
    expect(h).toMatchObject({ status: 'complete', nextName: null, nextType: null, energyCost: null, cleared: ids.length });
  });
  it('renders the contextual plate for each state', () => {
    const energy = { current: 42, max: 60, msUntilNextTick: 0 };
    const fresh = renderToStaticMarkup(createElement(ContinueCampaign, { hub: campaignHub(progress([])), energy, onOpen: () => {} }));
    expect(fresh).toContain('Begin the Campaign');
    const mid = renderToStaticMarkup(createElement(ContinueCampaign, { hub: campaignHub(progress(ids.slice(0, 4))), energy, onOpen: () => {} }));
    expect(mid).toContain('Continue Campaign');
    expect(mid).toContain(CHAPTER_1.nodes[4].name);
    expect(mid).toContain('4 / ');
    const done = renderToStaticMarkup(createElement(ContinueCampaign, { hub: campaignHub(progress(ids)), energy, onOpen: () => {} }));
    expect(done).toContain('Chapter complete');
    expect(done).not.toContain('hh-energy');
    const broke = renderToStaticMarkup(createElement(ContinueCampaign, { hub: campaignHub(progress(ids.slice(0, 4))), energy: { current: 0, max: 60, msUntilNextTick: 1000 }, onOpen: () => {} }));
    expect(broke).toContain('hh-energy low');
  });
});

describe('the one contextual note', () => {
  const now = 1_000_000_000_000;
  const none = { masteryPoints: 0, owned: starter, history: [], now };
  it('nothing to say on a fresh profile', () => {
    expect(pickHubNote(none)).toBeNull();
  });
  it('an unspent Mastery Point outranks everything', () => {
    expect(pickHubNote({ ...none, masteryPoints: 2, owned: { ...starter, ...undeadCards(12) } })).toEqual({ kind: 'mastery', points: 2 });
  });
  it('a starter is surfaced only once it is close (>= 40%), and never when unlocked', () => {
    expect(closestStarter({ ...starter, ...undeadCards(3) })).toBeNull(); // 3/15 = 20%
    const need = Math.ceil(STARTER_CLOSE_FRACTION * 15);
    const p = closestStarter({ ...starter, ...undeadCards(need) });
    expect(p).toMatchObject({ faction: 'undead', collected: need });
    expect(pickHubNote({ ...none, owned: { ...starter, ...undeadCards(8) } })).toMatchObject({ kind: 'starter', name: 'Undead Starter', collected: 8, total: 15 });
    expect(closestStarter({ ...starter, ...undeadCards(15) })).toBeNull(); // unlocked
  });
  it('picks the nearest of several locked starters', () => {
    const owned = { ...starter, ...undeadCards(7), 'inf-flame-imp': 2, 'inf-cultist': 2, 'inf-pit-fiend': 2, 'inf-hellhound': 2, 'inf-blood-demon': 2, 'inf-infernal-lord': 1 };
    expect(closestStarter(owned)?.faction).toBe('infernal');
  });
  it('a first copy pulled in the last day is a note; an old one, or a duplicate, is not', () => {
    const entry = (at: number, wasNew: boolean) => ({ cardId: 'und-bone-soldier', rarity: 'common' as const, at, wasNew, bannerId: 'gravebound' });
    expect(pickHubNote({ ...none, history: [entry(now - 1000, true)] })).toEqual({ kind: 'recent', cardId: 'und-bone-soldier' });
    expect(pickHubNote({ ...none, history: [entry(now - RECENT_CARD_MS - 1, true)] })).toBeNull();
    expect(pickHubNote({ ...none, history: [entry(now - 1000, false)] })).toBeNull();
  });
  it('renders one line per kind', () => {
    const noop = () => {};
    expect(renderToStaticMarkup(createElement(HubNoteLine, { note: { kind: 'mastery', points: 1 }, onOpenProfile: noop, onOpenDecks: noop, onOpenHeroes: noop }))).toContain('Mastery Point ready');
    expect(renderToStaticMarkup(createElement(HubNoteLine, { note: { kind: 'starter', deckId: 'starter-undead', name: 'Undead Starter', collected: 12, total: 15 }, onOpenProfile: noop, onOpenDecks: noop, onOpenHeroes: noop }))).toContain('3 to go');
  });
});

describe('attention markers', () => {
  it('Summon glows only with enough Gems (or dev Unlimited Gems)', () => {
    const base = { masteryPoints: 0, owned: starter };
    expect(attentionState({ ...base, gems: 99 }).canSummon).toBe(false);
    expect(attentionState({ ...base, gems: 100 }).canSummon).toBe(true);
    expect(attentionState({ ...base, gems: 0, unlimitedGems: true }).canSummon).toBe(true);
  });
  it('nav dots: Profile for a Mastery Point, Heroes for a duplicate ready to Ascend - nothing else', () => {
    expect(anyAscensionReady(starter)).toBe(false);
    const spare = { ...starter, 'kng-royal-guard': 3 };
    expect(anyAscensionReady(spare)).toBe(true);
    expect(navDots(attentionState({ gems: 0, masteryPoints: 1, owned: spare }))).toEqual({ heroes: true, profile: true });
    expect(navDots(attentionState({ gems: 900, masteryPoints: 0, owned: starter }))).toEqual({ heroes: false, profile: false });
  });
});

describe('Summon presence', () => {
  it('shows the banner, its chase card, pity and cost; the ready dot follows Gems', () => {
    const banner = getBanner('gravebound')!;
    const on = renderToStaticMarkup(createElement(FeaturedSummon, { banner, pity: 17, canSummon: true, onOpen: () => {} }));
    expect(on).toContain('Gravebound');
    expect(on).toContain('Featured · Vharos');
    expect(on).toContain('17/40');
    expect(on).toContain('hh-dot');
    const off = renderToStaticMarkup(createElement(FeaturedSummon, { banner, pity: 0, canSummon: false, onOpen: () => {} }));
    expect(off).not.toContain('hh-dot');
  });
});

describe('reserved Event and Shop slots', () => {
  it('Event renders a quiet, non-interactive Coming-soon stone today (no fake content)', () => {
    const html = renderToStaticMarkup(createElement(EventSlot, { event: null }));
    expect(html).toContain('Coming soon');
    expect(html).toContain('reserved');
    expect(html).not.toContain('<button');
  });
  it('a live Event drops into the same footprint as a tappable plate', () => {
    const html = renderToStaticMarkup(createElement(EventSlot, { event: { id: 'e1', name: 'Test Event', sub: 'Ends soon', onOpen: () => {} } }));
    expect(html).toContain('<button');
    expect(html).toContain('Test Event');
    expect(html).toContain('hh-event');
    expect(html).not.toContain('reserved');
  });
  it('the Gem plate has a trailing slot for a future Shop entry, empty today', () => {
    expect(renderToStaticMarkup(createElement(GemPlate, {}))).not.toContain('shop');
    expect(renderToStaticMarkup(createElement(GemPlate, { trailing: createElement('span', { className: 'shop-slot' }, 'Shop') }))).toContain('shop-slot');
  });
});
