# Moonwater launch set: Boxes, Core and Structure Decks

How the 116-card launch set reaches players. The card design and the combat rules are in
`docs/CARD-COMBAT-DESIGN.md` (section 20); prices and income are in `docs/ECONOMY-BASELINE.md`. The design source is the
120-card set study (REPORT, SECOND-PASS and FINAL-PASS, where FINAL wins), which this build implements without
rebalancing.

## 1. Where every card comes from

| Source | Cards | Code |
| --- | --- | --- |
| Core (free, three faction packages of 10) | 30 | `game/core/corePackages.ts` |
| The nine archetype Boxes | 74 | `game/box/archetypeBoxes.ts` |
| Structure Deck debuts (2 per deck) | 6 | `game/structureDecks/definitions.ts` |
| Event / progression cards (planned, not obtainable yet) | 6 | `game/cards/eventCards.ts` |

`launchRoster.ts` records each card's source and its Boxes. `collection/acquisition.ts` turns that into the player-facing
"where to get it" labels ("Core · Kingdom", "Arcane Box", "Structure Deck · Crusade", "… · coming later"). A test fails
if any roster card has no source.

## 2. The nine Boxes

Each archetype has one finite Box. The Shop shows them as three faction groups of three:

| Group | Box | Copies | Distinct cards | C / R / E / L copies | Legendary (flagship) |
| --- | --- | --- | --- | --- | --- |
| Kingdom | Vanguard | 33 | 11 | 16 / 12 / 4 / 1 | Marshal Aldric |
| Kingdom | Arcane | 30 | 10 | 16 / 9 / 4 / 1 | Archmage Vael |
| Kingdom | Crusade | 25 | 9 | 8 / 12 / 4 / 1 | Saint Aveline |
| Undead | Bone Legion | 26 | 9 | 12 / 9 / 4 / 1 | Morwen |
| Undead | Phantoms | 28 | 10 | 8 / 15 / 4 / 1 | Duchess Nyx |
| Undead | Wither | 27 | 10 | 8 / 12 / 6 / 1 | Plague Mother |
| Infernal | Hellpack | 28 | 10 | 12 / 9 / 6 / 1 | Cerberus |
| Infernal | Hellfire | 29 | 10 | 12 / 12 / 4 / 1 | Ignis |
| Infernal | Bloodbound | 30 | 10 | 16 / 9 / 4 / 1 | Kathra |

- **Copy shape:** each card is in a Box as Legendary 1, Epic 2, Rare 3, Common 4 copies (`BOX_COPIES_BY_RARITY`).
- **Contents:** a Box holds its archetype's headline cards plus a few cards cross-listed from neighbouring archetypes.
  A cross-listed card can be found in more than one Box. Sizes are not normalized.
- **One Legendary per Box,** the flagship, so emptying a Box guarantees it.

## 3. Pulling

- **Card counts:** a pull is exactly 1 card and a 10-pull exactly 10 cards. There are no packs, no bonus card, no pity
  and no hidden pool.
- **Without replacement:** each pull takes one sealed copy, every remaining copy equally likely. The Box page shows every
  card with its remaining and total copies, and the odds of the next card's rarity.
- **Determinism:** draws use a per-Box seeded generator stored with the Box (`boxPool.ts`), so the outcome is fixed
  before the reveal plays. A 10-pull needs 10 sealed copies; with fewer left, Pull 10 is disabled ("Not enough cards left") and single pulls finish the Box.
- **Payment** (`boxProduct.ts`):
  - Gems at `BOX_PULL_GEMS` per pull, a configurable placeholder in `economy/config.ts`.
  - Or Pack Tickets at `PULLS_PER_TICKET` (1 Ticket = 1 pull = 1 card).
  - Both pay for the same draw. A Ticket pull and a Gem pull are identical.
- **The reveal** (`reveal/sequence.ts`) shows exactly the cards pulled:
  - one card centred for a pull;
  - a 5×2 grid for a 10-pull, turned over in rising rarity with the rarest card as the climax.
  - Tap advances; Skip goes to Pull Results.
- **Pull Results** lists the cards and how many were new.

## 4. Restock

A Box can be restocked only when it is empty. Restocking refills it to its original contents. It is free, gives no
reward, and leaves the collection untouched. The draw sequence continues from where it stopped, so a restocked Box is not
a replay of the first one.

## 5. Core and the starter pick

- **Core packages:** Core is 30 free cards, 10 per faction. Paladin, Vharos and Infernal Lord are Core. A faction's
  package holds each of its Core cards at deck-limit copies (2, a Legendary 1), so it owns that faction's starter deck
  outright.
- **Starter pick:** a new account picks a starter faction on first launch (`components/StarterFactionPick.tsx`) and
  receives that package. Until it picks, it holds the Kingdom package provisionally, which the pick swaps out. The
  picked faction's Starter deck becomes the selected deck.
- **Unlocking the other two packages:** they unlock on the first clear of two early Campaign stages
  (`CORE_UNLOCK_NODES`):
  - Broken Palisade unlocks the next faction;
  - Ford of Ash unlocks the last one.
  - The order is Kingdom, Undead, Infernal, skipping the starter.
  - The stage result says "<Faction> Core cards unlocked".
- **No duplication:** granting a package only raises each card to the package count. Nothing is added on top of copies
  already owned, for example from Campaign rewards, and nothing owned is lowered.

State lives in `moonwater:coreAccess:v1` (`core/coreAccess.ts`).

## 6. Structure Decks

Three Structure Decks are on sale: **Bone Legion, Hellfire and Crusade**.

- **Contents:** each is a complete 15-card list from the study's decklists, including 2 debut cards that are not in any
  Box:
  - Bone Legion: Bone Dragon, Barrow Knight;
  - Hellfire: Flame Herald, Meteor;
  - Crusade: Banner Knight, Reliquary Blade.
- **Limits:** one per account.
- **Price:** `STRUCTURE_DECK_GEMS` (a configurable placeholder).
- **On purchase:** the deck is added to the collection and saved as a ready-to-play deck.

Graveborn Rising is retired: it is no longer sold, but an account that bought it keeps it and still sees it as owned.

## 7. Event cards

Six launch cards are planned as event or progression rewards: Grave Tyrant (a later Campaign boss), Ashen Revenant,
Arcane Knight, Night Courier, Pack Warden and Oath of Vengeance. `cards/eventCards.ts` registers them so they show as
"coming later". **TODO:** they are not obtainable until their events are built.

## 8. Migration from the pre-launch save

`save/launchSetMigration.ts` runs at startup, before the collection migration. It is idempotent.

- **Existing accounts** (a stored collection or Campaign progress, but no Core record):
  - recorded as a Kingdom start, so they see no starter pick;
  - granted the Kingdom package plus the package of each Core unlock stage already cleared (raise-only).
- **New accounts** are recorded as "not picked yet" and pick on first launch.
- **Moonfall Box (retired):**
  - Its pool is read once, so anything its pack count unlocked stays unlocked, then deleted.
  - Cards opened from it stay owned. Unopened Moonfall packs are not carried over or refunded.
  - Every archetype Box starts full.
- **Untouched:** Gems, Gold, Pack Tickets, saved decks, Structure Deck purchases, Campaign progress, events and
  missions. Tickets are kept 1:1 and are now worth 1 pull (1 card) each instead of a 5-card pack. There is no silent
  conversion.
- **Card ids:** every pre-launch card id is kept, so owned cards and saved decks still resolve.

## 9. Placeholders (not final, set by the economy follow-up)

| Value | Now | Where |
| --- | --- | --- |
| Gem price per pull | 30 (a 10-pull is 10×) | `BOX_PULL_GEMS` |
| Pulls per Ticket | 1 | `PULLS_PER_TICKET` |
| Structure Deck price | 600 Gems | `STRUCTURE_DECK_GEMS` |

The study judged 30 Gems per pull far too cheap; the final price is deliberately not hard-coded anywhere else.
