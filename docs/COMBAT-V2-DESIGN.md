# Combat V2 experiment

Status: isolated prototype only. Campaign, Quick Battle, Friendly Battle, and Ranked continue to use the legacy deterministic Power resolver. Open the lab from Profile → Developer Tools (Vite development mode or `?debug=1`). The lab has AI, Campaign sandbox, and boss scenarios. It grants no game rewards.

## Why test a new model

The production resolver compares effective Hero Power in each of three lanes: higher Power destroys the opposing Hero, ties destroy both, and an unopposed Hero deals Power to the opposing Commander. Level adds at most +2 Power, and Ascension changes abilities. This protects tactical matchups, but a long-term Hero upgrade has little direct combat impact.

V2 keeps card placement, three lanes, tactical spells, and simultaneous lane attacks. Hero damage persists on the board for that battle. Heroes return to full health in a new battle. There is no global injury state and no Defense, accuracy, crit, or speed stat.

## Roster and proposed stats

`node scripts/simulate-combat-v2.mjs` imports the actual card roster and runs the stat and starter matchup calculations. The playtest roster contains 31 Heroes. Current Power distribution is: 3 (5 Heroes), 4 (14), 5 (8), 6 (2), 7 (2); mean 4.42, median 4.

V2 stat rules:

```text
Attack = round(Power × 2.4 + 2) + floor((Level − 1) / 10) + 2 × Ascension Rank
Max HP = round(Attack × 2.5) + 2 × floor((Level − 1) / 10) + 7 × Ascension Rank
Hero clash damage = effective Attack
Commander direct damage = ceil(effective Attack × 0.75)
```

Rank is bounded to the prototype’s 0–3 stat input; in actual progression callers should also clamp it to the card’s defined Ascension path. Ascension adds stats while its existing ability evolution remains a separate strategic benefit. No stat bonus is granted by Stars independently; Stars continue to summarize Ascension.

Median Power Hero example (Power 4, `kng-archer`):

| Level | ATK | HP |
|---:|---:|---:|
| 1 | 12 | 30 |
| 20 | 13 | 35 |
| 40 | 15 | 44 |
| 60 | 17 | 53 |

At Level 40, the same example reaches 17 ATK / 56 HP at Ascension 1 and 19 ATK / 68 HP at Ascension 2. Per-card Ascension caps vary in the live definitions.

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

The script compares three vitality rules on the 11-Hero portions of the current starter decks at Level 1:

| Starter | A: 25% of Hero HP sum | B: 80 + 25% | C: full Hero HP sum |
|---|---:|---:|---:|
| Kingdom | 90 | 170 | 361 |
| Undead | 84 | 164 | 334 |
| Infernal | 90 | 170 | 360 |

V2 selects Candidate A, recalculated from the deck’s Heroes. Its 60 HP floor applies only to tiny decks. Full vitality (C) asks for too many open-lane hits; B adds a large fixed buffer without a clear roster reason. Direct damage at 75% keeps an empty lane meaningful: the median Level 20 Hero deals 10 Commander damage rather than 13 at full Attack. The script also tests 50% (7 damage) and 100% (13 damage) as comparison points.

Six deterministic, simplified 11-Hero starter-vs-starter trials finished in 15 rounds each using the selected stat and Commander rules. They deployed one Hero into each available lane, used no spells, and did not run the production AI or legacy ability resolver. This is a reproducible pace estimate, not a claim about observed player duration. Fifteen rounds is the upper edge of the intended mobile range; the next tuning pass should test faster draw/deployment and the actual AI before considering live use. Event totals in these trials ranged from 19–20 Hero defeats and 150–180 Commander damage dealt across both sides.

## Spells and event model

The old card catalogue includes destruction, Power changes, damage, shields, stalling, revives, and persistent round-end effects. Those effects cannot be copied mechanically onto HP stats. The lab translates a small subset: Fireball becomes 10 Hero/Commander damage, Power Surge gives +3 Attack for that round, Weakness removes 3 Attack for that round, and Aegis Ward grants a 10-point shield. A lab-only +12 heal helper exercises healing without claiming an existing spell already heals. It is not shown as a selectable legacy spell.

V2 emits deterministic `HERO_DEPLOYED`, `HERO_DAMAGE`, `HERO_HEAL`, `SHIELD_APPLIED`, `HERO_BUFF`, `HERO_DEBUFF`, `HERO_DESTROYED`, and `COMMANDER_DAMAGE` events. Seed is stored with the state; the current prototype policy has no random choices, so equal inputs produce the same log. The experimental UI shows ATK and an HP bar/value in each lane. Aggregate model, round, damage, duration, and boss-result analytics fire at battle completion.

## Boss and campaign prototype

The boss sandbox uses a 600 HP Commander, a Vharos guardian in the centre lane, and the same left/centre/right board. It demonstrates a large target while retaining lane pressure. The campaign sandbox uses the same prototype battle loop and intentionally grants no Campaign energy, rewards, or progress. Boss phases, lane telegraphs, adds, and percentage damage remain future design work.

## Ranked implications

Ranked v1 is still on the production legacy engine. Its local rating is deliberately simple (+24 win, −12 loss, draw 0, floor at zero). An AI deck is selected by closest average Hero Power and its Hero Levels mirror the player deck’s average Level. This is a local prototype, not human matchmaking. If V2 ever reaches real PvP, decide explicitly between full progression, brackets, normalization, or soft normalization; this phase does not choose for live PvP.

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
