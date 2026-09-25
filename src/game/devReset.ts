// The single "start from a genuinely clean state" orchestrator (Commercial Prototype Phase 11). Every
// individual store already had its own reset*()/clear*() helper (collection, economy, progression,
// heroLevel, ascension, missions, journey, idle rewards, purchases) from earlier phases; Campaign
// progress, saved decks, preferences, local match history, Lanterns story progress and the
// first-seen-at timestamp did not, because nothing had needed a full reset before now, so this phase
// added one to each (a small, matching-convention addition per file, not a rewrite). This file is the
// only place that calls every one of them in one deliberate order, so a tester (or a developer) never has
// to remember - or discover the hard way - which dozen keys make up "the save."

import { resetCollection } from './collection/collection';
import { resetEconomy } from './economy/economy';
import { resetProgression } from './progression/account';
import { resetHeroLevels } from './heroLevel/store';
import { resetAscension } from './ascension/store';
import { resetMissions } from './missions/store';
import { resetJourney } from './journey/store';
import { resetIdleRewards } from './campaign/idleRewards';
import { resetPurchases } from './offers/store';
import { resetCampaignProgress } from './campaign/progress';
import { resetSavedDecks } from './engine/localDecks';
import { resetPreferences } from './engine/preferences';
import { resetMatchHistory } from './engine/localMatchHistory';
import { resetLanternProgress } from './story/lanterns';
import { resetFirstSeenAt } from '../analytics/context';
import { clearQueuedEvents, track } from '../analytics/track';

/**
 * Resets every piece of local player state back to a fresh install - collection (back to the starter
 * Kingdom deck), economy (Gold/Gems/Tickets/pity/history), account level/Mastery, Hero Level, Ascension,
 * missions, the 7-day journey, idle-reward timestamps, simulated purchases, Campaign progress, saved
 * decks, preferences, match history, Lanterns story progress, and the first-seen-at timestamp the
 * journey/analytics both anchor to. Order matters only in that collection/economy/progression are reset
 * first (nothing downstream depends on old values from them surviving).
 *
 * This is what `skyloomDev.resetEverything()` and Profile's "Reset Progress (Playtest)" button both call -
 * the exact same function, so there is only one definition of "clean" to keep correct.
 */
export function resetEverything(): void {
  resetCollection();
  resetEconomy();
  resetProgression();
  resetHeroLevels();
  resetAscension();
  resetMissions();
  resetJourney();
  resetIdleRewards();
  resetPurchases();
  resetCampaignProgress();
  resetSavedDecks();
  resetPreferences();
  resetMatchHistory();
  resetLanternProgress();
  resetFirstSeenAt();
  clearQueuedEvents();
  track('session_started', { reset: true });
}
