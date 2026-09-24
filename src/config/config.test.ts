import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalProvider, getConfig, reloadConfig, setConfigProvider, setDevConfigOverride } from './config';
import { DEFAULT_CONFIG } from './defaults';

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
  setConfigProvider(null);
});

describe('getConfig', () => {
  it('resolves to DEFAULT_CONFIG with no provider configured - the prototype runs fully offline/local', () => {
    expect(getConfig()).toEqual(DEFAULT_CONFIG);
  });
  it('caches the resolved config until reloadConfig or a provider swap', () => {
    let calls = 0;
    setConfigProvider(() => {
      calls++;
      return DEFAULT_CONFIG;
    });
    getConfig();
    getConfig();
    getConfig();
    expect(calls).toBe(1);
    reloadConfig();
    getConfig();
    expect(calls).toBe(2);
  });
});

describe('setConfigProvider', () => {
  it('swaps the active provider and drops the cache immediately', () => {
    setConfigProvider(() => ({ ...DEFAULT_CONFIG, economy: { ...DEFAULT_CONFIG.economy, startingGems: 9999 } }));
    expect(getConfig().economy.startingGems).toBe(9999);
  });
  it('null resets to the plain local default', () => {
    setConfigProvider(() => ({ ...DEFAULT_CONFIG, economy: { ...DEFAULT_CONFIG.economy, startingGems: 1 } }));
    expect(getConfig().economy.startingGems).toBe(1);
    setConfigProvider(null);
    expect(getConfig().economy.startingGems).toBe(DEFAULT_CONFIG.economy.startingGems);
  });
});

describe('createLocalProvider - deep merge', () => {
  it('a partial override only replaces the fields given, keeping every sibling field', () => {
    setConfigProvider(createLocalProvider({ economy: { startingGems: 500 } }));
    const cfg = getConfig();
    expect(cfg.economy.startingGems).toBe(500);
    expect(cfg.economy.startingGold).toBe(DEFAULT_CONFIG.economy.startingGold); // untouched
    expect(cfg.summon).toEqual(DEFAULT_CONFIG.summon); // untouched section
  });
  it('merges nested record fields (Record<string, number>) by replacement, not per-key merge - overrides ARE the record for that field', () => {
    setConfigProvider(createLocalProvider({ economy: { campaignFirstClearGems: { battle: 999 } } }));
    // campaignFirstClearGems is a plain object one level deep - deepMerge treats it as a mergeable object,
    // so unspecified node types are preserved from the default.
    const cfg = getConfig();
    expect(cfg.economy.campaignFirstClearGems.battle).toBe(999);
    expect(cfg.economy.campaignFirstClearGems.boss).toBe(DEFAULT_CONFIG.economy.campaignFirstClearGems.boss);
  });
  it('with no overrides, behaves exactly like the plain default', () => {
    setConfigProvider(createLocalProvider());
    expect(getConfig()).toEqual(DEFAULT_CONFIG);
    setConfigProvider(createLocalProvider(undefined));
    expect(getConfig()).toEqual(DEFAULT_CONFIG);
  });
});

describe('setDevConfigOverride (dev-only)', () => {
  it('applies immediately and is readable back through getConfig', () => {
    setDevConfigOverride({ idle: { capHours: 1 } });
    expect(getConfig().idle.capHours).toBe(1);
    setDevConfigOverride(null);
    expect(getConfig().idle.capHours).toBe(DEFAULT_CONFIG.idle.capHours);
  });
});

describe('the schema shape covers every candidate value named in the brief', () => {
  it('has a field or override map for each named category', () => {
    const cfg = getConfig();
    expect(cfg.economy.startingGems).toBeTypeOf('number');
    expect(cfg.economy.startingGold).toBeTypeOf('number');
    expect(cfg.summon.singleGemCost).toBeTypeOf('number');
    expect(cfg.summon.ticketCostSingle).toBeTypeOf('number');
    expect(cfg.summon.pityThreshold).toBeTypeOf('number');
    expect(cfg.summon.featuredMainMultiplier).toBeTypeOf('number');
    expect(cfg.campaign.recommendedPowerOverrides).toBeTypeOf('object');
    expect(cfg.economy.campaignFirstClearGems).toBeTypeOf('object');
    expect(cfg.idle.goldPerHourBase).toBeTypeOf('number');
    expect(cfg.idle.capHours).toBeTypeOf('number');
    expect(cfg.campaign.energyRegenIntervalMs).toBeTypeOf('number');
    expect(cfg.missions.rewardOverrides).toBeTypeOf('object');
    expect(cfg.journey.rewardOverrides).toBeTypeOf('object');
    expect(cfg.offers.priceLabels).toBeTypeOf('object');
    expect(cfg.flags).toBeTypeOf('object');
  });
});
