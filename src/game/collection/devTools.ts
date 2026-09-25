import { grantCard, removeCard, resetCollection, setAllOwned, getCollection } from './collection';
import { getStarterDeckUnlockProgress, starterDeckId } from './starterUnlock';
import { getCardAcquisitionSources, getUnavailableCards } from './acquisition';
import { PLAYTEST_ROSTER } from '../cards/roster';
import type { StarterFaction } from '../cards/starterDecks';
import { getAccount, grantXp, resetProgression, setLevel, setMasteryRank, unlockMastery } from '../progression/account';
import type { MasteryId } from '../mastery/definitions';
import { ascendCard, getAscensionStatus } from '../ascension/ascend';
import { CARD_ASCENSIONS } from '../ascension/definitions';
import { getAscensionState, resetAscension, setAscensionRank } from '../ascension/store';
import { getEconomy, grantGems, grantGold, grantTickets, isUnlimitedGems, resetEconomy, resetSummonState, setGems, setGold, setPity, setTickets, setUnlimitedGems } from '../economy/economy';
import { performSummon } from '../summon/summon';
import { SUMMON_BANNERS } from '../summon/banners';
import { forceNextRarity } from '../summon/devControls';
import type { Rarity } from '../types';
import { getHeroLevelStatus, levelUpHero } from '../heroLevel/levelUp';
import { getHeroLevelState, resetHeroLevels, setHeroLevel } from '../heroLevel/store';
import { rosterPowerForDeck } from '../heroLevel/rosterPower';
import { claimIdleReward, loadIdleReward, resetIdleRewards } from '../campaign/idleRewards';
import { claimMission, getMissionsState, resetMissions, setMissionProgress } from '../missions/store';
import { claimJourneyDay, getJourneyState, resetJourney } from '../journey/store';
import { getConfig, reloadConfig, setDevConfigOverride } from '../../config/config';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';
import { cancelPurchase, getPurchaseState, resetPurchases, simulatePurchase } from '../offers/store';
import { OFFERS, type OfferId } from '../offers/definitions';
import { resetEverything } from '../devReset';

// DEV ONLY - attached to window.skyloomDev by main.tsx behind import.meta.env.DEV, so it never ships.
// e.g. skyloomDev.grant('und-mira'), skyloomDev.setAllOwned(), skyloomDev.reset().
export const devTools = {
  grant: (cardId: string, count = 1) => grantCard(cardId, count),
  remove: (cardId: string, count = 1) => removeCard(cardId, count),
  setAllOwned: (copies = 2) => setAllOwned(copies),
  reset: () => resetCollection(),
  get: () => getCollection(),
  // ---- Ascension ----
  grantCopies: (cardId: string, count = 1) => grantCard(cardId, count),
  setAscensionRank: (cardId: string, rank: number) => setAscensionRank(cardId, rank),
  resetAscension: () => resetAscension(),
  ascend: (cardId: string) => ascendCard(cardId),
  ascensionReport: () => ({ state: getAscensionState(), cards: Object.fromEntries(CARD_ASCENSIONS.map((c) => [c.cardId, getAscensionStatus(c.cardId)])) }),
  // ---- Account progression ----
  account: () => getAccount(),
  addXp: (amount: number) => grantXp(amount),
  setLevel: (level: number) => setLevel(level),
  unlockMastery: (id: MasteryId, rank = 1) => unlockMastery(id, rank),
  setMasteryRank: (id: MasteryId, rank: number) => setMasteryRank(id, rank),
  resetProgression: () => resetProgression(),
  // ---- Economy / Summon ----
  economy: () => getEconomy(),
  addGems: (amount: number) => grantGems(amount, 'dev'),
  setGems: (amount: number) => setGems(amount),
  addGold: (amount: number) => grantGold(amount, 'dev'),
  setGold: (amount: number) => setGold(amount),
  addTickets: (amount: number) => grantTickets(amount, 'dev'),
  setTickets: (amount: number) => setTickets(amount),
  // ---- Hero Level / Roster Power ----
  heroLevel: (cardId: string) => getHeroLevelStatus(cardId),
  setHeroLevel: (cardId: string, level: number) => setHeroLevel(cardId, level),
  levelUpHero: (cardId: string) => levelUpHero(cardId),
  resetHeroLevels: () => resetHeroLevels(),
  rosterPower: (cardIds: string[], accountLevel: number) => rosterPowerForDeck(cardIds, accountLevel, getHeroLevelState(), getAscensionState()),
  // ---- Idle rewards ----
  idleReward: () => loadIdleReward(),
  claimIdle: () => claimIdleReward(),
  resetIdle: () => resetIdleRewards(),
  // ---- Missions ----
  missions: () => getMissionsState(),
  setMissionProgress: (id: string, count: number) => setMissionProgress(id, count),
  claimMission: (id: string) => claimMission(id),
  resetMissions: () => resetMissions(),
  // ---- 7-day journey ----
  journey: () => getJourneyState(),
  claimJourneyDay: (day: number) => claimJourneyDay(day),
  resetJourney: () => resetJourney(),
  // ---- Remote config (Commercial Prototype Phase 8) ----
  config: () => getConfig(),
  /** Partial, deep-merged onto the defaults, persisted across reloads. skyloomDev.setConfigOverride(null) resets. */
  setConfigOverride: (overrides: Parameters<typeof setDevConfigOverride>[0]) => {
    setDevConfigOverride(overrides);
    return getConfig();
  },
  reloadConfig: () => reloadConfig(),
  // ---- Analytics debug (Commercial Prototype Phase 9) ----
  /** Every event track()'d so far this session (capped at 500 - see analytics/track.ts). */
  analyticsEvents: () => getQueuedEvents(),
  /** Just the names, most recent last - a quick skim without the full property bags. */
  analyticsEventNames: () => getQueuedEvents().map((e) => e.name),
  clearAnalyticsEvents: () => clearQueuedEvents(),
  // ---- Offers (Commercial Prototype Phase 10 - simulated purchases only, never real money) ----
  offers: () => OFFERS.map((o) => o.id),
  purchases: () => getPurchaseState(),
  /** Simulates a full offer->purchase_started->purchase_completed flow, exactly what the UI's confirm button does. TEST ONLY. */
  simulatePurchase: (offerId: OfferId) => simulatePurchase(offerId),
  simulateCancelledPurchase: (offerId: OfferId) => cancelPurchase(offerId),
  resetPurchases: () => resetPurchases(),
  // ---- Full reset (Commercial Prototype Phase 11) ----
  /** Every piece of local state, back to a fresh install. Does NOT reload the page itself (the UI's Profile button does that) - a console call can inspect the result immediately. */
  resetEverything: () => resetEverything(),
  banners: () => SUMMON_BANNERS.map((b) => b.id),
  /** Pity is per banner: skyloomDev.setPity('gravebound', 39). */
  setPity: (bannerId: string, count: number) => setPity(bannerId, count),
  /** Real summons (spend Gems unless Unlimited Gems is on). Pass a seed for a reproducible pull. */
  summonOnce: (bannerId = SUMMON_BANNERS[0].id, seed?: number) => performSummon('single', bannerId, seed),
  summonTen: (bannerId = SUMMON_BANNERS[0].id, seed?: number) => performSummon('ten', bannerId, seed),
  /** Same, paid with Tickets instead of Gems - shares the same pity/history (see economy/economy.ts's commitSummon). */
  summonOnceWithTickets: (bannerId = SUMMON_BANNERS[0].id, seed?: number) => performSummon('single', bannerId, seed, 'tickets'),
  summonTenWithTickets: (bannerId = SUMMON_BANNERS[0].id, seed?: number) => performSummon('ten', bannerId, seed, 'tickets'),
  /** Dev only: summons are free while on (production builds ignore this). */
  setUnlimitedGems: (on: boolean) => setUnlimitedGems(on),
  unlimitedGems: () => isUnlimitedGems(),
  /** Dev only: the NEXT summon's rarity is replaced (a single, or slot 6 of a 10x) - then it clears itself. */
  forceNextRarity: (rarity: Rarity | null) => forceNextRarity(rarity),
  resetSummon: () => resetSummonState(),
  resetEconomy: () => resetEconomy(),
  /** Grants exactly the missing copies a starter deck needs (e.g. 'undead'), unlocking it. */
  grantStarterRequirements: (faction: StarterFaction) => {
    for (const r of getStarterDeckUnlockProgress(starterDeckId(faction))?.requirements ?? []) if (!r.met) grantCard(r.cardId, r.need - r.have);
  },
  starterProgress: (faction: StarterFaction) => getStarterDeckUnlockProgress(starterDeckId(faction)),
  /** Every roster card with its acquisition sources; unavailable lists cards with no path at all. */
  acquisitionReport: () => ({ sources: Object.fromEntries(PLAYTEST_ROSTER.map((id) => [id, getCardAcquisitionSources(id)])), unavailable: getUnavailableCards() }),
};
