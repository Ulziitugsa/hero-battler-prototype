import { beforeEach, describe, expect, it } from 'vitest';
import { getCard } from '../cards';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { STARTER_DECKS } from '../cards/starterDecks';
import { reloadAscension } from '../ascension/store';
import { CHAPTER_1 } from '../campaign/chapter1';
import { acquisitionSummary, getCardAcquisitionSources, getUnavailableCards, primaryAcquisitionLabel } from '../collection/acquisition';
import { getCollection, getOwnedCount, reloadCollection, setCollection } from '../collection/collection';
import { CAMPAIGN_EXCLUSIVE_CARDS } from '../collection/exclusives';
import { buildStarterCollection } from '../collection/starterCollection';
import { getEconomy, getGems, getPity, getTickets, reloadEconomy, setGems, setPity, setTickets, setUnlimitedGems } from '../economy/economy';
import { SUMMON_BANNERS, getBanner } from './banners';
import { SUMMON_CONFIG } from './config';
import { forceNextRarity, peekForcedRarity } from './devControls';
import { SUMMON_POOLS, bannersFor, buildPool, cardRates, getPool, isSummonable, validateSummonPool } from './pool';
import { PREVIEW_SCENARIOS, buildPreviewOutcome } from './preview';
import { resolveSummon, resolveSummons } from './resolve';
import { performSummon, summonCost } from './summon';
import { affordabilityNote, formatPercent, pityDisplay, summonOptions } from './view';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';

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
  reloadCollection();
  reloadEconomy();
  reloadAscension();
  forceNextRarity(null);
  clearQueuedEvents();
});

const vanguard = getPool('royal-vanguard');
const grave = getPool('gravebound');
const hunt = getPool('infernal-hunt');
const T = SUMMON_CONFIG.pityThreshold;

/** First seed in [1, 50000] satisfying the predicate - a deterministic scenario builder. */
function findSeed(pred: (seed: number) => boolean): number {
  for (let s = 1; s <= 50000; s++) if (pred(s)) return s;
  throw new Error('no seed found');
}

describe('banners', () => {
  it('there are three, with unique ids, and every pool validates', () => {
    expect(SUMMON_BANNERS.map((b) => b.id)).toEqual(['royal-vanguard', 'gravebound', 'infernal-hunt']);
    for (const p of SUMMON_POOLS) expect(validateSummonPool(p), p.id).toEqual([]);
  });
  it('each banner is about its archetype: most of the pool is its faction and the chase cards are its own', () => {
    for (const p of SUMMON_POOLS) {
      const own = p.entries.filter((e) => getCard(e.cardId).faction === p.banner.faction).length;
      expect(own / p.entries.length, p.id).toBeGreaterThanOrEqual(0.75);
      expect(getCard(p.banner.featured.main).faction).toBe(p.banner.faction);
      for (const id of p.banner.featured.secondary) expect(getCard(id).faction).toBe(p.banner.faction);
    }
  });
  it('features what the design calls for, from the real roster', () => {
    expect(getBanner('royal-vanguard')!.featured).toEqual({ main: 'kng-paladin', secondary: ['kng-battle-captain', 'kng-royal-guard'] });
    expect(getBanner('gravebound')!.featured.main).toBe('und-vharos');
    expect(getBanner('gravebound')!.featured.secondary).toEqual(expect.arrayContaining(['und-grave-knight']));
    expect(getBanner('infernal-hunt')!.featured).toEqual({ main: 'inf-infernal-lord', secondary: ['inf-blood-demon', 'inf-hellhound'] });
  });
  it('every banner can roll every rarity, including a Legendary chase', () => {
    for (const p of SUMMON_POOLS) for (const r of ['common', 'rare', 'epic', 'legendary'] as const) expect(p.entries.some((e) => e.rarity === r), `${p.id} ${r}`).toBe(true);
  });
  it('pools are small enough to chase (a dozen cards or fewer)', () => {
    for (const p of SUMMON_POOLS) expect(p.entries.length).toBeLessThanOrEqual(12);
  });
});

describe('exclusivity', () => {
  it('Mira is not summonable anywhere; Vharos only on Gravebound, by an explicit validated exception', () => {
    expect(isSummonable('und-mira')).toBe(false);
    expect(bannersFor('und-vharos').map((b) => b.id)).toEqual(['gravebound']);
    expect(getBanner('gravebound')!.campaignExclusiveExceptions).toEqual(['und-vharos']);
    expect([...CAMPAIGN_EXCLUSIVE_CARDS].sort()).toEqual(['und-mira', 'und-vharos']);
  });
  it('validation rejects an exclusive card that is not a declared exception, and a bogus exception', () => {
    const b = getBanner('royal-vanguard')!;
    const sneaky = buildPool({ ...b, cardIds: [...b.cardIds, 'und-mira'] });
    expect(validateSummonPool(sneaky)).toEqual(expect.arrayContaining([expect.stringContaining('und-mira: Campaign-exclusive')]));
    const bogus = buildPool({ ...b, campaignExclusiveExceptions: ['kng-archer'] });
    expect(validateSummonPool(bogus)).toEqual(expect.arrayContaining([expect.stringContaining('not Campaign-exclusive')]));
  });
  it('validation rejects an off-theme pool and missing rarities without crashing', () => {
    const b = getBanner('royal-vanguard')!;
    const off = buildPool({ ...b, cardIds: ['kng-paladin', 'inf-hellhound', 'inf-cultist', 'und-bone-soldier'], featured: { main: 'kng-paladin', secondary: [] } });
    const errs = validateSummonPool(off);
    expect(errs.some((e) => e.includes('only 1/4'))).toBe(true);
    expect(errs.some((e) => e.includes('no cards for rarity epic'))).toBe(true);
  });
});

describe('rates and rate-up', () => {
  it('base rates are 69 / 22 / 8 / 1 (Legendary 1%) and sum to 100', () => {
    expect(SUMMON_CONFIG.rarityRates).toEqual({ common: 69, rare: 22, epic: 8, legendary: 1 });
    for (const p of SUMMON_POOLS) expect(p.rates).toEqual(SUMMON_CONFIG.rarityRates);
  });
  it('per-card chances add up to 100% and to each rarity rate', () => {
    for (const p of SUMMON_POOLS) {
      const rates = cardRates(p);
      expect(rates.reduce((n, r) => n + r.percent, 0)).toBeCloseTo(100, 6);
      for (const r of ['common', 'rare', 'epic', 'legendary'] as const) expect(rates.filter((x) => x.entry.rarity === r).reduce((n, x) => n + x.percent, 0)).toBeCloseTo(p.rates[r], 6);
    }
  });
  it('featured cards carry rate-up within their rarity', () => {
    const r = cardRates(vanguard);
    const captain = r.find((x) => x.entry.cardId === 'kng-battle-captain')!;
    const fortify = r.find((x) => x.entry.cardId === 'spl-fortify')!;
    expect(captain.entry.featured).toBe('secondary');
    expect(captain.percent).toBeGreaterThan(fortify.percent * 2);
    const guard = r.find((x) => x.entry.cardId === 'kng-royal-guard')!;
    const priest = r.find((x) => x.entry.cardId === 'kng-light-priest')!;
    expect(guard.percent).toBeGreaterThan(priest.percent); // featured secondary vs equal-weight non-featured Hero
    expect(r.find((x) => x.entry.cardId === 'kng-paladin')!.entry.featured).toBe('main');
  });
  it('rate-up shows up in real rolls', () => {
    const n = 20000;
    let captain = 0;
    let fortify = 0;
    for (let s = 1; s <= n; s++) {
      const c = resolveSummon(vanguard, { pity: 0 }, s * 7919).cardId;
      if (c === 'kng-battle-captain') captain++;
      if (c === 'spl-fortify') fortify++;
    }
    const expected = Object.fromEntries(cardRates(vanguard).map((x) => [x.entry.cardId, x.percent]));
    expect(Math.abs((captain / n) * 100 - expected['kng-battle-captain'])).toBeLessThan(1);
    expect(Math.abs((fortify / n) * 100 - expected['spl-fortify'])).toBeLessThan(0.8);
    expect(captain).toBeGreaterThan(fortify * 2.5);
  });
  it('rarities roll near the configured rates', () => {
    const n = 30000;
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (let s = 1; s <= n; s++) counts[resolveSummon(hunt, { pity: 0 }, s * 104729).rarity]++;
    for (const r of ['common', 'rare', 'epic', 'legendary'] as const) expect(Math.abs((counts[r] / n) * 100 - SUMMON_CONFIG.rarityRates[r])).toBeLessThan(1);
  });
  it('formats small rates with a decimal', () => {
    expect(formatPercent(1)).toBe('1%');
    expect(formatPercent(0.6)).toBe('0.6%');
    expect(formatPercent(69)).toBe('69%');
    expect(formatPercent(6.4)).toBe('6.4%');
  });
});

describe('resolution', () => {
  it('is deterministic for identical inputs', () => {
    expect(resolveSummons(vanguard, { pity: 5 }, 10, 1234)).toEqual(resolveSummons(vanguard, { pity: 5 }, 10, 1234));
  });
  it('always returns a card from the banner, with matching rarity and featured status', () => {
    for (const pool of SUMMON_POOLS)
      for (let s = 1; s <= 200; s++) {
        const r = resolveSummon(pool, { pity: 0 }, s);
        const entry = pool.entries.find((e) => e.cardId === r.cardId)!;
        expect(entry).toBeDefined();
        expect(getCard(r.cardId).rarity).toBe(r.rarity);
        expect(r.featured).toBe(entry.featured);
      }
  });
  it('a rarity with no eligible cards never crashes resolution and is never rolled', () => {
    const b = getBanner('royal-vanguard')!;
    const commons = buildPool({ ...b, cardIds: ['kng-archer', 'kng-common-knight'], featured: { main: 'kng-archer', secondary: [] } });
    for (let s = 1; s <= 200; s++) expect(resolveSummon(commons, { pity: 0 }, s).rarity).toBe('common');
    expect(resolveSummon(commons, { pity: T - 1 }, 1)).toMatchObject({ rarity: 'common', pityTriggered: false });
  });
});

describe('cost', () => {
  it('single is 100 and 10x is 900 (a bulk discount) - all from config', () => {
    expect(summonCost(vanguard, 'single')).toBe(100);
    expect(summonCost(vanguard, 'ten')).toBe(900);
    expect(SUMMON_CONFIG.tenCost).toBeLessThan(SUMMON_CONFIG.singleCost * SUMMON_CONFIG.tenCount);
  });
});

describe('pity (per banner)', () => {
  const nonLegendarySeed = findSeed((s) => resolveSummon(hunt, { pity: 0 }, s).rarity !== 'legendary');
  const legendarySeed = findSeed((s) => resolveSummon(hunt, { pity: 0 }, s).rarity === 'legendary');

  it('a non-Legendary pull adds one', () => {
    expect(resolveSummon(hunt, { pity: 0 }, nonLegendarySeed)).toMatchObject({ pityBefore: 0, pityAfter: 1, pityTriggered: false });
  });
  it('a Legendary before pity resets the counter and is not "triggered"', () => {
    expect(resolveSummon(hunt, { pity: 10 }, legendarySeed)).toMatchObject({ rarity: 'legendary', pityBefore: 10, pityAfter: 0, pityTriggered: false });
  });
  it('exact threshold: pull 39 is a normal roll, pull 40 (pity 39) is forced Legendary - and it is the banner chase pool', () => {
    const s = findSeed((seed) => resolveSummon(hunt, { pity: T - 2 }, seed).rarity !== 'legendary');
    expect(resolveSummon(hunt, { pity: T - 2 }, s)).toMatchObject({ pityAfter: T - 1, pityTriggered: false });
    const forced = resolveSummon(hunt, { pity: T - 1 }, nonLegendarySeed);
    expect(forced).toMatchObject({ rarity: 'legendary', pityAfter: 0, pityTriggered: true, cardId: 'inf-infernal-lord', featured: 'main' });
  });
  it('a natural Legendary on the pity pull is not counted as triggered', () => {
    expect(resolveSummon(hunt, { pity: T - 1 }, legendarySeed)).toMatchObject({ rarity: 'legendary', pityAfter: 0, pityTriggered: false });
  });
  it('never goes 40 pulls without a Legendary over a long run', () => {
    let pity = 0;
    let since = 0;
    let rng = 42;
    for (let i = 0; i < 3000; i++) {
      const r = resolveSummon(vanguard, { pity }, rng);
      pity = r.pityAfter;
      rng = r.nextSeed;
      since = r.rarity === 'legendary' ? 0 : since + 1;
      expect(since).toBeLessThan(T);
    }
  });
  it('10x crossing the threshold: forced on exactly the right pull, then pity restarts', () => {
    const seed = findSeed((s) => resolveSummons(hunt, { pity: T - 5 }, 10, s).pulls.every((p) => p.rarity !== 'legendary' || p.pityTriggered));
    const { pulls, pityAfter } = resolveSummons(hunt, { pity: T - 5 }, 10, seed);
    expect(pulls.map((p) => p.pityBefore)).toEqual([35, 36, 37, 38, 39, 0, 1, 2, 3, 4]);
    expect(pulls[4]).toMatchObject({ rarity: 'legendary', pityTriggered: true, pityAfter: 0 });
    expect(pityAfter).toBe(5);
  });
  it('a Legendary early in a 10x resets pity for the rest; multiple Legendaries leave pity counting from the last', () => {
    const seed = findSeed((s) => resolveSummons(hunt, { pity: T - 1 }, 10, s).pulls.filter((p) => p.rarity === 'legendary').length >= 2);
    const { pulls, pityAfter } = resolveSummons(hunt, { pity: T - 1 }, 10, seed);
    expect(pulls[0].pityTriggered).toBe(true);
    expect(pityAfter).toBe(9 - pulls.map((p) => p.rarity).lastIndexOf('legendary'));
  });
  it('clamps out-of-range pity input', () => {
    expect(resolveSummon(hunt, { pity: 500 }, nonLegendarySeed).pityTriggered).toBe(true);
    expect(resolveSummon(hunt, { pity: NaN }, nonLegendarySeed).pityBefore).toBe(0);
  });
  it('each banner has its own counter: pulling one does not move the others', () => {
    setGems(5000);
    setPity('royal-vanguard', 17);
    setPity('infernal-hunt', 31);
    const seed = findSeed((s) => resolveSummon(grave, { pity: 0 }, s).rarity !== 'legendary');
    const r = performSummon('single', 'gravebound', seed);
    if (!r.ok) throw new Error('expected success');
    expect([getPity('royal-vanguard'), getPity('gravebound'), getPity('infernal-hunt')]).toEqual([17, 1, 31]);
    expect(r.bannerId).toBe('gravebound');
    expect(getEconomy().summon.history[0].bannerId).toBe('gravebound');
  });
  it('a banner at 39 forces its own chase Legendary in a real pull', () => {
    setGems(1000);
    setPity('gravebound', T - 1);
    const seed = findSeed((s) => resolveSummon(grave, { pity: T - 1 }, s).pityTriggered);
    const r = performSummon('single', 'gravebound', seed);
    if (!r.ok) throw new Error('expected success');
    expect(r.pulls[0]).toMatchObject({ rarity: 'legendary', cardId: 'und-vharos', pityTriggered: true, featured: 'main' });
    expect(getPity('gravebound')).toBe(0);
  });
});

describe('dev forced rarity', () => {
  it('replaces one pull, then clears itself', () => {
    expect(resolveSummon(vanguard, { pity: 0 }, 7, 'epic').rarity).toBe('epic');
    expect(resolveSummon(vanguard, { pity: 0 }, 7, 'legendary')).toMatchObject({ rarity: 'legendary', pityTriggered: false, pityAfter: 0 });
    setGems(2000);
    forceNextRarity('legendary');
    expect(peekForcedRarity()).toBe('legendary');
    const a = performSummon('single', 'infernal-hunt', 5);
    if (!a.ok) throw new Error('expected success');
    expect(a.pulls[0]).toMatchObject({ rarity: 'legendary', cardId: 'inf-infernal-lord' });
    expect(peekForcedRarity()).toBeNull();
  });
  it('in a 10x it lands on slot 6 and leaves the other nine to the normal rates', () => {
    setGems(2000);
    forceNextRarity('epic');
    const seed = findSeed((s) => resolveSummons(hunt, { pity: 0 }, 10, s).pulls.every((p) => p.rarity === 'common'));
    const r = performSummon('ten', 'infernal-hunt', seed);
    if (!r.ok) throw new Error('expected success');
    expect(r.pulls.map((p) => p.rarity)).toEqual(['common', 'common', 'common', 'common', 'common', 'epic', 'common', 'common', 'common', 'common']);
    expect(r.highestRarity).toBe('epic');
  });
  it('is ignored when the pool lacks that rarity', () => {
    const b = getBanner('royal-vanguard')!;
    const commons = buildPool({ ...b, cardIds: ['kng-archer', 'kng-common-knight'], featured: { main: 'kng-archer', secondary: [] } });
    expect(resolveSummon(commons, { pity: 0 }, 3, 'legendary').rarity).toBe('common');
  });
});

describe('performSummon', () => {
  it('refuses without enough Gems and changes nothing', () => {
    setGems(60);
    const before = getCollection();
    expect(performSummon('single', 'royal-vanguard', 1)).toEqual({ ok: false, reason: 'insufficient', currency: 'gems', need: 100, have: 60 });
    expect(getGems()).toBe(60);
    expect(getCollection()).toBe(before);
    expect(getEconomy().summon).toEqual({ pity: {}, history: [] });
    setGems(899);
    expect(performSummon('ten', 'royal-vanguard', 1).ok).toBe(false);
  });

  it('dev Unlimited Gems lets summons through without spending, and the real check returns when it is off', () => {
    setGems(0);
    setUnlimitedGems(true);
    const r = performSummon('ten', 'gravebound', 3);
    expect(r.ok).toBe(true);
    expect(getGems()).toBe(0);
    expect(summonOptions(0, grave, true).every((o) => o.affordable)).toBe(true);
    setUnlimitedGems(false);
    expect(performSummon('single', 'gravebound', 3).ok).toBe(false);
    expect(summonOptions(0, grave, false).some((o) => o.affordable)).toBe(false);
  });

  it('single: spends 100, advances that banner\'s pity, records history and grants through the collection', () => {
    setGems(250);
    const r = performSummon('single', 'royal-vanguard', 4242);
    if (!r.ok) throw new Error('expected success');
    expect(getGems()).toBe(150);
    const p = r.pulls[0];
    expect(getOwnedCount(p.cardId)).toBe(p.grant.owned);
    expect(getPity('royal-vanguard')).toBe(p.pityAfter);
    expect(getEconomy().summon.history).toEqual([{ cardId: p.cardId, rarity: p.rarity, at: expect.any(Number), wasNew: p.grant.isNew, bannerId: 'royal-vanguard' }]);
  });

  it('is reproducible from the same seed and state, and the outcome is fully resolved before any presentation', () => {
    setGems(1000);
    const a = performSummon('ten', 'infernal-hunt', 777);
    setCollection({ ...buildStarterCollection() });
    setGems(1000);
    setPity('infernal-hunt', 0);
    const b = performSummon('ten', 'infernal-hunt', 777);
    if (!a.ok || !b.ok) throw new Error('expected success');
    expect(a.pulls.map((p) => p.cardId)).toEqual(b.pulls.map((p) => p.cardId));
    expect(a.highestRarity).toBe(b.highestRarity);
  });

  it('10x: spends 900, ten results, every card lands in the collection, pity shared', () => {
    setGems(1000);
    const before = getCollection();
    const r = performSummon('ten', 'gravebound', 31337);
    if (!r.ok) throw new Error('expected success');
    expect(getGems()).toBe(100);
    expect(r.pulls).toHaveLength(10);
    const added: Record<string, number> = {};
    for (const p of r.pulls) added[p.cardId] = (added[p.cardId] ?? 0) + 1;
    for (const [id, n] of Object.entries(added)) expect(getOwnedCount(id)).toBe((before[id] ?? 0) + n);
    expect(getPity('gravebound')).toBe(r.pityAfter);
    expect(getEconomy().summon.history[0].cardId).toBe(r.pulls[9].cardId);
  });

  it('first copy is New; a duplicate (even within one 10x) is not', () => {
    setGems(1000);
    setCollection({});
    const seed = findSeed((s) => {
      const ids = resolveSummons(hunt, { pity: 0 }, 10, s).pulls.map((p) => p.cardId);
      return new Set(ids).size < ids.length;
    });
    const r = performSummon('ten', 'infernal-hunt', seed);
    if (!r.ok) throw new Error('expected success');
    const seen = new Map<string, number>();
    for (const p of r.pulls) {
      const n = (seen.get(p.cardId) ?? 0) + 1;
      seen.set(p.cardId, n);
      expect(p.grant.isNew).toBe(n === 1);
      expect(p.grant.owned).toBe(n);
    }
  });

  it('a duplicate raises ownership and can make Ascension available (never auto-applied)', () => {
    setGems(1000);
    const seed = findSeed((s) => resolveSummon(vanguard, { pity: 0 }, s).cardId === 'kng-royal-guard');
    const r = performSummon('single', 'royal-vanguard', seed);
    if (!r.ok) throw new Error('expected success');
    expect(r.pulls[0]).toMatchObject({ cardId: 'kng-royal-guard', ascensionAvailable: true, featured: 'secondary' });
    expect(r.pulls[0].grant).toMatchObject({ isNew: false, previous: 2, owned: 3 });
    expect(getOwnedCount('kng-royal-guard')).toBe(3);
  });

  it('reports starter-deck progress, and the unlock when a pull completes the deck', () => {
    setGems(1000);
    const undeadNeeds = new Set(STARTER_DECKS.undead);
    const seed = findSeed((s) => undeadNeeds.has(resolveSummon(grave, { pity: 0 }, s).cardId) && resolveSummon(grave, { pity: 0 }, s).cardId !== 'und-vharos');
    const r = performSummon('single', 'gravebound', seed);
    if (!r.ok) throw new Error('expected success');
    expect(r.starterProgress).toEqual([expect.objectContaining({ deckId: 'starter-undead', name: 'Undead Starter', collected: 1, total: 15, unlockedNow: false })]);

    const need: Record<string, number> = {};
    for (const id of STARTER_DECKS.undead) need[id] = (need[id] ?? 0) + 1;
    setCollection({ ...buildStarterCollection(), ...need, 'und-bone-soldier': 1 });
    const boneSeed = findSeed((s) => resolveSummon(grave, { pity: 0 }, s).cardId === 'und-bone-soldier');
    setGems(1000);
    setPity('gravebound', 0);
    const done = performSummon('single', 'gravebound', boneSeed);
    if (!done.ok) throw new Error('expected success');
    expect(done.starterProgress).toEqual([expect.objectContaining({ deckId: 'starter-undead', unlockedNow: true, collected: 15 })]);
  });

  it('Infernal cards can complete the Infernal Starter through Summon alone', () => {
    setGems(100000);
    let seed = 1;
    for (let i = 0; i < 400 && !getCollection()['inf-infernal-lord']; i++) performSummon('ten', 'infernal-hunt', seed++);
    expect(Object.keys(getCollection()).some((id) => id.startsWith('inf-'))).toBe(true);
  });
});

describe('performSummon duplicate analytics (Commercial Prototype Phase 9)', () => {
  it('fires hero_star_changed when a duplicate crosses a star boundary for a card with no Ascension path', () => {
    // kng-archer has no Ascension path - stars are copy-derived (2nd copy = 1 star, see ascension/stars.ts).
    setGems(1000);
    setCollection({ 'kng-archer': 1 });
    const seed = findSeed((s) => resolveSummon(vanguard, { pity: 0 }, s).cardId === 'kng-archer');
    performSummon('single', 'royal-vanguard', seed);
    const events = getQueuedEvents().filter((e) => e.name === 'hero_star_changed');
    expect(events).toHaveLength(1);
    expect(events[0].properties).toMatchObject({ cardId: 'kng-archer', starsBefore: 0, starsAfter: 1, source: 'summon' });
  });
  it('a brand-new card (not a duplicate) fires no hero_star_changed', () => {
    setGems(1000);
    setCollection({});
    const seed = findSeed((s) => resolveSummon(vanguard, { pity: 0 }, s).cardId === 'kng-archer');
    performSummon('single', 'royal-vanguard', seed);
    expect(getQueuedEvents().filter((e) => e.name === 'hero_star_changed')).toHaveLength(0);
  });
});

describe('performSummon paid with Tickets (Commercial Prototype Phase 7)', () => {
  it('spends Tickets, not Gems, and grants a real card through the collection', () => {
    setGems(0);
    setTickets(5);
    const r = performSummon('single', 'royal-vanguard', 4242, 'tickets');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.currency).toBe('tickets');
    expect(r.cost).toBe(SUMMON_CONFIG.ticketCost.single);
    expect(getTickets()).toBe(5 - SUMMON_CONFIG.ticketCost.single);
    expect(getGems()).toBe(0); // untouched
    expect(getOwnedCount(r.pulls[0].cardId)).toBeGreaterThan(0);
  });
  it('a 10x Ticket pull costs SUMMON_CONFIG.ticketCost.ten flat, with no bulk discount (Tickets are earned, not priced)', () => {
    setTickets(SUMMON_CONFIG.ticketCost.ten);
    const r = performSummon('ten', 'royal-vanguard', 1, 'tickets');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cost).toBe(SUMMON_CONFIG.ticketCost.ten);
    expect(getTickets()).toBe(0);
  });
  it('refuses without enough Tickets and changes nothing - Gems are never a silent fallback', () => {
    setGems(100000);
    setTickets(0);
    const before = getCollection();
    const r = performSummon('single', 'royal-vanguard', 1, 'tickets');
    expect(r).toMatchObject({ ok: false, reason: 'insufficient', currency: 'tickets', need: SUMMON_CONFIG.ticketCost.single, have: 0 });
    expect(getTickets()).toBe(0);
    expect(getGems()).toBe(100000); // completely untouched
    expect(getCollection()).toBe(before);
  });
  it('a Gem pull and a Ticket pull on the same banner share one pity counter and one history, not two pools', () => {
    setGems(1000);
    setTickets(20);
    const gemPull = performSummon('single', 'royal-vanguard', 10);
    expect(gemPull.ok).toBe(true);
    const pityAfterGems = getPity('royal-vanguard');
    const ticketPull = performSummon('single', 'royal-vanguard', 11, 'tickets');
    expect(ticketPull.ok).toBe(true);
    expect(getPity('royal-vanguard')).toBe(pityAfterGems + 1); // continued the same counter, not reset
    expect(getEconomy().summon.history).toHaveLength(2);
    expect(getEconomy().summon.history.every((h) => h.bannerId === 'royal-vanguard')).toBe(true);
  });
  it('dev Unlimited Gems also lets Ticket-paid summons through for free (shared dev bypass)', () => {
    setTickets(0);
    setUnlimitedGems(true);
    const r = performSummon('single', 'royal-vanguard', 1, 'tickets');
    expect(r.ok).toBe(true);
    expect(getTickets()).toBe(0);
    setUnlimitedGems(false);
  });
  it('reward persistence: a Ticket-funded grant survives a reload exactly like a Gem-funded one', () => {
    setTickets(5);
    const r = performSummon('single', 'royal-vanguard', 4242, 'tickets');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cardId = r.pulls[0].cardId;
    const ownedBefore = getOwnedCount(cardId);
    reloadCollection();
    reloadEconomy();
    expect(getOwnedCount(cardId)).toBe(ownedBefore);
    expect(getTickets()).toBe(5 - SUMMON_CONFIG.ticketCost.single);
  });
});

describe('acquisition sources', () => {
  it('every summonable card lists its banner(s); nothing became unobtainable', () => {
    for (const p of SUMMON_POOLS) for (const e of p.entries) expect(getCardAcquisitionSources(e.cardId).some((s) => s.kind === 'summon' && s.bannerId === p.id)).toBe(true);
    expect(getUnavailableCards()).toEqual([]);
    for (const p of SUMMON_POOLS) for (const e of p.entries) expect(PLAYTEST_ROSTER).toContain(e.cardId);
  });
  it('reads as data-driven, banner-specific lines', () => {
    const boneStage = CHAPTER_1.nodes.find((n) => n.encounter?.firstClearReward.cardId === 'und-bone-soldier')!.name;
    expect(acquisitionSummary('und-bone-soldier')).toBe(`Campaign · ${boneStage} / Summon · Gravebound`);
    expect(acquisitionSummary('inf-hellhound')).toBe('Summon · Infernal Hunt / Future region');
    expect(acquisitionSummary('kng-paladin')).toBe('Starter collection / Summon · Royal Vanguard');
    expect(acquisitionSummary('und-vharos')).toMatch(/^Campaign · .* \/ Summon · Gravebound$/);
    expect(acquisitionSummary('und-mira')).toMatch(/^Campaign exclusive · /);
    expect(primaryAcquisitionLabel('inf-hellhound')).toBe('Summon · Infernal Hunt');
  });
});

describe('UI logic', () => {
  it('disables both actions when the balance is short, with an exact message', () => {
    const [single, ten] = summonOptions(60, vanguard);
    expect(single).toMatchObject({ cost: 100, affordable: false, shortfall: 40 });
    expect(ten).toMatchObject({ cost: 900, affordable: false, shortfall: 840 });
    expect(affordabilityNote(60, vanguard)).toBe('Need 100 Gems · You have 60');
  });
  it('enables single at 100 but not 10x until 900', () => {
    expect(summonOptions(100, vanguard).map((o) => o.affordable)).toEqual([true, false]);
    expect(summonOptions(900, vanguard).map((o) => o.affordable)).toEqual([true, true]);
    expect(affordabilityNote(100, vanguard)).toBeNull();
  });
  it('pity display counts from the counter', () => {
    expect(pityDisplay(17)).toMatchObject({ current: 17, threshold: 40, remaining: 23, label: '23 summons until a guaranteed Legendary' });
    expect(pityDisplay(39)).toMatchObject({ remaining: 1, label: 'Your next summon is a guaranteed Legendary' });
    expect(pityDisplay(999).current).toBe(39);
  });
});

describe('dev preview outcomes', () => {
  it('build every scenario without touching state', () => {
    setGems(123);
    const before = JSON.stringify(getEconomy());
    for (const b of SUMMON_BANNERS)
      for (const s of PREVIEW_SCENARIOS) {
        const o = buildPreviewOutcome(b.id, s.id);
        expect(o.pulls.length).toBe(s.id.startsWith('ten-') ? 10 : 1);
        for (const p of o.pulls) expect(getCard(p.cardId)).toBeDefined();
      }
    expect(JSON.stringify(getEconomy())).toBe(before);
    expect(buildPreviewOutcome('gravebound', 'featured-legendary').pulls[0]).toMatchObject({ cardId: 'und-vharos', featured: 'main', rarity: 'legendary' });
    expect(buildPreviewOutcome('royal-vanguard', 'ten-legendary').highestRarity).toBe('legendary');
  });
});
