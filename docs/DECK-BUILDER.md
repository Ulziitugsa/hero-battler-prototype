# Deck Builder

Status: prototype. The Deck Builder is the Decks tab (`src/pages/DecksPage.tsx`). Deck rules are unchanged: 15 cards, max 2 copies, max 1 of each Legendary (`game/engine/deckRules.ts`).

## Starting HP

`game/decks/deckSummary.ts` computes **Starting HP** as the sum of every Unit copy's **HP Contribution**. HP Contribution comes from the current card-model prototype (`cardStatsPreview(card).lp`, see [CARD-COMBAT-DESIGN.md](CARD-COMBAT-DESIGN.md)); Spells contribute nothing. Base card stats are used (no Level/Ascension), so a deck shows the same number for every player.

This is the intended collectible-card value. Production combat still starts every player at `STARTING_HP` (20) until the card-combat migration is approved, and the Deck Builder says so when the Starting HP badge is tapped. Nothing in this module feeds the resolver.

The deck summary line also shows Units, Spells, average base ATK, and Unit count per faction.

## Search, filters, sort

`game/decks/cardPool.ts` is one pure query used by the editor's card pool:

- **Search** matches every typed word against name, short name, role, Unit/Spell, faction, rarity, tags, board text and full effect text.
- **Filters** (AND): type, faction, rarity, ownership (Owned / All / Missing), favorites only. Unowned cards appear locked and open Card Inspect instead of being added.
- **Sort**: default (Units, rarity, name), ATK, HP Contribution, rarity, recently obtained, name. ATK and HP sorts show that value on each tile.

## Favorites and "recently obtained"

`game/collection/cardMarks.ts` stores favorites and each card's last-obtained time under a new key, `skyloom:cardMarks`. The collection's copy-count model and save version are untouched; an old save simply has no marks. `grantCard` records the obtain time, so cards owned before this change sort after dated ones under "Recently obtained". `resetEverything` clears the key.

## Popular in Ranked (not active)

`game/decks/cardPopularity.ts` defines the data shape (deck share per card, source label, computed time) and a pluggable source that returns `unavailable` by default. The "Popular in Ranked" sort is offered only when a source returns real aggregate data. Ranked is currently an on-device AI mode and analytics never leave the device, so there is no honest data to show. A future server endpoint that aggregates real Ranked deck lists should be the only production source.

## Fill deck (suggested completion)

`game/decks/autoFill.ts` is a deterministic, template-based helper, not an AI. It keeps every card already chosen, uses only owned copies within copy limits, aims for the starter shape of 11 Units / 4 Spells, prefers the deck's faction, then rarity, then ATK, then name. If the player lacks cards it leaves the deck short rather than inventing any. It appears as **Fill deck** while the deck has open slots; every added card can be tapped out again.

Possible later refinements: archetype templates (e.g. the reference decks in `cards/archetypeDecks.ts`) as fill targets, and ATK / HP Contribution range filters.
