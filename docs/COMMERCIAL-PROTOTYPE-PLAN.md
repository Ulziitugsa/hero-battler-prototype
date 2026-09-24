# Embervale commercial prototype — living implementation plan

Source: `Embervale_Commercial_Prototype_Implementation_Plan.docx` (24 September 2026), reconciled here
with [PRODUCTION-PLAN.md](PRODUCTION-PLAN.md). This file is the one that gets updated as phases land —
the docx is the frozen brief; this is the record of what actually happened.

**Reconciliation with PRODUCTION-PLAN.md**: that document's ordered backlog (visual slice → first hour →
account foundation → friendly battles → PvP season → live ops → commercial release) is not superseded —
it is a longer-horizon, partly-visual roadmap. This plan is the commercial/retention/economy workstream
that runs concurrently with, and mostly *before*, PRODUCTION-PLAN.md's items 3–7. Nothing here touches
Friendly Battle, visual direction, or the core combat rules — those stay exactly as PRODUCTION-PLAN.md
and `docs/game/CORE-RULES.md` describe them. Where the two plans reference the same underlying system
(e.g. server authority, analytics), this plan is the more detailed, more current source.

## 1. Purpose

Turn the existing Embervale prototype into a small, measurable mobile F2P commercial prototype without
rebuilding the core game. Not a production-ready live-service title — a version that can tell us whether
progression, collection and return loops create real retention and eventual willingness to spend.

Preserve: portrait-first 3-lane hero/card combat; choose a card, choose a lane, press Fight; deterministic
simultaneous resolution; placement matters; the Fight reveal remains the memorable interaction.

## 2. Repository baseline (confirmed by audit, 2026-09-24)

See the audit summary carried over from the planning conversation — unchanged from the docx's Section 2.
Headline: combat engine, cards, collection, summon and the Friendly Battle backend are mature; Campaign has
one authored region of nine; hero-level progression, idle rewards, missions, onboarding, analytics and
remote config do not exist yet; everything except Friendly Battle is client/localStorage-owned.

## 3. Decisions that change the previous roadmap

- Analytics becomes Phase 0 — a thin `track()` abstraction ships before any new commercial system.
- Ascension is **not** completed for all 52 cards yet — 6 authored paths is enough to validate the loop.
- No RPG levels applied directly to the 3–7 card Power scale — Roster Power (UI/gating) is kept separate
  from Battle Power (what the lane engine compares), and any Battle Power contribution from Level is
  small and hard-capped.
- The duplicate economy is resolved (Section 6) **before** Stars is implemented, not after.
- Target economy: Gold + Gems + Summon Tickets. Duplicate card copies remain a resource, not a currency.
- Server authority, when it lands, extends the existing Supabase/Vercel Friendly Battle stack rather than
  introducing a second backend.
- No guild wars, chat, trading, equipment treadmill, VIP ladder or big event framework before retention
  data justifies them.

## 4. Commercial product model

Embervale is a hero-collector RPG whose combat system is a 3-lane tactical card battler, not merely a
competitive CCG. Primary loop: Campaign → rewards → strengthen roster → overcome harder encounters →
summon/add heroes → strengthen roster → repeat. PvP supplies mastery, prestige and social competition;
PvE progression carries more of the monetisation burden.

## 5. Power model

**Roster Power** — a large, satisfying UI/gating number. Incorporates Hero Level, Stars/Ascension,
Mastery and account progression. Never read by the battle engine.

**Battle Power** — the real 3–7 number `resolveRound()` compares. Any Level/Star contribution is small,
hard-capped, and unit-tested to stay subordinate to card identity and placement.

Formula chosen in Phase 1 (see that section below) — first proposal, deliberately tunable via config, not
a final balance claim.

## 6. Duplicate progression decision gate

**Status: resolved in Phase 2.** Decision and reasoning are recorded in [Section: Phase 2](#phase-2--duplicate-progression-decision--implementation-status-done) below, not here, so the reasoning sits next to what was actually built.

## 7. Claude operating instructions

Followed as written in the brief: repository as source of truth, sequential phases with no
confirmation stops between them, existing visual direction and interaction model preserved, tests kept
green with focused new coverage, pure-module + persistence-adapter pattern matched to the existing
codebase, one reviewable commit per phase, no real-money IAP before server economy authority exists.

## 8. Phase log

Status legend: ⬜ not started · 🟨 in progress · ✅ done

### Phase 0 — Analytics abstraction — Status: ✅ done

- `src/analytics/events.ts` — typed event name + property union covering the schema requested in the
  original repo audit (session/tutorial/campaign/summon/hero/idle/mission/journey/offer/purchase).
- `src/analytics/track.ts` — `track(event)` queues in-memory, logs via `console.debug` in dev, no-ops in
  production until a real provider is wired (Phase 10). `context()` merges common properties (account
  level, roster power, days since first launch, Gem/Gold balances) automatically.
- `src/analytics/context.ts` — reads account/economy/roster-power/first-launch state; never throws.
- Instrumented: `session_started` (main.tsx), `campaign_node_started` / `campaign_won` / `campaign_lost`
  (progress.ts), `summon_opened` / `summon_performed` / `legendary_pulled` (summon.ts + SummonPage).
- Tests: `src/analytics/track.test.ts`.
- Deviation: none.

### Phase 1 — Hero Level + Roster Power — Status: ✅ done

- Gold added to the economy (`economy/types.ts` v3, `economy/config.ts` GOLD_REWARDS, `economy/economy.ts`
  grantGold/spendGold), sourced from Campaign wins (all clears, not just first) and Quick Battle wins.
- New `src/game/heroLevel/` module: per-card Level (1→60), Gold-funded, single-step level-up (mirrors
  Ascension's confirm-and-spend UX). Level cap = `min(60, accountLevel * 3)` — Level 1 account can only
  raise a hero to Level 3, Level 20 (max) account can reach Level 60.
- Battle Power contribution: `battlePowerBonusForLevel(level)` = 0 below Level 30, **+1** from Level 30,
  **+2** (max) from Level 60. Deviation from the first draft of this plan, which proposed a +3 cap at
  three breakpoints (20/40/60): the live roster's Power range turned out to be exactly 3–7 (verified by
  reading every card definition, not assumed), with cards like `kng-archmage-vael` (Legendary, Power 4)
  sitting *below* several Commons by design (`docs/game/CARD-SYSTEM.md`: "Rarity is a design lens, not a
  Power tier"). A +3 swing against that range was too large to defend as "subordinate to card identity";
  +2 keeps the invariant provable — the weakest Common in the roster, fully levelled, still loses to the
  strongest Legendary at base (see `heroLevel.test.ts`'s engine-safety cases, which compute this from the
  real roster rather than asserting it by name). Engine-safe: added at `HeroInstance` construction,
  threaded through `GameState.heroLevels` exactly like `GameState.ascensions` (optional, per-side,
  per-card), flipped in `perspective.ts`, and — like `ascensions`/`masteries` — never sent to Friendly
  Battle's `createMatch` (`api/create-match.ts` is unchanged), preserving "Friendly duels enforce base
  strength."
- Roster Power (first proposal, tunable): `card.power * 10 + level * 5 + ascensionRank * 40 + accountLevel * 2`,
  summed per hero for a deck/roster total. Documented as provisional in `heroLevel/config.ts`.
- UI: `HeroLevelPanel` in Heroes → hero detail sheet (mirrors `AscensionPanel`); Gold balance next to Gems
  on Home/Profile.
- Tests: `heroLevel/heroLevel.test.ts` (curve, cap, cost, engine-safety of the Battle Power bonus),
  `engine` tests asserting a max-level Common still loses to a base-level Legendary in the worst case the
  design allows.
- Deviation: the docx left "Hero XP-item currency" open; Gold-only was sufficient, so no XP item was
  added, per the docx's own "unless implementation proves Gold-only is inadequate."

### Phase 2 — Duplicate progression decision + implementation — Status: ✅ done

**Decision gate.** Compared against the current collection + Ascension code (`ascension/store.ts`,
`ascension/ascend.ts`, `collection/collection.ts`):

| Option | Verdict |
|---|---|
| A. Duplicates → Stars; Ascension uses another resource | Rejected — introduces a second duplicate-consuming sink competing with Ascension for the exact same scarce resource (a Legendary's spare copies), with no separate resource to arbitrate between them. Exactly the conflict the gate exists to avoid. |
| B. Duplicates → Ascension; Stars derived from Ascension milestones | **Chosen.** |
| C. Duplicates → hero-specific shards | Rejected for this prototype — adds a UI-visible resource per hero with no gameplay payoff over spending copies directly; the existing `AscensionStatus`/`deckDemand` machinery already protects decks from being broken by a spend, which a shard-conversion step would have to re-derive. Revisit only if a future trading/market system needs shards as a tradeable unit. |
| D. Collapse Stars + Ascension into one track | Rejected — loses the "cheap, frequent duplicate feedback" surface the brief explicitly wants (a 2nd copy of a hero you already own should do *something* immediately, not wait for a 1/2/3-copy Ascension threshold). |

**Model B, implemented as:** Stars are a **read-only presentation layer over the existing Ascension rank**,
not a second store, not a second spend. `starsForRank(rank, maxRank)` maps a card's current Ascension rank
(0–3, from the existing `ascension/store.ts`) onto a 0–5 star display: `stars = round((rank / maxRank) * 5)`
for cards with an Ascension path (giving 0/2/3/5 stars at ranks 0/1/2/3), and a lighter **duplicate-only**
star track for cards with **no** Ascension path yet (46 of 52 cards), so a duplicate is never worthless
just because that card hasn't had its Ascension content authored:
`starsForUnascendedCard(copiesOwned) = min(5, copiesOwned - 1)` (2nd copy = ★1 ... 6th copy = ★5), spending
no resource at all — it is a pure ownership readout, exactly like the existing `×N` copy badge already on
`HeroTile`, just re-expressed as stars for cards that will eventually get an Ascension path.

This resolves the gate's concern directly: there is exactly **one** duplicate sink in the whole game
(Ascension), and exactly **one** place duplicates go. Stars never spend anything a second time.

- `src/game/ascension/stars.ts` — `starsForCard(cardId, owned, ascensionState)` and `starsForNextRank`,
  pure, derived, no persistence of its own (nothing to migrate, nothing that can desync from Ascension).
- UI: a 5-star `StarStrip` (new, `pages/heroes/StarStrip.tsx`) on the Hero Detail sheet's owned line, and
  an "★ at Ascension N" caption on `AscensionPanel`'s next-rank preview so the two readouts visibly agree
  before the player spends anything. Deliberately **not** added to the grid tile (`HeroTile`) alongside
  the existing `×N`/Ascension-rank marks — three stacked badges per tile read as clutter; the detail sheet
  is where a player actually evaluates a card.
- Analytics: `duplicate_acquired` (Summon pulls only — the primary duplicate-generating flow),
  `duplicate_progress_applied` (fired from the existing `grantCard`/`ascendCard` call sites — no new
  spend path to instrument).
- Tests: `ascension/stars.test.ts`.
- Deviation: UI scope narrowed from "replaces/augments the badge on HeroTile/HeroDetail" (first draft) to
  HeroDetail only, for the clutter reason above. Options A/C/D were compared only on paper, not in code.

### Phase 3 — Campaign power curve — Status: ✅ done

- `CampaignEncounterDef.recommendedRosterPower?: number` added to `campaign/types.ts`; populated for the
  9 battle/challenge/elite/boss nodes in Chapter 1 (story/reward nodes have no encounter to compare
  against). Values are grounded in the real formula, not guessed: a diagnostic run of
  `rosterPowerForDeck` against the actual Kingdom starter deck showed pure-collection play (no deliberate
  Hero Level/Ascension spend) sits at 575-765 across the whole account Level 1-20 range. The boss is set
  to 800 - above that entire range, so the boss is provably a wall for collection alone at every account
  level, while a modest deliberate spend (a handful of Hero Levels, or the one free Ascension the
  Toll-of-the-Ford challenge already grants) clears it comfortably. Verified directly in
  `campaign/powerCurve.test.ts`, not asserted by feel.
- `rosterPowerForDeck(cardIds, accountLevel, ...)` (already built in Phase 1) is reused as-is.
- `StagePreviewSheet.tsx`: a neutral "Roster Power: current / recommended" row (no warning iconography,
  no red, same background whether under or at recommendation) - reads `recordBattleResult`'s reused
  `currentRosterPower()` logic via the same `rosterPowerForDeck` call.
- `campaign/progress.ts`: `CampaignProgress` gained `lastLossPower: Record<nodeId, number>` - the Roster
  Power recorded at the moment of a loss while under the node's recommendation, consumed (cleared,
  whether or not Power actually rose) on the next win on that node.
- Analytics: `campaign_node_started` (Phase 0, serves as the "attempt" event - no separate
  `campaign_attempt` was added), `campaign_loss_at_power_deficit` (fires only when the loss happened
  under the recommendation), `campaign_upgrade_after_loss` / `campaign_return_win` (fire together on a
  win that followed a recorded loss AND Roster Power genuinely increased since - a win on the same Power
  clears the flag but fires neither, since that was a strategy win, not a "the upgrade loop worked" win).
- Tests: `campaign/powerCurve.test.ts`.
- Deviation: the docx listed a bare `campaign_attempt` event name; reused the existing
  `campaign_node_started` (Phase 0) instead of adding a near-duplicate.

### Phase 4 — Idle / offline rewards — Status: ✅ done

- `src/game/campaign/idleRewards.ts` — copies `energy.ts`'s elapsed-time-since-timestamp pattern exactly
  (`lastClaimAt` → elapsed → rate → cap → claim), local-only per the brief.
- Reward: Gold only, at a rate tied to Campaign progress (`goldPerHour(clearedNodeCount)` =
  `IDLE_GOLD_PER_HOUR_BASE + cleared * IDLE_GOLD_PER_HOUR_PER_NODE`), capped at `IDLE_CAP_HOURS` (12h, a
  named config constant, not a magic number in the UI). Claiming always resets the clock, even at 0 Gold,
  so polling can't bank partial minutes.
- Home affordance: reused the existing "one contextual note" slot (`game/home/hubState.ts`'s
  `pickHubNote`) rather than adding new screen real estate - a meaningful idle reward (≥
  `IDLE_NOTE_MIN_GOLD`, 20) now outranks the Mastery-Point note, since it's the only one of the notes
  that actively decays (caps out and stalls) if ignored; Mastery Points don't expire. Tapping the note
  claims directly from Home. `useHubState` deliberately does NOT memoize the idle read to mount-time like
  Campaign/Energy - it recomputes every render and exposes `refreshIdle()`, so the note disappears the
  instant it's claimed without needing to leave and re-enter Home.
- Analytics: `idle_reward_available` (fired once per distinct available amount, not per render),
  `idle_reward_claimed` (only on a genuine >0 grant).
- Tests: `campaign/idleRewards.test.ts` (elapsed-time edge cases, cap, repeated-claim safety, clock skew,
  a backwards-moving clock never grants negative Gold).
- Deviation: none from the brief; the Home-integration choice (reuse the single-note slot vs. a new UI
  element) was an implementation decision made in favor of the brief's own "without cluttering the
  screen" instruction.

### Phase 5 — Daily + weekly missions — Status: ✅ done

- `src/game/missions/definitions.ts` — 5 daily + 3 weekly, each backed by an EXISTING analytics event
  name (Phases 0-4) as its metric: Campaign win, Hero Level-up, Summon, idle-reward claim, and duplicate
  progress applied (Ascension). `src/game/missions/store.ts` — persisted progress + deterministic
  day/week reset (epoch-based `Math.floor(now / DAY_MS)`, not calendar-aligned to Monday - a documented
  prototype simplification), same snapshot+listener+sanitize pattern as every other store in the repo.
- Progress is driven by the Phase 0 analytics stream, not bespoke counters: `analytics/track.ts` gained a
  second, internal-only subscription mechanism (`subscribeTrack`, separate from the single external
  `setAnalyticsProvider` slot) so missions can react to every `track()` call without competing for that
  slot. `initMissions()` subscribes once, called from `main.tsx` at startup, so progress accrues even if
  the player never opens the Missions sheet that session.
- UI: a compact `MissionsSheet` reachable from Home's footer (same "sheet, not a new nav tab" pattern as
  `GraveyardSheet`/`HelpModal`), with a small "•" marker when something is claimable.
- Analytics: `mission_progressed` (every advance), `mission_completed` (once, at target), `mission_claimed`.
- Tests: `missions/store.test.ts` (reset boundaries, no-double-claim, a claimed mission stops advancing,
  deterministic day/week keys, malformed-storage recovery).
- Deviation: the brief's example list included "use 3 spells" as a daily objective; spell plays have no
  analytics event yet (Phase 0 didn't instrument them - only session/campaign/summon/hero/idle flows were
  called "low-risk" to wire first). Substituted "advance a Hero with a duplicate"
  (`duplicate_progress_applied`, Phase 2) rather than adding a new instrumentation surface under Phase 5
  just to hit a specific example verb. Every mission is still backed by something that already fires.

### Phase 6 — Seven-day new player journey — Status: ✅ done

- `src/game/journey/definitions.ts` — 7 days, Day 7 a Legendary hero grant (`inf-infernal-lord`), none
  gated behind spend or ads. `src/game/journey/store.ts` — day index derived from elapsed real time
  against `analytics/context.ts`'s `getFirstSeenAt()` (the SAME first-launch timestamp Phase 0 already
  established, not a second install clock that could drift from it), with its own dedicated storage key
  (`skyloom:journey`) that no other module's reset helper touches — satisfying "cannot be accidentally
  reset by ordinary local changes" by construction, verified in `store.test.ts`.
- Days may be claimed **out of order**, and a missed day is never lost — a design decision beyond the
  brief's literal text, made in service of its own "generous, not manipulative" instruction: punishing a
  missed day by permanently forfeiting that reward would be the manipulative pattern the brief explicitly
  rejects elsewhere (Section 14's "no dark patterns"). Every day just checks "is it unlocked and unclaimed
  yet", nothing more.
- UI: a compact `JourneySheet` (7-day strip), reachable from Home's footer next to Missions, sharing its
  sheet chrome. Hides itself once complete rather than permanently occupying footer space.
- Analytics: `journey_day_claimed`, `journey_completed` (fires once, on the 7th distinct claim, whatever
  order they came in), `journey_dropped_off` (the day of the last claim, reported at most once per gap,
  computed lazily on read — not a running timer).
- Tests: `journey/store.test.ts`.
- Deviation (at the time): the brief's own Section 9 day-list named a Relic (Day 3), Summon Tickets
  (Day 2) and a Cosmetic (Day 6) — Tickets did not exist yet at Phase 6 time, so Day 2 was substituted
  with Gems. **Corrected in Phase 7** once Tickets landed: Day 2 now grants 3 Tickets, restoring the
  brief's original intent. The Relic (Day 3) and Cosmetic (Day 6) substitutions stand — neither system
  exists in this codebase and neither is in scope for this workstream.

### Phase 7 — Economy cleanup: Summon Tickets — Status: ✅ done

**Audit (task 1) — sources/sinks as they stood entering Phase 7:**

| Currency | Sources (as of Phase 6) | Sinks (as of Phase 6) |
|---|---|---|
| Gold | Campaign win (every win), Quick Battle win/draw, idle rewards, daily/weekly missions, journey Days 4/5 | Hero Level only |
| Gems | Starting grant, Campaign first-clear, chapter complete, Account Level milestones, daily/weekly missions, journey Day 6 | Summon only |
| Duplicate copies | Summon duplicates, Campaign multi-copy rewards, journey Day 3 | Ascension only |

No dead currency, no dead sink — both Gold and Gems already had at least one source and one sink before
Phase 7 started. The only real gap was the missing third currency the brief's Phase 5/6 text assumed.

**What landed:**

- `economy/types.ts` (v3→v4) — `PlayerEconomy.tickets: number`. Pre-v4 saves get `tickets: 0`, never
  backfilled retroactively (same treatment as v2→v3's `gold`).
- `economy/economy.ts` — `getTickets`/`canAffordTickets`/`grantTickets`/`spendTickets`/`setTickets`,
  structurally identical to Gold's pair, deliberately not a generic "third currency" abstraction (same
  reasoning as Gold's own header comment: keeps Gold/Gems/Tickets from ever sharing a code path that
  assumes "the one currency").
- **`commitSummon` now takes a `currency: 'gems' | 'tickets'` parameter** (defaults to `'gems'`, so every
  existing call site keeps working unchanged) and writes to the SAME `summon.pity`/`summon.history` either
  way — there was never a second pity object to create; both currencies just pick which balance field the
  one write path debits. Verified directly: a Gem pull followed by a Ticket pull on the same banner
  continues the same pity counter and appends to the same history array (`economy.test.ts`,
  `summon.test.ts`).
- `summon/config.ts` — `SUMMON_CONFIG.ticketCost = { single: 1, ten: 10 }`, flat and banner-independent
  (Gem cost varies per banner; Ticket cost deliberately does not - there's no "price" to discount since
  Tickets are earned, not bought).
- `summon/summon.ts` — `performSummon(kind, bannerId, seed?, currency?)`. `currency` was added as the
  LAST parameter, after the pre-existing `seed`, specifically so every one of the ~17 existing
  `performSummon(kind, bannerId, seed)` call sites (mostly in `summon.test.ts`) kept working unchanged
  rather than requiring a mechanical rewrite of a parameter that has nothing to do with what changed.
- `SummonPage.tsx` — a Gems/Tickets toggle, shown only once the player owns at least 1 Ticket (matches
  the "don't clutter for players who have none" pattern already used for the Journey/Missions footer
  entries). Defaults to Tickets when the player has any, since spending the earn-only currency first is
  always at least as good as spending Gems.
- New `TicketIcon`/`TicketAmount`/`TicketBalance` components, matching Gem/Gold's shape exactly. **Found
  and fixed a real Phase 1 gap while building these**: `GoldBalance` had never actually been given CSS
  (unlike `GemBalance`) — it was rendering unstyled since Phase 1 landed. Added `.gold-balance`/
  `.gold-gain` alongside the new `.ticket-balance`/`.ticket-gain` rules.
- Journey Day 2 restored to Summon Tickets (see Phase 6's entry above). Missions: Tickets added to the 3
  weekly missions only (1/2/1), deliberately NOT to any daily mission - keeps Tickets a weekly-commitment
  reward, with the journey covering "a free Ticket early on" instead of a daily trickle.
- While already touching `missions/store.ts` for Tickets, also wired the Phase-9-shaped period-specific
  events (`daily_mission_progress`/`daily_mission_completed`/`weekly_mission_progress`/
  `weekly_mission_completed`/`daily_set_completed`) alongside the existing generic `mission_progressed`/
  `mission_completed` - see Phase 9's entry for why both naming schemes coexist rather than a rename.

**Final source/sink table (post-Phase 7):**

| Currency | Sources | Sinks |
|---|---|---|
| **Gold** | Campaign win (every win, not just first clear): 30/40/55/90 by node type · Quick Battle win/draw: 20/8 · Idle rewards: `goldPerHour(clearedNodes)`, capped 12h · Daily missions: 3 of 5 (40/30/20) · Weekly missions: 2 of 3 (200/150) · Journey Days 4/5: 150/200 | Hero Level-up (`goldCostForLevelUp`, rising curve) |
| **Gems** | Starting grant: 100 · Campaign first-clear: 20/30/40/60 by node type · Chapter complete: 100 · Account Level milestones: 100/100/100/150 at 5/10/15/20 · Daily missions: 2 of 5 (20/15) · Weekly missions: 1 of 3 (100) · Journey Day 6: 200 · (future: IAP, Phase 10 surfaces only - no real purchase path exists) | Summon (single/ten, per-banner cost) |
| **Summon Tickets** | Weekly missions: all 3 (1/2/1) · Journey Day 2: 3 · (future: offer bundles, Phase 10 surfaces only) | Summon (single/ten, flat 1/10 - shares pity/history with Gems) |
| **Duplicate copies** *(resource, not a currency)* | Summon duplicates · Campaign multi-copy rewards · Journey Day 3 | Ascension (spends copies to raise rank; Stars reads the result, spends nothing itself - Phase 2) |

Every currency has at least one source and one sink; nothing is dead. Not added, per the brief: Hero XP
items, Ascension stones, equipment/relic currencies, shards - duplicate copies already serve the role a
shard system would, per the Phase 2 decision gate.

- Tests: `economy/economy.test.ts` (Ticket earn/spend, insufficient Tickets, pity/history sharing across
  Gems and Tickets, v3→v4 migration), `summon/summon.test.ts` (`performSummon` end-to-end with Tickets:
  cost, insufficient-Tickets refusal, shared pity across currencies, reward persistence through a reload,
  Unlimited-Gems dev bypass also covering Tickets).
- Deviation: none from the task list; the missions period-specific-event and `daily_set_completed` work
  (Phase 9-shaped) landed early, alongside Tickets, because it touched the same file - documented under
  Phase 9 below rather than re-described there.

### Phase 8 — Remote config abstraction — Status: ✅ done

- `src/config/schema.ts` — the full typed `GameConfig` surface: `economy`, `summon`, `heroLevel`,
  `campaign`, `idle`, `missions`, `journey`, `offers`, `flags`. Two shapes, by design (see the file's own
  header note): plain scalar/object fields for values that ARE the tunable number, and `*Overrides` maps
  keyed by content id (a Campaign node id, a mission id, a journey day) for values that live inside
  existing content files (`chapter1.ts`, `missions/definitions.ts`, `journey/definitions.ts`) - an
  override map lets one id's number change without creating a second source of truth for that content.
- `src/config/defaults.ts` — `DEFAULT_CONFIG`, every field equal to the value already live in the
  codebase before this phase. `src/config/config.ts` — `getConfig()`/`setConfigProvider()` (same seam
  shape as `analytics/track.ts`'s `setAnalyticsProvider`), a `createLocalProvider(overrides)` deep-merge
  helper (the "local/default provider" the brief says is sufficient for this phase - no remote endpoint
  wired), and a dev-only `setDevConfigOverride()` persisted to `localStorage` so a QA tester can retune
  values without a rebuild (the "smallest reasonable solution" for a dev-facing override tool).
- **What was actually migrated to read through `getConfig()` ("where practical"):**
  - `economy/rewards.ts` - `campaignFirstClearGems`, `chapterCompleteGems`, `levelGems`,
    `campaignWinGold`, `quickBattleGold` (all function-shaped already, now read config live on every call).
  - `heroLevel/config.ts` - `heroLevelCapForAccount`, `goldCostForLevelUp`.
  - `campaign/idleRewards.ts` - `goldPerHour` and `loadIdleReward`'s cap.
  - `summon/summon.ts` - `summonCost`'s Ticket branch (`ticketCostSingle`/`ticketCostTen`).
  - Three override maps actually wired at their read sites, not just declared in the schema:
    `campaign/progress.ts`'s new `recommendedPowerFor(node)` (used by both `recordBattleResult` and
    `StagePreviewSheet.tsx`), `missions/store.ts`'s `claimMission`, `journey/store.ts`'s `claimJourneyDay`.
  - `SummonPage.tsx`'s Ticket-toggle visibility now also respects `flags.alwaysShowTicketToggle` - the
    one feature flag actually wired to a UI decision this phase.
- **A real architectural fix this phase required, not just config plumbing**: `heroLevel/config.ts`
  previously held both `battlePowerBonusForLevel` (imported by `engine/abilities.ts`, which is reachable
  from `api/` for Friendly Battle) and the newly-config-dependent `heroLevelCapForAccount`/
  `goldCostForLevelUp` in one file. Importing `config/config.ts` into that file broke the `api/` build
  (`import.meta.env` isn't typed under `api/tsconfig.dev.json`'s Node target) and - independent of the
  build error - would have been the wrong design anyway: a combat-balance invariant must never be able to
  drift via a remote config value. Split into `heroLevel/battlePower.ts` (engine-safe, zero dependency on
  config) and kept `heroLevel/config.ts` for the economy-tuning half, re-exporting the engine-safe
  constants so no other call site needed to change. `engine/abilities.ts` and `GamePage.tsx` now import
  `battlePowerBonusForLevel` directly from `battlePower.ts`.
- **Deliberately NOT routed through config, documented as actual game rules, not live-ops levers:**
  `MAX_HERO_LEVEL` and `battlePowerBonusForLevel`'s breakpoints (the engine-safety invariant Phase 1's
  tests protect), `ROSTER_POWER_WEIGHTS` (a first-draft formula still expected to change in *shape*, not
  just tuning, per Section 5 - config values would falsely imply the formula itself is settled),
  `ECONOMY_VERSION`/`MISSIONS_VERSION`/`JOURNEY_VERSION`/storage keys/`historyLimit`/pity clamping bounds
  (schema versioning and storage bookkeeping, not economy tuning).
- **Deliberately left un-wired despite being in the schema, with the limitation stated rather than
  hidden**: `SUMMON_CONFIG`'s `pityThreshold`, `rarityRates`, `heroWeight`/`spellWeight`, and the featured
  multipliers, plus per-banner Gem cost - all baked once into `SUMMON_POOLS` at module load
  (`summon/pool.ts`'s `buildPool()`). Making these safely live-reconfigurable would mean rebuilding the
  pool array reactively, a materially bigger change than "read a number from config" that this phase
  explicitly did not take on (brief: "do not rebalance the entire economy endlessly"). Similarly, mission/
  journey `target` counts are captured nowhere in config (see `MissionRewardOverride`'s own comment) -
  only reward *amounts* are overridable, since a target change would need to flow consistently through
  every place a progress count is capped/compared against it.
- Tests: `config/config.test.ts` (provider swap, deep merge preserves untouched siblings, dev override
  persistence, schema shape), `config/configIntegration.test.ts` (proves the abstraction flows
  end-to-end: a provider swap changes what `campaignFirstClearGems`/`goldCostForLevelUp`/`goldPerHour`/
  `summonCost`/`recommendedPowerFor`/`claimMission`/`claimJourneyDay` actually return, not just that
  `getConfig()` itself resolves correctly).
- Deviation: none from the task list; scope boundaries (what's wired vs. schema-only) are stated above
  rather than silently left ambiguous.

## 9. Sequencing update (2026-09-24 follow-up) — the Commercial Validation Gate

Supersedes this document's original Section 9. The docx's "Decision gate after Phase 10" is replaced by a
renumbered Phases 7–11 (below) followed by a named gate:

```
Phases 0–11 → Closed Playtest → Commercial Validation Gate → only then decide on
server authority / monetisation / soft launch
```

Phases 7–10 were re-scoped in this follow-up (Phase 9 is now Analytics completion, not "focused
progression polish"; Phase 10 is now monetisation *surfaces*, not closed-playtest readiness; the old
Phase 10 became Phase 11). The reasoning and content for each renumbered phase live in its own entry in
Section 8 (the phase log) as it lands, not duplicated here.

**Server-authoritative economy, real IAP, ranked PvP, live events, guilds, equipment and other expensive
production/live-service systems do not begin automatically after Phase 11.** They begin only after a
closed external playtest and a review of the metrics below.

**The Commercial Validation Gate evaluates at least:**

- tutorial completion
- D1 / D3 / D7 retention
- sessions per player
- Campaign progression
- Campaign power-wall encounter rate
- return/retry rate after encountering a power wall
- Hero Level engagement
- Ascension engagement
- Star engagement
- idle reward claim rate
- daily mission participation/completion
- weekly mission participation/completion
- 7-day journey claims
- Summon engagement
- resource balance/faucet/sink behaviour

**No success thresholds are defined yet**, deliberately — the first closed cohort will likely be too small
for statistically meaningful benchmarking. The goal through Phase 11 is to make every one of the above
measurable, not to decide in advance what a "good" number looks like. Thresholds are a Gate-time decision,
made with real data in hand, not a Phase 7–11 decision made in the abstract.

## 10. What happens after Phase 11 — explicit stop list

Phase 11 ends implementation for this entire workstream until the Commercial Validation Gate is reviewed.
Do not begin, even opportunistically or as a "small step toward":

- server-authoritative economy or real authentication migration
- real IAP (Stripe, App Store, Google Play billing)
- Ranked PvP
- Live Events
- Guilds / Guild Raid
- Equipment / Relics
- a large Ascension content pass (covering the remaining ~46 cards)
- new Campaign regions
- large roster expansion

This replaces the docx's original "Later phases" list (Phases 11–15+) — same systems, gated behind the
Commercial Validation Gate explicitly rather than left as "later, not needed yet."

## 11. Definition of success — checked at the end of Phase 6

| Criterion (docx Section 12) | Status |
|---|---|
| Embervale still feels like the same 3-lane game, not a stat simulator | Held by construction: the only numeric change to real combat across all six phases is `battlePowerBonusForLevel`, capped at +2, proven (not just asserted) to stay smaller than the roster's widest Common-vs-Legendary gap. Everything else (Ascension, Mastery, Stars) was already ability-based or purely virtual before this workstream and stayed that way. |
| An obvious reason to strengthen heroes, and a place that strength matters | Hero Level (Phase 1) + Stars-over-Ascension (Phase 2) give the reason; the Campaign Roster Power curve (Phase 3) gives the place, with a boss provably out of reach for pure collection alone. |
| At least three reasons to return tomorrow | Idle accumulation (Phase 4), daily/weekly missions (Phase 5), the 7-day journey (Phase 6) — all three land, all three are analytics-instrumented from day one. |
| Duplicates have clear value without a confusing double-spend economy | Phase 2's decision gate resolved this explicitly before any Stars code was written — one duplicate sink (Ascension), Stars are a read, never a second spend. |
| All new loops emit measurable analytics events | Every phase's write-up above lists its events; `track()`'s common context (account level, Gem/Gold balance, days since install) rides on all of them automatically. |
| No large content/live-ops/backend build undertaken early | Confirmed — no server work, no new regions, no guilds/ranked/events; Summon Tickets and full Ascension-content coverage were both explicitly deferred rather than pulled forward. |

**Open before Phase 7+:** the Roster Power formula and every reward/rate constant introduced in Phases
1–6 are first-draft, PROTOTYPE-tier numbers (consistent with every existing tuning file in this codebase)
and have not been played by a real user yet. Phase 9 (closed-playtest polish) and Phase 10 (closed
playtest itself) are what the brief's own Section 9 decision gate depends on — this plan does not treat
Phases 0–6 landing as evidence the retention hypothesis is correct, only that it is now testable.
