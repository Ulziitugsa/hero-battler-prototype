# Moonwater card combat design

Status: **authoritative design, live as the production combat of every mode (section 16, 2026-10-01).** This document is the single source of truth for Moonwater's core combat direction: a premium collectible three-lane card battler where Units have **ATK** and an **HP Contribution** that sums into the player's Starting HP. It supersedes [COMBAT-V2-DESIGN.md](COMBAT-V2-DESIGN.md) (per-Unit HP, historical) for future core-combat work.

Card combat is the production rule set: Quick Battle, Campaign, Ranked AI, the Lantern trials and Friendly Battle all play it, with no flag or URL switch (section 16). The legacy resolver (Power, fixed 20 HP, overflow) is historical and Combat V2 is experimental; neither is reachable from normal navigation. The model below was validated with the seeded simulator in `src/game/cardSim/` ([CARD-COMBAT-SIMULATION.md](CARD-COMBAT-SIMULATION.md)); section 12 is the plan for moving production onto it. ozi approved the stat model and the section 13 defaults on 2026-09-29; section 14 is the effect and archetype balance pass run on top of them, whose card changes ozi approved the same day as the baseline card data for the new model. Those card changes are the live card data of the production resolver in `src/game/cardCombat/`.

## 1. Design goals

- **Cards first.** A Unit is a card, not a hero: art, name, faction, rarity, one effect, **ATK** and **HP Contribution**. There is no per-Unit health, no Unit HP bar, no Unit healing.
- **Readable clashes.** Three lanes, simultaneous reveal, the higher ATK wins. A player should predict most clashes by reading two numbers.
- **Empty lanes matter.** An open lane lets a Unit hit the opposing player for its full ATK. Blocking, leaving a lane open and forcing a lane open are the core decisions.
- **Deckbuilding tradeoffs.** Starting HP comes from the deck, so Unit count and card choice shape how long a player can survive.
- **Bounded progression.** Rarity makes cards desirable without deciding clashes. Since 2026-10-03 there is no combat Card Mastery at all (section 17): every card plays at its printed values.
- **Mobile pacing.** Portrait, one-handed, short matches: a design target of about 9–12 rounds (current balanced baseline: median 12, p90 15, accepted for playtesting; section 14.4).
- **Safe migration.** Saves are migrated once, versioned and idempotently (section 16.5); old Friendly match records keep finishing under the rules they started with.

## 2. Rules

| Rule | Card model |
| --- | --- |
| Deck | 15 cards. 2 copies per card, 1 for a Legendary (unchanged). **At least 8 Units (approved).** |
| Starting HP | Sum of the deck's Unit HP Contributions. Spells and battle tokens contribute 0. |
| Round | Hand refills to 3, simultaneous deploy into 3 Unit lanes and 3 Spell slots, then the live phase order: Reveal → Spells left to right → Before Combat → Combat → death chains → After Combat → Round End → temporary effects expire. Initiative alternates by round. An empty deck just stops drawing; there is no deck-out loss (approved, section 15.7). |
| Clash | Opposed Units compare effective ATK. Higher wins and stays unchanged; lower is destroyed; **the loser's player takes winner ATK − loser ATK as Clash Damage (section 15).** |
| Tie | Equal ATK destroys both Units. No Player damage. |
| Direct attack | An unopposed Unit deals its full effective ATK to the opposing player. No cap, no scaling. |
| Overflow | Replaced by **Clash Damage** (approved, section 15): the losing Unit's player takes winner ATK − loser ATK. |
| Graveyard | **Each card may return from the Graveyard once per match (approved)**, counted per physical copy: a copy that has returned is marked Returned (section 14). Covers return to hand or deck and revive. |
| Growth cap | Permanent effects raise a Unit at most **+45 ATK** above the ATK it entered with; cards that grow print "up to +45" (section 14). |
| Win | A player at 0 HP loses. Both at 0 in the same step is a draw. A hard round cap (40 in the simulator) ends a stalled match as a draw. |

## 3. Stat model

| Stat | Formula | Current roster |
| --- | --- | --- |
| ATK | `80 + 15 × (Power − 3)` + a fixed per-card offset in −6..+6 | 76–145 |
| HP Contribution (HPC) | `max(45, round(0.75 × (210 − ATK)))` + rarity premium (Common 0, Rare 4, Epic 8, Legendary 11) | 60–103 |

By Power band on the roster:

| Power | Units | ATK | HPC |
| ---: | ---: | --- | --- |
| 3 | 5 | 76–84 | 95–103 |
| 4 | 14 | 89–100 | 83–98 |
| 5 | 8 | 104–115 | 76–91 |
| 6 | 2 | 124–128 | 62–73 |
| 7 | 2 | 144–145 | 60–61 |

Why this shape:

- **ATK keeps 15 per Power.** Every existing ±Power effect converts 1:1 (+2 Power = +30 ATK), and the ATK order of the bands is unchanged. The absolute range barely matters: every affine Power→ATK map tested (85–145, 80–140, 100–180, 100–140) gave the same standings and pacing.
- **The per-card offset exists to kill ties.** On 15-point bands two random Units tie 30% of the time (14 of 31 Units share ATK 100 today). The ±6 offset drops the printed tie chance to 5% and the in-match tie rate from 12% to 3%. The offset must stay under half a band so it never reorders bands. In production it is authored per card, not hashed (section 12).
- **HPC falls as ATK rises,** so a low-ATK card buys the deck more HP. The ¾ factor sets the pacing (section 4). The HPC tradeoff is honest but weak: see section 10.
- **Tokens** have ATK and no HPC. Their face must not print one.

## 4. Starting HP

`Starting HP = Σ HPC over the deck's Units`. A typical 11-Unit deck lands near 900.

| Deck | Units / Spells | Starting HP |
| --- | --- | ---: |
| Aggressive study deck | 12 / 3 | 859 |
| Balanced study deck | 11 / 4 | 921 |
| Defensive study deck | 11 / 4 | 1,039 |
| Spell-heavy study deck | 8 / 7 | 732 |
| High / low rarity study decks | 11 / 4 | 868 / 907 |
| Kingdom / Undead / Infernal starter | 11 / 4 | 921 / 960 / 915 |
| Arcane Control (mage archetype) | 7 / 8 | 590 |

- The spread is about 1.3× between ordinary decks and 1.8× at the extremes, which keeps the scale readable (no 600 against 2,500).
- Starting HP is still mostly **Unit count**: each Unit adds 60–103, each Spell adds 0.
- **8-Unit minimum (approved).** Below 7 Units matches collapse to 2–4 rounds. At 8 Units Starting HP is about 680 and the median reaches the target. Arcane Control was rebuilt with 8 Units in the balance pass (section 14).
- The fixed 20 HP (`engine/constants.ts STARTING_HP`) disappears for every mode on the card resolver. Production must never show a board of 100+ ATK cards against a 20 HP bar (section 12.4).

## 5. Clash resolution

- Compare effective ATK after Spells, Passive auras and Before Combat effects (there is no On Play since section 18). Higher wins; the loser is destroyed; the winner keeps its ATK and stays in the lane. **Since section 15 the loser's player also takes the ATK difference as Clash Damage.**
- **Tie: both destroyed.** "Neither destroyed" was tested and rejected: it tripled board locks (tie rate 9.5%), raised stalls and pushed p90 to 16 rounds.
- **No overflow (approved, superseded by section 15).** The live engine makes the losing side's player take the ATK difference. Without it, a blocker fully absorbs any attacker, which is what makes the lane game about blocking. With it, games run 2 rounds shorter, 35–40% of kills come from overflow, a clash loss hurts twice and chump-blocking decks collapse (Undead starter 0.44 → 0.31).
- A Unit reduced to or below the Power 0 line (35 ATK on the baseline) is destroyed, preserving the legacy "Power ≤ 0 dies" rule.

## 6. Direct attacks

- An unopposed Unit deals its full ATK to the opposing player. Bypass effects (Mirage Imp, Shade Thief, Wraith Prince) already do exactly this past a blocker.
- Measured on the recommended rules: a player takes about 9.4 direct hits per match; the winner lands about 7.2, averaging about 130 per hit against about 900 HP. 90% of kill shots are direct hits, 10% are effect damage.
- **One open lane is a real threat, not a loss.** A single strong Unit (145 ATK) needs about 6 unanswered hits to kill a 900 HP deck. The largest single hit seen was 64% of Starting HP, from stacked permanent growth; without the Graveyard cap it exceeded 100%. A per-card growth cap is still advisable (section 9).
- **Two open lanes** roughly halve the clock, which is the intended punishment for losing the board.
- 75% direct damage was tested: games ran longer and nothing improved. No cap or scaling is recommended.

## 7. Mastery (historical: combat Card Mastery was removed 2026-10-03, section 17)

This section records the HPC-only Mastery that shipped on 2026-10-01 and the studies behind it. **None of it is live any more:** no rank changes any combat value, and no copies or Gold can be spent on it. Kept for the record and for the future Prestige design.

- **HPC only: +5 / +10 / +15 / +20% HPC at Mastery II–V. No ATK step.** A maxed 11-Unit deck gains about +180 Starting HP, under two average hits.
- Mirror results (M5 against M1, same deck and pilot): HPC-only 0.52–0.54 win share. Thread D's option MA (+3% ATK, +10% HPC) scored **0.86–0.93**, because any ATK step wins 100% of same-card clashes and each won clash compounds. A well-played M1 deck still beats a badly played M5 deck 61–68% of the time under HPC-only.
- **Effect stages (III and V) must never flip a clash.** Even a +10% ATK once-per-match stand-in reached 0.77. Effect stages should be HPC, cosmetic, or once-per-match utility without ATK.
- Ladder unchanged: 1 / 2 / 4 / 7 / 11 copies owned for I–V (duplicate costs 1 / 2 / 3 / 4), plus **500 Gold for Mastery IV and 1,500 Gold for Mastery V**, the Gold sink that ships with the Legacy Level refund (section 16.5) (a card run at 2 copies needs 12 in practice, because deck copies are protected).
- Spells get a Mastery path so duplicates are never dead. **As shipped (2026-10-01) a Spell's Mastery is a collection mark only: the Spell plays the same at every stage.** The earlier proposal (III and V raise the Spell's number about 10%) is not implemented; it needs its own review against "never flips a clash on its own".
- **Legacy Level** (+15 / +30 ATK at Levels 30 / 60) is bigger than the whole Mastery budget. The card resolver never reads it; it retires for combat at the moment a mode moves to the card resolver. **Approved save treatment: refund invested Gold only, and only in the same release as a new Gold sink.** Done 2026-10-01: section 16.5.

## 8. Rarity philosophy

- Rarity buys **effect depth and a small HPC premium (0 / 4 / 8 / 11), never ATK.** ATK is the high-leverage axis: +3% ATK wins 59–78% of mirrors.
- Common: simple and efficient. Rare: specialised. Epic: synergy and stronger effects. Legendary: a build-around rule or unique effect.
- Today's Legendary edge is Power, not rarity: Vharos and Infernal Lord are Power 7. **Re-band the Power 7 Legendaries to Power 6 (approved)** and spend their budget on effects.
- Measured: high rarity against low rarity is 0.47 head-to-head on the recommended rules (0.69 without the Graveyard cap, most of it Mira and Vharos recursion). Against the whole field the high-rarity deck is still the best deck (0.85, low rarity 0.72), so rarity is desirable without being a wall.

## 9. Effects

Full per-card table: `effect-audit.csv` from the effect audit (project files, `moonwater/combat-sim/thread-c/`). Of 60 cards (52 roster, 6 off-roster, 2 tokens): 40 compatible, 5 wording-only, 9 numeric rebalance, 3 old-Power thresholds, 1 per-Unit HP, 2 incompatible.

Conversion rules:

- **1 Power = 15 ATK.** Every ±Power effect already prints this way.
- **Absolute thresholds are stored as ATK values, not Power.** Execute (≤ Power 3), Blood Pact (≤ 6), Vharos revive (4), Fireball set (1) and Bone Soldier Mastery rank 2 (≤ 4) convert through the ATK formula. Execute's shown copy ("45 ATK or less") is a text-converter bug; the engine value is 85 today and 80 on the baseline.
- **Player-HP effects scale by 45 HP per legacy point (approved; every card reviewed in section 14).** That is a typical deck's ~900 HP over the legacy 20. The effect audit proposed ×25 (keeps each effect the size of a Unit hit); ×55 was also run. ×25 leaves burn decks weakest (0.13 floor), ×55 helps them most (0.21). Examples at ×45: Arcane Bolt 135 (+90), Light Priest heal 135, Pit Fiend 90, Siege Fire 45 per round.

Breakages to fix before production:

| Card | Problem | Recommended fix |
| --- | --- | --- |
| Legendary Paladin, line 3 | Reduces overflow damage; no overflow exists | **Proposed (section 14):** "When the enemy Unit in this lane is destroyed, restore 45 HP to your player (once per round)" |
| Ward token | Same overflow reduction | **Proposed (section 14):** a plain 70-ATK blocker with no text |
| Fireball | Uses per-Unit HP (`DAMAGE_HERO`) | Keep only the legacy branch as data: −60 ATK permanent, or set ATK to the Power 1 line |
| Execute, Bone Soldier M2 | Wrong threshold in copy | Store the threshold as ATK and derive the copy from it |
| Flame Imp, Pit Fiend, Runebreaker, Alpha Hound, Vael, Arcane Bolt, Siege Fire, Grave Knight, Light Priest + 5 Mastery lines | 20 HP scale | Rescale at the chosen HP unit |
| Recursion (Cursed Warrior, Mira, Grave Totem, Bone Soldier, Vharos) | Without overflow they chump-block forever (4.5% stalls) | Once-per-match Graveyard return (0.1% stalls) |
| Blood Demon, Bone Soldier scaling, Titanroot (off-roster) | Unbounded permanent growth into uncapped direct damage | +45 growth cap rule, Bone Soldier up to +60 (section 14) |
| Tokens | Free chump blockers with no HPC cost | Battle-only tokens, and every token effect is once per card played or once per round (section 14) |
| Weak spells: Blood Pact, Soul Burn, Siege Fire, Dispel | 0.36–0.43 inclusion win share | Retune after the HP unit is chosen |

No Spell restores HP today; Growth Totem (off-roster, duplicates Fortify) is the natural candidate to become a heal Spell. Nothing moves or swaps Units between lanes and the engine has no primitive for it; that is a later mechanic, not a conversion.

## 10. Simulations

Tool: `node scripts/simulate-card-combat.mjs` (seed 20260929; byte-identical output for the same arguments). Methods, commands and headline tables: [CARD-COMBAT-SIMULATION.md](CARD-COMBAT-SIMULATION.md). 21,000 games per model or rule variant (200 per deck pair, seats alternated) and 1,000 per controlled pair.

Recommended rules, measured:

| Metric | Value |
| --- | --- |
| Rounds mean / median / p10 / p90 | 8.5 / 9 / 5 / 12 |
| Draws / stalls | 2.5% / 0.1% |
| In-match tie rate | 3.0% |
| Kill shots: direct / effect / overflow | 90 / 10 / 0% |
| Seat 0 win rate | 0.49 (no first-player correction needed) |
| Archetype win-share spread | 0.18–0.85 |
| High vs low rarity | 0.47 |
| M5 vs M1 (HPC-only) | 0.52–0.54 |

What the simulation does **not** solve:

- **ATK dominates HPC.** +3% ATK beats +80% HPC in mirrors. HPC buys time but a lost clash compounds, so HPC cannot pay for low ATK.
- **Defensive and spell-heavy decks are not viable** (0.18–0.25) under every stat model and rule tried. Aggressive (0.79), the Infernal and Kingdom starters (0.79, 0.74) and balanced shells are. Fixing this needs effects (shields, ATK reduction, lane control, Spells that refund tempo) or letting Spells add HPC, not stat formulas **(open)**.
- **Deck quality outweighs decisions.** The best study deck played randomly still beats a weaker deck played well 92% of the time; lane choice is worth 7–16 points in a mirror. Finer ATK granularity and a narrower archetype spread both raise the weight of decisions. Only a human playtest settles it.
- The AI is a one-ply heuristic and under-plays Undead and Arcane Control.

Target match length: **about 9–12 rounds** (median 9, p90 at most 12). The ¾ HPC scale is approved. The balanced baseline currently runs median 12 / p90 15, accepted for the next playtest (section 14.4). Reasoning (a judgement, not a measurement): a 15-card deck with a 3-card hand gives each player roughly that many rounds of real placement choices before the deck is spent, the winner needs about 7 direct hits so open lanes decide games without one hit ending them, and at one Fight tap plus the resolve animation per round it is a few minutes of portrait play. HPC ×0.8 gave median 8 / p90 11 before the balance pass, but only median 11 after it, so HPC is not the tempo lever.

## 11. Rejected models

| Model | Why rejected |
| --- | --- |
| Combat V2 (per-Unit persistent HP) | Contradicts the card model: Units have no health. Historical, see COMBAT-V2-DESIGN.md |
| Banded ATK (A–D: 85–145, 80–140, 100–180, 100–140) | Same standings as each other; 30% printed tie chance, 12% in-match ties |
| Flat HPC (G, 100 per Unit) | Removes the ATK/HPC tradeoff with no pacing gain |
| Rarity budget into ATK (F) | Rarity decides clashes; the premium belongs in effects and HPC |
| Preview HPC scale (695–1,205 HP) | Median 9–10 but p90 15 and 6.6% draws before the Graveyard cap |
| Tie destroys neither | Board locks, 9.5% ties, p90 16 |
| 75% direct damage | Longer games, no balance gain |
| Unlimited Graveyard recursion | 4.5% stalls, max hit above 100% of Starting HP |
| Overflow on | Not needed for pacing; double punishment for losing a clash; crushes Undead. Kept as an **open** alternative, not the default |
| Mastery MA (+3% ATK, +10% HPC) | 0.86–0.93 M5-vs-M1 mirrors, over the 60% line |
| Mastery MB (+8% ATK) and MX (+15% ATK, +20% HPC) | 0.92–1.00 mirrors; on the baseline MB crosses into the next Power band in 9% of N vs N+1 pairs and MX in 43% |
| Legacy Level kept in combat | +15/+30 ATK exceeds every other progression budget |

## 12. Migration plan

### 12.1 Phases

*Completed 2026-10-01: phases 1 to 6 are done, see section 16. The table is kept as the record of the plan.* The legacy resolver stayed available, and remained the default, through every phase until then. Each phase is a separate reviewed change with a per-mode switch that can be turned off without a deploy of new code.

| Phase | Scope | Gate to start the next phase |
| --- | --- | --- |
| 0 (this change) | Simulator, design, plan. No mode switched | ozi's decisions on section 13 |
| 1 | Production card resolver behind a feature flag, plus card stat data | Parity tests against the simulator; determinism and replay tests; `npm run check` green |
| 2 | **Quick Battle** on the card resolver, with the battle UI changes in 12.4 | Internal playtest: median 8–10 rounds, no stall reports, players describe HP correctly |
| 3 | **Campaign** | Every encounter rebuilt and re-simulated to its target length; boss nodes use a boss HP pool |
| 4 | **Ranked AI** | AI decks carry a fixed Mastery stage per tier and stop borrowing the player's Level and Ascension |
| 5 | **Friendly Battle** and remaining legacy modes | Both clients and the API agree on a resolver version per match |
| 6 (later) | Save migration: Legacy Level refund with a Gold sink, Mastery re-authoring | Versioned, idempotent migration with tests; separate release |

Flag (historical): `combatV2/featureFlag.ts` gained `'card'`, read from `VITE_CARD_COMBAT_MODES` with a `?combat=card` override. Since section 16 the file is `combat/combatModel.ts`, the env list is gone and production builds always play card combat. Combat V2 stays in the codebase as an isolated lab until a separate decision retires it.

### 12.2 New resolver requirements

- ATK on Units; Starting HP from HPC; no per-Unit HP anywhere in state.
- 3 lanes, simultaneous clashes, tie rule, full-ATK direct damage, no overflow (behind a rule switch until decided).
- Every live trigger, condition and action on ATK rather than Power, with absolute thresholds stored as ATK.
- Spells, Spell slots and Continuous Spells; Graveyard with the once-per-match return counter; death chains in the live order.
- Deterministic and seeded (reuse `engine/rng.ts`), with a typed event log per phase (clash result, direct hit, effect damage, heal, destroy, return) that drives both the battle animation and a replay.
- Replay/debug output compatible with the existing `engine/replay.ts` shape, plus a version field so Friendly Battle can reject mismatched clients.
- A round cap that ends the match as a draw.
- Implementation route: promote `src/game/cardSim/engine.ts` into `src/game/cardCombat/` (it already models every roster effect and passes determinism tests), strip the study-only rule switches that lost, and add the production event log. The legacy engine is not edited.
- Card stats become data: a generated table of authored `atk` and `hpc` per card id (the offset is chosen by design, not hashed), read by both the card face (`cards/cardFace.ts`) and the resolver so they can never disagree.

### 12.3 Deck and data changes in Phase 1

- Deck validation gains the Unit minimum only for decks that will play in card-model modes, so legacy modes keep accepting today's decks until the switch.
- Player-HP numbers, thresholds, Fireball, Paladin and Ward per section 9.
- Re-band Vharos and Infernal Lord to Power 6.
- Legacy Level and Ascension stat bonuses are not passed to the card resolver.

### 12.4 Battle UI

Keep the current board layout; change what the numbers mean.

- **Top:** enemy HP bar, max = the enemy deck's Starting HP (or a boss pool). **Bottom:** player HP, max = the player's Starting HP. `SideHeader` stops reading `STARTING_HP` in card mode.
- **Board:** 3 lanes. A clash shows a winner/loser treatment (loser shatters, winner holds); no Unit damage numbers and no Unit HP bar.
- **Damage numbers appear only on the player HP bars:** direct hits, effect damage and heals.
- Pre-match: show both Starting HPs on the versus screen, so the player sees where the number came from.
- Production must never combine card-face ATK (76–145) with a 20 HP bar. The integration branch already prints ATK on battle cards while legacy battles use 20 HP; that is acceptable only in the prototype and must be resolved (by Phase 2, or by hiding ATK in legacy battles) before any production release.

### 12.5 HP Contribution on battle cards: recommendation

**Deck Builder, Collection and Card Inspect show ATK and HPC equally. Battle hand and board show ATK only; HPC appears in the battle inspect sheet as "Added +83 to your Starting HP".**

Reasons: once the match starts HPC changes nothing (no effect reads it, and destroying a Unit does not remove its HP); a heart icon with a number on a board Unit is exactly how players read Unit health, which this model says does not exist; and the compact board chip at 390 px has room for one number to be read at a glance. A smaller, secondary HPC chip was considered and rejected for the second reason. This is a UI change for Phase 2, not part of this change.

### 12.6 Starting HP display

- Deck Builder already shows Starting HP from `decks/deckSummary.ts`; it switches to the authored HPC table in Phase 1 so the preview and the battle agree.
- The versus screen and both HP bars use the deck's value. Campaign's per-node `startingHp` override is replaced by deck-derived HP for the player and a boss pool for bosses.

### 12.7 Boss compatibility (one conceptual example)

The model supports bosses without giving Units personal HP: a boss is a player-like side with a large HP pool and a scripted deck.

**The Drowned Warden** (concept only)

- **HP pool 1,600** (about 1.8× a player deck). Not derived from HPC.
- **Deck:** 18 minion cards at 70–110 ATK with no HPC, played one or two per round, so the player usually has an open lane to hit.
- **Scripted effect, every 3rd round, "Tide":** one lane chosen by the script floods; no clash and no direct damage happen there that round (the existing Stasis Field behaviour applied to a lane).
- **Phase at 50% HP:** the Warden's minions gain +15 ATK for the rest of the battle, and Tide floods two lanes.
- Target: 10–12 rounds, win through lane control and burst rather than a longer grind. Tuning belongs to Phase 3.

## 13. Decisions (ozi, 2026-09-29)

The open questions of the first draft, as decided:

1. **Overflow:** none. *Superseded 2026-09-29 by Clash Damage (section 15).*
2. **Graveyard return:** once per card per match, counted per physical copy (section 14).
3. **Deck minimum:** 8 Units.
4. **Player-HP effects:** 45 HP per legacy point, reviewed per card (section 14: every card keeps ×45; Aegis Ward prevents a whole hit and is not scaled).
5. **Tempo:** keep the ¾ HPC scale. Design target about 9–12 rounds; the current baseline (median 12, p90 15) is accepted for playtesting (section 14.4).
6. **Mastery:** HPC only, +20% at Mastery V, no ATK step.
7. **Paladin line 3 and the Ward token:** reworked (proposals in section 14).
8. **Legacy Level:** refund as Gold only, and only alongside a new Gold sink.
9. **Defensive and control decks:** made viable through effects, not Spell HPC. Spells give no Starting HP.
10. **Power 7 Legendaries:** re-banded to Power 6.
11. **Tokens:** must not be free unlimited blockers (policy in section 14).
12. **Box composition:** copies fixed so Epics never Master faster than Rares (appendix).
13. **Names:** "Tactic" and "Renown" are kept.

14. **Balance pass (section 14):** the combined card changes, the recursion, token and growth rules, the Arcane Control and Defensive effect changes and the Moonfall Box copy split are approved as the baseline card data for the new model. The rejected alternatives stay rejected. Box prices do not change.

*(2026-09-29; superseded by the Phase 2 prototype below and section 16.)*

**Phase 2 prototype (Quick Battle only).** At ozi's ask, the production card resolver now lives in `src/game/cardCombat/` (resolver, balanced AI, card data from section 14, the shared Starting HP helper) and Quick Battle can play it when `VITE_CARD_COMBAT_MODES` lists `quickBattle` or the URL carries `?combat=card`. `?combat=card` works in any build so a preview deploy can be played; it is ignored for every mode other than Quick Battle. Campaign, Ranked, Friendly Battle, the legacy resolver, Combat V2, saves and Legacy Level are unchanged.

**Before Combat order (ozi, 2026-09-29).** Before Combat effects resolve in initiative order: the player first on odd rounds, the enemy first on even rounds. Resolving player-first every round gave the enemy the last word on every Guard contest (Undead mirror 32-61 over 100 AI games); with alternation it is 46-48. This departs from the simulator, which resolves player-first.

## 14. Effect and archetype balance pass

Status: **approved by ozi on 2026-09-29 as the baseline card data and effect design for the new card-combat model.** Measured on the approved rules and stat model with every change below registered as a simulator override (`src/game/cardSim/balance/proposal.ts`, variant `final`). They reach `src/game/cards` with the production card resolver, which is not started. The rejected alternatives (section 14.5) stay rejected. Full report, CSVs and runs: project files `moonwater/balance/final/`.

### 14.1 New rules and primitives

- **Guard N:** "Before Combat: if this Unit would lose its lane, gain +N Power this round." Guard only works when blocking or contesting, so it holds lanes without raising direct damage.
- **Growth cap:** permanent effects raise a Unit at most +45 ATK above its entry ATK. Cards that grow print "up to +45".
- **Graveyard return per copy:** a copy that has returned is marked Returned and can't return again. Counting per card name was tested and cut Arcane Control to 0.27.
- **Token policy:** tokens stay battle-only, and every token effect is once per card played or once per round. No token printer can fill lanes every round for free.
- **PACIFY (new primitive):** a Unit deals no damage this round, in a clash or directly. Used by Stasis Field.

### 14.2 Card changes

| Card | Change | From |
| --- | --- | --- |
| Dark Priest | Permanent growth line becomes Guard 2 | A |
| Grave Knight | Permanent growth line becomes Guard 2; heal 90 kept | A |
| Crypt Warden | Gains Guard 2 | E |
| Legendary Paladin | Guard 4 becomes Guard 3; line 3 becomes "when the lane enemy is destroyed, restore 45 HP (once per round)" | D line 3, E Guard |
| Ward token | Plain 70-ATK blocker, no text | D |
| Stasis Field | Enemy Unit in this lane deals no damage this round and gets −15 ATK for the battle | B |
| Aegis Ward | Also gives your Unit in this lane a Shield | B |
| Grave Sage, Apprentice Mage, Archmage Vael | Return a Spell from the Graveyard (subject to the once-per-copy return) | B |
| Arcane Bolt | 135 damage, +90 after a Spell | B |
| Battle Captain | Aura goes from all allies to adjacent allies | C |
| Bone Soldier | Graveyard bonus capped at +60; returns once | D, cap raised by E |
| Blood Demon | +15 per allied death up to +45; +30 if an ally died this round | D |
| Battle Banner | +2 Power becomes +1 | E |
| War Cry | All allies +2 becomes +1 (Kingdom line unchanged) | E |
| Vharos, Infernal Lord | Power 6 | approved |

Study decks: Defensive Bulwark (A) and Arcane Control with 8 Units (B) are the core defensive and control decks; the Balanced list lost its dead Spells and orphan Beasts (E). Every Player-HP card keeps ×45; Aegis Ward prevents a whole hit and is not scaled.

### 14.3 Results (search pilot, 200 games per pair, nine core decks)

| Deck | Before | After |
| --- | ---: | ---: |
| Aggressive | 0.71 | 0.55 |
| Balanced | 0.29 | 0.50 |
| Defensive Bulwark | 0.23 | 0.57 |
| Arcane Control | 0.11 | 0.43 |
| Kingdom starter | 0.63 | 0.43 |
| Undead starter | 0.49 | 0.64 |
| Infernal starter | 0.64 | 0.35 |
| High rarity | 0.73 | 0.48 |
| Low rarity | 0.66 | 0.56 |

| Metric | Before | After |
| --- | --- | --- |
| Spread (core decks) | 0.11–0.73 | 0.35–0.64 |
| Pairings at 0.85 or more | 20 | 0 (search), 1 (heuristic: Bulwark over Arcane Control 0.91) |
| Rounds median / p90 | 10 / 13 | **12 / 15** |
| Draws / stalls | 4.1% / 0% | 3.9% / 0% |
| Direct hits per match (winner) | 9.3 (7.2) | 11.2 (8.3) |
| Weaker deck played well vs stronger deck played randomly (Aggressive vs Balanced) | 0.27 | 0.79 |
| M5 vs M1 mirrors | 0.53–0.58 | 0.50–0.57 |

### 14.4 Match length: accepted for playtesting

Decision (ozi, 2026-09-29): **the current length is accepted for the next playtest iteration, not locked as final.** The design target stays about 9–12 rounds; the balanced baseline is recorded as **median 12, p90 15**. No tempo pass runs until pacing has been judged in playable combat, and the balanced effects are not distorted to hit the old number before then.

Evidence: lowering HPC to ×0.9 and ×0.8 of the approved scale only moved the median to 11, so Starting HP is not the cause and the global model stays. Games got longer in every pairing, Aggressive mirrors included (mean 9.9 to 11.0 rounds), because the pass removed uncapped growth, turned growth lines into Guard and removed lopsided blowouts. If playtesting says games are too long, the lever is effects that add damage, in a separate pass.

Locked through the playtest: the ATK/HPC model, HPC-only Mastery, no overflow (since replaced by Clash Damage, section 15), once-per-copy Graveyard return, the 8-Unit minimum and the token limits.

### 14.5 Rejected alternatives (stay rejected)

| Alternative | Why |
| --- | --- |
| Dark Priest Graveyard line +1 | Undead starter fell to 0.31 |
| Crypt Warden Guard 1, or no Guard | Too weak; without Guard Balanced fell to 0.38 and long-game loops doubled |
| Balanced study list v3 | Overshot to 0.67 |
| Graveyard return counted per card name | Arcane Control fell to 0.27 |
| Guard only on the round played ("Arrival Guard") | No length gain; Bulwark fell to 0.25 |
| Bone Soldier capped at +45 | Low rarity fell to 0.29 |
| HPC ×0.9 / ×0.8 for tempo | Median only 12 to 11 |
| Hellhound −15, Power Surge +2 | Not needed |

## 15. Clash Damage (ATK difference damage)

Status: **approved by ozi on 2026-09-30 as the current card-combat prototype baseline (section 15.7).** Resolver (`src/game/cardCombat/`) and simulator (`src/game/cardSim/`, variant `dd-final` in `balance/differenceDamage.ts`) implement it identically; the parity test replays the same matches through both. Full report, CSVs, runs and screens: project files `moonwater/difference-damage/`. Card-by-card audit: `card-changes-difference-damage.csv` (the batch 3 `card-changes.csv` stays as history).

### 15.1 The rule

| Case | Result |
| --- | --- |
| Unit vs Unit, different ATK | Higher ATK wins and stays in its lane unchanged. Lower ATK is destroyed. **The losing Unit's player takes winner ATK − loser ATK as Clash Damage.** |
| Unit vs Unit, equal ATK | Both destroyed. No Player damage. |
| Unit vs empty lane | Direct hit for the Unit's full ATK (unchanged). |

Why: without it a 60 ATK chump blocker stopped a 145 ATK Unit for 0 damage, so the cheapest blocker was always right.

### 15.2 What ATK does now

ATK has two jobs in a clash. It decides **who wins the lane**, and the loser's ATK is **how much of the winner's attack it absorbs** for its player. Example: a 145 ATK Unit beats an 85 ATK Unit. The 85 ATK blocker is destroyed and absorbs 85 of the attack; the remaining **60 reaches the defending Player as Clash Damage**. A 140 ATK blocker would absorb 140 and let 5 through; an empty lane lets all 145 through.

This is **not Unit HP**. Units still have no HP of their own, damage never stays on a Unit, the winner is never damaged, and the loser is destroyed regardless of the difference. Clash Damage is Player damage, like a direct hit, just reduced by the blocker's ATK. Nothing from Combat V2 comes back.

- Clash Damage is never negative and needs no cap: it is at most the winner's ATK, which is what an empty lane would have dealt.
- ATK buffs and debuffs change Clash Damage because they change ATK (Power Surge on a 115 ATK Unit against 130: it wins 130 vs 115 and deals 15). Mastery changes HP Contribution only, so it never changes Clash Damage.
- Shield saves the Unit, not the Player: a shielded loser survives, but its player still takes the difference.
- Pacify (Stasis Field): the pacified Unit does not clash, so no Clash Damage in that lane.
- Aegis Ward: "The next damage your player would take this round, **including Clash Damage**, is prevented." Same effect as before; the text now says so.
- Bypass (Mirage Imp, Shade Thief, Wraith Prince) is still a direct hit past the blocker, not a clash.

### 15.3 Guard: one meaning

**Guard N stays "+N × 15 ATK this round when this Unit would lose its lane".** Under Clash Damage that does two things at once, both through ATK: it may flip the lane, and when it doesn't, it shrinks the difference its player takes. Guard as Clash Damage reduction (30, 45 or 60 off) was simulated and collapsed Bulwark and Undead to about 0.05; Guard 3 on Dark Priest, Grave Knight and Crypt Warden created near-auto-wins. Both are rejected. No card changes in this batch: every card either works unchanged or needed a wording update (Aegis Ward).

### 15.4 Results (expert pilot, 200 games per pair, eleven study decks, seed 20260929)

| Metric | Batch 3 (no overflow) | Clash Damage |
| --- | --- | --- |
| Rounds mean / median / p90 | 11.5 / 12 / 15 | **10.3 / 10 / 14** |
| Draws / stalls | 3.9% / 0% | 5.7% / 0% |
| Player damage per match: direct / Clash / effect | 1356 / 0 / 257 | 994 / 524 / 251 |
| Direct hits per match | 11.2 | 8.4 |
| Kill shot: direct / Clash / effect | 92% / 0% / 8% | 81% / 13% / 6% |
| First-seat win rate | 0.41 | 0.50 |
| Core deck spread | 0.34–0.66 | 0.39–0.61 |
| Core pairings at 0.85 or more | 0 (Undead over Bulwark was 0.73) | 1: Undead starter over Bulwark 0.96 |

First-seat rate moved because the simulator now resolves Before Combat in initiative order like the resolver (section 13); it was player-first. Mastery V vs Mastery I mirrors: 0.49–0.60 (batch 3: 0.50–0.57). Weaker deck played well vs stronger deck played randomly (Aggressive vs Balanced): 0.80 (batch 3: 0.79). High rarity vs low rarity, both played well: 0.29 (unchanged; the study high-rarity list is not the stronger deck).

### 15.5 Deck exhaustion

There is no deck-out loss. When a player's deck is empty, the draw at the start of the round does nothing and play continues with the hand and board. A match ends: at 0 HP (both at 0 in the same step is a draw); as an **exhausted draw** when both decks, hands and boards are empty and nothing can be played; or as a draw at the round cap (40). Under Clash Damage, 100% of expert matches and 99.8% of heuristic matches end by HP; 0.2% end exhausted; none reach the cap. At least one deck runs out in 85% of expert matches, on average 3.4 rounds before the end, so the last rounds are played from hand and board.

### 15.6 Blocking quality

Attackers 145 / 110 / 85 against blockers 130 / 95 / 70: the six placements cost the defender 45, 55, 65, 75, 90 and 90 HP (no blockers: 340; old rule: 0 for every placement). The placement that takes the least damage loses all three blockers; the others trade HP for kills, so placement is a real choice. Over 2000 random boards from real card ATKs, best / random / worst placement take 24 / 32 / 38 HP, and the net HP swing gap between best and worst is 60 or more in 23% of boards.

### 15.7 Decisions (ozi, 2026-09-30)

Locked for the current card-combat baseline:

1. **Clash Damage rule accepted:** winner ATK − loser ATK is dealt to the losing Unit's player.
2. **No card balance changes from this pass.** All approved card-combat effects stay. Guard stays an ATK modification. The Aegis Ward wording update is kept.
3. **Pacing accepted:** median about 10 rounds, p90 about 14. No artificial HP scaling, damage caps or extra damage to force another target.
4. **No deck-out loss.** An empty deck stops drawing; the player keeps using cards in hand and on board; the primary victory stays Player HP reaching 0. The exhausted-board draw and the round-cap draw remain the fallbacks.
5. **Undead starter vs Bulwark (0.96) is a known matchup outlier.** Bulwark is a study deck, not a shipped deck, so production card balance is not changed to correct it. **Review it when real starter and archetype decks are authored.**
6. **Approved prototype baseline:** core archetype spread about 0.39–0.61, first-seat win rate about 0.50, no stalls, Clash Damage on, HPC unchanged, Mastery HPC-only, no Unit HP, an empty lane still takes full ATK, ties destroy both for 0 Player damage.

No further balance pass is scheduled. *(Campaign, Ranked and Friendly Battle moved to card combat on 2026-10-01, section 16.)*

### 15.8 Battle presentation (Battle UX pass, 2026-09-30)

Presentation only; no rule above changes.

- **Destruction per lane.** A lane's clash loser (both Units on a tie) plays a quick destroy beat (about 300 ms at 1x) right after the lane's Clash Damage, and the lane is empty before the next lane clashes. The engine still clashes all three lanes and then destroys the losers in one batch, and When Destroyed / Ally Destroyed / Enemy Destroyed effects still fire after the third lane. The playback reads the lane's own `HERO_DESTROYED` (or `SHIELD_CONSUMED`) from the event log, so a replay of the same log plays the same sequence (`components/animation/playback.ts`).
- **A battle card is a collectible card.** Hand cards, board Units and Card Inspect show the same card in four zones inside the rarity frame: a name bar, a framed art box (about 45 to 54% of the card's height on a 390px-wide phone; the longest cards and narrower phones go lower), a stats row with faction and rarity and ATK set into the frame (a Spell names its kind there), and a text box. A Spell zone shows the Spell's name and text. Hand cards are the most readable, board cards are compact, and Card Inspect adds HP Contribution beside ATK, with the full wording, Mastery and keyword help listed under the card. HP Contribution is not shown on hand or board cards.
- **Every effect on the card, in battle copy.** Each combat effect is a short battle line after a small-caps label: its timing (Passive, Round End, Clash, Destroyed, …; On Play was retired in section 18) or a keyword that says more (Guard 2, Your 2nd Spell, Enemy's 2nd Spell). Effects that share a label read as one paragraph under it, and a one-time Spell's effects need no label, since they happen once, when it is cast. The copy is `BATTLE_LINES` in `cardCombat/cardText.ts`, e.g. Royal Guard: "Passive: Adjacent allies +15 ATK.", "Destroyed: Adjacent allies gain +15 ATK." and "Passive: Spell Immune with Kingdom ally."; Archmage Vael: "Round End: If hand is empty, gain a Graveyard Spell." A few lines have a tighter board wording where part of the line stops mattering once the card is in play (a Bypass's "from next round"). Conventions: an ATK change with no duration lasts for the rest of the battle; "this round" marks temporary ones; "here" is this lane; "allies" are your other Units; "with …" holds while the condition does; "damage" always hits the enemy player (Units have no HP); no abbreviations beyond ATK and HP. Rules text is 10px in hand and 9.5px on the board at line height 1.15. Text never scrolls, is never cut off and never goes below 9px: a card with more text first tightens its spacing, then gives the text box room from the art box, then uses smaller type; the very longest texts are set slightly condensed.
- **Three layers of card information (Info layers pass, 2026-10-01).** The card face (above) is layer 1: everything that matters in a fight, at a glance. Layer 2 is the **focus panel**: in card combat, tapping a hand card, one of your Units, an enemy Unit or a filled Spell zone opens a panel over the hand area, under the board and the HP bar (`components/battleInfo/BattleDock.tsx`, content from `focusDetails.ts`). It shows the art, ATK (current and printed), HP Contribution, every effect's full rule, whether each conditional Passive is on now, and the card's live state: each ATK change by source and how long it lasts ("+15 ATK from Battle Banner, while it stays"), Shield and Silence, a revived or summoned Unit's entry ATK, and the Units in a Spell's lane. Tapping a hand card also selects it for placement, as before; the panel closes on placement, on Fight, with its close button, Back or Escape, or by tapping the same card again, and its Inspect button opens Card Inspect, layer 3, with keywords, Mastery and collection detail. Layer 3 also covers the **battle log** (`battleLog.ts`): while a round resolves, a short log under the board adds one line per effect and clash as the playback reaches it ("Royal Guard — Destroyed: Common Knight and Light Priest +15 ATK", "Battle Banner — Expired: Its Unit left play (Light Priest)", "Clash Damage — Left: 13 to Enemy (Common Knight 143 beat Vharos 130)"), built from the resolver's own events, so it never says more than happened. Between rounds the Log pill by the HP bar opens the whole match's log; it stays open from round to round until closed.
- **One card system everywhere (global card UX migration, 2026-10-01).** The card face, the focused card detail and Card Inspect are now the only card UI: battle (every mode), Collection, Deck Builder, Shop, Box contents and pack results, Structure Decks, events, banners and Campaign rewards all render `GameCard` and open the same focus detail and Inspect, with wording from `cards/cardPresentation.ts`. Since section 16 every battle plays card combat, so a card shows the same ATK, HP Contribution and wording in battle as in the Collection; the legacy-number branches are gone. Details: `docs/design/CARD-FACE.md`.

## 16. Card combat everywhere (2026-10-01)

At ozi's ask, card combat (sections 2 to 15, Clash Damage included) is the production combat of every mode. No rule, stat, effect, HP Contribution, Mastery percentage, deck-out rule, rarity or Box number changed. **Amended 2026-10-03 (section 17): combat Card Mastery is removed, so the Mastery lines below are superseded.**

### 16.1 One resolver

- `combat/combatModel.ts` (was `combatV2/featureFlag.ts`): a production build always plays `'card'`. There is no env list and no URL switch that routes elsewhere; `?combat=card` is accepted and changes nothing. Development builds can still open the old engines with `?combat=legacy` or `?combat=v2` for comparison.
- Roles: card = production, legacy (`src/game/engine`) = historical, kept so an old Friendly match record can finish; Combat V2 (`src/game/combatV2`) = experimental, its lab page shows only in development builds.
- Every match records `combatModel` and `cardCombat.version` (`CARD_RESOLVER_VERSION`, now 3 since section 17; version 2 matches still continue) in its state; local match history stores both (`combat/resolver.ts`).
- Decks need 8+ Units everywhere (`engine/deckRules.ts`, Deck Builder status and Battle Setup). The Arcane Control (Mage) archetype deck moved to its approved 8-Unit list.

### 16.2 Campaign

- Each encounter plays its own authored deck at printed values against the player's deck, also at printed values (section 17) (`campaign/battleSetup.ts`). Nothing reads the player's Level, Ascension or old Power: difficulty comes from deck construction and, for the boss, an HP pool.
- Each node carries an authored `difficulty` (Easy / Fair / Hard) shown on the stage sheet and Home in place of Recommended Power and Deck Strength. The stage sheet's Starting HP preview and the battle read the same helper.
- Boss: the Grave Tyrant fights from a **1,200 HP pool** instead of its deck's total. Challenge node Toll of the Ford starts the player at **70%** of their deck's Starting HP.
- Objectives were re-thresholded for card-combat numbers (rounds, HP kept, Clash Damage dealt) from the simulation.
- Simulated with `scripts/simulate-modes.mjs` (seed 20261001, 300 games per row, Kingdom starter at printed values): Easy nodes 81–97%, Fair 62–68%, Hard 39–53%, boss 39%, median 7–14 rounds, no match ended through a fallback.

### 16.3 Ranked AI

- `ranked/tiers.ts`: each division has fixed rival decks. Rivals get harder through deck construction only (plain Commons, then synergy, then optimized lists) and the AI. Since section 17 there are no rival Mastery tiers. Nothing reads the player's decks, Legacy Level or Power.
- The Ranked screen shows the next rival's deck name and tier line.
- Simulated averages over the three starters, as shipped 2026-10-01 with rival Mastery: Bronze ~88%, Silver ~71%, Gold ~53%, Platinum ~48%, Diamond ~37%, Master ~36%. Printed-value numbers: section 17.3.

### 16.4 Friendly Battle

- Both clients send `rules: { combatModel, resolverVersion }` with their deck snapshot. `api/create-match.ts` builds the match with `createCardMatch` only when both match the server's production rules; otherwise the room is abandoned with a 409 "different versions of Moonwater" message.
- Every card plays at its printed values for both players (section 17; the old "both players at Mastery I" rule is gone because there is nothing left to equalize), so a Friendly match is decided by decks and play, not collection depth.
- `api/_lib/resolveRoundInternal.ts` picks the resolver from the stored match: a card match must carry the current resolver version (a mismatch is a 409 and writes nothing) and continues the stored RNG state; a legacy match record still finishes on the legacy resolver; Combat V2 is refused. A client whose rules differ from the stored match shows an alert and does not submit.
- The guest's view flips every side-keyed card-combat field. A version 2 record may still carry a per-card Mastery table; it is redacted and flipped if present, and nothing reads it.
- Fixed in passing: clients no longer begin a round locally on top of the server's begin.

### 16.5 Progression and saves

- ~~Card Mastery I–V is the only card progression.~~ Superseded 2026-10-03 by section 17: there is no combat Card Mastery, no copies or Gold can be spent on it, and `economy.masteryGoldFee` is inert config.
- **Legacy Level is retired.** It has no effect on any battle, its panel is gone, and its daily and weekly missions became "Fight 3 battles" / "Fight 15 battles". The Gold a save spent on it is refunded once (`save/migrations.ts`): the economy (now v5) records the grant id `legacy-level-refund-v1` in the same write as the Gold, so a crash or a second run can never pay twice, and the migration marker `moonwater:saveMigration` records the version. Level data itself is kept untouched. Home shows a one-time note with the amount.
- **Deck Strength is gone.** Home shows the active deck's real Starting HP and the next Campaign battle's difficulty instead. Old Power, Hero, Tactic and Legacy Level wording is removed from player UI (a test scans the screens for it).
- Saves keep every key: collection counts, decks, Ascension ranks and duplicatesSpent (historical, no combat effect, section 17.5), Level data, Tactic data and match history.

### 16.6 Fonts

Cinzel, Alegreya, Alegreya SC, Bree Serif and Nunito (all SIL OFL) are bundled from `@fontsource` (latin subset, `styles/fonts.css`) and ship inside the build, so cards render the same offline and in the Capacitor app. Google Fonts is no longer loaded.

## 17. Combat Card Mastery removed (2026-10-03)

At ozi's ask (Batch 12 follow-up), Moonwater ships the card-combat foundation **without combat Card Mastery**. There is one authoritative printed version of each card.

### 17.1 Combat

- No stored Mastery or Ascension rank changes HP Contribution, Starting HP, ATK, Clash Damage, effects, numbers, conditions, Passives, Graveyard behaviour, tokens or any other combat value. `cardCombat/mastery.ts` is deleted; `cardCombat/stats.ts` exposes only printed values (`printedStats`, `hpContribution`).
- **Starting HP is the sum of the printed HP Contribution of the deck's Units** (`deckStartingHp`). Collection, Deck Builder, Battle Setup, Campaign, Ranked, Friendly, Quick Battle and the simulator all read that one helper.
- `createCardMatch` takes no Mastery table. New matches no longer write `cardCombat.masteryStage`; the field is optional and only appears in version 2 records.
- Clash Damage and immediate destruction are unchanged.

### 17.2 Resolver version

- `CARD_RESOLVER_VERSION` is **3**. Round resolution is identical to version 2; only match setup changed (no Mastery table, no Mastery HP bonus). A version 2 match already stores its Starting HP, so it continues to the end under the same code (`CONTINUABLE_CARD_RESOLVER_VERSIONS` in `combat/resolver.ts`, used by `api/_lib/resolveRoundInternal.ts`). New Friendly rooms require both clients on version 3. Legacy Friendly records still finish on the legacy resolver.

### 17.3 Ranked and Campaign

- Ranked rival Mastery tiers are gone (`ranked/tiers.ts`): difficulty comes from each division's decks and the AI only. Tier copy no longer mentions Mastery.
- Campaign encounters were already authored at Mastery I, which equals printed values, so no encounter changed and no encounter deck was adjusted.
- Re-simulated with printed cards (`scripts/simulate-modes.mjs`, seed 20261001, 300 Campaign / 200 Ranked games per row):
  - **Campaign:** byte-identical to the 2026-10-01 run (the player was already simulated at printed values and encounters at Mastery I). Kingdom starter: Easy 81–97%, Fair 62–68%, Hard 49–53%, Grave Tyrant 39%; no fallback endings. No encounter deck changed.
  - **Ranked, average of the three starters:** Bronze ~88%, Silver ~72%, Gold ~54%, Platinum ~51%, Diamond ~41%, Master ~39% (with rival Mastery it was 88 / 71 / 53 / 48 / 37 / 36). Removing rival Mastery made Diamond and Master the same three decks, so **Master now plays only Blood Onslaught and Iron Rank** (Ember Pact dropped). No card stat changed. Full tables: `mode-sim-results` from the script; this run's copy is in the PR #12 amendment report.

### 17.4 UI and spending

- Card Inspect, the focus panel, card faces, Deck Builder, Collection, Shop, Moonwell results and Campaign results show no Mastery progression: no "HPC +X%", no "ATK never changes", no Next Mastery, no Mastery pips or numerals, no "Card Mastery available" dots, no Mastery sort.
- Historical rank is not shown anywhere in the player UI, Card Inspect included (removed 2026-10-03 so players never see an unfinished migration concept). It stays in the save for the future Prestige conversion; the dev tools still read it (`skyloomDev.ascensionReport()`).
- `ascendCard` refuses every request and spends nothing. No copies and no Gold can be spent on Mastery. `MASTERY_GOLD_FEE` and `economy.masteryGoldFee` remain as inert config (a test checks nothing reads the fee).
- The daily mission "Raise a card's Mastery" became "Play a Ranked battle" (same 15 Gem reward); Journey copy that promised Mastery was rewritten.
- Spells: no Spell Mastery, no Unit Mastery, no Mana.

### 17.5 Historical data

Historical Ascension/Mastery data is preserved for future cosmetic Prestige conversion and has no combat effect. Stored ranks and `duplicatesSpent` (`skyloom:ascension`) are never deleted, refunded or erased, and nothing in combat reads them. The Prestige migration is **not** performed. PR #12's other save work stays: the Legacy Level retirement and its one-time Gold refund, Deck Strength removal (not replaced by a Mastery number) and the Easy / Fair / Hard Campaign labels.

### 17.6 Moonwell Summon

Moonwell Summon is **deprecated for card acquisition**. Its Mastery chips and "Ascension available" result lines are removed. **Update (section 19, cleanup pass):** the Summon screen, banners, pool and pity code are now removed; its reveal ceremony opens Box packs, and its saved pity and history stay in the save, read-only.

### 17.7 CARD PRESTIGE — FUTURE, NOT YET IMPLEMENTED

- Cosmetic only. It never affects Ranked or Friendly, and never any combat value anywhere.
- It may use duplicates and Gold, and may have a I–V presentation.
- Possible stages: card frame, foil, entrance effect, animated art, Moonlit treatment.
- The copy ladder and Gold costs are **not locked** (the old 1 / 2 / 3 / 4 copies and 500 / 1,500 Gold are not decisions for Prestige).
- Existing investment (historical ranks and `duplicatesSpent`) should eventually carry over.

### 17.8 Commanders — FUTURE, NOT YET IMPLEMENTED

- A Commander is chosen with a deck and is not one of the deck's 15 cards. Each has one faction affinity. 4 at launch.
- No gacha: Commanders come from the free starter, progression or a fixed price.
- One printed Skill may affect Ranked, and it never scales with Commander level. Level, talents and Relics are PvE-side only.
- Skills are designed alongside the real 120-card archetypes, not before.

## 18. Timing cleanup and Spell lifetime (resolver v4, 2026-10-03)

At ozi's ask (cleanup pass), card combat has **no On Play timing** and every Continuous Spell names what it belongs to. Full card-by-card table: project file `moonwater/cleanup-pass/migration.csv`; report `moonwater/cleanup-pass/REPORT.md`.

### 18.1 Timing vocabulary

| Timing | Meaning |
| --- | --- |
| Passive | True while the Unit is in play and its condition holds. ATK auras are read live (`passiveAtkSources` in `cardCombat/engine.ts`), never stored on the Unit, so they end the moment the source leaves, is Silenced or its condition fails. |
| Round Start | Once at the start of each round, for each Unit in play. The hook exists; no printed card uses it after this pass. |
| Round End | Once at the end of each round while in play. |
| Clash (Before Combat) | Before the clashes, in initiative order (alternating by round, unchanged). |
| Destroyed | Once, when the Unit is destroyed (a Shield that saves it is not a destruction). |
| Reactions | Your Spell, Your 2nd Spell, Enemy Falls, Ally Falls, Enemy's 2nd Spell (unchanged). |
| Cast | A one-time Spell's effect, once, when it resolves. It is a Spell's only timing and is not printed as a label. |

- **Shield** is printed as a keyword on Paladin, Light Priest and Crypt Warden (a Passive Shield): the first time the Unit would be destroyed it survives instead, once per Unit in play. Silence does not remove it. A revived or returned copy is a new Unit in play with a fresh Shield. A Unit at or under the death line (35 ATK) uses it there.
- Ten Units had On Play effects. Each was re-authored by its role, never blindly to every round: Royal Guard (aura + Destroyed), Light Priest (Round End 45 HP instead of 135 once), Paladin and Crypt Warden (printed Shield), Forest Wolf (Passive), Mira and Grave Sage (Destroyed), Runebreaker (Clash), Infernal Lord (Destroyed −15 to every enemy, Clash Spell break). **Hellhound's one-round Silence is retired**: every lasting form tested switched the facing Unit off for good (Undead Starter vs Infernal 38% → 0%). Its Clash −30 stays.
- The 17 one-time Spells only rename ON_PLAY to CAST (`castSpell` in `cardCombat/cards.ts`); they play exactly as before.

### 18.2 Spell lifetime (`spellBinding`)

Every Continuous Spell declares `spellBinding: 'UNIT' | 'LANE'` in `cardCombat/cards.ts`. No current Spell is global: every one is written about its lane.

| Spell | Binding | Why |
| --- | --- | --- |
| Battle Banner | UNIT (Attached Spell) | "+15 ATK to the Unit here": its whole purpose is that Unit. |
| Fortify | UNIT (Attached Spell) | Grows one Unit each Round End; a new Unit was never its target. |
| Burning Ground | LANE | Hits whatever enemy stands in the lane. |
| Growth Totem | LANE | Feeds whichever ally holds the lane (off-roster). |
| Cursed Ground | LANE | Pays off any enemy death into the lane's ally. |
| Siege Fire | LANE | Works best when the lane is empty. |
| Grave Totem | LANE | Saves the first ally lost in the lane each round. |

- An **Attached Spell** needs your Unit in its lane (one already there, or one placed in the same deploy). On reveal it attaches to that Unit (`SpellZoneInstance.boundTo`). When that Unit leaves play, the resolver pushes `SPELL_EXPIRED` right after the Unit's `HERO_DESTROYED`, moves the Spell to the Graveyard and frees the slot. A Shield that saves the Unit keeps the Spell.
- On the board the Spell chit fades and breaks in step with its Unit (`chitEffects.ts`), the battle log says "Battle Banner — Expired: Its Unit left play (Light Priest)", and the Graveyard sheet lists it. Expiry adds no extra playback step.
- Card wording: the type line reads "Attached Spell", the text "The Unit it is attached to has +15 ATK.", and Help explains Attached and Continuous Spells.

### 18.3 Resolver and events

- `CARD_RESOLVER_VERSION` is **4**. The Unit On Play phase and the `ON_PLAY` event are removed from card combat; new events: `SPELL_ENTERED` (with `attachedTo` for an Attached Spell) and `SPELL_EXPIRED`. The legacy resolver keeps its own On Play for legacy records only.
- `CONTINUABLE_CARD_RESOLVER_VERSIONS` is `[4]`. A stored v2/v3 card match is **not** continued under v4 rules, because cards already in play would change mid-match. The client shows `rulesChangeNotice` and keeps the Fight button disabled, and the Friendly server answers 409 without writing anything. New Friendly rooms need both clients on v4.

### 18.4 Balance

Re-simulated before/after with the production resolver and AI (`scripts/simulate-deck-matrix.mjs`, `scripts/simulate-modes.mjs`). Results are in `moonwater/cleanup-pass/sim/`. Matches did not get longer (median 9, p90 12 rounds), max ATK is unchanged (244), there were no death-chain safeguards and Graveyard returns stayed flat. The Kingdom Starter's drop comes entirely from Battle Banner becoming Attached (a lane-bound Banner restores it). **Decided (ozi, 2026-10-04):** Battle Banner stays Attached at +15 ATK. The lifetime rule matters more than the old Kingdom win rate, and there is no compensating buff; Kingdom balance is revisited with the wider card pool.

## 19. One card-acquisition path: packs (2026-10-03)

> **Superseded by section 20 (launch set):** the Moonfall Box and 5-card packs are retired. Cards now come from Core, nine archetype Boxes (1 pull = 1 card), Structure Decks and the Campaign; a Pack Ticket pays for one pull. The rest of this section is the history of that change.

At ozi's ask (cleanup pass), Moonwater has one model: **"I open packs to get cards."**

- **Packs from finite Boxes** are the only card-acquisition path (plus Structure Decks and the Campaign/Journey grants). The Moonfall Box price (150 Gems a pack), size, rarity counts and duplicate handling are unchanged.
- **Pack Tickets** (the former Summon Tickets, same storage) open one pack of the same Box each (`buyBoxPacks(count, box, 'tickets')`). Tickets are never a hidden fallback for Gems.
- **Ticket rewards (ozi, 2026-10-04):** 1 Pack Ticket = 1 pack = 5 cards, with no fractional Tickets. A Summon Ticket was one card, so the free legacy quantities were cut: Journey Day 2 grants 1, the weekly "Open 5 packs" mission 1 (since 2026-10-04 "Complete 5 daily missions"; the other weekly missions none), Ranked rating 300 keeps 1, and the Long Vigil keeps one Ticket (login Day 6). Paid offer quantities and prices stay as prototype placeholders, and saved Summon Tickets carry over 1:1. Every Ticket source and the monetization principles are in [ECONOMY-BASELINE.md](ECONOMY-BASELINE.md).
- **The reveal ceremony** that belonged to the Moonwell Summon now opens packs (`components/reveal/RevealStage.tsx`, `game/reveal/`). One pack turns all five cards over in rising rarity, spotlights each Epic and ends on the rarest card's hero reveal; ten packs play one opening, one quick beat per pack, a spotlight for each Epic and Legendary and the best card last. A tap finishes the current beat and Skip jumps to **Pack Results**. The reveal is pure presentation of an already-granted opening.
- **Removed:** the Summon screen and route, banners, banner pool, rarity rates, pity, preview, dev controls and the `summon` config section. **Kept:** the Moonwell visual components and the reveal timeline, sound and meteors (renamed to neutral reveal modules), and the saved Summon pity and history, which stay **read-only** (`economy/legacySummon.ts`). A save that used the Summon still counts as having opened packs for Shop unlocks.
- Terminology: Open Pack, Open 10 Packs, Pack Ticket, Box, Pack Results. Analytics `pack_opened`, `pack_ticket_used` and `pack_results_viewed` replace `summon_*`. The missions were "Open a pack" and "Open 5 packs" until pack-gated missions were retired (2026-10-04, [ECONOMY-BASELINE.md](ECONOMY-BASELINE.md)).

## 20. The launch set: 116 cards, Core and nine archetype Boxes (resolver v5, 2026-10-05)

Implements the approved 116-card set design (project files `moonwater/card-set-120/`: FINAL-PASS over SECOND-PASS over REPORT). No card was invented or rebalanced beyond those files; the one rules fix found during implementation is listed below.

### 20.1 Roster

- 116 cards, 3 factions (Kingdom 39, Undead 38, Infernal 39), 9 archetypes. Every pre-launch card id is kept. `cards/launchRoster.ts` holds one row per card: its archetype, its source (`core`, `box`, `structure-deck` or `event`), its Boxes (headline first), its printed ATK and HPC, and its complexity band (C1-C6, review only, never shown).
- New cards live in `cards/launchCards.ts`; changed existing cards are rewritten in `cardCombat/cards.ts` (`LAUNCH_CHANGED_IDS`). Printed ATK comes from the roster (`stats.ts` reads `LAUNCH_ATK`), and HP Contribution still follows the formula from it.
- Renamed: Paladin is **Dawnshield Paladin**, Vharos is **Vharos, the Undying**. Rarity moves: Siege Fire Common, Soul Burn Rare, Death Wave Epic. Bone Soldier gains the Undead tag.
- Reference decks (`cards/launchDecks.ts`): 3 Core starters, 9 optimized, 6 budget, 3 Structure Decks, all legal and pinned by tests. They are fixtures for the AI, tests and playtest selection, never win-rate claims. No win-rate test exists.
- Art: the new cards (and Death Wave, now on the roster) have no pixel art yet and use the faction placeholder (`pixelArt.test.ts` NO_ART_YET). TODO: art pass.

### 20.2 New engine primitives

| Primitive | Where | Used by |
|---|---|---|
| Units-only Graveyard count | condition `GRAVEYARD_COUNT_AT_LEAST` with `units: true`; count basis `GRAVEYARD_UNIT_COUNT` | Grave Sexton, Bone Wall, Bone Soldier, Bone Dragon |
| Count cap | `CHANGE_POWER_BY_COUNT` `max` | Bone Soldier (+45), Bone Dragon (+45) and other "up to" cards |
| "Would lose its lane" targeting | target `ADJACENT_ALLIES_LOSING` | Dawnshield Paladin, Morwen |
| Revive into an empty lane | `REVIVE_TO_LANE` with `emptyLane: true` (the first empty lane, left to right; none empty = no revive) | Morwen |
| Attached Spell return on expiry | Passive `RETURN_EXPIRED_ATTACHED`: once per round per Unit, and a copy that already came back once this match goes to the Graveyard instead, so it can never loop | Saint Aveline |
| Once per battle per physical lane Spell | condition `SPELL_ZONE_NOT_USED_THIS_BATTLE`, `SpellZoneInstance.usedThisBattle` (a recast copy is a new instance and starts fresh) | Grave Totem |
| Enemy Spell this round OR in play | condition `ENEMY_SPELL_ACTIVE` | Grave Totem, Barrow Knight and the other anti-Spell cards |

Also new: the Skeleton token (65 ATK). `launchPrimitives.test.ts` checks each primitive through the real round resolver.

**Rules fix found during implementation.** Grave Sexton and Bone Wall say "3+ Units in your Graveyard", but the study tooling counted every Graveyard card. The game counts Units only, as printed. Their win rates in the study may read slightly high as a result; no number was changed.

### 20.3 Resolver

`CARD_RESOLVER_VERSION` is **5** and `CONTINUABLE_CARD_RESOLVER_VERSIONS` is `[5]`. A stored v4 match ends with the rules-changed notice (changed cards resolve differently), and the Friendly server answers 409 for it.

### 20.4 Acquisition

- **Core** (30 free cards, 10 per faction, each at its deck limit): a new account picks its starter faction once (`components/StarterFactionPick.tsx`) and gets that package and its starter deck. The other two packages unlock on the first clear of Broken Palisade and Ford of Ash (Kingdom, Undead, Infernal order, skipping the starter). Packages only raise counts, never duplicate. Paladin, Vharos and Infernal Lord are Core.
- **Nine archetype Boxes** replace the Moonfall Box: 1 pull = 1 card, a 10-pull = 10 cards, drawn without replacement, one flagship Legendary each, restock only when empty. See [BOX-ARCHITECTURE.md](BOX-ARCHITECTURE.md).
- **Structure Decks**: Bone Legion, Hellfire and Crusade, one per account, each with 2 debut cards that are in no Box. Graveborn Rising is retired from sale; owners keep it.
- **Event / progression cards** (6, incl. The Grave Tyrant): registered in `cards/eventCards.ts` with their planned source. TODO: hand them out when those events and chapters are built.
- **Campaign** card rewards are unchanged.
- The reveal shows exactly 1 or 10 cards (no packs): the same Moonwell opening, a spotlight for each Epic and the Legendary hero reveal, tap, Skip and reduced motion; rewards are saved before the reveal starts. **Pull Results** replaces Pack Results; analytics `box_pulled`, `box_restocked` and `pull_results_viewed` replace `prototype_box_opened`, `pack_opened`, `box_reset` and `pack_results_viewed`.

## Appendix: collection, Box and save rules

- Collection is a copy count per card. `cardMastery/model.ts` is now a historical read model over legacy Ascension (stored rank 0..4 was Mastery I..V); it has no combat effect (section 17). See [COLLECTION-PROGRESSION.md](COLLECTION-PROGRESSION.md).
- Cards are pulled one at a time from nine finite archetype Boxes of 25-33 cards (copies per card: Legendary 1, Epic 2, Rare 3, Common 4), paid with Gems or Pack Tickets (section 20, [BOX-ARCHITECTURE.md](BOX-ARCHITECTURE.md)). The retired Moonfall Box (100 five-card packs over the old 52-card roster) is deleted from saves by the launch-set migration; cards opened from it stay owned.
- Keep card IDs, collection counts, deck definitions, `skyloom:*` storage keys and historical event names intact.
- Before replacing Legacy Level or Ascension behaviour, ship an idempotent, versioned migration with tests for old saves, missing fields, max-rank cards, duplicate inventory and playable decks.
