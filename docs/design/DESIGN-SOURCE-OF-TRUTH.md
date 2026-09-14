# Design source of truth (repo-side summary)

**Status:** approved direction, partially implemented.
**Authoritative long-form document:** `Design Source of Truth.pdf` at the repo root - Embervale v1,
September 2026, exported from Claude Design. This file is the concise repo-side reference; where it
is silent or ambiguous on a visual decision, the PDF is authoritative. This file does **not**
reproduce the exploratory discussion behind those decisions.

**Implementation status warning.** The Embervale direction below is approved but **not yet built in
`src/`**. The shipped UI (`src/styles/global.css`, all of `src/pages`) is still the earlier
dark-panel/dashboard build that section "Rejected directions" rules out. Read this document as
*where the product is going*, not as a description of the current screens. See
[UI-REDESIGN-BACKLOG.md](UI-REDESIGN-BACKLOG.md).

---

## 1. Product direction

- A mobile-first fantasy Hero and card battler.
- Portrait-first. Primary viewport 390 x 844.
- Accessible, readable, character-driven.
- It must feel unmistakably like a **game**, never like a SaaS product or an admin dashboard.
- The interaction loop is three steps and never more: choose a card, place it in a lane, press
  Fight. No manual targeting for normal effects, no confirmation step.
- The rules are frozen and are not a design concern. Design work covers presentation, layout,
  hierarchy, usability, character presentation and mobile polish. A design pass introduces no new
  systems, screens or mechanics.
- Design reads game data from the code (`src/game/cards`, `src/components/Icon.tsx`) rather than
  inventing a parallel data set.

## 2. Approved visual direction - Embervale

A warm sunset fantasy realm rendered in carved wood, hammered gold and dusk-lit stone. This is the
approved direction; alternatives are not proposed on top of it. Two fully explored concepts,
**Ashen Vigil** (rain-and-iron cinematic) and **Aetherfall** (floating isles, aurora, rune halos),
were set aside in its favour.

Four principles define it.

**The world is the background layer.** Every screen sits on a painted environment - a sunset sky
over distant hills on Home, a lit arena floor in battle, a dusk-toned hall in the collection
screens. Environments are large soft gradient masses, silhouetted ridgelines, one dominant light
source. UI floats above it. There is no flat page colour anywhere in the product.

**Characters are the visual stars.** On Home a single hero occupies roughly half the frame, backlit,
environment glowing behind. Nothing in the interface crosses a hero's face or chest; supporting UI
arranges itself around the figure.

**UI is made of objects, not panels.** Interface elements read as physical things: carved wooden
banners, gold medallions, pressed metal seals, ribbon plates, engraved dividers. Rounded rectangular
containers are used sparingly and never stacked into a grid. A container that is genuinely needed is
shaped - notched, angled or bevelled - not a plain rounded box.

**Light does the work.** Depth comes from lighting rather than borders: rim light along the top edge
of raised objects, a dark bottom edge, a soft cast shadow, a warm glow behind anything important.
Hairlines are warm gold at low alpha, never neutral grey.

Atmosphere is present but **restrained**: drifting motes, a slow breathing glow behind the primary
action, a light sweep across card art. Motion is brisk and cheap; nothing loops fast enough to
distract during play.

## 3. Typography

Two families, used strictly by role. **Bree Serif** is the display face; **Nunito** carries
everything else. Bree Serif is never used for a paragraph; Nunito is never used for a hero name.

| Role | Face and size | Where |
| --- | --- | --- |
| Display | Bree Serif 27-36 | Featured hero name, modal titles |
| Screen title | Bree Serif 27-29 | Heroes, Decks, Profile headers |
| Section title | Bree Serif 17-19, gold | In-page group headings, paired with a fading rule |
| Card name | Bree Serif 15-17 | On the carved plate; wraps to two lines rather than truncating |
| Stat numeral | Bree Serif 16-34 | Power seals, health readouts, counters |
| Body | Nunito 600, 13.5-15 | Ability text, help copy, descriptions |
| Card ability | Nunito 600, 11.5-12 | Short summary only, two lines maximum |
| Caption | Nunito 700-800, 11.5-13 | Chips, faction lines, metadata |

Sentence case is the default everywhere; title case only in proper names. Small tracked-out
uppercase utility labels (`A C T I V E  D E C K`) are rejected - they were the single strongest
signal that the earlier design read as a dashboard. Sections are titled in Bree Serif sentence case,
or carry no label at all and rely on layout to communicate grouping.

## 4. Colour and material system

Warm throughout. Cool colour appears only as a faction accent and as sky in an environment gradient.
Two governing rules: **the accent is gold and gold alone**, and **no more than two background colour
families in a single screen**.

| Token | Value | Use |
| --- | --- | --- |
| World base | `#150D13` | Deepest ground behind every environment |
| Ink | `#FFF6E6` | Primary text, warm off-white |
| Ink secondary | `#C8A98F` | Supporting copy, metadata |
| Ink muted | `#A98D78` | Smallest captions. Floor for text contrast - nothing dimmer |
| Gold light | `#FFE6AD` | Top of every metal gradient, rim light |
| Gold | `#FFD894` | Accent, headings on dark, active state |
| Gold deep | `#A9701F` | Bottom of metal gradients |
| Gold ink | `#3D2210` | Text sitting on gold |
| Wood | `#7A4630` / `#42221A` | Carved banners, name plates, the HUD arc |
| Ember | `#E8674F` / `#8F2E2C` | The Fight seal core, and only that |
| Success | `#9FE8C0` | Player health, positive buffs, victory |
| Danger | `#F0857A` | Enemy health, defeat, destructive actions |

**Metal recipe.** Every gold object uses the same construction so it reads as one material: a
vertical gradient `#FFE6AD` to `#A9701F`, a 1px white highlight inset at the top, a dark inset at the
bottom, and a drop shadow in `rgba(20,8,6,.6)`. Flat gold fills are not used.

**Hairlines.** Warm gold at low alpha - `rgba(255,214,140,.13)` quietest, `.45` for a lit edge.
Neutral grey borders are not part of this system.

## 5. Navigation

Primary navigation is five destinations:

**Home · Battle · Heroes · Decks · Profile**

Battle and Battle Setup are **full-screen with no bottom navigation** - combat never competes with
navigation chrome for vertical space on a phone. This is already how the code behaves: `App.tsx`
renders `GamePage` outside `AppShell` entirely.

Navigation is presented as a **carved HUD arc with medallions**, not a generic app tab bar.

> **Open contradiction.** The PDF describes the HUD as *four* medallions (Home, Heroes, Decks,
> Profile) with the **Fight seal occupying the centre position**, i.e. Battle is the seal rather than
> a tab. The code ships *five* tabs including an explicit Battle tab that opens `BattleSetupPage`
> (`src/components/AppShell.tsx`). Both readings are defensible - the seal-as-fifth-slot is the
> Embervale form of the same five destinations - but the Home redesign has to settle it explicitly.
> Tracked in [UI-REDESIGN-BACKLOG.md](UI-REDESIGN-BACKLOG.md) under P1.

## 6. Card frame system

One frame family serves every card in every context: hand, deck builder, collection grid, detail
modal, compact board piece. A card should read as something a player wants to pull, not as a UI tile.
Full data model in [../game/CARD-SYSTEM.md](../game/CARD-SYSTEM.md).

**Anatomy, top to bottom**

- **Art area** - roughly 65% of card height. Nothing overlaps the face. A gradient scrim covers only
  the lowest third so the name plate can sit against it. A slow specular sweep crosses the art.
- **Gem row and rarity word** - top left, four diamond slots with the filled count showing rarity;
  top right, the rarity name in Bree Serif. Two independent signals, neither colour-dependent.
- **Name plate** - a notched wooden banner breaking the frame line at the art boundary. Wraps to two
  lines rather than truncating.
- **Power seal** - a raised gold coin straddling art and plate, same relative size and position on
  every Hero card. Power must be findable without reading.
- **Faction line** - sigil tile, faction name and role on one baseline beneath the plate.
- **Ability line** - a handful of words, two lines maximum. Full rules text lives only in the detail
  view. This is what keeps type large enough to read on a phone.

**The three card types**

- **Hero** - character portrait, gold Power seal, role in the faction line. The numbered gold coin is
  the type's defining mark. Heroes are the only type carrying a number there.
- **Spell** - no portrait; art is a radiant rune sigil composition. A violet-framed type token sits
  where the Power seal would be. A Spell must never read as a Hero with the number removed.
- **Continuous Spell** - three simultaneous marks, because colour alone may not carry this: a gold
  type token holding the continuous glyph, a slowly rotating dashed rune ring inside the art, and a
  gold "Continuous" banner across the artwork. "This stays on the field" must be instant.

**Rarity** - four tiers, four stacked signals, so rarity survives greyscale, colour blindness and a
small screen. Rarity always outranks faction in the visual hierarchy: a common Kingdom card and a
legendary Kingdom card must be distinguishable at a glance across a grid; two legendaries of
different factions need not be.

| Tier | Gems | Frame | Ornament and glow |
| --- | --- | --- | --- |
| Common | 1 | Plain iron, 2px | None. Clean and quiet |
| Rare | 2 | Steel blue, 2.5px | Notched top corners |
| Epic | 3 | Violet, 3px | Filigree upper corners, soft outer glow |
| Legendary | 4 | Gold, 3.5px | Crown ornament above, lower corner brackets, pulsing aura, drifting motes, brighter art light |

**Faction** is restrained identification, never a theme applied to the whole interface. It owns
exactly three things: the light colour in the card art, the sigil shape, and one accent line of text.
It never touches frame weight, the Power seal, or surrounding UI.

| Faction | Accent | Sigil | Art light and edge |
| --- | --- | --- | --- |
| Kingdom | `#7FB6F0` | Diamond | Cool dawn light, banner ribbon detail |
| Undead | `#7FD8B0` | Ring | Pale underlight, bone hairline |
| Infernal | `#F0866A` | Spike | Ember rim light, cracked edge |
| Wildborn | `#B7D474` | Leaf | Green dapple light, woodgrain edge |

Spells carry a faction for flavour only (any deck may include any Spell); on a Spell card the faction
appears as a subdued text line, never as a frame treatment.

**Battlefield compact cards.** On the board a card becomes a chit roughly 110pt wide carrying
portrait, Power seal, short name and a small gem row, plus a status pill above the name when a
modifier applies. Ability text is dropped entirely. Names use the `shortName` field that already
exists in the card data, so nothing truncates mid-word. Spell chits carry the name on one line and
the kind label with its continuous glyph on a second line beneath - the glyph is never a floating
corner badge competing with the name for width. Chits are angled slabs, clipped along their vertical
edges so the player's row and the enemy's row lean toward each other.

## 7. Iconography

The product has **one** icon family and it already exists: the hand-authored 24x24 stroke set in
`src/components/Icon.tsx` (25 glyphs). Design work uses those exact glyph paths rather than drawing
substitutes. Icons are stroked in `currentColor` at 1.5-2.1 weight, round caps and joins.

The spell mark (radiant orb) and the continuous-spell mark (circle with loop arrow) are the
load-bearing glyphs in the whole product and are not replaced.

`public/icons.svg` is Vite starter boilerplate containing social logos and is **not** the game icon
set.

## 8. UI principles

Apply these when a decision is not covered elsewhere.

- **Clarity beats decoration.** If an ornamental choice makes the game harder to read, it goes.
- **One primary action per screen.** Everything else is visibly quieter.
- **Structure over labels.** If a relationship needs a caption to be understood, the layout is wrong.
- **Objects, not panels.** Before adding a rounded rectangle, ask what physical thing it could be.
- **Never signal with colour alone.** Rarity, spell type and state each carry at least two
  independent cues.
- **Simple terminology.** Short copy, sentence case, plain language. No heavy lore or invented
  fantasy vocabulary in the interface.
- **No manual targeting for normal effects.** Placement *is* targeting. A card that would need a
  target-selection UI is out of scope.
- **Motion is brisk.** Card lift 160ms, snap into lane 280ms, power bump 400ms, modal rise 260ms,
  press 90ms. No cinematic sequences.
- **Empty states are designed.** An empty slot shows what belongs there and invites the action.
- **Placeholder art must look intentional.** The layout has to hold up before final art arrives.
- **Mobile readability first.** Tap targets 44pt or larger. Hand and Fight seal in the lower third,
  within thumb reach. Body text holds 4.5:1 contrast against whatever sits behind it, painted
  environments included - which is why the top of Home carries a scrim. Card stats stay legible at
  chit size; if text will not fit it is cut rather than shrunk. No text truncates mid-word.
- **The battle screen never scrolls.** 390 x 844, no bottom navigation.
- **One developer must be able to build it.** Practical beats impressive.

Desktop: the player experience stays mobile-first, centred in a narrow column with a device frame. A
dashed developer panel may sit alongside it. The game is never redesigned as a desktop-first layout.

## 9. Rejected directions

Tried, judged, ruled out. Do not reintroduce without a deliberate conversation.

- **Dashboard and SaaS layouts** - a flat dark background with a vertical stack of rounded
  rectangular panels. The central failure of the first pass and the thing to guard against hardest.
- **Flat single-colour page backgrounds**, including the dark purple that replaced the earlier slate.
  Every screen carries a painted environment.
- **Generic rounded panel stacks.** Containers are shaped objects, used sparingly, never gridded.
- **Web-style CTA buttons.** The primary action is a seal set into the world, never a full-width
  rounded rectangle.
- **Tracked-out uppercase micro-labels.** Section headings are Bree Serif sentence case, or absent.
- **Generic app tab bars.** Navigation is a carved HUD arc with medallions.
- **Overly ornate TCG presentation**, cluttered MMO chrome, ornate frames.
- **Grimdark overload.**
- **Neon and rainbow palettes**, every panel a different colour, tiny text.
- **Faction-theming the entire application.** Faction stays inside card accents, sigils, filters and
  deck badges.
- **Cool neutral greys**, grey hairlines, grey empty slots. Neutrals are warm; empty slots are
  designed.
- **Full rules text on the card face.** Cards carry a short line; full text is in the detail view.
- **Corner badges competing with a name for width.** The continuous glyph sits inline with the kind
  label.
- **Left / centre / right lane labels.** The column structure carries it.
- **Extra confirm or cast buttons in battle.** One Fight press per round.
- **New systems** - shop, summon, quests, events, guilds are out of scope until asked for. No
  progression systems on Profile.
- **The two rejected concept directions**, Ashen Vigil and Aetherfall.

## 10. Working with Claude Design

**Claude Design** owns visual exploration and specification. **Claude Code** owns the working
implementation, this repository's documentation, integration, and the current source of truth for
rules and data.

These markdown files exist so a **new** design session can be bootstrapped from a short read. Do not
keep appending context to one endless Claude Design session - context rot in a long thread is how
rejected directions come back.

Recommended flow:

```text
repo source-of-truth docs
        |
        v
fresh Claude Design session
        |
        v
one focused visual task
        |
        v
approved design
        |
        v
Claude Code integration
        |
        v
update source-of-truth docs if needed
```

One focused visual task per session. When a design is approved, the approval is recorded here (or in
[CHARACTER-ART-BIBLE.md](CHARACTER-ART-BIBLE.md) for art), and the corresponding backlog item in
[UI-REDESIGN-BACKLOG.md](UI-REDESIGN-BACKLOG.md) is closed out.

**Housekeeping in the Claude Design project.** Three superseded exploration files and one obsolete
first-pass file should be removed: `Concept A`, `Concept B`, `Concept C` and `Battler Redesign`. The
live files are `Embervale` (the screen prototype) and `Card System` (the card specification).
