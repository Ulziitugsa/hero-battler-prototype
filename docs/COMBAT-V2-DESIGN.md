# Combat V2 experiment (historical, superseded)

> **Historical / experimental.** Superseded for future core-combat direction by [CARD-COMBAT-DESIGN.md](CARD-COMBAT-DESIGN.md), which is the authoritative design. Moonwater Units have ATK and an HP Contribution to the player's Starting HP, never per-Unit HP. This record and the `?combat=v2` lab are kept for reference and are not deleted.

Status: **not promoted**. This document records a historical experiment in per-unit HP and combat stats. Normal modes use the legacy resolver; local development may opt into the experiment with `?combat=v2`. The proposed rules are not production rules. The current card-combat direction and simulation brief live in [CARD-COMBAT-DESIGN.md](CARD-COMBAT-DESIGN.md).

## Why test a new model

The production resolver compares effective Hero Power in each of three lanes: higher Power destroys the opposing Hero, ties destroy both, and an unopposed Hero deals Power to the opposing Commander. Level adds at most +2 Power, and Ascension changes abilities. This protects tactical matchups, but a long-term Hero upgrade has little direct combat impact.

V2 keeps card placement, three lanes, tactical spells, and simultaneous lane attacks. Hero damage persists on the board for that battle. Heroes return to full health in a new battle. There is no global injury state and no Defense, accuracy, crit, or speed stat.

## Roster and proposed stats

`node scripts/simulate-combat-v2.mjs` imports the actual card roster and runs the stat and starter matchup calculations. The playtest roster contains 31 Heroes. Current Power distribution is: 3 (5 Heroes), 4 (14), 5 (8), 6 (2), 7 (2); mean 4.42, median 4.

V2 stat rules:

```text
Attack = round(Power × 2.4 + 2) + floor((Level − 1) / 10) + Ascension Rank
Max HP = round(Attack × 2.5) + 2 × floor((Level − 1) / 10) + 3 × Ascension Rank
Hero clash damage = effective Attack, dealt simultaneously
Commander direct damage = min(15, ceil(effective Attack × 0.75))
Commander max HP = clamp(round(60 + 0.08 × total deck Hero max HP), 80, 120)
```

Rank is bounded to the prototype’s 0–3 stat input; in actual progression callers should also clamp it to the card’s defined Ascension path. Ascension adds stats while its existing ability evolution remains a separate strategic benefit. No stat bonus is granted by Stars independently; Stars continue to summarize Ascension.

Median Power Hero example (Power 4, `kng-archer`):

| Level | ATK | HP |
|---:|---:|---:|
| 1 | 12 | 30 |
| 20 | 13 | 35 |
| 40 | 15 | 44 |
| 60 | 17 | 53 |

At Level 40, the same example reaches 16 ATK / 50 HP at Ascension 1, 17 / 56 at Ascension 2, and 18 / 62 at Ascension 3. Per-card Ascension caps vary in the live definitions.

Power-tier baseline at Level 1, before Ascension:

| Existing Power | Example Hero | ATK | HP |
|---:|---|---:|---:|
| 3 | Light Priest | 9 | 23 |
| 4 | Archer | 12 | 30 |
| 5 | Royal Guard | 14 | 35 |
| 6 | Common Knight | 16 | 40 |
| 7 | Vharos | 19 | 48 |

The existing roster has role text but not a consistent machine-readable Tank/Striker/Support taxonomy. V2 does not infer extra role multipliers from inconsistent labels.

## Time-to-kill findings

Cells show hits for the row attacker to defeat the column target at Level 1, Ascension 0. Both heroes still attack during the same Clash if alive at its start.

| ATK Power ↓ / HP Power → | 3 | 4 | 5 | 6 | 7 |
|---:|---:|---:|---:|---:|---:|
| 3 | 3 | 4 | 4 | 5 | 6 |
| 4 | 2 | 3 | 3 | 4 | 4 |
| 5 | 2 | 3 | 3 | 3 | 4 |
| 6 | 2 | 2 | 3 | 3 | 3 |
| 7 | 2 | 2 | 2 | 3 | 3 |

For a same-Power median Hero, the Level 1 peer matchup is 3 hits. Level 40 versus Level 20 is also 3 hits; Level 20 versus Level 40 is 4. Level 60 versus Level 1 is 2. This lets progression turn a close encounter while avoiding a one-hit peer fight. Power spread still matters: a Level 1 Power-3 attacker needs 6 hits against a Power-7 Hero, so special abilities and deck matchup remain important.

## Commander health and match length

The script compares four vitality rules (A: 25% of roster Hero HP, B: 80 + 25%, C: full roster Hero HP, D: bounded 60 + 8%) on the 11-Hero portions of the current starter decks:

| Starter | A: 25% of Hero HP sum | B: 80 + 25% | C: full Hero HP sum | D: 60 + 8%, bounded |
|---|---:|---:|---:|---:|
| Kingdom | 90 | 170 | 361 | 89 |
| Undead | 84 | 164 | 334 | 87 |
| Infernal | 90 | 170 | 360 | 89 |

V2 selects Candidate D, recalculated from the deck's Hero max HP. The clamp keeps tiny and developed decks in a bounded range. Direct damage at 75%, capped at 15, makes empty lanes meaningful without allowing high ATK to scale without bound. At Level 20/40/60, the starter matchup averages were 14.7/16.3/16.3 rounds (ranges 14–15/15–18/16–17); Level 1 averaged 13.3 rounds (13–14). The simulation deploys Heroes in lane order without spells, so actual battle pacing depends on the production AI and player decisions. The comparison script also evaluates 50% capped at 10, 75% uncapped, and 100% uncapped.

The deterministic 11-Hero starter trials use a simple lane-order deployment and no spells; they do not model every production AI decision or ability interaction. Their 13–17 round range is a pace estimate, not measured player duration. Event totals and pairwise TTK data are reproducible with the simulator.

## Spells and event model

The production resolver retains the existing ability/event pipeline and translates effects that used to modify Power into V2 combat operations. Fireball deals fixed Hero damage (12; its continuous lane version deals 20); its Commander hit uses the bounded direct-damage rule. Power Surge and Weakness modify effective Attack for their existing duration, Aegis Ward applies a shield, healing clamps to max HP, stalls still suppress a lane clash, and destruction/revival use Hero HP. Existing cards are used; no new production spell roster was added. The lab also has explicit helper choices for isolated heal/shield tests.

V2 emits deterministic `HERO_DEPLOYED`, `HERO_DAMAGE`, `HERO_HEAL`, shield, buff/debuff, destruction, and Commander damage events. Seed is stored with the state; the current prototype policy has no random choices, so equal inputs produce the same log. Battle lanes show ATK and current/max HP, and Hero Level previews show the resulting combat-stat increase. Aggregate model, round, damage, duration, and boss-result analytics fire at battle completion.

## Boss and campaign prototype

The boss sandbox uses a 240 HP Commander, a Vharos guardian in the centre lane, and the same left/centre/right board. Test spells include heal, Hero/Commander shields, attack buffs/debuffs, direct damage, and lane stall. It demonstrates multi-turn pressure and lane choices, but does not implement boss phases, telegraphs, or persistent adds. The campaign sandbox grants no Campaign energy, rewards, or progress.

## Ranked implications

Ranked AI uses V2 and keeps its local rating (+24 win, −12 loss, draw 0, floor at zero). Opponent deck selection compares current Roster Power, including Hero Level and Ascension, with a rating-based target that rises gradually and caps at 20% above the player's roster. The AI Heroes use the player's average Hero Level to keep encounters near the same progression band. This remains local AI matchmaking, not human PvP. If V2 reaches real PvP, decide explicitly between full progression, brackets, normalization, or soft normalization.

## Alternatives and open questions

- Rejected: keep Level at +0/+1/+2 Power. It barely expresses Hero investment in the fight.
- Rejected: full deck Hero HP as Commander HP. Current starters produce 334–361, with long cleanup after the board is won.
- Rejected for this slice: five defensive stats, global injuries, independent Star spend, permanent Ascension multipliers, percent-HP boss damage, and wholesale conversion of the ability DSL.
- Open: test role-based HP for existing Tank/Support data; include real cards’ spell frequency and AI play patterns in simulations; measure match duration on device; tune boss attack/telegraph and encounter phases; decide whether Commander vitality should use the deck’s complete legal Hero list or only copies actually fielded.

## Test entry points

- `src/game/combatV2/model.test.ts`: simultaneous damage, persistent HP, destruction, direct damage, growth, shield/heal helper, deterministic state, boss scale.
- `src/game/ranked/store.test.ts`: rating, claim-once reward, rank mapping, AI selection.
- `src/game/backgrounds/store.test.ts`: unlock requirements remain intact while explicit test override can select and persist any defined background.
- `node scripts/simulate-combat-v2.mjs`: roster distributions, TTK, Commander options, direct damage, and six simplified matches.
