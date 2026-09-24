// The full analytics vocabulary, in one place, so a new commercial system never invents its own event
// name inline. Property shapes are intentionally loose (a plain string/number/boolean bag) rather than a
// fully-typed-per-event schema - the goal of Phase 0 is "nothing ships uninstrumented", not a bespoke
// analytics backend. track() (./track.ts) merges common context onto every event automatically.

export type AnalyticsEventName =
  // Session
  | 'session_started'
  | 'session_ended'
  // Tutorial / first run
  | 'tutorial_started'
  | 'tutorial_completed'
  // Campaign
  | 'campaign_node_started'
  | 'campaign_won'
  | 'campaign_lost'
  | 'campaign_loss_at_power_deficit'
  | 'campaign_upgrade_after_loss'
  | 'campaign_return_win'
  // Hero / duplicate progression
  | 'hero_levelled'
  | 'hero_ascended'
  | 'duplicate_acquired'
  | 'duplicate_progress_applied'
  // Summon
  | 'summon_opened'
  | 'summon_performed'
  | 'legendary_pulled'
  // Idle rewards
  | 'idle_reward_available'
  | 'idle_reward_claimed'
  // Missions
  | 'mission_progressed'
  | 'mission_completed'
  | 'mission_claimed'
  // 7-day journey
  | 'journey_day_claimed'
  | 'journey_completed'
  | 'journey_dropped_off'
  // Monetisation (wired later - Phase 12+; the names exist now so nothing is invented ad hoc then)
  | 'offer_seen'
  | 'offer_clicked'
  | 'purchase_started'
  | 'purchase_completed';

/** A plain, JSON-serialisable properties bag - deliberately not typed per event (see file header). */
export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;
