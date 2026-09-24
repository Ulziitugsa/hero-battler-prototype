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
  | 'hero_star_changed'
  | 'roster_power_changed'
  | 'duplicate_acquired'
  | 'duplicate_progress_applied'
  // Campaign - Phase 9 additions alongside the Phase 3 names above (see
  // docs/COMMERCIAL-PROTOTYPE-PLAN.md Phase 9 for why both exist rather than a rename)
  | 'campaign_power_wall_encountered'
  | 'campaign_retry_after_power_wall'
  // Summon
  | 'summon_opened'
  | 'summon_performed'
  | 'summon_ticket_used'
  | 'legendary_pulled'
  // Idle rewards
  | 'idle_reward_available'
  | 'idle_reward_claimed'
  // Missions - period-specific names alongside the Phase 5 generic ones
  | 'mission_progressed'
  | 'mission_completed'
  | 'mission_claimed'
  | 'daily_mission_progress'
  | 'daily_mission_completed'
  | 'daily_set_completed'
  | 'weekly_mission_progress'
  | 'weekly_mission_completed'
  // 7-day journey
  | 'journey_day_claimed'
  | 'journey_reward_claimed'
  | 'journey_completed'
  | 'journey_dropped_off'
  // Monetisation (Phase 10 - simulated/test purchases only, see game/offers/)
  | 'offer_seen'
  | 'offer_clicked'
  | 'purchase_started'
  | 'purchase_completed'
  | 'purchase_cancelled';

/** A plain, JSON-serialisable properties bag - deliberately not typed per event (see file header). */
export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;
