# Card system

Describes the **existing implementation** - the card data model as it is actually built in
`src/game/`, not a theoretical future engine. Rules context is in [CORE-RULES.md](CORE-RULES.md);
the visual card frame is in
[../design/DESIGN-SOURCE-OF-TRUTH.md](../design/DESIGN-SOURCE-OF-TRUTH.md) section 6.

---

## Card definition

Every card - Hero or Spell - is one `CardDefinition` (`src/game/types/index.ts`):

```ts
interface CardDefinition {
  id: string;          // stable, prefixed: kng- / und- / inf- / wld- / spl-
  name: string;
  shortName: string;   // used on board chits so nothing truncates mid-word
  faction: Faction;
  type: 'hero' | 'spell';
  spellKind?: 'ONE_TIME' | 'CONTINUOUS';  // Spells only
  role: string;        // "Fighter", "Support", "Spell" - flavour/UI only, never read by the engine
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  cost: number;        // kept for a future cost system; NOTHING reads it (ENERGY_ENABLED = false)
  power?: number;      // Heroes only
  tags: string[];      // "Human", "Knight", "Spell" - flavour/UI only
  abilities: AbilityDefinition[];
  boardText?: string;  // short battlefield reminder text, see "Battlefield effect summaries" below
}
```

Cards are looked up by **id, never by display name**. `src/game/cards/index.ts` builds the lookup;
`validate.ts` enforces card shape (a `validate.test.ts` suite runs it over every card).

### Hero cards

- Carry `power`; current roster range is **3 to 7**.
- Occupy a lane's **Hero zone** and persist there between rounds.
- The runtime instance (`HeroInstance`) adds `instanceId`, and `tempPower` - the portion of `power`
  that came from `UNTIL_ROUND_END` effects, subtracted back off at round end.

### Spell cards

- No `power`. Carry `spellKind`.
- **One-time** (`ONE_TIME`): resolves in the Spells phase, then straight to the Graveyard. Never
  occupies a Spell zone.
- **Continuous** (`CONTINUOUS`): enters the lane's **Spell zone** at Reveal, activates once, and stays
  until removed. Blocks any further Spell placement in that slot.
- The runtime instance (`SpellZoneInstance`) adds `instanceId` and `usedThisRound`, which backs
  once-per-round reactions and resets for every Spell zone at Round Start.
- **Spells are faction-neutral in play.** Every Spell carries a faction for flavour and filtering, but
  any deck may include any Spell.

## Abilities - data-driven, no per-card engine code

An ability is data, and the engine has **no card-specific branches**:

```ts
interface AbilityDefinition {
  trigger: Trigger;
  conditions?: ConditionDef[];   // all must pass (AND); omit for unconditional
  actions: ActionDef[];
  text: string;                  // player-facing; must describe an automatic target, never "choose"
  oncePerRound?: boolean;        // gate: fires at most once per round for this instance - see below
}
```

**Triggers** - `ON_PLAY`, `ROUND_START`, `BEFORE_COMBAT`, `AFTER_COMBAT`, `ON_DEATH`,
`ON_ALLY_DEATH`, `ON_ENEMY_DEATH`, `ON_DIRECT_DAMAGE`, `ON_ALLY_SPELL_PLAYED`,
`ON_ENEMY_SPELL_PLAYED`, `ROUND_END`, `CONTINUOUS`, and `PASSIVE`.

`CONTINUOUS` and `PASSIVE` are both special: **neither is ever dispatched**. `effectivePower()` reads
`CONTINUOUS`-trigger abilities (Spell zones only) live, every time Power is needed; the immunity and
overflow-reduction helpers read `PASSIVE`-trigger abilities (Heroes only) live, at the moment a
hostile effect resolves its targets or overflow damage is about to be dealt. That is the difference
between a passive/live-conditional effect and a recurring triggered one, and it is a real mechanical
distinction, not flavour - see "Conditions, tags and status effects" below.

`ON_DIRECT_DAMAGE` fires only for `DIRECT_DAMAGE` events (an unopposed Hero hitting the enemy player,
or a `PLAYER_DAMAGE` action). Combat overflow damage - the Power difference a won fight deals to the
loser's controller - is its own event, `OVERFLOW_DAMAGE` (see
[CORE-RULES.md](CORE-RULES.md#direct-damage)), and does **not** dispatch `ON_DIRECT_DAMAGE`. This is
deliberate: giving an `ON_DIRECT_DAMAGE` card (currently just Infernal's Flame Imp) a brand-new
trigger source from ordinary combat would be an implicit rebalance, not a mechanics change - if a
future card wants to react to overflow damage specifically, that's a new trigger to add on purpose.

`ON_ALLY_SPELL_PLAYED` / `ON_ENEMY_SPELL_PLAYED` are dispatched to **every living Hero on both
sides**, right after any Spell (one-time or Continuous) resolves in the Spells phase - `ALLY` to the
caster's own side, `ENEMY` to the opponent's. A Hero reacting to its own side playing a Spell targets
`SELF` the same way any other triggered ability does.

**`oncePerRound`** is a general-purpose "the first time X happens this round" gate, checked against
the ability's own instance (`HeroInstance.usedThisRound` / `SpellZoneInstance.usedThisRound`, both
reset at every `ROUND_START`) rather than a condition + a hand-rolled action pairing. Once an
`oncePerRound` ability fires, it won't fire again until next round, even if the same trigger dispatches
multiple times in one round (e.g. two enemy Heroes dying) - see Undead's Grave Knight ("the first time
an enemy Hero dies each round, heal 2"). The pre-existing `SPELL_ZONE_NOT_USED_THIS_ROUND` condition
(Grave Totem) is the same idea applied by hand, kept as-is rather than migrated.

## Conditions, tags and status effects

**Board-presence and count conditions** - `LANE_EMPTY_ENEMY_SIDE` / `LANE_OCCUPIED_ENEMY_SIDE`,
`SELF_LANE_OCCUPIED`, `SELF_LANE_HAS_SPELL` / `ENEMY_LANE_HAS_SPELL`, `SELF_LOSING_LANE` /
`SELF_WINNING_LANE`, `ADJACENT_ALLY_PRESENT`, `ALLY_FACTION_PRESENT` / `ENEMY_FACTION_PRESENT`,
`ALLY_TAG_PRESENT` / `ENEMY_TAG_PRESENT`, `ALLY_HERO_COUNT_AT_LEAST`,
`ALLY_FACTION_COUNT_AT_LEAST`, `GRAVEYARD_COUNT_AT_LEAST` / `GRAVEYARD_FACTION_COUNT_AT_LEAST`
(both take an optional `side: 'SELF' | 'ENEMY'`, default `SELF`), `HAND_SIZE_AT_LEAST` /
`HAND_SIZE_AT_MOST`.

**Round-local history conditions** - `ALLY_DIED_THIS_ROUND`, `ENEMY_DIED_THIS_ROUND`,
`SPELL_PLAYED_THIS_ROUND`, `CONTINUOUS_SPELL_DESTROYED_THIS_ROUND` (the latter two also take an
optional `side`). These are **not** a persisted flag anywhere in `GameState` - they scan the current
`resolveRound()` call's own event log so far (`ctx.events`) for a matching `HERO_DESTROYED` /
`SPELL_RESOLVED` / `SPELL_ZONE_DESTROYED`, which is naturally "since this round started" and needs no
extra state or replay support.

**`tags: string[]`** on `CardDefinition` (already part of the base data model - "Human", "Knight",
"Undead", "Demon", "Beast", ...) is what `ALLY_TAG_PRESENT` / `ENEMY_TAG_PRESENT` read. No separate
traits field was added; the existing flavour tags became load-bearing instead.

Combining conditions is how card-specific behaviour is expressed without card-specific code - e.g.
Grave Totem's "the *first* ally that dies in this lane, once per round" is `DEATH_IN_SELF_LANE` +
`SPELL_ZONE_NOT_USED_THIS_ROUND`; Dark Priest's "+2 Power if your Graveyard holds 3+ cards" is a
single `GRAVEYARD_COUNT_AT_LEAST` on a `BEFORE_COMBAT` ability.

**Status effects** - three reusable, engine-level mechanics, never a card-name branch:

- **Immunity** (`GRANT_IMMUNITY`, `immunity: 'SPELL' | 'HERO_EFFECT'`) - `PASSIVE`-trigger only,
  always `target: 'SELF'` on every current card. Read live by `hasImmunity()` at the moment a hostile
  action (`DESTROY`, `SILENCE`, `SET_POWER`, or a negative `CHANGE_POWER` / `CHANGE_POWER_BY_COUNT` /
  `DEBUFF_ALL_OTHERS`) resolves its enemy-side targets; a blocked target is dropped from that action's
  target list and an `IMMUNITY_BLOCKED` event is pushed. `SPELL` immunity matches a hostile action
  whose ability came from a Spell (`AbilityContext.sourceKind === 'spell'`); `HERO_EFFECT` immunity
  matches one from a Hero (including that Hero's own `ON_DEATH`). Never blocks combat itself, and
  never blocks your own side's effects.
- **Destruction shield** (`GRANT_SHIELD`) - sets `HeroInstance.shielded`. Checked in the single choke
  point every destruction path already funnels through (`removeAndRecord`, called by `destroyAndChain`
  from a combat loss, a `DESTROY` action, or a Power <= 0 sweep): if shielded, the Hero survives, the
  shield flips back to `false`, and a `SHIELD_CONSUMED` event replaces `HERO_DESTROYED`. Granting it
  again while already shielded is a no-op.
- **Overflow damage reduction** (`REDUCE_OVERFLOW_DAMAGE`, amount) - `PASSIVE`-trigger only, read live
  by `overflowReductionFor()` right before `dealOverflowDamage()` is called for the loser's lane.
  Stacks additively with itself if a Hero somehow had more than one source; floored at 0 overall.
- **Silence** (`SILENCE`) - sets `HeroInstance.silenced`, reset at the next `ROUND_START`. A silenced
  Hero's own `dispatchTriggerForHero` calls short-circuit immediately (no ability of any trigger
  fires, including a live `PASSIVE` immunity check), and its own `ON_DEATH` is skipped too if it dies
  while silenced. It never touches Power or combat directly.

Five small events back these: `IMMUNITY_BLOCKED` (informational only - no state change), `SHIELD_GRANTED`
/ `SHIELD_CONSUMED`, `SILENCED`, and `ONCE_PER_ROUND_USED` (carries `zone: 'hero' | 'spell'` so the
replay reducer knows which instance's `usedThisRound` to flip). All five replay deterministically, the
same as every other `GameEvent` - see `replay.test.ts` / `richEffects.test.ts`.

**Actions** - `CHANGE_POWER`, `SET_POWER` (absolute value, not a delta), `CHANGE_POWER_BY_COUNT`
(scales with `ALLY_HERO_COUNT` / `ALLY_FACTION_HERO_COUNT` / `GRAVEYARD_COUNT` /
`GRAVEYARD_FACTION_COUNT` via `perCount`), `DESTROY` (optionally gated by `maxPower`),
`DESTROY_SPELL_ZONE`, `SILENCE`, `GRANT_SHIELD`, `GRANT_IMMUNITY`, `REDUCE_OVERFLOW_DAMAGE`,
`RETURN_TO_HAND`, `RETURN_TO_DECK`, `RETURN_DEATH_SOURCE_TO_HAND`, `REVIVE_TO_LANE` (now also
faction-filterable, like `RETURN_TO_HAND`), `REVIVE_SELF`, `PLAYER_DAMAGE`, `PLAYER_HEAL`,
`DEBUFF_ALL_OTHERS`, `EXILE_FROM_GRAVEYARD`. `SET_POWER` and `CHANGE_POWER_BY_COUNT` reuse
`CHANGE_POWER`'s `PERMANENT` / `UNTIL_ROUND_END` duration split and push the same `POWER_CHANGED`
event - no new Power-change event type was needed.

## Battlefield effect summaries - `boardText`

A card with at least one ability may carry an optional `boardText: string` - a short (roughly
1-2 line, ≤30 character) reminder of what it does, rendered directly on its battlefield chit
(`BoardChit.tsx` for Heroes, `SpellZoneChit.tsx` for Spells) so a player scanning the board doesn't
have to tap every card to remember its effect. Examples: `"+2 with Undead ally"`, `"Spell Immune"`,
`"On Death: Return"`, `"On Play: Destroy Spell"`.

This is deliberately **data, not JSX branching** - there is no per-card rendering logic in either
chit component. Both components render the same way: if `card.boardText` is set, show a footer with
the name plus the summary line; if it is unset (a vanilla card with no abilities, e.g.
`kng-common-knight`), fall back to the original bare name treatment with no empty/broken footer.

`boardText` is a short reminder only - it never replaces the ability's full `text`. Tapping a card
(on the battlefield or in the Graveyard) always opens Card Detail, which shows the complete rules
text from `abilities[].text`.

## Automatic targeting - `TargetScope`

Every targeted action declares a scope, resolved automatically from the ability owner's own side and
lane. **The player never picks a target, ever.**

| Scope | Resolves to |
| --- | --- |
| `SELF` | The ability owner's own position |
| `ALLY_SAME_LANE` | Own side, own lane |
| `ENEMY_SAME_LANE` | Opposing side, own lane |
| `ALL_ALLIES` | Own side, all three lanes |
| `ALL_ENEMIES` | Opposing side, all three lanes |
| `ADJACENT_ALLIES` | Own side, lanes adjacent to own |
| `ADJACENT_ENEMIES` | Opposing side, lanes adjacent to own |

A play is `{handId, cardId, lane}` - there are no target ids in the action format, the event log, or
the AI. Graveyard-sourced effects choose automatically too: `GraveyardPick` is `LOWEST_POWER`,
`HIGHEST_POWER`, or `RANDOM` (uniformly among every eligible card, ignoring Power - for a "return a
random X" effect rather than "the biggest/smallest X"), optionally filtered by faction.

## Graveyard - visible and inspectable

The Graveyard (`state[side].graveyard: string[]`, an ordered array of card ids in destruction order -
see [CORE-RULES.md](CORE-RULES.md#graveyard-and-revival) for the underlying rule) is a real,
player-facing system, not just engine bookkeeping:

- The player's Graveyard count in `SideHeader` is a tappable button that opens `GraveyardSheet`, a
  bottom sheet (not a new nav page) listing every card currently in the Graveyard, most-recently-lost
  first. Each row shows the card's art (or the usual faction placeholder), name, type (Hero / Spell /
  Continuous Spell), faction sigil, and Power for Heroes.
- The **opponent's Graveyard is inspectable too**, from a tab in the same sheet - Graveyard contents
  are treated as public information for now. This may need revisiting if a future card explicitly
  hides Graveyard information, but nothing in the current roster does.
- Tapping a Graveyard row opens the same Card Detail view as tapping a battlefield card - full rules
  text, not just the summary row.
- An empty Graveyard shows a plain icon + "Nothing here yet." rather than disabling the tab or the
  pill.
- **Lifecycle**: a card enters the Graveyard when a Hero is destroyed or a one-time/Continuous Spell
  resolves/is destroyed, and it **leaves** the moment a revival or return effect
  (`REVIVE_TO_LANE`, `REVIVE_SELF`, `RETURN_TO_HAND`, `RETURN_TO_DECK`,
  `RETURN_DEATH_SOURCE_TO_HAND`) removes it - the array holds each card id by reference to its single
  location, so a card can never appear in the Graveyard and its destination zone at once.
- **Exile remains a separate mechanic.** `EXILE_FROM_GRAVEYARD` removes a card from the Graveyard array
  entirely (not into any zone) and it is gone for the match - Exiled cards are not shown in
  `GraveyardSheet`, by construction, since they're no longer in the array.

## Power modifiers - three distinct kinds

| Kind | How | Where it lives |
| --- | --- | --- |
| **Permanent** | `CHANGE_POWER` duration `PERMANENT` | Mutates the Hero's stored `power` |
| **Temporary** | `CHANGE_POWER` duration `UNTIL_ROUND_END` | Mutates stored `power`, records the delta in `tempPower`, subtracted back at round-end cleanup |
| **Continuous** | A `CONTINUOUS`-trigger ability on an active Spell zone | Never stored. Summed live by `effectivePower()` from both sides' Spell zones at that lane |

`effectivePower(state, side, lane)` = stored `power` + `computeContinuousBonus(...)`. It is the
single definition of "how strong is this Hero right now", shared by combat, direct damage, death
checks and board display (`withEffectivePowers()` gives the UI a display copy where `.power` is
already effective). Recomputing rather than caching is fine at three lanes.

## Rarity

Four tiers: `common`, `rare`, `epic`, `legendary`.

**Rarity is a design lens, not a Power tier.** A Legendary is not simply a bigger stat line - the
Kingdom Paladin only gets its +4 when it would otherwise *lose* its lane, making it a defensive
comeback tool. Rarity says what a card is meant to *do*.

Rarity has exactly two mechanical consequences: the deck copy limit, and (visually) the frame
treatment. It is not read anywhere else in the engine.

## Factions

| Faction | In roster | Gameplay identity |
| --- | --- | --- |
| `kingdom` | Yes, 11 cards | Knights, priests, archers. Buffs, protection, board control, reliable Heroes |
| `undead` | Yes, 10 cards | Skeletons, priests, necromancers. Death as a resource - On Death payoffs, graveyard recursion, revival |
| `infernal` | Yes, 11 cards | Demons, fire, corrupted warriors. Aggression, direct damage, Power reduction, risky high-impact effects |
| `wildborn` | **No** | Beasts and nature spirits. Growth, high Power. Defined in `wildborn.ts` and exercised by engine tests, but excluded from the playtest roster and illegal in a deck |

**Counters, not hard-counters** is the design goal: Kingdom's buffs out-race Infernal burst if the
board stays full; Infernal removal and Soul Burn's Exile can kill an Undead engine before it
snowballs; Undead recursion out-values a long Kingdom grind. None of the three should be an automatic
matchup win - that is what the playtest phase exists to test, not assert.

## The playtest roster - Card Set v0.1

`src/game/cards/roster.ts` is the single source of truth for "the playtest set". The Collection
screen, the Deck Builder pool and deck validation all read from `PLAYTEST_ROSTER`.

> **Update:** the roster is now **52 cards** (18 Kingdom, 16 Undead, 18 Infernal; 31 Heroes, 21
> Spells) after the card-pool expansion - new archetypes (Mage, Mage Slayer, Beast, Trickster), general
> cards, tokens and the new effect primitives are documented in [ARCHETYPES.md](ARCHETYPES.md). The
> original 32 are listed below; the expansion cards are appended to each faction's roster list.

**32 cards** (original set): 11 Kingdom, 10 Undead, 11 Infernal.

| Split | Count |
| --- | --- |
| Heroes | 18 |
| Spells | 14 (8 one-time, 6 continuous) |
| Common | 10 |
| Rare | 13 |
| Epic | 6 |
| Legendary | 3 |

38 cards are *defined* in the card files. Six are deliberately out of the roster: the four Wildborn
cards plus two inherited Phase 0.4 Spells (`spl-execute`, `spl-death-wave`, `spl-growth-totem`).
They stay in the code because engine tests reference them; they are not shown in Collection or Deck
Builder and are rejected by `validateDeck()`.

## Deck rules

`src/game/engine/deckRules.ts` - all limits are configurable constants in one place, and
`validateDeck()` is the single source of truth called by the Deck Builder, the start-battle gate, and
a starter-deck self-check at module load.

- **Deck size: exactly 15** (`DECK_SIZE`).
- **Max copies of one card: 2** (`MAX_COPIES`).
- **Max copies of a Legendary: 1** (`MAX_LEGENDARY_COPIES`).
- Every card must be in `PLAYTEST_ROSTER` - enforced defensively even though the Deck Builder never
  offers anything else.

A deck is a **flat list of card ids, one entry per copy**.

## Decks available to the player

`src/game/engine/deckOptions.ts` merges:

- Three **starter decks**, one per roster faction (`src/game/cards/starterDecks.ts`), also used as the
  AI opponents.
- Anything the player saved in the Deck Builder, persisted in `localStorage`
  (`src/game/engine/localDecks.ts`).

## What the card system does not have

- **No image field.** `CardDefinition` has no art slot; cards render a CSS placeholder keyed off
  faction. Adding a drop-in image slot is prerequisite work for real artwork - see P2 in
  [../design/UI-REDESIGN-BACKLOG.md](../design/UI-REDESIGN-BACKLOG.md).
- **No cost enforcement.** `cost` is carried on every card and read by nothing.
- **No ownership, unlocking, upgrades or duplicates.** All 32 roster cards are available to everyone;
  this is a card *browser*, not a collection system.
- **No card-specific engine code.** If a new card needs behaviour the primitives cannot express, that
  is a deliberate new primitive, added to `ConditionDef` or `ActionDef` - never a branch on
  `card.id`.
