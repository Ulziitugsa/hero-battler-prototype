# Moonwater collection and progression reframe

Status: **superseded in part on 2026-10-01 by the card-combat default (CARD-COMBAT-DESIGN.md section 16.5).** Card Mastery I–V is now the only card progression, on every collectible card: duplicates 1 / 2 / 3 / 4 plus 500 Gold (IV) and 1,500 Gold (V); a Unit gains HP Contribution +5 / 10 / 15 / 20%, never ATK; a Spell's Mastery is a collection mark. Legacy Level is retired from combat and UI, its Gold refunded once (`save/migrations.ts`). Deck Strength and Roster Power are removed; Home shows Starting HP and the next battle's difficulty. Tactics are hidden from the UI with their data kept. Renown stays design only. The audit below is the earlier record.

Earlier status: terminology applied on Home, Collection chrome and Profile; Card Mastery read model implemented; migration and Faction progression designed only.

This is Thread D of the collectible-card direction pass. It builds on [CARD-COMBAT-DESIGN.md](CARD-COMBAT-DESIGN.md) (which already renamed Ascension to "Card Mastery" on the inspect surface) and does not repeat it.

## Decisions in one place

1. **Players collect cards.** Named characters keep their names, lore, art and personality, but the thing you own, upgrade and put in a deck is a *card*. The card type is **Unit** (internally still `type: 'hero'`).
2. **"Mastery" means one thing: Card Mastery**, the per-card I–V ladder funded by duplicates. The account-wide equipped passive that used to be called "Mastery" (Fortification, Necromancy, Blood Pact) is now called a **Tactic** in the UI. Internal ids (`MasteryId`, `equippedMasteryId`, `skyloom:account`) are unchanged.
3. **Card Mastery stage = legacy Ascension rank + 1.** Mastery I is simply owning the card. The three authored Ascension ranks read as Mastery II–IV. Mastery V is reserved for the final effect and visual treatment. Nothing is stored for this; it is derived, so no save migration is needed to show it.
4. **Stars retire as a separate concept.** Five Mastery pips replace them. Stars are already derived (never stored), so there is nothing to migrate.
5. **Legacy card Level is frozen, not deleted.** It stays in the save and in combat until the combat migration. When it retires, the Gold players invested is refunded.
6. **Deck Strength is the only "power" number** players see. Roster Power stays as the internal function name.
7. **Account Level stays** and drives unlocks, Tactic Points, Gem milestones and cosmetic rewards, never stat multipliers.
8. **Faction progression is named Renown** (for example "Kingdom Renown · Level 8") so it cannot be confused with Card Mastery. It is designed here and not implemented.

## D1. Terminology

One term per context. Internal identifiers stay for save and analytics compatibility.

| Context | Player-facing term | Retired player-facing terms | Internal names kept |
| --- | --- | --- | --- |
| The bottom-nav tab and its screen | **Cards** | Heroes | `TabId 'heroes'`, `HeroesPage`, `styles/heroes.css` |
| Everything you own | **Collection** ("12 / 31 collected") | Roster | `game/collection`, `skyloom:collection` |
| The card type that fights in lanes | **Unit** | Hero | `type: 'hero'`, `HeroInstance`, `hero_*` events |
| The full-card detail surface | **Card Inspect** in docs and code; the player sees the card itself, with an "Inspect" affordance | Hero detail | `CardDetail`, `HeroDetail` |
| The single strength number for a deck | **Deck Strength** (Home, Campaign, Decks) | Roster Power, Collection Power, Battle Power | `rosterPowerForDeck`, `ROSTER_POWER_WEIGHTS`, `roster_power_changed` |
| Per-card duplicate progression | **Card Mastery**, shown as "Mastery II" | Ascension, Ascend, Stars, Star progress | `game/ascension`, `skyloom:ascension`, `hero_ascended`, `ascension_completed` |
| Per-card Gold progression | **Legacy Level** (only inside a collapsed legacy section) | Hero Level, level up a Hero | `game/heroLevel`, `skyloom:heroLevel`, `hero_levelled` |
| Account-wide equipped passive | **Tactic** and **Tactic Points** | Mastery, Mastery Points | `game/mastery`, `MasteryId`, `equippedMasteryId`, `masteryPoint*` |
| Player level | **Account Level** | Level (unqualified, where ambiguous) | `AccountState.level` |
| Per-faction meta progression | **Renown** (design only) | Faction Mastery | none yet |
| The deck taken into battle | **Active Deck** | Active Formation | `getActiveDeck` |
| Optional Campaign objectives | **Bonus seals** | Mastery seals | `encounter.objectives` |

"Deck Strength" is not a combat stat: it is a virtual summary used for Campaign recommendations. Card faces should show ATK and HP Contribution, not a per-card Deck Strength (see the handoff list).

## D2. Character identity

Nothing about a character is removed. Card definitions keep `name`, `shortName`, `role`, `tags`, lore (`cards/lore.ts`) and art. Copy should talk about the card while letting the character speak: "Infernal Lord · a Legendary card" rather than "a Legendary hero". Journey Day 1 now reads "A new card joins you".

## Legacy system audit

| System | Where | Stored | Read by combat? | Classification | Action |
| --- | --- | --- | --- | --- | --- |
| Collection copy counts | `game/collection` | `skyloom:collection` (v3) | Deck legality only | **Keep** | Core of the new direction. |
| Ascension (3 authored ranks on 6 of 31 Units) | `game/ascension` | `skyloom:ascension` (rank, duplicatesSpent) | Yes: rank adds or replaces abilities | **Keep, rebrand** as Card Mastery II–IV | Read through `game/cardMastery`. Author paths for the other 25 Units. |
| Stars | `ascension/stars.ts` | No (derived) | No | **Retire** | Replace with Mastery pips. No migration needed. |
| Hero Level (1–60, Gold) | `game/heroLevel` | `skyloom:heroLevel` | Yes: +1 Power at 30, +2 at 60 | **Freeze, then retire** | Already hidden in a collapsed "Legacy Level" section. Retire at the combat migration with a Gold refund. |
| Roster Power | `heroLevel/rosterPower.ts` | No (derived) | No | **Keep internally, shown as Deck Strength** | Reweight to Mastery stage once Level retires. |
| Account "Mastery" passive | `game/mastery`, `game/progression` | `skyloom:account` | Yes (engine/mastery.ts) | **Keep, rename to Tactic** | Done in the UI this pass. |
| Account Level and XP | `game/progression` | `skyloom:account` | No | **Keep** | See D6. |
| Level-up missions and Journey Day 4 | `missions/definitions.ts`, `journey/definitions.ts` | Mission progress | No | **Reword now, replace later** | Replace with Mastery or battle missions when Level retires. |
| Old Home sections | `pages/home/HomeSections.tsx` | No | No | **Remove later** | Only imported by `hubState.test.ts`; the live Home is `HomePage.tsx`. |

Two findings that affect the migration:

- **Legacy Level is the only Gold sink.** `spendGold` is called only by `heroLevel/levelUp.ts`. Retiring Level without a replacement leaves Gold with no use. The replacement has to land first: Shop products priced in Gold (Thread C), and optionally a small Gold cost on Mastery IV and V.
- **Ranked AI borrows the player's Ascension ranks.** `App.tsx` passes `ascensionRanksFor(rival.cardIds)`, which reads the player's own store for the rival's cards, and gives rival Units the player's average Level. That is a reasonable handicap-matching shortcut for AI Ranked, but it must not carry into real multiplayer.

## D3. Card Mastery

### Ladder

| Stage | Kind | Duplicate cost | Copies owned in total | What it does |
| --- | --- | --- | --- | --- |
| Mastery I | Base | 0 | 1 | The card as printed. Fully usable in every mode. |
| Mastery II | Small stat | 1 | 2 | A small ATK or HP Contribution step. |
| Mastery III | Effect | 2 | 4 | The first effect refinement. |
| Mastery IV | Prestige | 3 | 7 | A small stat step and a frame trim. |
| Mastery V | Final | 4 | 11 | The final effect refinement and the Moonlit treatment. |

The costs for II–IV are exactly today's `ASCENSION_DUPLICATE_COST` (1, 2, 3), so a migrated save lands on the same stage with the same copies invested. This is encoded as `PROPOSED_MASTERY_LADDER` and checked by tests.

### Bounds

- *Superseded by the simulation:* [CARD-COMBAT-DESIGN.md](CARD-COMBAT-DESIGN.md) section 7 recommends HP Contribution only (+5/10/15/20% at II–V) with no ATK step, because any ATK step wins same-card clashes outright. The original proposal follows.
- Numeric steps total about **+10% ATK and +10% HP Contribution at Mastery V**, never a multiplier. With the preview numbers in CARD-COMBAT-DESIGN.md (ATK 85–145), that is roughly +8 to +15 ATK. The exact values are a balance-review decision.
- Effect refinements follow the existing Ascension rule: they add reach, reliability or a condition to the card's own identity, never a new archetype.
- The six existing paths keep their authored content. Today every one of their ranks is an effect refinement, which is acceptable: those cards simply have no stat step until the combat migration. New paths use the template above.
- A maxed card must lose to a well-placed base card of the next Power band often enough to matter. That is the simulation check, run with the seeded sweep in `scripts/simulate-card-combat.mjs` once it is rule-complete.

### Implemented read model

`src/game/cardMastery/model.ts` exposes `getCardMasteryView(cardId)`, which returns everything a card face, a Collection tile or Card Inspect needs in one shape:

```ts
{
  cardId, owned, copies,
  stage,            // 0 = not owned, 1..5 = Mastery I..V
  label,            // "Mastery II"
  maxStage,         // 1 + authored ranks in this build
  hasPath,
  duplicatesInvested,
  nextStage, nextCost, spareCopies, canAdvance, blockedReason,
  pips: { filled, total: 5 },   // replaces Stars
  legacyLevel,
}
```

It reads the existing Collection, Ascension and Level stores and writes nothing. Advancing still goes through `ascendCard`, which keeps the existing guarantees: the last copy is never spent, and no copy needed by a playable deck is spent.

## D4. Duplicates

Today a duplicate of one of the 6 Units with a path funds Ascension. A duplicate of any other card only raises its derived Star count and otherwise does nothing.

Recommended model:

- **Duplicates fund Card Mastery, and nothing else, for now.** One number (copies owned) is the only resource. No new currency.
- **Cards without a path keep their duplicates.** Copies stay in the collection. The moment a path is authored, those copies are immediately spendable, because Mastery reads the live copy count. Inspect says "Mastery path coming later. Extra copies stay in your collection."
- **Priority content work:** author Mastery paths for the remaining 25 Units, starting with the Units in the three starter decks and the Moonfall Box chase cards, so duplicates from the finite Box always mean something.
- **Future, only if needed:** one dismantle currency (working name Moondust) for copies beyond Mastery V's 11. It stays out until players can actually exceed that, because a second resource for duplicates is exactly the complexity this pass is trying to avoid.

## D5. Stars and Ascension

- **Stars:** retire from the UI. They were a derived readout with two inconsistent formulas (rank-based for 6 cards, copy-based for the rest). Mastery pips are one formula for every card. `stars.ts` can stay until nothing imports it.
- **Ascension:** becomes Card Mastery. The storage key, `rank` and `duplicatesSpent` stay as they are. Code should read through `game/cardMastery`, so the store can be versioned later without touching screens.
- **Old saves:** remain valid. `sanitizeAscension` already clamps ranks to authored paths. Because stage is derived, a save from before this pass displays correctly with no conversion.

## Migration

Nothing is written in this pass. `planCardMasteryMigration(collection, ascension, levels)` produces a report of what a write-migration would do: per card, copies, Ascension rank, duplicates invested, resulting Mastery stage, legacy Level and the Gold invested in it, plus totals. It is pure and idempotent, and tests confirm it does not mutate its inputs.

When the combat migration is approved, the write-migration should:

1. Snapshot `skyloom:ascension` and `skyloom:heroLevel` to `skyloom:legacyProgress:v1` before anything else, and skip if that snapshot exists (idempotent).
2. Keep Ascension rank as Mastery stage − 1 (no change to its data).
3. Refund each card's `legacyLevelGold` as Gold, in one grant with a clear one-time notice. Gold only comes from play today, so a refund is honest and cannot be exploited.
4. Stop passing `heroLevels` into matches, and rebase Deck Strength weights on Mastery stage.
5. Record `planVersion`, the totals and the refund in analytics under a new event, keeping old event names intact.

Test cases before shipping: an empty save, a save with rank 3 on every path card, a save with Level 60 cards, a save whose spare copies are needed by a saved deck, and running the migration twice.

## D6. Account Level

Keep it. Current behaviour: 20 levels, linear XP (100, 150, 200 …), a Tactic Point at every even level, Gems at milestone levels, and a legacy cap on card Level (`3 × Account Level`).

Recommended role, in order of value:

- **Unlocks:** Tactics (already), Ranked (for example Account Level 5, after the Campaign teaches lanes), Friendly Battle, Boxes beyond the starter Box, deck slots.
- **Rewards:** Gems and Tickets at milestones (already), Home backgrounds, card backs and titles.
- **Missions:** unlock the weekly mission set at a low level.
- **Never:** universal ATK or HP multipliers. Deck Strength currently adds a flat 10 per Account Level. That is a virtual number and never reaches combat, so it can stay, but it should shrink relative to card-driven terms once Level retires.

## D7. Faction Renown (designed, not implemented)

Implementation was skipped as not cheap. It needs a new persisted store, a hook at match end in `App.tsx`/`GamePage.tsx`, reward granting and a Profile surface, and it overlaps the mission metrics Thread E is building. The design is ready to implement after Thread E's measurement layer lands.

- **Name:** "Kingdom Renown", "Undead Renown", "Infernal Renown". Level 1–20.
- **Earned by:** each Unit of that faction you play (1 point), and each win with a deck whose Units are mostly that faction (10 points). Both are measurable from match events the engine already emits. No points for losses beyond the per-card points, so there is nothing to farm by throwing matches.
- **Rewards:** Gold and Tickets on most levels; a faction card back at 5, a title at 10, a faction frame treatment at 15, and a faction Home background at 20. No combat stats at any level.
- **Storage:** `moonwater:renown:v1` holding `{ version, points: { kingdom, undead, infernal }, claimed: { [faction]: number[] } }`, with level derived from points. Mixed-faction archetype decks earn per-card points for every faction they play, so they are not punished.
- **Surface:** one row per faction on Profile, and a Renown line on Card Inspect for that card's faction. Not on Home.

## Handoff to Thread F

### Terminology changes on screens this thread does not own

| Where | Current | Should read |
| --- | --- | --- |
| `pages/HeroesPage.tsx` inspect sheet (Thread A) | Rule tag "Ascension" | "Mastery" |
| same | "Mastery II · saved Level 3 · 120 Deck Strength" | Mastery and copies only; drop per-card Deck Strength and move Level to the legacy section |
| same | `aria-label` "Previous hero" / "Next hero" | "Previous card" / "Next card" |
| same | `StarStrip` | Mastery pips from `getCardMasteryView().pips` |
| `components/CardDetail.tsx` (Thread A) | Its own `Stage I–V` numerals | `getCardMasteryView().label` |
| `pages/summon/RitualStage.tsx` (Thread C) | "Ascension ready", "Copy added toward Ascension", "Star progress +N", `aria-label="Ascension available"` | "Mastery ready", "Copy added toward Mastery", "Mastery progress" |
| `game/offers/definitions.ts` (Thread C) | "Gold, Gems, Tickets and a Hero" | "… and a card" |
| `components/AppShell.tsx` (shared nav) | Dot label "Reward or Mastery action ready on Home" | "Reward or Tactic Point ready on Home" |
| Card rules text (Thread A, `game/cards/*.ts`) | "this Hero", "allied Heroes" (68 strings) | "this Unit", "allied Units", in the new effect wording |
| `game/engine/mastery.ts` trigger details | "No Hero to shield", "No Hero in your Graveyard" | "No Unit …" (text only; do not change engine logic) |
| `components/LaneSlot.tsx` | "Drop hero" | "Drop Unit" |

### Shared files touched by this thread

None of the shared global types, `global.css`/token files, routes/nav, persistence modules or analytics event names were changed. New code lives in `src/game/cardMastery/`. Copy changed in `game/mastery/definitions.ts` (Tactic text only), `game/missions/definitions.ts` (titles only), `game/journey/definitions.ts`, `game/campaign/chapter1.ts` and `components/XpSummary.tsx`.

## Open product decisions

1. **Tactic** as the name for the equipped passive. Alternatives considered: Skill (too close to Duel Links), Rite, Doctrine.
2. **Renown** instead of the spec's "Faction Mastery", to keep "Mastery" unambiguous.
3. The stat values for Mastery II and IV, and whether Mastery IV and V also cost Gold (the Gold-sink question above).
4. Whether Collection should list Spells. The Cards screen currently shows the 31 Units only; 21 Spells are collectible but not browsable there. Recommended yes, with a Units / Spells type filter, once Thread A's standard card face renders Spells.
5. The Account Level at which Ranked unlocks.
