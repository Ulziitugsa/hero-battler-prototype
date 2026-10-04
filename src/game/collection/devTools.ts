import { grantCard, removeCard, resetCollection, setAllOwned, getCollection } from './collection';
import { getStarterDeckUnlockProgress, starterDeckId } from './starterUnlock';
import { getCardAcquisitionSources, getUnavailableCards } from './acquisition';
import { PLAYTEST_ROSTER } from '../cards/roster';
import type { StarterFaction } from '../cards/starterDecks';
import { getAccount, grantXp, resetProgression, setLevel, setMasteryRank, unlockMastery } from '../progression/account';
import type { MasteryId } from '../mastery/definitions';
import { ascendCard } from '../ascension/ascend';
import { historicalMastery } from '../cardMastery/model';
import { getAscensionState, resetAscension, setAscensionRank } from '../ascension/store';
import { getEconomy, grantGems, grantGold, grantTickets, isUnlimitedGems, resetEconomy, setGems, setGold, setTickets, setUnlimitedGems } from '../economy/economy';
import { buyBoxPacks } from '../box/boxProduct';
import { resetHeroLevels, setHeroLevel } from '../heroLevel/store';
import { resetSaveMigrations, runSaveMigrations } from '../save/migrations';
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
  // ---- Historical Ascension / Mastery (save data only: no combat effect; advancing is retired and always refuses) ----
  grantCopies: (cardId: string, count = 1) => grantCard(cardId, count),
  setAscensionRank: (cardId: string, rank: number) => setAscensionRank(cardId, rank),
  resetAscension: () => resetAscension(),
  ascend: (cardId: string) => ascendCard(cardId),
  ascensionReport: () => ({ state: getAscensionState(), cards: Object.fromEntries(Object.keys(getAscensionState().cards).map((id) => [id, historicalMastery(id)])) }),
  // ---- Account progression ----
  account: () => getAccount(),
  addXp: (amount: number) => grantXp(amount),
  setLevel: (level: number) => setLevel(level),
  unlockMastery: (id: MasteryId, rank = 1) => unlockMastery(id, rank),
  setMasteryRank: (id: MasteryId, rank: number) => setMasteryRank(id, rank),
  resetProgression: () => resetProgression(),
  // ---- Economy / packs ----
  economy: () => getEconomy(),
  addGems: (amount: number) => grantGems(amount, 'dev'),
  setGems: (amount: number) => setGems(amount),
  addGold: (amount: number) => grantGold(amount, 'dev'),
  setGold: (amount: number) => setGold(amount),
  addTickets: (amount: number) => grantTickets(amount, 'dev'),
  setTickets: (amount: number) => setTickets(amount),
  // ---- Legacy Hero Level (save data only: no effect anywhere; refunded once by save/migrations.ts) ----
  setHeroLevel: (cardId: string, level: number) => setHeroLevel(cardId, level),
  resetHeroLevels: () => resetHeroLevels(),
  // ---- Save migration ----
  runSaveMigrations: () => runSaveMigrations(),
  resetSaveMigrations: () => resetSaveMigrations(),
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
  /** Real pack openings from the Moonfall Box (spend Gems, or Pack Tickets, unless Unlimited Gems is on). */
  openPack: () => buyBoxPacks(1),
  openTenPacks: () => buyBoxPacks(10),
  openPackWithTicket: () => buyBoxPacks(1, undefined, 'tickets'),
  /** Dev only: Gems and Pack Tickets are not spent while on (production builds ignore this). */
  setUnlimitedGems: (on: boolean) => setUnlimitedGems(on),
  unlimitedGems: () => isUnlimitedGems(),
  resetEconomy: () => resetEconomy(),
  /** Grants exactly the missing copies a starter deck needs (e.g. 'undead'), unlocking it. */
  grantStarterRequirements: (faction: StarterFaction) => {
    for (const r of getStarterDeckUnlockProgress(starterDeckId(faction))?.requirements ?? []) if (!r.met) grantCard(r.cardId, r.need - r.have);
  },
  starterProgress: (faction: StarterFaction) => getStarterDeckUnlockProgress(starterDeckId(faction)),
  /** Every roster card with its acquisition sources; unavailable lists cards with no path at all. */
  acquisitionReport: () => ({ sources: Object.fromEntries(PLAYTEST_ROSTER.map((id) => [id, getCardAcquisitionSources(id)])), unavailable: getUnavailableCards() }),
};
