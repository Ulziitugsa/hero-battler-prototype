# Archetypes, factions and the expanded card pool

Faction says **where a card is from** (Kingdom, Undead, Infernal - flavour, art direction, the summon
banner it lives in). Archetype says **what a deck is trying to do**, and it is carried by **tags**
(`Mage`, `Mage Slayer`, `Beast`, `Trickster`, plus the older `Knight`, `Demon`, `Undead`, ...). Tags cut
across factions on purpose: a Kingdom Knight can be a Mage Slayer, an Infernal Demon can be a Beast, an
Undead Hero can be a Mage. The reference decks in `src/game/cards/archetypeDecks.ts` all mix factions.

Roster: **52 cards** (31 Heroes, 21 Spells: 15 one-time, 6 Continuous), Kingdom 18 / Undead 16 /
Infernal 18. 20 cards were added in the expansion pass. Tokens (below) are not roster cards.

## The supported strategies

### Mage / Spell (`Mage`)
- **Wants to:** win with Spells - chip the enemy player, protect its own HP and lanes, and keep its
  Heroes alive with wards and stalls while Spell-triggered Heroes grow.
- **Cards:** Apprentice Mage (+2 Power per Spell you play), Grave Sage (draws if you hold 3+; the
  2nd Spell each round shields adjacent allies), **Archmage Vael** (Legendary: your first one-time
  Spell each round resolves twice; the 2nd Spell each round deals 2), Arcane Bolt (3 damage, 5 after
  another Spell), Aegis Ward (ignore the next damage), Stasis Field (no combat in a lane), Ward Circle
  (two Ward tokens), Giant's Bane.
- **Win path:** Bolt + echo + Vael's payoff is 13 damage in a round with two Spells; Aegis/Stasis/Wards
  buy the rounds to get there.
- **Strengths:** answers to one big Hero (Stasis, Giant's Bane, Weakness), real reach without a board.
- **Weaknesses:** thin board and low Power; Vael (4 Power) is a target for Execute-style removal, Hush
  and Dispel-type play; **Mage Slayers** blunt the Spell plan (below). Wide boards outrun one-lane answers.

### Mage Slayer (`Mage Slayer`)
- **Counters:** Spell decks. **Identity:** Spell resistance and punishing Spell play - not "Spells do
  nothing".
- **Cards:** Spellbreaker (+2 Power whenever the enemy plays a Spell), Null Templar (the first hostile
  Spell that would affect it each round has no effect - a *second* Spell still lands), Runebreaker
  (destroys the enemy Continuous Spell in its lane; Spell-immune only while another Mage Slayer is in
  play; the enemy's 2nd Spell each round costs them 2 HP).
- **Counterplay against it:** Heroes' own abilities and combat ignore its immunity; make it spend its
  one block per round (cast a cheap Spell first, then the real one); Silence removes its passives;
  Silenced/removed Mage Slayers leave the others exposed (Runebreaker's immunity needs a partner);
  and **Beasts** overrun it with board presence rather than Spells.

### Beast (`Beast`)
- **Wins by:** board presence and pack pressure. It cares about how many Heroes stand next to each
  other, not about Spells, so anti-Spell tech is wasted on it.
- **Cards:** Ash Jackal (+2 per adjacent Beast), Packhound (when another Beast dies, summon a Pup
  token, once per round), Alpha Hound (+1 Power per allied Hero; with 3 Heroes, 2 damage), plus the
  existing Hellhound. Pups count as Heroes (and as Beasts) for pack effects.
- **Why it pressures Mage Slayers:** Slayers spend their Power budget on Spell answers; a full board of
  Heroes makes their Spell immunity irrelevant.
- **Weaknesses:** mass stalls/debuffs and one-lane answers are weak against it, but it is beaten by big
  single Heroes, Stasis-style stalls on its best lane, and being out-tempoed before the board fills.

### Bypass / Trickster (`Trickster`) - the Toon-inspired direct attacker
- **Rule (`GRANT_BYPASS`):** while its condition holds, the Hero does not fight the Hero opposing it -
  it deals `Power - reduction` direct damage to the enemy player, and that lane has no combat (the
  opposing Hero deals nothing through it either). Against an empty lane it is an ordinary unopposed
  hit. This is *lane avoidance*: an answer to a Hero you cannot beat in combat.
- **Setup and drawbacks:** it cannot bypass on the round it enters, needs a Continuous Spell (Shade
  Thief and Wraith Prince: any of yours; Mirage Imp: one in its own lane), and it switches off
  instantly when Silenced or when the Spell is destroyed. Low Power, so conditional removal kills it.
- **Cards:** Shade Thief (Undead, full-Power bypass), Mirage Imp (Infernal, bypass with a Spell in
  lane), Wraith Prince (Epic: bypass at Power-1, +1 Power per hit).
- **Counterplay:** Dispel/Runebreaker on its Spell, Hush, Execute-style removal, or simply racing it.

### General / neutral
Crypt Warden (Shield if your Graveyard has 2+), Hush (Silence), Giant's Bane (destroy if outnumbered),
Blood Pact (sacrifice your Hero in the lane to destroy theirs, 6 Power or less - never a 7+). These
fit several decks and are the toolbox for building outside a named archetype.

### The older faction plans
Kingdom (buffs, Knights, protection), Undead (Graveyard recursion, sacrifice value), Infernal (direct
damage, aggression) are unchanged; their cards freely combine with the archetypes above.

## Answers to a big Hero (combat stays "winner survives unchanged")
Conditional destruction (Giant's Bane, Blood Pact, Execute) - Silence (Hush, Hellhound) - temporary
Power reduction (Weakness, Fireball, Hellhound) - stall (Stasis Field) - bypass (Tricksters) - token
blocking (Ward Circle, Pups reduce or absorb overflow) - Shield/damage prevention (Aegis Ward, Shield
cards) - sacrifice/trade (Blood Pact). Immunity is soft everywhere: once-per-round, ally-gated, or
Spell-only, and it never stops combat.

## Engine work
New reusable pieces (all read from card data; nothing is keyed to a card id):

| Piece | Kind | Used by |
| --- | --- | --- |
| `DRAW_CARDS` | action | Grave Sage |
| `PREVENT_NEXT_DAMAGE` (`PlayerState.barrier`, cleared at Round End) | action | Aegis Ward |
| `STALL_COMBAT` (`HeroInstance.stalled`, hostile, cleared at Round End) | action | Stasis Field |
| `SUMMON_TOKEN` + `cards/tokens.ts` | action / system | Ward Circle, Packhound |
| `GRANT_BYPASS` | PASSIVE action, read live | Shade Thief, Wraith Prince, Mirage Imp |
| `SPELL_ECHO` | PASSIVE action, read live | Archmage Vael |
| once-per-round immunity (`oncePerRound` on a `GRANT_IMMUNITY` PASSIVE) | ability flag | Null Templar |
| `CountBasis` `OTHER_ALLY_TAG_COUNT` / `ADJACENT_ALLY_TAG_COUNT` (+ `tag`) | count | Ash Jackal |
| `RETURN_TO_HAND.cardType` (default `hero`) | option | bug fix, see below |
| Conditions `SPELLS_PLAYED_THIS_ROUND_AT_LEAST`, `SPELL_ZONES_OCCUPIED_AT_LEAST/AT_MOST`, `ENEMY_HERO_COUNT_HIGHER`, `SELF_ENTERED_EARLIER`, `DEAD_HERO_HAS_TAG` | conditions | Vael, Bolt, Sage, Tricksters, Giant's Bane, Packhound |

Events: `TOKEN_SUMMONED`, `CARD_DRAWN`, `DAMAGE_PREVENTED`, `COMBAT_STALLED`; `COMBAT` gained
outcome `STALLED` and a `bypass` flag; `HERO_DESTROYED` gained `token`; `OVERFLOW_DAMAGE` now carries
`winnerInstanceId` / `loserInstanceId`. `replay.ts` handles all of them.

### Tokens
Engine-defined Heroes (`tok-ward`, `tok-pup`), resolvable through `getCard` but not in `ALL_CARDS`, any
roster, deck, collection or Summon pool. `HeroInstance.token = true`. They only fill **empty** Hero
lanes (Left to Right), have deterministic instance ids (`t-<side>-<lane>-r<round>-e<eventIndex>`),
**vanish when destroyed** (no Graveyard entry) and **trigger no death effects**, and nothing they do
summons another token - so recursion is impossible by construction.

### Bug fixes found along the way
- **Graveyard returns picked Spells.** `RETURN_TO_HAND` (Second Chance "strongest Hero", Mira, Vharos)
  and Soul Burn treated Spells as Infinity Power and could pick one. They now default to Heroes.
- **Healing at 0 HP.** Lethal overflow followed by a heal in the same round (Grave Knight) left a
  player alive at 2 HP, producing endless Vharos-mirror stalemates in the sweep. A player already at
  0 HP can no longer be healed.

## Combat presentation fix ("-2 on my winning 7-Power Hero")
The **engine was correct**: 7 vs 5 destroys the 5, leaves the 7 at 7 (no Power event, no destruction of
the winner) and deals 2 to the defending *player*. The bug was **presentation only**: `chitEffects.ts`
anchored the overflow number (and a hit-flash) to the *winner's* chit, so a "-2" appeared on the 7.
Direct damage did the same on the attacker. Both now report on the damaged player's HP bar only. No
CSS or layout changed. The event stream carries `side` (who took the damage), `amount`,
`winnerInstanceId`, `loserInstanceId` and the loser's `HERO_DESTROYED`.

## Acquisition
Only a few cards were placed in existing banners (which are capped at 12 cards and 75% own-faction):
Spellbreaker (Royal Vanguard), Crypt Warden and Hush (Gravebound), Ash Jackal (Infernal Hunt). The
rest are parked in `FUTURE_REGION_CARDS` as `banner-arcane`, `banner-mage-slayer`, `banner-beast`,
`banner-trickster`, `banner-general` for later banners; the dev "unlock all" still grants them.
Ascension for new cards shows "coming later" - no new Ascension paths were added.

## Simulation (sanity, not balance)
`engine/aiSweep.test.ts` plays every reference deck (5 archetypes + 3 faction starters) against every
deck, both seats, deterministic seeds, and checks: no exception or illegal action, card conservation,
no duplicate hand ids, no token in deck/hand/Graveyard, no surviving barrier, no runaway hands, no
safeguard trips, no unfinished games, every new mechanic fires, and every deck wins some and loses some.
`SWEEP_SEEDS=200 npx vitest run src/game/engine/aiSweep.test.ts` prints a win matrix.

Last run (12,800 matches): 0 crashes, 0 violations, 0 safeguard trips, 0 timeouts, average 3.7
rounds. **It also shows real imbalance** (the AI is simple and both seats share it): the older Kingdom
and Infernal starters beat the new archetype decks most of the time and the Undead starter loses to
nearly everything (pre-existing). Among the new decks, Mage Slayer > Mage (~75%), Beast ~ Mage Slayer
(~54%), Beast > Mage (~60%, not the intended soft Mage > Beast leg), Tricksters are the weakest and
slowest (games end in under four rounds, before bypass pressure builds). Treat these as tuning
targets for a human playtest, not conclusions.
