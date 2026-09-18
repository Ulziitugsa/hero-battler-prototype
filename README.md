# Hero Battler - Phase 0.5 Prototype: Card Set v0.1

A throwaway browser prototype. Phase 0.4 froze the core combat rules (`CORE PLAYTEST RULESET v0.1`
below, unchanged since). This pass is the first real content/playtest phase built on top of it: a
~30-card roster across three factions, a local deckbuilder, starter/AI decks, and local playtest
tooling. We are no longer asking "can the engine support cards?" - we're asking **does deckbuilding
create interesting strategies and repeatable fun?** See "Playtesting Goals" below.

## Documentation

This README stays the build/run guide and the phase-by-phase record of *why the code is like this*.
The consolidated source-of-truth documents live in [`docs/`](docs/README.md):

- [`docs/game/CORE-RULES.md`](docs/game/CORE-RULES.md) - the frozen ruleset as actually implemented,
  with the resolution sequence and the known documentation discrepancies. Expanded version of
  "CORE PLAYTEST RULESET v0.1" below.
- [`docs/game/CARD-SYSTEM.md`](docs/game/CARD-SYSTEM.md) - card data model, abilities, targeting,
  rarity, factions, deck rules.
- [`docs/design/DESIGN-SOURCE-OF-TRUTH.md`](docs/design/DESIGN-SOURCE-OF-TRUTH.md) - the approved
  Embervale visual direction (summary of `Design Source of Truth.pdf`).
- [`docs/design/CHARACTER-ART-BIBLE.md`](docs/design/CHARACTER-ART-BIBLE.md) - approved character and
  spell art direction.
- [`docs/design/UI-REDESIGN-BACKLOG.md`](docs/design/UI-REDESIGN-BACKLOG.md) - design work that is not
  finished, P0-P4.

**The UI in `src/` is still the pre-Embervale dark-panel build.** The approved visual direction is
documented but not yet implemented; see the backlog.

## What changed since Phase 0.4 (Card Set v0.1)

- **Card Set v0.1**: 32 curated cards across Kingdom / Undead / Infernal (see below). `src/game/cards/roster.ts` is the single source of truth for "the playtest set" - the Collection screen, Deck Builder pool, and deck validation all read from it. A few Phase 0.4 prototype cards (extra Undead removal/tempo spells, the whole Wild faction) still exist in the code and are still covered by engine tests, but are deliberately left out of the roster so the playtest surface stays at "3 factions, ~30 cards" rather than "everything ever added to the file". Wild is *not* a fourth playtest faction yet.
- **Two new conditions** (`SELF_LANE_HAS_SPELL`, `SELF_LOSING_LANE`) and **one new action** (`EXILE_FROM_GRAVEYARD`) - the only new engine primitives this pass needed. Everything else in the 30-card set reuses Phase 0.4's existing primitives (`CHANGE_POWER`, `RETURN_TO_HAND`/`RETURN_TO_DECK`/`REVIVE_TO_LANE`/`REVIVE_SELF`/`RETURN_DEATH_SOURCE_TO_HAND`, `PLAYER_DAMAGE`, `DESTROY_SPELL_ZONE`, `LANE_EMPTY_ENEMY_SIDE`, `SELF_LANE_OCCUPIED`). "Lane movement" (listed as an example Hero pattern in the brief) was deliberately **not** built - it would need the engine to support moving a Hero between zones and picking a destination, which breaks the "placement is targeting, nothing is ever player-chosen mid-effect" rule this engine is built on. Reconsidered rather than bolted on; see "Things explicitly not built".
- **Two real bugs found and fixed while building this set**, both surfaced by actually playing the new cards in the browser, not by inspection:
  1. `resolveRound`'s `playFor(side, lane)` looked up a side's play at a lane with `.find()`, blind to zone type - so a Hero *and* a Spell placed in the same lane in the same round (exactly the Kingdom Archer + Battle Banner combo this set was designed around) meant whichever play wasn't first in the array silently never got its `ON_PLAY` phase processed. Fixed by making `playFor` zone-aware (`playFor(side, lane, 'hero' | 'spell')`).
  2. `RETURN_TO_HAND` and `RETURN_DEATH_SOURCE_TO_HAND` built a returned card's hand-card id from `(side, round, cardId)` alone, with no per-event disambiguator - two copies of the *same* card returning to hand in the *same* round (very plausible with this set's heavier return-to-hand toolkit) collided and crashed `resolveRound` with "Hand card used twice" the next time either was played. Fixed by folding `ctx.events.length` (deterministic, strictly increasing within one `resolveRound` call) into the id, and by putting the resulting `handId` on the `RETURNED_TO_HAND` event itself so the UI's replay reducer no longer recomputes it independently.

  Both are covered by regression tests (`newPrimitives.test.ts`, and the full-match `starterDecks.test.ts` which exercises real AI-vs-AI play across all three roster matchups).
- **A simple local deckbuilder**: `src/game/engine/deckRules.ts` (15-card decks, max 2 copies, max 1 Legendary, all configurable constants), `src/game/engine/localDecks.ts` (localStorage-backed saved decks), and three new UI screens (`DeckBuilderPage`, `CollectionPage`, `StatsPage`) plus a `HomePage` menu that replaces the old hardcoded Infernal-vs-Undead match `GamePage` used to boot straight into.
- **Extended local playtest stats**: `MatchStats` now tracks per-card drawn/played/won-when-played counts and deck labels, not just match-level totals; `src/game/engine/playtestReport.ts` rolls the saved match history up into the two tables the Stats screen shows. See "Playtesting Goals".

## What changed since Phase 0.3

- **Two real Spell categories.** `SpellKind` is now `'ONE_TIME' | 'CONTINUOUS'`. A one-time Spell resolves in the Spells phase and goes straight to the Graveyard, freeing its slot the same round (this was actually broken before this pass - see "Bugs found" below). A Continuous Spell activates once and then stays physically in its Spell zone, occupying it, until something removes it - a second Spell can't be placed on top of it.
- **Effective Power is now real**, not a per-round re-applied hack. A Hero's stored `power` is its permanent/base value and is never touched by a Continuous Spell. `src/game/engine/power.ts` computes `effectivePower()` live - base + whatever's currently active in the same lane's Spell zone - every time Power is needed (Combat, direct damage, death checks, board display). Destroying the Continuous Spell makes its contribution disappear on the next read, with no cleanup step required and no risk of it ever getting "baked in" by mistake.
- **A new `CONTINUOUS` trigger** for passive modifiers like Battle Banner's "+2 while active" - it's deliberately never dispatched like the other triggers; `effectivePower()` reads `CONTINUOUS`-trigger abilities directly. Recurring *triggered* Continuous effects (Burning Ground's `ROUND_END` -1/round, Grave Totem's `ON_ALLY_DEATH` reaction) still use the normal dispatch system and mutate base Power permanently, same as before - the difference between "passive overlay" and "recurring triggered effect" is a real mechanical distinction now, not just flavor text.
- **`AbilityDefinition.condition` became `.conditions` (an array, AND-combined)**, plus two new condition types: `DEATH_IN_SELF_LANE` and `SPELL_ZONE_NOT_USED_THIS_ROUND` - together they implement Grave Totem's "the *first* ally that dies in this lane, once per round" without any card-specific engine code. `SpellZoneInstance.usedThisRound` resets for every Spell zone at Round Start.
- **Two new actions**: `DESTROY_SPELL_ZONE` (Dispel - destroys the enemy Continuous Spell in the same lane) and `RETURN_DEATH_SOURCE_TO_HAND` (Grave Totem - returns the specific Hero that just died in its lane, not a graveyard-wide search).
- **Generic "don't allow an obviously dead placement" check.** `spellHasAValidTarget()` blocks deploying a same-lane `DESTROY`/`DESTROY_SPELL_ZONE` Spell (Execute, Dispel) into a lane with no eligible target, at the UI and engine level both - not by checking `card.id`, but generically off the ability's own target scope and (for Execute) `maxPower`.
- **Resolution order**: `ROUND_END` abilities now fire *before* temporary-Power cleanup, matching the brief's phase list exactly (Reveal → Spells → Hero On Play → Before Combat → Combat → deaths → After Combat → Round End → temporary effect cleanup → win check). No observable effect on the current card set (all Power deltas are simple sums, so the two orderings commute), but it's now correct for a future card that might care.
- **Two bugs found and fixed** while building this (both surfaced by the new tests, not by inspection):
  1. A resolved one-time Spell was never actually added to the Graveyard - `graveyard` state and the `SPELL_RESOLVED` event existed, but nothing pushed the card id. Existing tests never checked for it.
  2. A self-revived Hero (Vharos) always came back at its *card's base* Power in the UI's replay reducer, even though the engine correctly gave it the reduced revival Power - the `REVIVED` event didn't carry the actual revival Power, only the destination lane. Both are fixed and covered by dedicated tests now.

## Running

```bash
npm install
npm run dev     # http://localhost:5173, resize to ~390px wide for the intended portrait layout
npm test        # vitest - engine + replay + AI determinism tests
npm run build   # tsc -b && vite build
```

## CORE PLAYTEST RULESET v0.1

*Expanded, code-verified version: [`docs/game/CORE-RULES.md`](docs/game/CORE-RULES.md).*

**This is the ruleset Card Set v0.1 (below) is built on, unchanged since Phase 0.4. It is not "final forever" - it's the point where we stop redesigning rules and start playtesting cards against them. If a card idea genuinely needs a rule change, that's a deliberate decision to make then, not something to drift into. (Two bugs in the existing implementation of this ruleset were found and fixed while building the card set - see "What changed since Phase 0.4" - but the rules themselves did not change.)**

- 15-card deck (`DEFAULT_DECK_SIZE`, configurable).
- Hand of 3; draw back up to 3 at the start of every round.
- 3 lanes (Left/Center/Right) per side, each with a **Hero zone** and a **Spell zone**.
- Heroes persist on the board round after round until removed.
- Combat compares **effective** Power (base + any active Continuous Spell overlay): higher wins and survives completely unchanged; equal Power destroys both; Combat never partially damages a Hero.
- An unopposed Hero deals direct damage to the enemy player equal to its current effective Power (`directDamageAmount()` - the one rule flagged as most likely to need tuning once playtesting starts).
- Effect targeting is always automatic from where a card is placed (`TargetScope`: `SELF`, `ALLY_SAME_LANE`, `ENEMY_SAME_LANE`, `ALL_ALLIES`, `ALL_ENEMIES`, `ADJACENT_ALLIES`, `ADJACENT_ENEMIES`) - there is no target-selection UI, and a card that would need one is out of scope for now.
- **One-time Spells**: resolve once, then Graveyard.
- **Continuous Spells**: activate once, then occupy their Spell zone until removed; a second Spell can't be placed into an occupied Continuous slot.
- Graveyard and revival exist, with all graveyard-sourced effects choosing automatically (lowest/highest Power, optionally by faction) - never a manual pick.
- Deterministic phase order: Round Start → draw to 3 → Deploy → FIGHT → Reveal → Spells (Left→Center→Right) → Hero On Play (Left→Center→Right) → Before Combat → Combat → deaths/death-triggers → After Combat → Round End → temporary effect cleanup → win check.

## Card Set v0.1

32 cards across three factions (11 Kingdom, 10 Undead, 11 Infernal - see `src/game/cards/roster.ts`
for the exact list). Every card has a stable id (`kng-`/`und-`/`inf-`/`spl-` prefix), never a
display-name lookup. Rarity is a design lens, not a Power tier - see each archetype's "gameplay
identity" below and the individual card text in the Collection screen for what each rarity is meant
to *do*, not just how big its numbers are.

**Kingdom** - knights, priests, archers. Balanced, buffs, board control, reliable Heroes.
Commons are simple and vanilla-adjacent (Common Knight has no ability at all; Kingdom Archer rewards
having a Continuous Spell in its lane). Rares buff on play (Royal Guard, adjacent allies) or heal
(Light Priest). Battle Captain (Epic) buffs the whole board before Combat; Legendary Paladin is a
comeback card - it only gets its +4 Power when it would otherwise *lose* its lane, so it's a defensive
tool rather than just a bigger stat line. Spells: Power Surge/War Cry (one-time buffs), Dispel (destroys
an enemy Continuous Spell), Battle Banner/Fortify (Continuous - a live +2 overlay, and a grow-by-1-a-round aura).

**Undead** - skeletons, priests, necromancers. Death is a resource: On Death, ally-death payoffs,
Graveyard recursion, revival. Bone Soldier returns to the Deck on death (slow recursion); Cursed
Warrior returns to hand instead (fast, safe recursion) - two different revival speeds, deliberately
both Common so a starter deck can lean on either. Dark Priest and Grave Knight both grow off *deaths*
(ally vs. enemy respectively) as simple, stackable value engines. Mira (Epic) fetches the strongest
Undead Hero from the Graveyard; Vharos (Legendary) is this set's one self-revival card - it
comes back once, at reduced Power, and that's the whole rule (no infinite loop to reason about).
Spells: Second Chance (return to hand) and Raise Fallen (revive to lane, capped at 4 Power or less -
the "powerful but restricted" revival pattern) are one-time; Grave Totem and Cursed Ground are
Continuous value engines that react to deaths in or near their lane over multiple rounds.

**Infernal** - demons, fire, corrupted warriors. Aggression, direct damage, Power reduction, risky
high-impact effects. Flame Imp and Pit Fiend both turn "this Hero is about to die anyway" into a
damage payoff (direct-damage-on-hit vs. damage-on-death) - two ways of getting value out of a
trade instead of just losing it. Hellhound and Blood Demon are the classic aggro/value-engine pairing.
Infernal Lord (Legendary) is a genuine board swing - -2 Power to *every other Hero in play, both
sides* - with the obvious counterplay of simply not overcommitting the board into it. Spells: Weakness/
Fireball are direct removal; Soul Burn is this set's Graveyard-hate card (**Exile**: permanently
removes a Hero from a Graveyard - not returned, not revivable, gone for the rest of the match - the
soft counter to Undead's recursion engines, per "Counters Matter" below). Burning Ground and Siege
Fire are two different Continuous pressure tools (drain the enemy Hero in this lane every round, vs.
punish them for *not* having a Hero in this lane).

**Counters, not hard-counters**: Kingdom's Battle Captain/Fortify buffs can out-race Infernal's burst if
the board stays full; Infernal's Soul Burn and direct removal can kill an Undead engine (Dark Priest,
Grave Knight) before it snowballs; Undead's recursion (Cursed Warrior, Second Chance, Grave Totem) is
built to out-value a long Kingdom grind. None of the three should be an automatic matchup win against
either of the others - that's the thing this phase exists to actually test, not assert.

**Spells inherited from Phase 0.4** (still in the code, still faction-tagged, but not part of the
Card Set v0.1 roster): Execute, Death Wave, and the whole Wild faction (Forest Wolf, Ancient Treant,
Titanroot, Growth Totem). Still exercised by the engine test suite; not shown in the Collection/Deck
Builder and not legal in a v0.1 deck.

## Deck Rules

- Deck size: **15 cards** (`DECK_SIZE` in `src/game/engine/deckRules.ts`).
- Max copies of one card: **2** (`MAX_COPIES`), except **Legendary: 1** (`MAX_LEGENDARY_COPIES`).
- All three constants are configurable in one place; `validateDeck()` is the single source of truth
  the Deck Builder, the Home screen's "start battle" gate, and the starter-deck self-check at module
  load time all call.
- A deck may only be built from the Card Set v0.1 roster (`PLAYTEST_ROSTER`) - the Deck Builder never
  offers anything outside it, and `validateDeck()` rejects a card id that isn't in it defensively.

## Playtesting Goals

Now that the ruleset is frozen and a real 30-card set exists, the open questions are about content and
deckbuilding, not mechanics:

- Which archetype is fun? Which is confusing?
- Which cards feel useless? Which feel mandatory?
- Do matches become repetitive, or does deckbuilding create meaningfully different games?
- Is revival fun, or does it just prolong a match that should have ended?
- Do Continuous Spells create real lane decisions (commit a Spell slot here for many rounds, or keep
  it flexible), or is Continuous just strictly better once a deck can afford one?

The Playtest Stats screen (`src/pages/StatsPage.tsx`, backed by `localStorage` match history and
`src/game/engine/playtestReport.ts`) exists to start answering these with numbers - win rate by deck,
and per-card drawn/played/won-when-played counts - instead of vibes. It is explicitly **not**
statistically rigorous tooling; treat it as a nudge toward what to look at more closely, not a verdict.

## Architecture

```
UI (React, drag-and-drop + tap fallback)
  |  PlayerAction: DeployPlay[] = {handId, cardId, lane}[] - no target ids, ever
  v
Combat engine  - resolveRound(state, playerAction, enemyAction, seed) -> { nextState, events }
  |  GameEvent[]
  v
Replay reducer  - purely re-applies the already-decided event log for animation
  v
React renders whatever the replay reducer currently shows, effective Power computed for display
```

- `src/game/types` - `CardDefinition`, `AbilityDefinition` (trigger/conditions[]/TargetScope), `GameState` (`PlayerState.heroZones` + `spellZones`), `GameEvent`.
- `src/game/engine/power.ts` - **new this pass**: pure `effectivePower()`/`computeContinuousBonus()`/`withEffectivePowers()`, shared by the engine (Combat/direct-damage/death checks) and the UI (board display) so there is exactly one definition of "how strong is this Hero right now".
- `src/game/engine/resolveRound.ts` - the fixed, lane-ordered phase sequence + Deploy legality (including the generic "does this Spell have a valid target" pre-check).
- `src/game/engine/abilities.ts` - trigger dispatch, `TargetScope` resolution, the destruction/chain queue (now also dispatches death reactions to Spell zones, not just Heroes, carrying `deathCardId`/`deathLane` context for Grave Totem).
- `src/game/cards` - `infernal.ts`, `undead.ts`, `kingdom.ts`, `wildborn.ts`, `spells.ts` (card data); `roster.ts` (the curated Card Set v0.1 list); `starterDecks.ts` (the 3 starter/AI decks); `validate.ts` (card-shape validator, section "Card Definition Validation").
- `src/game/engine/deckRules.ts` / `localDecks.ts` / `playtestReport.ts` - deckbuilding rules + localStorage deck persistence + match-history aggregation, all new this pass.
- `src/game/ai` - unchanged in shape; `scoreSpellLane` already read a card's ability data generically, so new action types default to a neutral score rather than needing a bespoke case.
- `src/pages` - `HomePage` (deck/opponent select), `DeckBuilderPage`, `CollectionPage`, `StatsPage` are new this pass; `GamePage` no longer hardcodes a matchup - it takes `playerDeck`/`enemyDeck`/labels as props from `App.tsx`'s router.
- `src/components` - `SideBoard.tsx` renders one side's 3 lane columns; `GamePage.tsx` wraps both boards through `withEffectivePowers()` before rendering, so board chits always show the true combat-relevant number, not the raw stored one.

**Determinism**: `determinism.test.ts` replays a full AI-vs-AI match twice from a seed and asserts byte-identical output; `replay.test.ts` asserts the UI's playback reducer reconstructs the engine's own `nextState` exactly from its event log, across a full match - this is what actually caught both bugs listed above.

## Known simplifications in this pass

- An instant Spell still doesn't get a visual "pending" marker inside the Spell slot it targets (only Continuous Spells occupy a slot) - it shows in the small removable "Pending Spells" list under the board instead.
- Drag-and-drop uses the native HTML5 DnD API - fine on desktop, not touch-optimized; tap-to-select-then-tap-to-place already covers touch.
- `effectivePower()` is recomputed by scanning both sides' Spell zones at a lane on every read rather than being cached - completely fine at 3 lanes, would need revisiting only at a much larger board size than this game will ever have.

## Rules-level design questions (carried over from Phase 0.4, still open)

These are about the frozen ruleset itself, distinct from the content questions in "Playtesting Goals" above.

**Continuous vs. one-time Spells** - Does committing a Spell slot to an ongoing Continuous effect feel meaningfully different from a one-shot Spell? Is losing a Spell slot for many rounds a real cost, or is Continuous strictly better once a deck can afford one?

**Persistent Heroes** - Do Heroes stay on board too long? Does defeating a strong Hero (or Dispelling its buff) feel rewarding?

**Direct damage** - Is full-Power direct damage too lethal, especially from a Hero that's been growing for several rounds?

## Campaign (vertical slice, as of Card Set v0.1)

One real, playable chapter exists: Region 1 / Chapter 1 - "The Ashen Road" (`src/game/campaign/`,
`src/pages/campaign/`). Thirteen story/battle/reward/elite/boss nodes with real localStorage-persisted
node-clearing progress, a real per-stage Energy economy (current/max/regen, also localStorage-persisted
with a timestamp so it keeps regenerating while the app is closed), and battles that run on the actual
match engine (`GamePage`, unchanged) rather than a parallel system. Reached from Home's Fight seal
("Campaign" vs. "Quick Battle"). Region 1 is the only real content; Regions 2-9 render as locked
placeholders with no fabricated content behind them. Energy's tuning numbers (60 max, 5/7/10 costs, +1
per 5 min) are the design's own placeholders, centralized in `game/campaign/energy.ts` for easy
retuning. See `game/campaign/types.ts` for how a second region/chapter would be added (content only, no
new UI).

## Things explicitly not built (still, as of Card Set v0.1)

Gacha, premium currency, card ownership/unlocking (all 32 cards are unlocked for everyone - this is a
card *browser*, not the future collection system), card upgrades, accounts, a backend, real PvP,
matchmaking, Energy purchases/refill monetization, Hard/Nightmare difficulty, Mastery, Ascension,
quests, a battle pass, a store, purchases, final character art, sound production, and mobile packaging.
The deckbuilder, starter decks, a real card set, and one real Campaign chapter are no longer on this
list - they're what these passes built - but everything above stays deliberately deferred.
