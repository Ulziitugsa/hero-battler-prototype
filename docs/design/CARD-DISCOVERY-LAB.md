# Card Discovery Lab (experiment)

October 17, 2026. An isolated test screen for playing Moonwater's strongest existing decks and combinations, built to
answer one question before any design decision: can the current cards and combat produce the discovery-and-combination
experience we want? It is an experiment, not a feature, and it is not in the production game.

Nothing in it changes combat rules, card definitions, stats, balance, economy, Boxes, saves, monetisation, routes or the
production AI. Every battle is the real battle screen on the real resolver (`src/game/cardCombat`).

## Opening it

The lab is built in only when the build turns it on (`__CARD_LAB__`, `vite.config.ts`), and opens only on a page load
with `?lab`.

| Where | How |
| --- | --- |
| This computer | `npm run dev`, then `http://localhost:5173/?lab` |
| A phone on the same Wi-Fi | `npm run dev -- --host`, then `http://<computer's IP>:5173/?lab` |
| A local test build | `VITE_CARD_LAB=1 npm run build` then `npm run preview`, then `/?lab` |
| The PR's Vercel preview | `<preview URL>/?lab` (built in because Vercel sets `VERCEL_ENV=preview`; previews need the Vercel login) |
| Production | Not present. The production bundle contains no lab code (checked by searching the built files). |

`VITE_CARD_LAB=0` turns it off in any build. "Exit lab" reloads the page without `?lab`, which starts the normal game.

## Save safety

- **Its own page load.** With `?lab`, `main.tsx` mounts the lab instead of the game. The save migrations, the
  collection migration, missions, events and session tracking never start.
- **Storage guard.** `lab/earlyGuard.ts` is the first module `main.tsx` imports. On a lab page load it refuses every
  `localStorage` write (`setItem`, `removeItem`, `clear`) for the whole page. Reads still work, so Card Inspect can
  say how many copies the player owns. Refused writes are counted on screen ("Save writes blocked: 0") and logged.
- **Sandbox battles.** `GamePage`'s new `sandbox` prop skips match history, the `battle_completed` event (so no mission
  or event progress), Quick Battle XP and Gold, and the mission read. The lab passes `onMatchEnd`, so no reward path runs.
- **Nothing persistent.** Borrowed decks and setups live in React state only. A reload starts the lab over. No card,
  currency or ownership is granted, and the lab never reads or changes the player's decks.
- **Nothing outside the lab imports it** except `main.tsx` (a test walks `src/` to check).

QA: a full session (Combination test, a 9-round borrowed-deck battle, Card Inspect, a reload mid-round, Exit lab) left
every `localStorage` key byte-identical, with 0 writes refused, at 390×844, 360×800 and 1280×800.

## What it offers

**Archetypes.** The nine optimised lists from `cards/launchDecks.ts`. Each page covers:
- strategy and key cards (tap to Inspect);
- signature combinations, with how each works and what limits it;
- strengths, weaknesses and likely counters;
- notes about the list;
- how the AI plays it;
- the deck list.

Every claim is written from the cards' rules in the resolver. `lab.test.ts` checks the card ids, that key cards are in the
list, and the quoted Starting HP and Unit counts.

**Battle.** Any of the 21 reference decks against any other. The opponent is the production AI. A borrowed deck lasts
one battle.

**Combinations.** Nine arranged setups, one per archetype (`lab/scenarios.ts`):
- The board, hand and Graveyard are set so one combination is available this round.
- The opponent holds no cards in that round. Both sides draw normally afterwards, and the battle continues as an
  ordinary match.
- The player makes the play (or any other); the resolver decides.
- `lab.test.ts` plays each suggested play through `resolveCardRound` and pins the numbers the setup quotes.

| Setup | Suggested play | What the resolver does |
| --- | --- | --- |
| Vael’s spell storm (Arcane) | Arcane Bolt left and right | First Bolt twice (135 + 135), second Bolt 135 + 90, Vael 90: **585 damage before any clash** |
| Morwen raises the line (Bone Legion) | Power Surge on Bone Dragon; leave right empty | Bone Dragon 182; Morwen revives Bone Soldier into the empty lane, which fights at 123 |
| Blood Pact sacrifice (Bloodbound, Box card) | Blood Pact left | Own Blood Imp destroyed, Kathra 145 and 45 damage, enemy Common Knight destroyed |
| The Plague Mother’s spread (Wither) | Cursed Ground center | Plague Mother 122 beats Royal Guard; at Round End a worn Common Knight drops to 35 ATK and is destroyed |
| Phantoms slip past | Weakness right | Wraith Prince (78) and Duchess Nyx (127) hit past Royal Guard and Paladin, which do nothing; both grow +15 |
| Hellfire burn round | Meteor, Inferno, Arcane Bolt | **540 effect damage**; Meteor destroys Kingdom Archer; every enemy −15 for good |
| Saint Aveline keeps the blade (Crusade) | Oath Blade on Aveline | Banner Knight (134) loses to a bannered Common Knight (143); Reliquary Blade returns to hand |
| The full Knight line (Vanguard) | War Cry | 171 / 150 / 147, all three clashes won; Vharos comes back at 95 |
| The pack refills (Hellpack) | Power Surge on Ash Jackal | Ash Jackal 159, Alpha Hound 123; the Matriarch falls and leaves a Hound Pup |

**Key moments in battle** (`lab/moments.ts`, `lab/LabMomentsLayer.tsx`). While a round resolves, the latest key moment
appears on the band between the two rows (no Unit is covered) once playback reaches its events. Each moment names the
card responsible. Between rounds, a pill lists the last round's moments.

They are built from the battle log's own grouping of the resolver's events, so they never claim more than happened:

| Moment | Shown when |
| --- | --- |
| Spell repeated | Vael's echo |
| Revived | — |
| Destroyed by an effect | — |
| Sacrificed | — |
| Destroyed by ATK loss | A Unit drops to 35 ATK or less (a rule the game itself never explains) |
| Effects turned the clash | The ATK order the Units started the round with and the order they fought at disagree |
| Bypass | — |
| Token summoned | — |
| Shield | — |
| Immune | — |
| Damage prevented | — |
| Big damage | One effect deals 90 or more |
| Major ATK boost / loss | One effect changes ATK by 45 or more |
| Back to hand | — |
| N effects in one round | Three or more effects of one side, from at least two cards, with a reaction among them (or three different cards) |

Reduced motion turns the callout animation off.

**Cards worth exploring** (`lab/discovery.ts`). After a lab battle, up to three of the opponent's cards, ranked by what
their effects did in that battle's events:
- effect damage, damage past blockers, Units destroyed, revives, tokens, ATK taken, heals, returns, Shield saves;
- clash wins count only alongside an effect;
- each pick shows the card, its rules, a "In this battle: …" line from the counts, and its normal source ("Arcane Box",
  "Core · Kingdom", "Structure Deck · Hellfire") or "Not obtainable yet";
- Inspect opens the normal Card Inspect;
- nothing is granted.

## The AI, measured

`node scripts/lab-ai-report.mjs --games 30` (seed 20261017) plays each optimised deck 630 times against all 21 reference
decks, piloted by the AI. It then plays the same games with a pilot that plays every card into a random legal lane
(`lab/randomPilot.ts`).

| Archetype | AI | Random lanes | AI's edge |
| --- | ---: | ---: | ---: |
| Vanguard | 64% | 57% | +7 |
| Bone Legion | 65% | 59% | +6 |
| Hellpack | 59% | 53% | +6 |
| Arcane | 61% | 60% | +1 |
| Phantoms | 80% | 73% | +7 |
| Hellfire | 80% | 79% | +1 |
| Crusade | 65% | 55% | +10 |
| Wither | 86% | 82% | +4 |
| Bloodbound | 69% | 65% | +4 |

The AI's choices are worth 1 to 10 points over random lanes. Signature moments per game were close for both pilots
(within 0.8 a game). So an AI-piloted result says little about an archetype's cards: judge a deck by borrowing it.

What the AI misses, from `cardCombat/ai.ts` (also shown in the lab):
- **Lane choice** counts only printed ATK, auras and Guard. It ignores:
  - Clash bonuses (Knight counts, Ash Jackal, Bone Dragon);
  - Destroyed effects;
  - Bypass;
  - Round End effects.
- **Spells** are judged one at a time for this round only, assuming the opponent plays nothing.
- **No planning ahead.** It never saves a card for a later combination, and never keeps a lane empty for Morwen.

## Known limitations

- **Arranged setups, not natural draws.** The setups put the combination in hand; whether it comes together in normal
  play is what the Battle tab is for.
- **The opponent passes in a setup's first round,** so the combination resolves against a fixed board. From the next
  round the AI plays normally.
- **Moments are built from events.**
  - A "turned" clash credits the winner's side. It does not say which aura or Spell made the difference; the Log does.
  - A Unit destroyed by ATK loss credits the last effect that lowered it.
- **Gaps in the optimised lists.**
  - Bloodbound runs no Blood Pact, Dark Ritual or Flesh Altar.
  - Hellfire runs no Continuous Spell, so Ignis's Round End line is idle.
  - Phantoms has only two Continuous Spells (Banshee needs two in play at once).
  - The lab says so on each archetype page.
- **The Vercel preview** includes the lab only if Vercel exposes `VERCEL_ENV` to the build (its default). If a preview
  opens the normal game at `/?lab`, use a local dev server or a `VITE_CARD_LAB=1` build.
- **Not tested on a real phone.** QA was headless Chrome with touch emulation (390×844, 360×800, desktop 1280×800,
  reduced motion).

## Files

- `src/lab/`:
  - `CardLabApp.tsx` and `LabMomentsLayer.tsx`: the screens;
  - `archetypes.ts` and `scenarios.ts`: the data;
  - `moments.ts` and `discovery.ts`: reading the events;
  - `storageGuard.ts`, `earlyGuard.ts` and `labAccess.ts`: isolation;
  - `randomPilot.ts` and `aiReport.ts`: measurement;
  - `lab.test.ts`.
- `src/pages/GamePage.tsx`: the optional `sandbox` and `labLayer` props.
- `src/main.tsx`: the `?lab` branch.
- `vite.config.ts`: `__CARD_LAB__`.
- `scripts/lab-ai-report.mjs`.
