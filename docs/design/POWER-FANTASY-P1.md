# Gameplay Evolution Phase 1: Power Fantasy Prototype

October 17, 2026. Experimental branch `claude/moonwater-power-fantasy-p1`, cut from master at `b41718c`. Not for merge
until reviewed.

## Part A: implementation baseline (written before any engine change)

### What was inspected

- `master` (`b41718c`) and PR #28 (`claude/moonwater-card-discovery-lab`, `a9fe1b1`, not merged).
- The resolver: `src/game/cardCombat/engine.ts` (resolver version 5), its card data (`cardCombat/cards.ts`, the card
  files), its stat model (`cardCombat/stats.ts`), the shared types (`game/types`), the AI (`cardCombat/ai.ts`), the
  playback reducer (`game/engine/replay.ts`) and the animation layer (`components/animation`).

### What is reused from PR #28

PR #28 stays unmerged. This branch ports the parts that are pure infrastructure, unchanged in behaviour:

| From PR #28 | Used here for | How |
| --- | --- | --- |
| `lab/storageGuard.ts` | Refusing every save write while the experiment is open | Copied as-is |
| The early-guard pattern (`lab/earlyGuard.ts`) | Installing the guard before any game module runs | Same pattern, for `?trials` |
| The build gate (`__CARD_LAB__`, `vite.config.ts`) | Keeping the experiment out of production builds | Same gate and the same rules |
| `GamePage`'s `sandbox` and `labLayer` props | Real battles that record and grant nothing, plus an overlay drawn from the resolver's events | Same props and code, with one more sandbox-only callback (`onRoundEnd`) |
| `lab/scenarios.ts` `buildScenario` idea | Arranging a board, hands, Graveyards and deck order on a real match | Rewritten for puzzles (fixed deck order, Starting HP) |

The archetype pages, the AI report, key moments and "cards worth exploring" are not ported: they answer PR #28's
question, not this one.

### Technical limitations found

| Area | What the resolver does today | Consequence for the prototypes |
| --- | --- | --- |
| **Growth cap** | Every permanent ATK gain stops at +45 above the ATK a Unit entered with (`changeAtk`, `GROWTH_CAP_ATK`). | No permanent scaling beyond +45 is possible. Doubling, or growth that keeps going, needs an explicitly uncapped rule. |
| **No multiplication** | Every ATK change is additive (`CHANGE_POWER`, `SET_POWER`, `CHANGE_POWER_BY_COUNT`). | "Double its ATK" needs a new action. |
| **Large numbers** | ATK is a plain JS number; nothing caps it. Player HP is clamped at 0, and Clash Damage is `winner − loser`. | No integer overflow risk below 2^53, but nothing stops an unbounded value either. A display ceiling is needed so the numbers stay readable (a board chit has room for 4 digits). |
| **Resurrection** | Each physical card copy may return from the Graveyard once per match (`graveMarks`, `returned`). `REVIVE_SELF` revives once, at a fixed ATK. | This rule is both the loop guard and the reason repeated resurrection is impossible. Repeated returns need their own explicit, bounded counter. |
| **Death chains** | `destroyAndChain` resolves deaths first-in, first-out, Destroyed effects first, then Ally Falls and Enemy Falls reactions, then the 35-ATK sweep. It stops after 64 steps (`SAFEGUARD_TRIPPED`). | Deterministic, with a hard backstop. A resurrection loop would be cut off at 64 steps but must never get near it. |
| **No "returned to play" timing** | A revive logs `REVIVED`; nothing reacts to it. | A payoff for resurrection needs a new reaction timing. |
| **Exile** | Only the enemy *Graveyard* can be exiled (`EXILE_FROM_GRAVEYARD`). A Unit in play can only be destroyed, and Shields, Destroyed effects and Graveyard entry always follow. | No clean answer to a Unit that comes back or that a Shield protects. |
| **Multi-target destruction** | `DESTROY` already accepts `ALL_ENEMIES`, and `destroyAndChain` handles several Units at once. Spells resolve left to right, with initiative breaking ties in a lane, and `spellsThisRound` counts the Spells already cast. | Board-wide destruction works technically today. Whether it can be *conditional on setup* is what has to be added: lane spread and a threshold that grows with the Spells already cast. |
| **Immunity and Silence** | Hostile actions are filtered by live Passive immunity (`hostileFilter`). A Unit Silenced when it dies runs no Destroyed effects (`destroyAndChain` reads Silence before removal). | Existing counters work against new hostile rules for free, as long as new rules are routed through `hostileFilter` and the normal death path. |
| **Targeting** | Placement is targeting: every effect resolves from its card's lane (`locations`). There is no "choose a target". | New effects must target by lane too. Lane spread is a natural fit; free targeting is not. |
| **Determinism** | Every random pick draws from the match's seeded stream, carried in `GameState.rngState`. The AI picks from the pre-round state (simultaneous deploy). | A puzzle with a fixed deck order and seed is fully deterministic, including the opponent's AI plays, so puzzles can be proven solvable by search. |
| **Animation** | Playback replays the round's events (`replay.ts applyEvent`). The board shows whatever the events say: `POWER_CHANGED.to`, `REVIVED.power`, `HERO_DESTROYED`. | New rules that log only existing event shapes animate correctly with no playback change. Exile needs one flag on `HERO_DESTROYED` (it must not enter the Graveyard in replay). |
| **Save compatibility** | Stored matches carry `cardCombat.version`; a different `CARD_RESOLVER_VERSION` ends a stored match with the rules-changed notice. | The new rules are additive and no production card uses them, so the version stays at 5. Stored matches continue unchanged. No save format changes. |
| **Card catalogue** | `getCard` resolves the catalogue (`ALL_CARDS`) and, separately, battle-only tokens that are in no list. | Experimental cards can follow the token pattern: resolvable by id, absent from every list (collection, Boxes, Deck Builder, decks). |
| **Card text** | Card faces read curated copy (`BATTLE_LINES`), falling back to the ability's own text. | Experimental cards use the fallback: their ability text is written in the card-text register. |

### Parity baseline

Before any engine change, `src/game/cardCombat/engineParity.test.ts` played one seeded AI-vs-AI battle for every ordered
pair of the 21 reference decks (441 battles) and hashed every event and every final state: `441:c7080c73`. The test
pins that value, so any change to how a production card resolves fails it.

## Part B: the three prototype combinations

Seven experimental cards (`src/trials/cards.ts`). They resolve through six new resolver rules (Part C). Their ids start
`xp-` and they carry the tag `Experimental`. Their art is borrowed from existing cards (still frames).

### 1. The Immortal Army

| Card | Type | ATK / HP | Ability (exact) |
| --- | --- | --- | --- |
| **Deathless Legionary** | Undead Unit, Rare | 80 / +102 | Undying. When this is destroyed, it rises again in its lane, 30 ATK stronger each time (up to 3 times per battle). It rises at 110, then 140, then 170. |
| **Mordrath, the Endless King** | Undead Unit, Legendary | 95 / +97 | Whenever another of your Units returns from the Graveyard to play, this Unit and that Unit gain +45 ATK until the battle ends (no +45 limit). |

How it works:

- Every death of a Legionary feeds the army. It comes back stronger, and Mordrath and the risen Legionary both grow +45. Over a battle, Mordrath grows +45 for every rise and every other revive (Raise Fallen, Morwen and Vharos count too).
- Destroying your own Legionary is a play, not a loss. Blood Pact and Dark Ritual destroy it in the Spells step, so it rises before lanes fight.
- For the opponent, killing a Legionary makes the army more dangerous: the dilemma the brief asked for.

Limits:

- Three rises per copy, carried on the copy itself.
- After its last rise, the copy is marked as returned, so no other effect can bring it back.
- It rises only into its own empty lane.

### 2. The Apocalypse

| Card | Type | ATK / HP | Ability (exact) |
| --- | --- | --- | --- |
| **Ashen Hierophant** | Infernal Unit, Legendary | 110 / +86 | Conduit. Your one-time Spells that affect the enemy Unit in their lane also affect the enemy Units in the lanes next to it. |
| **Cataclysm** | One-time Spell, Epic | — | Destroy the enemy Unit in this lane if its ATK is 100 or less, plus 50 for each other Spell you cast earlier this round. Deal 45 damage to the enemy player. |

How it works:

- Spells resolve left to right, so position decides two things: what spreads where, and how high Cataclysm's threshold has climbed.
- Cast in the center with the Hierophant in play, Cataclysm strikes all three lanes. Cast on the right, it has two Spells behind it (threshold 200) but reaches only two lanes.
- Every enabler (Weakness, Hush, Stasis Field) spreads too.
- Nothing destroys anything without setup. You need the Hierophant alive and unsilenced, Spells sequenced in front of Cataclysm, and an enemy Unit in Cataclysm's own lane.

**Alternative chosen.** The brief suggested a spellcaster plus destructive Spells. Rather than a board-wide destroy, the
destruction is lane-based and grows with sequencing. That keeps the board wipe conditional, as the brief asked, and makes
positioning matter. Cataclysm was retuned once: at 75 ATK base, +45 per Spell, with no damage, it was a dead card in
normal play.

### 3. The Unstoppable Champion

| Card | Type | ATK / HP | Ability (exact) |
| --- | --- | --- | --- |
| **Aurelian, the Unbroken** | Kingdom Unit, Legendary | 65 / +120 | At the end of each round, double this Unit's ATK until the battle ends (up to 9,999). While your Spell is in this lane, enemy Spells can't affect this Unit. |
| **Vow of the Unbroken** | Attached Continuous Spell, Rare | — | Before lanes fight each round, the Unit with this Spell gains a Shield. |

How it works:

- He starts weaker than almost every Unit (65 ATK) and doubles every Round End he survives: 65 → 130 → 260 → 520 → 1,040 → … → 9,999.
- Clash Damage is the ATK difference, so a 1,040 Aurelian ends most battles in one clash.
- The Vow protects him on both fronts: a Shield against the clash, and Spell immunity (the existing Crusader Champion line, as data).

His weaknesses:

- He dies to almost anything in his first round unless protected.
- The Vow can be destroyed (Dispel, Runebreaker), and Unmaking then exiles him through any Shield.
- Silence skips a doubling.
- Bypass Units never have to face him.

**Change from the brief's sketch.** Doubling plus a Shield answered combat, but every enemy Spell (Hush, Blood Pact,
Unmaking) would still have answered him cheaply. Adding the existing "Spell in this lane: Spell immune" line turns the
counterplay into a two-step plan: break the protection, then answer him while he is exposed.

### The counter card

| Card | Type | Ability (exact) |
| --- | --- | --- |
| **Unmaking** | One-time Spell, Rare | If the enemy Unit in this lane has more ATK than its printed ATK, exile it: it leaves play without being destroyed. No Shield saves it, no Destroyed effect happens and it never reaches the Graveyard. |

It answers all three growth engines, and only once they have grown:

- a risen Legionary;
- a grown Mordrath;
- a doubled Aurelian.

Spell immunity blocks it. It cannot be cast on an Aurelian who has not doubled yet.

## Part C: the shared combat engine

Every rule lives in the production resolver (`src/game/cardCombat/engine.ts`), as card-only actions next to the existing
ones (`cardCombat/cards.ts ExperimentalAction`). No trial has a resolver of its own: Arcane Trials, Campaign, Quick
Battle, Ranked and Friendly Battle all call the same `resolveCardRound`, so the same state and plays give the same
events in every mode.

| Rule | What it does | Guards |
| --- | --- | --- |
| `MULTIPLY_ATK` | Multiplies a Unit's lasting ATK (this round's boosts are not multiplied, and they still expire). | Ignores the +45 growth cap; stops at `ATK_CEILING` (9,999). |
| `EMPOWER` | +N ATK until the battle ends. | Ignores the +45 growth cap; stops at 9,999. |
| `UNDYING` | A Destroyed effect: the copy rises in its own lane at printed ATK + N per rise. | A per-copy count of rises (`HeroInstance.undyingReturns`). The lane must be empty. A Silenced Unit doesn't rise. The final rise marks the copy as returned. |
| `ON_ALLY_RETURN` (timing) | Each other living ally reacts when a Unit of its side returns from the Graveyard to play: Undying, Raise Fallen, Morwen, Vharos. | Nesting stops at 8 (`SAFEGUARD_TRIPPED`). No production card has this timing, so it logs nothing for them. |
| `UNMAKE` | Exiles a Unit: no Shield, no Destroyed effect, no Ally Falls reaction, no Graveyard (`HERO_DESTROYED` with `exiled: true`). | Hostile, so immunity blocks it. Optionally only a Unit above its printed ATK. |
| `CONDUIT` | Passive: a one-time Spell's "enemy Unit in this lane" effects also reach the adjacent enemy lanes. | Read live as each Spell resolves. Off while Silenced. The announcement is labelled `Conduit`. |
| `DESTROY_SCALING` | Destroys a Unit at or below a threshold that grows with the Spells already cast this round. | Hostile. Shields and immunity apply. The destroyed Unit goes through the normal death chain. |
| `ATK_CEILING` | No Unit's stored or effective ATK exceeds 9,999. | Applies to every Unit; no production card comes near it. |

**Production parity.** The 441-battle fingerprint (Part A) still matches `441:c7080c73` after every change, so no
production battle resolves differently. `CARD_RESOLVER_VERSION` stays at 5, and stored matches continue.

**Tests**: 57 in `src/trials/*.test.ts`, plus the parity test (58 in all, 6 files):

| Area | What is tested |
| --- | --- |
| Trigger order | Destroyed, then the rise, then Ally Falls; Ally Returns after the rise. Conduit is announced before the Spell. |
| Death and resurrection | Rises at 110, 140 and 170, then no fourth rise; the final copy is marked. Raise Fallen counts as a return. |
| Effect cancellation | Silence stops a rise and stops Mordrath's growth. Hush on the Hierophant (with initiative) stops the spread. |
| Scaling | Doubling 65 → 130 → 260; this round's boosts are not doubled. Cataclysm's threshold grows with lane order. |
| Destruction | A center Cataclysm strikes three lanes. A Shield breaks; Spell immunity blocks. |
| Immunity | Unmaking is blocked by Null Templar, and Hush and Unmaking by Aurelian's Vow. Dispel still removes the Vow. |
| Counterplay | Unmaking exiles through a Shield, with no rise and no Graveyard. It can't target an ungrown Unit. |
| Large numbers | The 9,999 ceiling holds; Clash Damage never takes HP below 0. |
| Determinism | The same position and plays give byte-identical events and state, and the replayed board equals the resolver's. |
| Loop protection | A Unit that rises into the death line every time is stopped by the 64-step death-chain guard. A chain of revives that triggers more revives terminates. |

## Part D: Arcane Trials

Three puzzles (`src/trials/trials.ts`) on the real battle screen.

**What is arranged:**

- the board, hands, Graveyards, deck order and Player HP of a real match;
- the objective: bring the enemy to 0 HP by a given round.

**What is not:** anything about how the rounds play out. You make every play, the production resolver decides, and the
production AI plays the opponent from its own (known) hand.

`trials.test.ts` searches every legal line of play (`solver.ts`). Each round, every legal deployment is tried, the AI
answers it exactly as the battle screen asks, and the result is followed to the end of the trial.

| Trial | Combination | Rounds | Lines of play | Winning lines | Intended solution |
| --- | --- | ---: | ---: | ---: | --- |
| **The Endless Legion** | Immortal Army | 1 | 34 | 2 (the same idea, mirrored lanes) | Blood Pact on one Legionary, Dark Ritual on the other, Power Surge on Mordrath |
| **Ashfall** | Apocalypse | 1 | 73 | 1 | Death Wave left (soaks the Null Templar's protection), Cataclysm center (threshold 150, strikes all 3 lanes), Weakness right |
| **The Unbroken** | Champion | 2 | 489 | 10 (all share the key plays) | Round 4: Stasis Field left (and let the Runebreaker break the first Vow). Round 5: the second Vow in the center, revealed before the enemy's Unmaking resolves, then Power Surge |

The tests also check:

- doing nothing fails;
- fewer than 10% of lines win;
- every winning line uses the trial's key idea;
- the outcome the battle screen replays from the events equals the resolver's state.

**Feedback.** Each trial has:

- a brief (what you know, the objective, the key cards to inspect, the enemy's hand when it holds cards);
- three progressive hints, available on the brief, during the battle (the Hint button) and after a failure;
- a success screen with why it worked and how an opponent would stop it;
- a failure screen with the reason and the enemy's HP left, Retry now (the exact same position), hints and Show the solution.

Progress is per page load: "Solved" and attempt counts live in React state only.

## Part E: visual treatments

All of them live in `src/trials/TrialLayer.tsx` and `trials.css`, drawn over the real battle screen through `GamePage`'s
`labLayer`. They read the round's events (`spectacle.ts`) and appear the moment playback reaches the event that causes
them. Each is chosen by the rule that produced it, read from the card's abilities, never by card name. No existing
animation, card face or layout was changed.

| Combination | Moment | Treatment |
| --- | --- | --- |
| Immortal Army | Undying rise | The empty slot cracks (a dashed ring), then a pillar of grave-light rises with **RISES 140** and "2 of 3". It follows the existing destruction flash, so death and revival read as two beats. |
| Immortal Army | Mordrath grows | A violet double ring on Mordrath with **ENDLESS 185**. |
| Apocalypse | Spell chain | Numbered chips on the band as each Spell resolves: 1 Death Wave, **2 Cataclysm: destroys 150 ATK or less**, 3 Weakness. Shown only in rounds where Spells spread or scale. |
| Apocalypse | Conduit | A burning beam across the enemy lanes the Spell reaches. |
| Apocalypse | Cataclysm | An ember streak falls into each struck lane with an impact ring, under the headline **CATACLYSM ×3: 3 lanes struck in one resolution**. |
| Champion | Doubling | A gold ×2 stamp on the card with the new ATK counting up (338 → 520). |
| Champion | Power tier | A full-width banner on the band at 500 (**Ascendant**), 1,000 (**Unbroken**), 5,000 (**Godlike**) and 9,999 (**Limitless**). |
| Champion | Lasting aura | A breathing gold glow and an ATK plaque with thousands separators ("1,040 · UNBROKEN") over the card's art. It grows brighter with each tier. |
| Champion | Immunity | A gold ward over the card with **IMMUNE**. |
| Counter | Unmaking | A void implosion with **UNMADE**. |

A slim trial bar above the enemy row shows "Practice", the round and the goal ("Win this round", "Win by Round 5"), with a
Hint button between rounds.

Design constraints:

- **Speed:** every moment lasts 1.1 to 2.2 s, overlaid on the existing pacing, so it adds no wait to the round. At most four lane moments show at once.
- **Reduced motion:** nothing moves, scales, falls or pulses; every label and number still shows for the same time (verified: all animation names `none`).
- **Large numbers:** the ceiling keeps ATK to four digits, which fits the card face ("ATK 1040"). The plaque prints "1,040".
- **Log accuracy:** the battle log now says "Cataclysm reaches the lanes next to it" for Conduit, not Archmage Vael's "resolves twice", and "Exiled Aurelian, the Unbroken: it never reaches the Graveyard" for Unmaking.

## Part F: counterplay

Each combination as a 15-card deck plays 200 seeded AI-vs-AI battles against each opponent
(`node scripts/trials-counterplay.mjs`). The control deck is the same list with the experimental cards swapped for the
nearest existing ones.

| Combination | Opponent | Combination wins | Control wins | What the signature did, per battle |
| --- | --- | ---: | ---: | --- |
| Immortal Army | Vanguard (no specific answer) | 53% | 2% | 4.0 rises |
| Immortal Army | Vanguard + Hush ×2, Unmaking ×2 | **24%** | 35% | 2.6 rises; 1.3 Units exiled |
| Immortal Army | Phantoms (Bypass) | 11% | 0% | 2.8 rises |
| Immortal Army | Hellfire (burn) | 4% | 0% | 2.3 rises |
| Apocalypse | Vanguard (no specific answer) | 21% | 28% | 1.05 Units destroyed by Cataclysm; 0.17 multi-kills |
| Apocalypse | Vanguard + Hush ×2, Null Templar ×2 | 25% | 28% | 0.78 destroyed; 0.12 multi-kills |
| Apocalypse | Phantoms (Bypass) | 17% | 34% | 1.62 destroyed; 0.27 multi-kills |
| Apocalypse | Hellfire (burn) | 5% | 15% | 1.06 destroyed; 0.16 multi-kills |
| Champion | Vanguard (no specific answer) | 50% | 22% | Peak ATK 623; 64 battles of 200 reached 1,000 |
| Champion | Vanguard + Dispel ×2, Unmaking ×2 | 54% | 59% | **Peak 188**; 14 reached 1,000; 1.2 Vows broken and 0.9 Champions exiled per battle |
| Champion | Phantoms (Bypass) | 16% | 9% | Peak 506; 46 reached 1,000 |
| Champion | Hellfire (burn) | 5% | 2% | Peak 158; 12 reached 1,000 |

Why each counter succeeds or fails:

- **Immortal Army, countered.** Unmaking takes a grown Legionary or Mordrath out of the battle for good: no rise, no
  Graveyard. Hush on a Legionary as it dies stops the rise. Win rate halves (53% → 24%). Graveyard exile (Soul Burn) does
  **not** work: the rise happens the instant the Legionary dies.
- **Champion, countered on the board, not in the result.** Dispel breaks the Vow, and Unmaking then exiles Aurelian: his
  average peak falls from 623 to 188 ATK. The win rate doesn't fall (54%) because the four counter cards replaced
  Vanguard's own damage Spells (the same swap lifts the control deck from 22% to 59%). The counter neutralises the
  Champion, but in a plain AI's hands it costs that deck its damage.
- **Apocalypse.** The counters (Hush on the Hierophant, Null Templar) work in the trials and tests. In AI-vs-AI they barely
  register, because the production AI rarely sets the combination up at all (0.17 multi-kills a battle). It sequences
  Spells one at a time and never plans lane order (PR #28's measurement: the AI is 1 to 10 points better than random
  lanes). The Apocalypse is the most skill-dependent of the three; it needs a player.
- **No combination is optimal everywhere.** All three lose at least 83% of battles to Phantoms (Bypass Units walk past a
  big Unit) and Hellfire (burn races a slow engine).

## Part G: isolation

| Requirement | How it is met |
| --- | --- |
| No permanent cards, no collection change | The experimental cards are registered for one page load (`registerExperimentalCards`). They are in no list: `ALL_CARDS`, the launch roster (so no Box), decks, opponents (tested). Card Inspect shows them as "A card to discover", never owned. |
| No economy, progression, Ranked or reward effect | Trials battles are `sandbox`: no match history, no `battle_completed` event (no mission or event progress), no XP or Gold, no mission read. The trials pass their own `onMatchEnd`. |
| No save corruption | `?trials` is its own page load: no save migration, missions, events or session tracking start. `lab/storageGuard.ts` refuses every `localStorage` write from the first module on. Browser QA: every save key byte-identical after 24 trial runs; 0 writes refused. |
| Not in production | The trials exist only when `__CARD_LAB__` is true (the dev server, `VITE_CARD_LAB=1`, or a Vercel preview). A production build contains no trials code, cards or text (searched: "Arcane Trials", "xp-aurelian", "Mordrath", "Cataclysm", "Unmaking": 0 files). |
| Engine changes are safe | The shared-engine rules are dormant in production, and the 441-battle parity hash is unchanged. `HERO_DESTROYED.exiled`, `HeroInstance.undyingReturns` and the `ON_ALLY_RETURN` timing are optional or new: existing saves and replays load unchanged. |
| Nothing else imports it | A test walks `src/`: only `main.tsx` imports `src/trials`, and no file outside it names an experimental card. |

## Part H: QA

- `npm run check`: 110 test files and 1,208 tests pass; the build succeeds. Lint shows only the existing `WorldBackdrop`
  warning. `git diff --check` is clean.
- **Production build:** no experiment code. **Experiment build** (`VITE_CARD_LAB=1`, served by `vite preview`): every
  trial played in a browser, as below.
- **Browser playthroughs:** headless Chrome with touch emulation, on the experiment build. Each configuration ran six
  runs: the three intended solutions, then one wrong line per trial, each followed by Retry.

  | Configuration | Solutions | Failures | Retry | Overflow | Console | Save |
  | --- | --- | --- | --- | --- | --- | --- |
  | 390×844 | 3 of 3 won | 3 of 3 failed | resets HP | none | clean | identical |
  | 360×800 | 3 of 3 won | 3 of 3 failed | resets HP | none | clean | identical |
  | Desktop 1280×800 | 3 of 3 won | 3 of 3 failed | resets HP | none | clean | identical |
  | 390×844, reduced motion | 3 of 3 won | 3 of 3 failed | resets HP | none | clean | identical |

  The wrong lines failed with:

  - The Endless Legion: "The round ended with the enemy still standing. The enemy has 200 HP left."
  - Ashfall: "… 246 HP left."
  - The Unbroken: "You reached 0 HP first", after Unmaking exiled an unprotected Aurelian.
- **Event accuracy:** each moment appeared at its event during playback (burst frames reviewed). The tests pin that the
  replayed board equals the resolver's.
- **Regular battles:** a Quick Battle on this branch played two rounds normally (no trial layer; developer tools as before),
  and `?lab` opens the normal game on this branch.
- **Not done:** no real phone or tablet. All mobile results are headless Chrome emulation.

## Part K: risks and limitations

- **The AI can't pilot the combinations.** It never sacrifices for value, holds a second Vow or sequences Spells by lane.
  The AI-vs-AI numbers understate what a player gets, and the opponent AI would need work before these cards appear in
  normal play.
- **Conduit spreads every "enemy Unit in this lane" effect,** including Blood Pact's second half and Dispel. A
  Hierophant with Blood Pact destroys three enemy Units. That is in the spirit of the brief, but it is the first thing to
  watch if the Apocalypse becomes playable outside the trials.
- **Unmaking reads ATK right now.** A Unit lifted by an aura (Royal Guard) or a Spell this round counts as grown.
- **Mordrath's growth has no per-card cap,** only the 9,999 ceiling and the finite number of returns in a battle.
- **Shipping any of this** would need a resolver version bump (cards would resolve differently from v5), curated card
  text (`BATTLE_LINES`) and art, AI support, and a real balance pass. None of that is in this branch.
- **Merging next to PR #28:** this branch copies PR #28's `lab/storageGuard.ts`, `lab/env.d.ts`, `lab/lab.css`, its
  `vite.config.ts` gate and its `GamePage` `sandbox`/`labLayer` code verbatim, so those merge cleanly. `main.tsx` would
  conflict (both add a branch) and needs both branches kept. `GamePage` also gains `onRoundEnd`, and hides the developer
  tools in a sandbox.
- The Vercel preview should include the trials (`VERCEL_ENV=preview`), but previews need the Vercel login, so it is unverified.

## Part L: access

| Where | How |
| --- | --- |
| This computer | `npm run dev`, then `http://localhost:5173/?trials` |
| A phone on the same Wi-Fi | `npm run dev -- --host`, then `http://<computer's IP>:5173/?trials` |
| A local experiment build | `VITE_CARD_LAB=1 npm run build`, then `npm run preview` and `/?trials` |
| This PR's Vercel preview | `<preview URL>/?trials` (unverified: previews need the Vercel login) |
| Production | Not present |

"Exit trials" reloads the page without `?trials`, which starts the normal game.

## Files

- **`src/trials/`:**
  - Cards: `cards.ts` (the experimental cards).
  - Trial data and setup: `trials.ts` (the puzzles), `arrange.ts` (arranged positions), `solver.ts` (exhaustive search).
  - Counterplay: `counterplay.ts` (decks and measurement).
  - Visuals: `spectacle.ts` (moments from events), `TrialLayer.tsx` (the battle layer), `trials.css`.
  - App: `TrialsApp.tsx` (the screens), `access.ts`, `earlyGuard.ts`, `mountTrials.tsx`.
  - Tests: `mechanics`, `trials`, `spectacle`, `counterplay` and `isolation` (`*.test.ts`).
- **The engine:**
  - `src/game/cardCombat/engine.ts`, `cards.ts` and `stats.ts`: the experimental rules, plus `engineParity.test.ts`.
  - `src/game/types/index.ts`: the `ON_ALLY_RETURN` timing, `undyingReturns` and `HERO_DESTROYED.exiled`.
  - `src/game/engine/replay.ts`: an exiled Unit skips the Graveyard.
- **Text and catalogue:**
  - `src/game/cards/index.ts`: `registerExperimentalCards`.
  - `src/game/cards/effectText.ts`: the Ally Returns label.
  - `src/components/battleInfo/battleLog.ts`: the Conduit and exile wording.
- **Battle screen:** `src/pages/GamePage.tsx` (`sandbox`, `labLayer`, `onRoundEnd`).
- **Entry and gate:** `src/main.tsx` (`?trials`), `vite.config.ts` (the gate).
- **From PR #28:** `src/lab/storageGuard.ts`, `env.d.ts` and `lab.css`, copied verbatim.
- **Script:** `scripts/trials-counterplay.mjs`.
