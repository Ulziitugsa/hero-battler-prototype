# UI redesign backlog

Design work that is **not** finished, in priority order. Everything settled lives in
[DESIGN-SOURCE-OF-TRUTH.md](DESIGN-SOURCE-OF-TRUTH.md); this file is only the open list.

**Read this first.** The approved Embervale direction currently exists as Claude Design prototypes,
**not** as code. `src/styles/global.css` and every screen in `src/pages` are still the earlier
dark-panel build. So each item below has two distinct pieces of work behind it:

- **(D)** a design decision that is still open, and
- **(I)** integration of an already-approved design into the repo.

Both are named per item so neither gets lost.

| Priority | Item | Kind |
| --- | --- | --- |
| P0 | Battle screen redesign | D, then I |
| P1 | Home screen expansion | D, then I |
| P2 | Real card artwork | D + content, then I |
| P3 | Combat resolution feedback | D, then I |
| P4 | Victory / defeat | D, then I |
| - | Embervale integration of already-approved screens | I only |

---

## P0 - Battle screen redesign

The highest-priority screen. It is functional but still visually feels wrong. The critique below is
of the **Embervale battle prototype**, which is already better than the shipped screen - fixing the
prototype is what unblocks integration.

### Composition

- Too much awkward empty / dead space through the middle of the battlefield.
- The enemy board feels compressed and pushed too far toward the top.
- The player and enemy halves do not feel balanced.
- The board does not yet feel like **one coherent battlefield**.

### Hero vs Spell importance

- Spell slots currently feel too small and secondary.
- Spells are a major strategic part of the game and need stronger visual presence. A Continuous Spell
  in a lane is a multi-round commitment of that lane's Spell slot and a live modifier on combat
  maths - the current sizing does not reflect that.
- Hero and Spell rows should clearly belong to **each lane**, not read as four independent rows.

### Lanes

The three vertical lanes need stronger structural grouping. A player should instantly understand:

```text
Enemy Hero
Enemy Spell
-----------
Player Spell
Player Hero
```

as **one vertical lane**. The structure has to carry this - left / centre / right text labels are
rejected and are not used. This vertical order is already how the code builds the board
(`src/components/SideBoard.tsx`); the problem is that the grouping is not *visible*.

### Hand and Fight interaction

- The Fight seal currently competes with and overlaps the hand too heavily.
- The centre card can be visually obstructed.
- Card readability must not be sacrificed for the Fight button.

Constraint that makes this hard and must not be traded away: there is exactly **one** Fight press per
round, no confirm step, and the seal is the single largest interactive element on the screen. It has
to stay in the lower third within thumb reach, alongside a three-card hand, without covering the
card the player is about to choose.

### Goal

The Battle screen should feel like:

> "a fantasy battlefield designed around three lanes"

not:

> "several rows of UI components separated by empty space."

### Hard constraints

- Fits **390 x 844 with no scrolling**.
- No bottom navigation - Battle is full-screen.
- Tap targets 44pt or larger.
- Vertical order: enemy banner with health; enemy Hero row; enemy Spell row; clash divider; player
  Spell row; player Hero row; player health and resource strip; hand; Fight seal.
- Empty Hero slots show a hero silhouette glyph and "Drop hero" in a dashed gold frame - never a
  plain grey box.
- Placement feedback: valid slots light gold and pulse, invalid slots dim to ~55%, the lane diamond
  brightens, a hint line above the hand reads "Tap a hero slot" / "Tap a spell slot".
- During resolution the seal desaturates to cold metal, the glow stops, planning is disabled and the
  status band reads "Resolving".

### Also unresolved on this screen

- **Pending one-time Spells have no designed home.** A one-time Spell never occupies a Spell zone, so
  a deployed-but-unresolved Spell currently appears in a small removable "Pending" list under the
  board (`src/pages/GamePage.tsx`). The design source of truth does not cover this element at all. It
  needs a designed treatment inside the lane, or a deliberate decision to keep it separate.
- **Graveyard and deck counters** sit as two small pill counters beside the player bar; confirm they
  survive the recomposition.

**Not implemented in the documentation pass.** This is the next focused design task.

---

## P1 - Home screen expansion

The Embervale Home direction is visually much better than the earlier dashboard. But it currently
feels **too empty and static**: the dominant featured Hero consumes most of the screen and there are
very few reasons to interact.

**Do not solve this by prematurely creating fake live-service systems.** No Shop, Summon, Quests or
Events added purely to fill space - they are explicitly out of scope and on the rejected list.

Instead, future Home design should explore functionality that **already exists** or is appropriate
for a playtest build:

- Primary Battle CTA.
- Active deck.
- Quick "Edit deck".
- Heroes shortcut.
- How to play.
- Starter deck switching (three starters plus saved decks already exist -
  `src/game/engine/deckOptions.ts`).
- Recent match (match history is already persisted - `src/game/engine/localMatchHistory.ts`).
- Possibly a small "try this deck / card" playtest prompt.

**Goal:** Home should feel like a **game hub**, not a static character profile.

**Decision this item must settle:** the navigation shape. The Design Source of Truth describes a
four-medallion HUD arc with the Fight seal in the centre; the code ships five tabs including an
explicit Battle tab. Home is where that gets resolved, because Home is where both the seal and the
HUD live.

---

## P2 - Real card artwork

Frames and the design system are usable. The remaining problem is filling the roster with coherent
character and spell artwork per [CHARACTER-ART-BIBLE.md](CHARACTER-ART-BIBLE.md).

**Plan**

1. Create ~6 anchor characters first.
2. Verify they look like one game.
3. Then scale toward 30-40 cards.
4. Integrate via image slots **without changing the frame**.

**Notes**

- The Design Source of Truth asks for **9-12** anchor artworks covering the range of collector
  appeal: a noble hero, an elegant caster, a cute or mascot character, a creepy undead, a cool
  necromancer, a demon warrior, a flashy infernal caster, at least two chase-feel cards, and at least
  one physically imposing figure. The 6-anchor plan above is the tighter first cut; expect to extend
  it to the fuller list before scaling. Whichever number is used, coverage of that spread is the
  point, not the count.
- **Step 4 needs a code change first.** `CardDefinition` has no image field and there is no asset
  directory. Adding a drop-in image slot is small engine/asset work that must land before artwork can
  be integrated.
- The roster is currently 32 cards (18 Heroes, 14 Spells). Scaling to 40 stress-tests the frame
  against the longest names and wordiest abilities - listed as an open task in the design source of
  truth and not yet done.
- Wildborn artwork is blocked until the faction is confirmed or cut.

**Do not generate artwork as part of a documentation or redesign task.**

---

## P3 - Combat resolution feedback

Motion rules exist for defeat and revival, but the moment-to-moment choreography of a resolving
round - what the player watches between pressing Fight and seeing the outcome - has not been
designed. Still unresolved:

- Choreography after FIGHT.
- Spell activation feedback.
- Power buff / debuff feedback.
- Combat comparison.
- Hero defeat.
- On Death chains.
- Revival.
- Continuous Spell activation.
- Direct damage.
- Victory / defeat transition.

**This is unusually tractable, because the engine already emits everything needed.** `resolveRound`
returns a complete ordered `GameEvent[]` and the UI replays it through a reducer purely for
animation (`src/game/engine/replay.ts`). Every beat above already exists as a discrete event type -
`SPELL_RESOLVED`, `POWER_CHANGED`, `COMBAT`, `HERO_DESTROYED`, `REVIVED`, `DIRECT_DAMAGE`,
`MATCH_END`. The design task is choreography and timing per event type, not new plumbing.

Goal: make resolution understandable **and** satisfying. Constraint: motion stays brisk; no cinematic
sequences.

---

## P4 - Victory / defeat

A dedicated finish state has not been properly designed. Later work.

Current state: the battle screen changes its status band, and a functional `MatchSummary` overlay
shows the result plus a playtest stats table (`src/components/MatchSummary.tsx`). That overlay is
developer-facing in tone - a key/value stats dump - and is not a designed victory moment.

---

## Standing item - Embervale integration

Not a design task, but it belongs on this list so it is not mistaken for done.

Every approved Embervale screen still has to be built in the repo. The shipped UI uses a cool dark
palette (`--bg: #100e14`, purple-grey panels, neutral grey `--line`), a system sans stack (Segoe UI),
stacked rounded panels, uppercase button labels and a generic bottom tab bar - all of which the
design source of truth explicitly rejects. Bree Serif and Nunito are not loaded anywhere.

Sequence this **after** P0 and P1 are settled, so integration happens once rather than twice.

---

## Also open, from the design source of truth

Small decisions recorded so they are not lost:

- **Wildborn.** The fourth faction has provisional styling but no confirmation it belongs in the
  shipped product. Confirm or cut. It is in the code and covered by engine tests, but excluded from
  the playtest roster.
- **Power and HP glyphs.** The icon set carries both, but the Power seal shows a bare numeral and
  health bars show numerals only. Decide whether the glyphs earn their place.
- **Real hero art pipeline.** Whether cards take drop-in image slots for supplied artwork, or the
  styled placeholder treatment ships as-is for playtesting. This decision shapes the frame's art area
  spec and gates P2 step 4.
- **Roster scaling.** The card system has been proven against a sample, not against a full 30-40
  cards - particularly the longest names and the wordiest abilities.
