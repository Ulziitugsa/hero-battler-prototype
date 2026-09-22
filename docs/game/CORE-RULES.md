# Core rules

**CORE PLAYTEST RULESET v0.1 - frozen.** Unchanged since Phase 0.4. This is not "final forever"; it
is the point where rule redesign stopped and card playtesting started. If a card idea genuinely needs
a rule change, that is a deliberate decision made then, not something to drift into.

This document describes **what the code does**, verified against `src/game/engine/` at the time of
writing. Where an older document disagrees, **current working code wins** - known discrepancies are
listed at the end.

Card data model, factions, rarity and deck rules are in [CARD-SYSTEM.md](CARD-SYSTEM.md).

---

## The board

- **3 lanes** - left, centre, right (`LANES` in `src/game/types/index.ts`).
- Each side has, per lane, **a Hero zone and a Spell zone**. Four slots per lane across both sides.
- Adjacency is literal: left and right are each adjacent to centre only; centre is adjacent to both
  (`adjacentLanes()`).
- Starting HP is **20** per player (`STARTING_HP`).

## Deck and hand

- **15-card deck** (`DEFAULT_DECK_SIZE` / `DECK_SIZE`). `SUPPORTED_DECK_SIZES` also defines 18 and 21
  for future use; 15 is what the deckbuilder enforces.
- **Starting hand: 3.** Round 1, each side draws to `HAND_REFILL_TARGET` (3) from an empty hand.
- **Draw back up to 3.** At the start of every round each side draws until its hand holds 3 cards
  (`beginRound`): a hand of 0 draws 3, 1 draws 2, 2 draws 1, and a hand of 3, 4 or 6 draws nothing.
  **3 is a refill floor, not a cap** - nothing is ever discarded. Extra-draw effects (`DRAW_CARDS`) and
  Graveyard returns can push a hand to 5; it then draws 0 next round. Playing cards is what earns
  next round's draws; hoarding above 3 delays them.
- **Round-start order (fixed, deterministic):** reset per-round flags -> `ROUND_START` triggers -> refill
  each hand (player, then enemy) -> Masteries -> Deploy. Masteries therefore act on an already-refilled hand.
- Drawing from an empty deck emits a fizzled `DRAW` event. **There is no deck-out loss condition** -
  a side with an empty deck simply stops drawing.
- Deck order is a plain array; draws take index 0, and return-to-deck pushes to the end.

## Heroes and combat

- **Heroes persist** on the board round after round until removed.
- Combat compares **effective Power** (base + any active Continuous Spell overlay in that lane).
- **Higher Power defeats lower Power.** The winner survives completely unchanged, at its **full
  current effective Power** - never chipped or reduced by the fight.
- **Overflow damage.** The losing Hero is destroyed, and the defending player takes direct damage
  equal to the **difference** between the winner's and loser's Power (`winner - loser`), dispatched as
  a dedicated `OVERFLOW_DAMAGE` event (see [Direct damage](#direct-damage)).
- **Equal Power destroys both**, and produces **no overflow damage** - there is no difference to deal.
- **Normal combat never chips Power.** There is no partial damage between Heroes themselves - a lane's
  combat either kills, kills both (with overflow to the loser's controller in the first case), or does
  nothing to the survivor.
- A Hero reduced to **Power <= 0** by any effect is destroyed. This is swept for at several points in
  the round (`sweepPowerZero`), not only at combat.

## Direct damage

- An **unopposed Hero** - one whose opposing Hero zone in the same lane is empty - deals direct damage
  to the enemy player equal to its current effective Power. This is unchanged by the overflow-damage
  rule above; it is a separate case (no opposing Hero to compare Power against at all).
- The amount goes through `directDamageAmount()`, which currently uses `DIRECT_DAMAGE_MODE =
  'FULL_POWER'`. `'HALF_POWER'` and `'CAPPED'` (cap 6) exist as alternatives and are **not** enabled.
  This is the rule flagged as most likely to need tuning once playtesting produces numbers.
- **Overflow damage** (a won combat's Power difference, see above) is a third, distinct source of
  player damage, carried by its own `OVERFLOW_DAMAGE` event rather than `DIRECT_DAMAGE`, so the event
  log and match stats can distinguish "hit because unopposed" from "hit because you lost a fight."
- Direct damage can also come from card effects (`PLAYER_DAMAGE`), and healing exists
  (`PLAYER_HEAL`).

## Spells

- **One-time Spells** resolve once in the Spells phase and go straight to the Graveyard, freeing
  their slot the same round. They never occupy a Spell zone at all - their lane is carried on the
  play itself.
- **Continuous Spells** activate once and then **stay physically in their Spell zone**, occupying it,
  until something removes them. A second Spell cannot be placed on top of an active Continuous Spell.
- A Continuous Spell does **not** re-cast every round. It does something after activation only if one
  of its own abilities has a recurring trigger (`ROUND_END`, `ON_ALLY_DEATH`, ...) or the special
  `CONTINUOUS` trigger.
- The `CONTINUOUS` trigger is a **live passive overlay**, never dispatched like other triggers.
  `effectivePower()` reads it fresh every time Power is needed, so removing the Spell makes its
  contribution vanish immediately - it can never be "baked in" to a Hero's stored Power.

## Effects can modify Power

- `CHANGE_POWER` with duration `PERMANENT` mutates a Hero's stored Power.
- `CHANGE_POWER` with duration `UNTIL_ROUND_END` also mutates stored Power but records the delta in
  `tempPower`, which is subtracted back off during round-end cleanup.
- A Continuous Spell's `CONTINUOUS` ability is the third kind: it **never** touches stored Power, it
  is summed live. A Hero's stored `power` is always its permanent/base value.

## Status effects and disruption

Rich-effects pass additions. Full primitive catalog is in
[CARD-SYSTEM.md](CARD-SYSTEM.md#conditions-tags-and-status-effects); this is the player-facing rule
summary.

- **Immunity** (`SPELL` or `HERO_EFFECT`) protects a Hero from a hostile targeted effect from that
  source - never from combat itself, and never from its own side's effects. It is always **live and
  condition-gated** ("while another Kingdom Hero is in play, immune to Spells") - it turns on and off
  automatically as the board changes, exactly like a Continuous Spell's Power bonus. A blocked effect
  logs `IMMUNITY_BLOCKED` and simply skips that one target; any other, non-immune targets of the same
  effect still resolve.
- **Destruction shield** is a one-time "the next time this Hero would be destroyed, prevent it"
  effect, from ANY source - a lost fight, a `DESTROY` Spell, a Power <= 0 sweep. It is consumed the
  first time it absorbs a destruction attempt and does not stack. It does **not** prevent combat
  overflow damage or Power loss - only the destruction itself.
- **Overflow damage reduction** is a separate, narrower defensive tool: it only reduces the overflow
  damage a Hero's controller takes when that Hero loses its own lane, by a flat amount (floored at 0).
- **Silence** suppresses a Hero's own abilities (including any immunity it grants itself) for the
  remainder of the round it was applied in. It does not touch Power or combat directly.

## Death triggers and Spell-play triggers

- Death triggers (`ON_DEATH`, `ON_ALLY_DEATH`, `ON_ENEMY_DEATH`) can now be gated **once per round**
  per ability instance - "the first time an enemy Hero dies each round" - rather than firing every
  time a chain produces multiple deaths in the same round.
- Every living Hero on both sides gets a chance to react whenever **any** Spell (one-time or
  Continuous, either side's) resolves, via `ON_ALLY_SPELL_PLAYED` (the caster's own side) or
  `ON_ENEMY_SPELL_PLAYED` (the opponent's) - "whenever you play a Spell, gain +1 Power this round."

## Graveyard and revival

- Destroyed Heroes and resolved one-time Spells go to the owner's **Graveyard** (an ordered array of
  card ids, destruction order).
- Graveyard-sourced effects **always choose automatically** - lowest Power, highest Power, or a
  uniformly random pick among every eligible card, optionally filtered by faction, never a manual pick
  (`pickEligibleFromGraveyard`).
- Revival patterns in use: revive from Graveyard into the ability owner's own lane (`REVIVE_TO_LANE`,
  capped by `maxPower` and optionally filtered by faction, fizzles if that lane's Hero zone is
  occupied - a Hero can never target its own lane this way, since it already occupies it; only a Spell
  can use this productively); a Hero reviving itself once at a fixed reduced Power (`REVIVE_SELF`);
  return to hand (`RETURN_TO_HAND`); return to deck (`RETURN_TO_DECK`); return the specific Hero that
  just died in this lane (`RETURN_DEATH_SOURCE_TO_HAND`).
- **Graveyard conditions** let an ability check the owner's (or the enemy's) Graveyard size, or how
  many cards of a given faction are in it, before acting - "if your Graveyard holds 3 or more Undead
  Heroes, revive the weakest one."
- **Exile** (`EXILE_FROM_GRAVEYARD`) permanently removes a Hero from the enemy Graveyard - not
  returned, not revivable, gone for the rest of the match. This is the counter to recursion engines.

## Targeting

- **Placement is targeting.** A card's ability declares a `TargetScope` and the engine resolves it
  automatically from where the card was placed. The player never picks a target.
- Scopes: `SELF`, `ALLY_SAME_LANE`, `ENEMY_SAME_LANE`, `ALL_ALLIES`, `ALL_ENEMIES`,
  `ADJACENT_ALLIES`, `ADJACENT_ENEMIES`.
- A play is `{handId, cardId, lane}`. There are **no target parameters anywhere in the action
  format** - not in the UI, not in the AI, not in the event log.
- A card that would need a target-selection UI is out of scope for this ruleset. "Lane movement" was
  deliberately not built for this reason.
- One generic exception guards obviously-dead placements: `spellHasAValidTarget()` blocks deploying a
  same-lane `DESTROY` / `DESTROY_SPELL_ZONE` Spell into a lane with no eligible target. It reads the
  ability's own target scope and `maxPower`, never a card id.

## FIGHT resolves the round

One press per round. No confirmation, no second cast step.

## Resolution sequence

As implemented in `resolveRound()`:

1. **Round start** (in `beginRound`, before the deploy UI) - reset every Spell zone's and every
   Hero's `usedThisRound` (backs `oncePerRound` gating) and `silenced` flag, dispatch `ROUND_START`
   for all zones, then each side refills its hand up to `HAND_REFILL_TARGET` (3), then Masteries fire.
2. **Deploy** - the player places cards; the AI picks its action.
3. **FIGHT** - both actions are validated, then:
4. **Reveal** - every played hand card leaves the hand; every Hero and Continuous Spell enters its
   zone, both sides, before any ability dispatches.
5. **Spells** - left, centre, right. One-time Spells resolve their effect (skipping any ability whose
   conditions aren't met - a conditional Spell effect can fizzle just like an unconditional one with
   no valid target) and go to the Graveyard; Continuous Spells fire their `ON_PLAY` and stay. Right
   after each Spell resolves, every living Hero on both sides gets a chance to react via
   `ON_ALLY_SPELL_PLAYED` / `ON_ENEMY_SPELL_PLAYED` (see "Spell-play triggers" below). Then a Power
   <= 0 sweep. **This is also where a Spell's `DESTROY` / `DESTROY_SPELL_ZONE` disruption lands**, so
   "destroy the opposing Continuous Spell before combat" is simply an ability on a Spell resolved here
   - no separate disruption phase exists.
6. **Hero On Play** - left, centre, right. Then a Power <= 0 sweep. A Hero's own `DESTROY` /
   `DESTROY_SPELL_ZONE` / `SILENCE` disruption lands here, for the same reason.
7. **Before Combat** - all zones, both sides. Most condition-gated Power swings (faction/tag/Graveyard
   presence, "did an ally die this round", ...) live on this trigger, since it's the last checkpoint
   before Power is compared.
8. **Combat** - per lane, comparing effective Power. A live PASSIVE `GRANT_IMMUNITY` or
   `REDUCE_OVERFLOW_DAMAGE` on the loser is read right here, before the winner deals overflow. A
   winning Hero deals overflow damage (`OVERFLOW_DAMAGE`) to the loser's controller equal to the Power
   difference (minus any live overflow reduction, floored at 0); unopposed Heroes deal full-Power
   direct damage (`DIRECT_DAMAGE`) here instead. Two lane-level exceptions: a **stalled** lane
   (`STALL_COMBAT`) has no combat at all (outcome `STALLED`), and a **bypassing** Hero (`GRANT_BYPASS`)
   skips the clash and deals reduced direct damage (outcome `PLAYER_DIRECT`/`ENEMY_DIRECT` with `bypass`).
9. **Deaths and death-trigger chains** - `ON_DEATH`, `ON_ALLY_DEATH`, `ON_ENEMY_DEATH`, resolved as a
   draining queue so chain reactions sweep in correctly. Both Heroes **and** Spell zones react to
   deaths. Before a Hero is actually removed here (from a combat loss, a `DESTROY`, or this sweep), an
   active destruction Shield (`GRANT_SHIELD`) is checked first - see "Status effects" below. Safety cap
   of 64 iterations, which emits a loud `SAFEGUARD_TRIPPED` event if ever hit.
10. **After Combat** - all zones.
11. **Round End** abilities - all zones. These fire **before** temporary-Power cleanup.
12. **Temporary effect cleanup** - `UNTIL_ROUND_END` deltas expire, unspent damage barriers
    (`PREVENT_NEXT_DAMAGE`) and stalled Heroes clear. Then a final Power <= 0 sweep,
    which catches round-end drain effects finishing off a weak Hero.
13. **Win check** - both at 0 HP is a draw; otherwise the side at 0 HP loses.

There is deliberately **no separate "disruption" or "destruction" phase**. A `DESTROY`,
`DESTROY_SPELL_ZONE` or `SILENCE` action is just an action on whichever trigger its card uses
(`ON_PLAY`, `BEFORE_COMBAT`, ...), so it always resolves within the existing phase for that trigger -
"destroy before combat" simply means putting the action on an `ON_PLAY` or `BEFORE_COMBAT` ability,
not a new step in the sequence.

**Ordering guarantees.** Within a phase, lanes resolve left -> centre -> right. Within a lane,
**initiative** breaks the tie between the two sides, and initiative alternates by round (`player` on
odd rounds, `enemy` on even) so neither side is favoured across a match. No phase ever depends on
animation timing.

**The event log is the engine's only channel to the UI.** `resolveRound` returns
`{nextState, events}`; the UI replays the already-decided `GameEvent[]` purely for animation
(`src/game/engine/replay.ts`). Determinism is enforced by tests: a seeded AI-vs-AI match replays
byte-identically, and the replay reducer must reconstruct the engine's own `nextState` exactly.

---

## Known documentation discrepancies

Recorded per the rule that **current working code wins**.

| Claim | Reality in code |
| --- | --- |
| "3 factions" | Four factions exist in the type system and card data: `kingdom`, `undead`, `infernal`, `wildborn`. Wildborn is excluded from the playtest roster and is not legal in a deck, but its cards are defined and covered by engine tests. |
| "One-time Spells occupy a Spell slot until they resolve" | They never occupy a Spell zone at all. Only Continuous Spells are placed into `spellZones`. A deployed-but-unresolved one-time Spell is a UI-side pending play. |
| "Continuous Spells re-cast each round" | They activate once. Recurring behaviour requires an explicitly recurring trigger, or the live `CONTINUOUS` overlay. |
| "Energy / cost" | `CardDefinition.cost` still exists in the data model and every card carries a value, but **nothing reads it**. `ENERGY_ENABLED` is `false`. Cost is not a rule. |
| Direct damage "may be capped" | The mode constant supports capping, but `FULL_POWER` is what is live. |
| Deck size 15 | Correct, but `SUPPORTED_DECK_SIZES` also lists 18 and 21; only 15 is enforced by `validateDeck()`. |
