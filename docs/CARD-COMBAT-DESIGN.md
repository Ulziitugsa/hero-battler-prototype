# Moonwater card combat and progression direction

Status: **design and prototype only**. This is the current design source for moving Moonwater from a Hero RPG presentation toward a collectible-card, three-lane battler. Combat rules, production card values, and save migration are not approved by this document. The previous per-unit-HP proposal is historical; see [COMBAT-V2-DESIGN.md](COMBAT-V2-DESIGN.md).

## Design goals

- Make each collectible read as a card first: original pixel art, name, faction, rarity, concise rules text, and prominent **ATK** and **LP** for unit cards.
- Keep the three-lane placement and readable simultaneous clashes. Do not add a separate HP bar to every unit.
- Let players inspect a card from Collection, deckbuilding, hand, board, graveyard, and pack reveals using the same full-card detail surface.
- Treat LP as the card's contribution to the player's starting Life, not as unit health. Candidate rules should make ATK matter in lane clashes and direct damage while LP expresses a deckbuilding tradeoff.
- Keep card effects strategic. Do not let long-term numeric progression swamp placement and effects.
- Preserve existing saves and provenance identifiers until a tested migration is designed.

## Current repository audit

The curated `PLAYTEST_ROSTER` contains **52 cards: 31 units and 21 spells**, across Kingdom, Undead, and Infernal. The roster is intentionally curated; `ALL_CARDS` also includes older Wildborn and other prototype definitions that are not part of the normal playtest surface. Spells are faction-neutral for deck legality. The three faction starter decks and five reference archetype decks are existing data; archetypes deliberately mix factions.

Current card records use `type: 'hero' | 'spell'`, `power` on units, `spellKind` on spells, rarity, faction, tags, data-driven triggered abilities, and player-facing ability text. The term **Hero** survives in internal type names, storage keys, event names, and code APIs. The visible navigation and primary Collection surfaces now say **Cards**. Keep serialized IDs, analytics/event names, and save keys stable during future terminology work; update user-facing copy in small, auditable passes.

The shared `CardDetail` now presents a full inspect surface with card identity, rarity, faction, effect trigger labels and text, ownership, acquisition, and existing duplicate-funded progression. Unit faces can show the experimental stat pair behind the local `?cardPreview=1` flag. The preview uses the existing card art and does not change battle resolution. The numbers are a translation for layout review only:

```text
ATK = 40 + 15 × current Power
LP  = max(45, 145 − 10 × base Power)
Deck Life = sum of LP for unit cards in the deck
```

This yields ATK values 85, 100, 115, 130, 145 and LP values 115, 105, 95, 85, 75 for Power 3–7. Buffed Power changes preview ATK; LP is fixed by base Power. Do not interpret these as tuned or approved production values.

## Combat prototype and simulation

Run `node scripts/simulate-card-combat.mjs` to load the live curated roster, starter decks, and archetype decks through Vite and run a deterministic 100-seed matchup sweep. The prototype uses three lanes, simultaneous clashes, ATK direct damage, and deck starting Life equal to the unit LP sum. It reports deck shape and Life as well as matchup results.

The current run gives starter decks 11 units / 4 spells and 1,085–1,145 Life. The deliberately constructed spell-heavy example is 8 units / 7 spells and 840 Life. Aggressive and defensive 12-unit examples have 1,080 and 1,310 Life respectively. These are formula outputs, not recommendations.

The baseline excludes spell effects and all triggered unit effects. Its simple lane refill/attrition loop also generated extreme matchup outcomes (many 100–0 sweeps), making its win rates unsuitable for balance decisions. This is a failure signal for the baseline, not evidence that one strategy is balanced or dominant. Use the script for reproducible range checks only, then replace the match loop with a rule-complete prototype before using win rate, time-to-lethal, or effect power to tune values.

### Rules to compare in the next prototype

Keep each candidate explicit and run the same seeded deck pool for all candidates:

1. **Lane contest:** compare effective ATK simultaneously. A winning unit stays; the defeated unit is removed. Test tie behavior separately (both removed versus neither removed) because it strongly changes board stability.
2. **Direct pressure:** an unopposed unit damages opposing Life by ATK or by a capped/fractional amount. Compare uncapped ATK, 75% ATK, and a smaller cap; record turns to lethal and whether a single open lane ends games too quickly.
3. **Life budget:** compare fixed starting Life against the sum of unit LP. Summed LP makes a spell-heavy deck trade away both blockers and Life, so test whether that compounds the cost of spells unfairly.
4. **Spell opportunity cost:** model each spell's actual effect and timing. Do not assign generic spell value based only on card count.
5. **Progression:** compare no numeric Mastery bonus with bounded ATK and LP variants. Include equal-rank mirror matches and uneven-rank matches, then inspect game length and first-player effects.

Report matchup matrix, average/median rounds, direct damage by lane, units removed, ties, spells played, and win rates with confidence intervals. Include random, starter, and strategy archetypes, not only hand-picked high/low stats. Keep the experiment behind a flag until the rules have been reviewed.

## Effects conversion audit

The current engine uses effect actions that assume Power and persistent units: Power changes/set/count modifiers, conditional destruction, silence, shields, immunity, overflow reduction, returns to hand/deck, revival, player damage/heal, debuffs, and graveyard exile. Triggers include play, round boundaries, before/after combat, death, spell play, direct damage, continuous, and passive. Several effects target current lanes, board counts, graveyards, or existing Hero/Spell zones.

Each card's wording and action must be reviewed individually during the rules prototype. Likely conversion families:

| Existing effect family | Questions for card-combat rules |
| --- | --- |
| Power buffs/debuffs and count scaling | Does it modify ATK until clash, permanently, or only for direct damage? What is the maximum? |
| Destroy / return / revive | Does “unit” removal happen before or after simultaneous clash? Can a removed unit still deal damage? What object can be revived? |
| Shields, immunity, silence | Which targeting and removal rules do these protect against? Does a shield stop combat defeat or only an effect? |
| Player damage/heal and overflow | How does this interact with deck Life and direct ATK? Set a per-turn cap only if testing shows runaway damage. |
| Spell-zone and spell-play reactions | Keep a distinct spell lifecycle if effects depend on persistent spells; specify timing and once-per-round behavior. |
| Graveyard, return, and exile | Decide whether deck recycling is allowed, how duplicate copies are tracked, and which states are public. |

Preserve triggers and card identity where possible. Rewrite rules text only after a corresponding mechanical definition exists. Do not silently change a trigger's event source or make all old Power effects permanent ATK changes.

## Collection, duplicates, and Mastery

The current collection is copy-count based. Summon grants copies to the collection; deck legality reads those counts. Ascension is already a duplicate-funded progression path for supported cards: it spends spare copies, retains at least one, protects copies needed by playable decks, records rank in the existing Ascension store, and applies defined ability evolutions. Stars are derived from Ascension rank; they are not an independent upgrade currency. Cards without an Ascension path remain collectible/playable duplicates.

The new inspect presentation calls this progression **Card Mastery**. This is a presentation label over the existing pathway, not a storage migration. A future Mastery redesign should test a bounded contribution: identity/art at the base stage, a small number of ability refinements, and at most a modest numeric ceiling if simulations show it is safe. Do not mechanically map every card to five stages: existing paths have different support and rank limits. Preserve the existing cost, spare-copy checks, and deck-use protection until replacement rules have passing migration tests.

Hero Level remains in the save under the legacy `skyloom:heroLevel` key and can add up to +2 legacy battle Power. Roster Power is a summary derived from base Power, Level, Ascension rank, and account level; it is not an independent combat unit. The UI now presents the overall value as **Deck Strength**. Do not delete levels or rank data. Before removing Level from combat, build a versioned migration that retains the original data, reports what was converted, and can be replayed safely. Account level may continue to drive unlocks and rewards independently of card combat.

## Finite Box proof of concept

The dev-only Test Economy panel uses a separate, explicit 100-pack finite pool (500 physical cards, five per pack): 250 Common, 150 Rare, 75 Epic, and 25 Legendary, distributed evenly per rarity across the curated eligible cards. `open 1` and `open 10` remove actual copies from that pool; each result grants copies through the existing collection grant path, so new and duplicate pulls use the same collection and Mastery eligibility as other grants. Draw order is deterministic from the stored pool seed/state. Opening an empty box does not silently refill it. An explicit confirmed reset restores the test pool while preserving collection ownership.

This is a development proof of concept, not a live offer. It displays the exact initial and remaining distribution. It does not display probability claims or add pity. Any future player-facing finite pack should show the remaining inventory and exact card counts, define whether a pack can contain a duplicate, and persist box state server-side before it is used across devices.

## Save and rollout rules

- Keep current card IDs, collection copy counts, deck definitions, `skyloom:*` storage keys, and historical event names intact.
- Do not rewrite historical Embervale/Skyloom provenance or save-compatibility identifiers.
- Keep the current resolver as the default. Per-unit HP Combat V2 stays experimental and is not promoted by this card-frame work.
- Keep `?cardPreview=1` and the finite Box panel development-only. Do not treat their preview values or pools as production economy data.
- Before replacing Hero Level/Ascension behavior, implement an idempotent, versioned migration and tests for old saves, missing fields, max-rank cards, duplicate inventory, and playable decks.

## Current work boundaries

This pass changes visible card terminology and inspect presentation, adds a local card-stat frame preview and finite Box prototype, and documents a simulation direction. It does not change the production combat resolver, live summon odds, live progression costs, or saved player state.
