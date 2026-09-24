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
- Reward: Gold only, at a rate tied to Campaign progress (`goldPerHour(clearedNodeCount)`), capped at a
  configurable window (default 12h, `IDLE_CAP_HOURS` in config — not a magic number in the UI).
- Home affordance: one line in the existing footer/destinations area (no new screen, no new nav item).
- Analytics: `idle_reward_available`, `idle_reward_claimed`.
- Tests: `campaign/idleRewards.test.ts` (elapsed-time edge cases, cap, repeated-claim safety, clock skew).
- Deviation: none.

### Phase 5 — Daily + weekly missions — Status: ✅ done

- `src/game/missions/` — `definitions.ts` (5 daily + 3 weekly, all backed by existing gameplay: Campaign
  win, hero level-up, summon, spell played, idle claim), `store.ts` (persisted progress + deterministic
  UTC-day/week reset, same snapshot+listener+sanitize pattern as every other store in the repo).
- Progress is driven by the Phase 0 analytics events already flowing through the app (a mission listens
  for the same `track()` calls other systems emit) rather than bespoke counters scattered through gameplay
  code.
- UI: a compact Missions sheet reachable from Home (same "sheet, not a new nav tab" pattern as
  `GraveyardSheet`/`HelpModal`).
- Analytics: `mission_progressed`, `mission_completed`, `mission_claimed`.
- Tests: `missions/store.test.ts` (reset boundaries, no-double-claim, deterministic day/week keys).
- Deviation: none.

### Phase 6 — Seven-day new player journey — Status: ✅ done

- `src/game/journey/` — `definitions.ts` (7 rewards, Day 7 a meaningful hero/material grant, none gated
  behind spend or ads), `store.ts` (first-launch timestamp captured once, day index derived from elapsed
  real time, immune to being reset by ordinary local changes — it does not live in a key any other reset
  tool touches).
- UI: a compact 7-day strip, reachable from Home, in the same footprint discipline as Missions.
- Analytics: `journey_day_claimed`, `journey_completed`, `journey_dropped_off` (day of last claim before a
  gap longer than 48h, computed, not tracked live).
- Tests: `journey/store.test.ts`.
- Deviation: none.

## 9. Decision gate after Phase 10

Unchanged from the docx — not re-litigated here. Review measured behaviour (tutorial completion, D1/D3/D7,
sessions per retained player, Campaign power-wall return rate, summon engagement, hero-upgrade engagement,
first-week journey completion) before any Phase 11+ work begins.

## 10. Later phases

Unchanged from the docx Section 10 (Phases 11–15+: server-authoritative economy, test monetisation, ranked
+ first live event, Season Pass/rewarded ads, guilds/raids). Not started; not needed to evaluate this
workstream's core hypothesis.

## 11. Definition of success

Unchanged from the docx Section 12. Re-checked at the end of Phase 6 in the final status update below.
