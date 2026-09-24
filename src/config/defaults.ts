import type { GameConfig } from './schema.js';

// The hardcoded default config (Commercial Prototype Phase 8) - every value here equals exactly what was
// already live in the codebase before this phase (economy/config.ts, summon/config.ts, heroLevel/config.ts,
// campaign/energy.ts, campaign/idleRewards.ts). This is what a LocalConfigProvider returns with no
// override applied, so the game runs identically offline with zero remote config wired - see config/config.ts.

export const DEFAULT_CONFIG: GameConfig = {
  economy: {
    startingGems: 100,
    maxGems: 999_999,
    startingGold: 0,
    maxGold: 99_999_999,
    startingTickets: 0,
    maxTickets: 9_999,
    campaignFirstClearGems: { battle: 20, challenge: 30, elite: 40, boss: 60, story: 0, reward: 0 },
    chapterCompleteGems: 100,
    levelMilestoneGems: { 5: 100, 10: 100, 15: 100, 20: 150 },
    campaignWinGold: { battle: 30, challenge: 40, elite: 55, boss: 90, story: 0, reward: 0 },
    quickBattleWinGold: 20,
    quickBattleDrawGold: 8,
  },
  summon: {
    singleGemCost: 100,
    tenGemCost: 900,
    ticketCostSingle: 1,
    ticketCostTen: 10,
    pityThreshold: 40,
    rarityRates: { common: 69, rare: 22, epic: 8, legendary: 1 },
    heroWeight: 2,
    spellWeight: 1,
    featuredMainMultiplier: 3,
    featuredSecondaryMultiplier: 2,
  },
  heroLevel: {
    maxHeroLevel: 60,
    accountLevelCapMultiplier: 3,
    levelUpCostBase: 20,
    levelUpCostPerLevel: 12,
  },
  campaign: {
    energyMax: 60,
    energyStarting: 42,
    energyRegenIntervalMs: 5 * 60 * 1000,
    energyRegenAmount: 1,
    nodeEnergyCostByType: { battle: 5, elite: 7, boss: 10, challenge: 5, story: 0, reward: 0 },
    recommendedPowerOverrides: {},
  },
  idle: {
    capHours: 12,
    goldPerHourBase: 20,
    goldPerHourPerNode: 15,
  },
  missions: {
    rewardOverrides: {},
  },
  journey: {
    rewardOverrides: {},
  },
  offers: {
    priceLabels: {
      'starter-pack': '$1.99',
      'growth-pack': '$4.99',
      'gem-pack-small': '$0.99',
      'gem-pack-medium': '$4.99',
      'gem-pack-large': '$9.99',
      'season-pass-preview': 'Coming soon',
    },
  },
  flags: {
    alwaysShowTicketToggle: false,
    offersEnabled: true,
  },
};
