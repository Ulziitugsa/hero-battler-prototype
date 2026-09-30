# Moonwater card combat design

Status: **authoritative design, not yet implemented.** This document is the single source of truth for Moonwater's core combat direction: a premium collectible three-lane card battler where Units have **ATK** and an **HP Contribution** that sums into the player's Starting HP. It supersedes [COMBAT-V2-DESIGN.md](COMBAT-V2-DESIGN.md) (per-Unit HP, historical) for future core-combat work.

Nothing here is live. Every mode still runs the legacy resolver (Power, fixed 20 HP, overflow). The model below was validated with the seeded simulator in `src/game/cardSim/` ([CARD-COMBAT-SIMULATION.md](CARD-COMBAT-SIMULATION.md)); section 12 is the plan for moving production onto it. ozi approved the stat model and the section 13 defaults on 2026-09-29; section 14 is the effect and archetype balance pass run on top of them, whose card changes ozi approved the same day as the baseline card data for the new model. They exist today as simulator overrides; the live card files and every game mode stay on the legacy resolver until the production card resolver is built on request.

## 1. Design goals

- **Cards first.** A Unit is a card, not a hero: art, name, faction, rarity, one effect, **ATK** and **HP Contribution**. There is no per-Unit health, no Unit HP bar, no Unit healing.
- **Readable clashes.** Three lanes, simultaneous reveal, the higher ATK wins. A player should predict most clashes by reading two numbers.
- **Empty lanes matter.** An open lane lets a Unit hit the opposing player for its full ATK. Blocking, leaving a lane open and forcing a lane open are the core decisions.
- **Deckbuilding tradeoffs.** Starting HP comes from the deck, so Unit count and card choice shape how long a player can survive.
- **Bounded progression.** Mastery and rarity make cards desirable without deciding clashes. A well-played base deck must be able to beat a maxed one.
- **Mobile pacing.** Portrait, one-handed, short matches: a design target of about 9–12 rounds (current balanced baseline: median 12, p90 15, accepted for playtesting; section 14.4).
- **Safe migration.** No save rewrite, no mode switch and no removal of legacy systems until each phase in section 12 passes its gate.

## 2. Rules

| Rule | Card model |
| --- | --- |
| Deck | 15 cards. 2 copies per card, 1 for a Legendary (unchanged). **At least 8 Units (approved).** |
| Starting HP | Sum of the deck's Unit HP Contributions. Spells and battle tokens contribute 0. |
| Round | Hand refills to 3, simultaneous deploy into 3 Unit lanes and 3 Spell slots, then the live phase order: Reveal → Spells left to right → Unit On Play → Before Combat → Combat → death chains → After Combat → Round End → temporary effects expire. Initiative alternates by round. An empty deck just stops drawing; there is no deck-out loss (approved, section 15.7). |
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

- Compare effective ATK after Spells, On Play and Before Combat effects. Higher wins; the loser is destroyed; the winner keeps its ATK and stays in the lane. **Since section 15 the loser's player also takes the ATK difference as Clash Damage.**
- **Tie: both destroyed.** "Neither destroyed" was tested and rejected: it tripled board locks (tie rate 9.5%), raised stalls and pushed p90 to 16 rounds.
- **No overflow (approved, superseded by section 15).** The live engine makes the losing side's player take the ATK difference. Without it, a blocker fully absorbs any attacker, which is what makes the lane game about blocking. With it, games run 2 rounds shorter, 35–40% of kills come from overflow, a clash loss hurts twice and chump-blocking decks collapse (Undead starter 0.44 → 0.31).
- A Unit reduced to or below the Power 0 line (35 ATK on the baseline) is destroyed, preserving the legacy "Power ≤ 0 dies" rule.

## 6. Direct attacks

- An unopposed Unit deals its full ATK to the opposing player. Bypass effects (Mirage Imp, Shade Thief, Wraith Prince) already do exactly this past a blocker.
- Measured on the recommended rules: a player takes about 9.4 direct hits per match; the winner lands about 7.2, averaging about 130 per hit against about 900 HP. 90% of kill shots are direct hits, 10% are effect damage.
- **One open lane is a real threat, not a loss.** A single strong Unit (145 ATK) needs about 6 unanswered hits to kill a 900 HP deck. The largest single hit seen was 64% of Starting HP, from stacked permanent growth; without the Graveyard cap it exceeded 100%. A per-card growth cap is still advisable (section 9).
- **Two open lanes** roughly halve the clock, which is the intended punishment for losing the board.
- 75% direct damage was tested: games ran longer and nothing improved. No cap or scaling is recommended.

## 7. Mastery

- **HPC only: +5 / +10 / +15 / +20% HPC at Mastery II–V. No ATK step.** A maxed 11-Unit deck gains about +180 Starting HP, under two average hits.
- Mirror results (M5 against M1, same deck and pilot): HPC-only 0.52–0.54 win share. Thread D's option MA (+3% ATK, +10% HPC) scored **0.86–0.93**, because any ATK step wins 100% of same-card clashes and each won clash compounds. A well-played M1 deck still beats a badly played M5 deck 61–68% of the time under HPC-only.
- **Effect stages (III and V) must never flip a clash.** Even a +10% ATK once-per-match stand-in reached 0.77. Effect stages should be HPC, cosmetic, or once-per-match utility without ATK.
- Ladder unchanged: 1 / 2 / 4 / 7 / 11 copies owned for I–V (a card run at 2 copies needs 12 in practice, because deck copies are protected).
- Spells get a Mastery path so duplicates are never dead: II and IV cosmetic, III and V raise the Spell's own number about 10% each, subject to the same "never flips a clash on its own" review.
- **Legacy Level** (+15 / +30 ATK at Levels 30 / 60) is bigger than the whole Mastery budget. The card resolver never reads it; it retires for combat at the moment a mode moves to the card resolver. **Approved save treatment: refund invested Gold only, and only in the same release as a new Gold sink.**

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

The legacy resolver stays available, and remains the default, through every phase. Each phase is a separate reviewed change with a per-mode switch that can be turned off without a deploy of new code.

| Phase | Scope | Gate to start the next phase |
| --- | --- | --- |
| 0 (this change) | Simulator, design, plan. No mode switched | ozi's decisions on section 13 |
| 1 | Production card resolver behind a feature flag, plus card stat data | Parity tests against the simulator; determinism and replay tests; `npm run check` green |
| 2 | **Quick Battle** on the card resolver, with the battle UI changes in 12.4 | Internal playtest: median 8–10 rounds, no stall reports, players describe HP correctly |
| 3 | **Campaign** | Every encounter rebuilt and re-simulated to its target length; boss nodes use a boss HP pool |
| 4 | **Ranked AI** | AI decks carry a fixed Mastery stage per tier and stop borrowing the player's Level and Ascension |
| 5 | **Friendly Battle** and remaining legacy modes | Both clients and the API agree on a resolver version per match |
| 6 (later) | Save migration: Legacy Level refund with a Gold sink, Mastery re-authoring | Versioned, idempotent migration with tests; separate release |

Flag: extend `combatV2/featureFlag.ts` from `'legacy' | 'v2'` to include `'card'`, read from a new `VITE_CARD_COMBAT_MODES` list with a dev-only `?combat=card` override, mirroring the existing V2 switch. Combat V2 stays in the codebase as an isolated lab until a separate decision retires it.

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

The production card resolver is not implemented and no mode moves to it until ozi asks.

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

Campaign, Ranked and Friendly Battle stay on the legacy resolver until ozi asks. No further balance pass is scheduled.

### 15.8 Battle presentation (Battle UX pass, 2026-09-30)

Presentation only; no rule above changes.

- **Destruction per lane.** A lane's clash loser (both Units on a tie) plays a quick destroy beat (about 300 ms at 1x) right after the lane's Clash Damage, and the lane is empty before the next lane clashes. The engine still clashes all three lanes and then destroys the losers in one batch, and When Destroyed / Ally Destroyed / Enemy Destroyed effects still fire after the third lane. The playback reads the lane's own `HERO_DESTROYED` (or `SHIELD_CONSUMED`) from the event log, so a replay of the same log plays the same sequence (`components/animation/playback.ts`).
- **Every effect on the card, in battle copy.** Hand cards, board Units and Spell zones show every combat effect as a compact row: a small timing chip (On Play, Clash, Passive, Destroyed, …) and a short battle phrase (`BATTLE_LINES` in `cardCombat/cardText.ts`, e.g. Royal Guard: "Adjacent allies +15 ATK", "Spell Immune with Kingdom ally"). Artwork takes about half the card, and the name and current ATK come next. Battle copy conventions: an ATK change with no duration lasts for the rest of the battle; "this round" marks temporary ones; "here" is this lane; "damage" always hits the enemy player (Units have no HP). Card Inspect keeps the full sentences and adds HP Contribution, Mastery and keyword help. HP Contribution is not shown on hand or board cards. The card body never scrolls.

## Appendix: collection, Box and save rules

- Collection is a copy count per card. Card Mastery is a read model over legacy Ascension (`cardMastery/model.ts`); only 6 Units have paths today. See [COLLECTION-PROGRESSION.md](COLLECTION-PROGRESSION.md).
- The Moonfall Box is a finite 100-pack pool (500 cards: 258 Common, 168 Rare, 54 Epic, 20 Legendary; per card 14-15 / 8 / 6 / 5, so Mastery V takes 1 / 2 / 2 / 3 Boxes) that shows its remaining contents. The copy split is approved (section 14); prices are unchanged and not part of this design.
- Keep card IDs, collection counts, deck definitions, `skyloom:*` storage keys and historical event names intact.
- Before replacing Legacy Level or Ascension behaviour, ship an idempotent, versioned migration with tests for old saves, missing fields, max-rank cards, duplicate inventory and playable decks.
