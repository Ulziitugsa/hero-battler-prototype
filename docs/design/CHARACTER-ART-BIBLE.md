# Character art bible

**Status:** approved art direction. No final artwork exists yet - every card currently renders a
styled geometric placeholder (see "Current state of art in the repo" at the end).

This document is the standalone reference for character and spell artwork. It supersedes the earlier
hyper-detailed fantasy rendering direction, which was **rejected because it looked obviously
AI-generated**.

The approved direction is:

> **Simpler, hand-painted, slightly cartoon/stylised fantasy character illustration with broad
> painted shapes and restrained detail.**

The result should look **intentionally illustrated**, not like hyper-detailed AI fantasy art.

Frame, layout and card anatomy are specified separately in
[DESIGN-SOURCE-OF-TRUTH.md](DESIGN-SOURCE-OF-TRUTH.md) section 6. This document covers only what goes
*inside* the art area.

---

## 1. Core art identity

- Stylised fantasy.
- Hand-painted appearance.
- Broad brush shapes.
- Visible painterly texture.
- Slightly simplified / cartooned anatomy.
- Strong silhouettes.
- Expressive faces.
- Restrained detail.
- Readable at small card size.
- **Character design first, rendering second.**

Avoid photorealism. Avoid highly polished 3D-render-like rendering.

An artwork succeeds if the character idea survives being shrunk to a board chit. It fails if it only
impresses at full size.

## 2. Detail ceiling

**When uncertain, remove detail.**

| Element | Target |
| --- | --- |
| Hair | Grouped painted masses. Not hundreds of individual strands |
| Armour | Large readable shapes, a small number of accents. No endless engraving |
| Fabric | Broad folds, restrained texture |
| Faces | Clear and expressive, simplified. No pore-level realism, no glossy beauty rendering |
| Weapons | Strong graphic silhouette, limited ornament |
| Background | Suggestive, simple, secondary to the character |

## 3. Anti-AI rules

The previous direction was rejected for reading as machine-generated. These are the specific signals
to avoid.

**Avoid**

- Excessive micro-detail.
- Meaningless filigree.
- Dozens of straps and buckles.
- Glossy skin.
- Every character looking like a fashion model.
- A generic glamour pose on every card.
- Perfectly symmetrical designs.
- Hyper-rendered hair.
- Particles everywhere.
- Complicated glowing environments.
- Excessive cinematic depth-of-field.
- Random jewellery.
- Detail added without design purpose.

**Prefer**

- Simplified graphic shapes.
- Intentional asymmetry.
- A restrained palette.
- Varied body and face designs.
- Strong individual character ideas.
- Visible painted texture.
- Limited rendering.

The single most useful test: *can you say in one sentence what this character is, without describing
their ornamentation?* If not, the design is decoration standing in for a character.

## 4. Shared character-design language

Each character has:

- One dominant silhouette feature.
- One primary costume idea.
- One signature object or weapon.
- A clear personality and expression.
- Mild deliberate asymmetry.
- Simple faction cues.

**Do not give every character five visual gimmicks.** One idea, executed clearly, beats four ideas
competing for the same silhouette.

## 5. Faction language

Faction is carried by shape, material and attitude - not by flooding the artwork with a colour. See
[DESIGN-SOURCE-OF-TRUTH.md](DESIGN-SOURCE-OF-TRUTH.md) section 6 for the accent colours and sigils
that live on the frame rather than in the art.

### Kingdom

- **Shape:** diamonds, shields, broad upward shapes.
- **Materials:** ivory armour, muted gold, blue cloth, warm steel, leather.
- **Character feel:** noble, heroic, disciplined, approachable, aspirational.
- **Gameplay identity for reference:** knights, priests, archers - buffs, protection, board control.

### Undead

- **Shape:** broken circles, crescents, tall/narrow silhouettes, hanging cloth.
- **Materials:** dark cloth, tarnished metal, bone, muted green accents.
- **Character feel:** eerie, elegant, melancholic, sinister - **stylish rather than gory**.
- **Gameplay identity for reference:** skeletons, wraiths, necromancers - death triggers, revival,
  graveyard recursion.

### Infernal

- **Shape:** triangles, spikes, split horns, heavy upper silhouettes.
- **Materials:** dark iron, charred leather, obsidian, bronze, ember accents.
- **Character feel:** aggressive, charismatic, dangerous, energetic.
- **Gameplay identity for reference:** demons, fire creatures, corrupted warriors - aggression, direct
  damage, Power reduction.

### Wildborn

A fourth faction exists in the codebase (`src/game/cards/wildborn.ts`) with provisional styling - leaf
sigil, green dapple light - but is **not** part of the playtest roster and has not been confirmed for
the product. **Do not commission Wildborn artwork until it is confirmed or cut.** Tracked as an open
task in the Design Source of Truth.

## 6. Character variety

Across the eventual roster, deliberately include:

- Attractive characters.
- Rough characters.
- Older characters.
- Cute characters.
- Beasts and monsters.
- Unusual body shapes.
- Different genders.
- Different skin tones.
- Different expressions and personalities.

**Do not make the roster consist of 30 conventionally attractive young fantasy humans.** Variety here
is the main thing that will make the collection feel like a designed set rather than a generated one.

## 7. Cute and mascot characters

Allowed, and wanted:

- Larger head proportions.
- Smaller bodies.
- Simpler silhouettes.
- Expressive faces.
- One obvious visual gag or characteristic.

They keep the **same painted rendering language** as everything else - a mascot is a proportion
choice, not a different art style.

## 8. Legendary treatment

Legendary means:

- A stronger character concept.
- A more iconic silhouette.
- A more confident composition.
- A memorable signature object.
- A slightly stronger visual presence.

Legendary does **not** mean:

- More detail.
- More jewellery.
- More particles.
- More armour engraving.

Rarity escalation that lives in the artwork will pull the whole set back toward the rejected
hyper-detailed look. The frame already carries rarity through four stacked signals - gems, frame
weight and colour, ornament, and glow. The art carries it through *design quality*, not density.

There are currently three Legendaries in the roster: Paladin (Kingdom), Vharos (Undead), Infernal
Lord (Infernal).

## 9. Spell artwork

**One-time Spells**

- One obvious action.
- Strong graphic composition.
- A simple effect.
- Immediate visual energy.

**Continuous Spells**

- One recognisable persistent object or environment: a banner, altar, totem, shrine, cursed ground, a
  ward.
- Anchored and environmental rather than an action mid-flight - this is the visual half of "this
  stays on the field".

Both must remain readable at very small size. Spell art is a radiant rune sigil composition in the
frame, never a character portrait - a Spell card must never read as a Hero card with the number
removed.

The current roster splits 8 one-time / 6 continuous; see [../game/CARD-SYSTEM.md](../game/CARD-SYSTEM.md).

## 10. Approved rendering anchor

**The latest simplified painted character studies are the current visual complexity target.** When
judging a new piece, compare it against those, not against the earlier detailed attempts.

The target reads as:

- Broad visible painted shapes.
- Flat / simple value masses.
- Restrained facial rendering.
- Simplified costume rendering.
- Reduced environmental detail.
- More illustration-like and less cinematic than previous attempts.

If a piece is more rendered than the anchor studies, it is wrong even if it is individually
attractive. **Consistency across the set matters more than individual impressiveness.**

> **Reference images are not currently stored in this repository.** The approved studies live in the
> Claude Design project. When they are exported, put them under `docs/design/reference/` and link
> them from this section. Do not regenerate them.

## 11. Image-generation base prompt

Reusable base prompt for every character:

> Stylised hand-painted fantasy game character illustration with simple graphic shapes, broad visible
> brush strokes and restrained detail. Slightly exaggerated heroic proportions, clear expressive
> face, strong readable silhouette, one dominant costume shape and one signature weapon or object.
> Simplified armour and clothing with large colour masses and very limited ornamentation. Painterly
> textured edges, restrained lighting, minimal gradients, no photorealism, no glossy 3D rendering, no
> excessive micro-detail. Simple atmospheric background built from a few large painted silhouettes.
> Character should remain recognisable when reduced to a mobile collectible card thumbnail.
> Deliberately illustrated rather than cinematic.

Faction and character-specific information is **appended** per card - the base prompt is not rewritten
per character. Append, in this order:

1. Faction shape / material / feel language from section 5.
2. The character's one dominant silhouette feature, one primary costume idea, one signature object.
3. Personality and expression.
4. Any variety note from section 6 (age, build, species, mood) that this card is carrying for the set.

## 12. Current state of art in the repo

Recorded so a design session is not misled about what exists:

- **No artwork files exist.** There is no image directory; `public/` contains only `favicon.svg` and
  the unused Vite boilerplate `icons.svg`.
- **`CardDefinition` has no image field** (`src/game/types/index.ts`). Cards render a CSS placeholder
  keyed off faction - the `.art` element with a faction class in `HomePage`, `CardDetail`,
  `CollectionPage` and the board chits. Adding drop-in art means adding an image slot to the card
  data model; that is P2 work, not design work.
- The placeholder treatment is deliberate: "placeholder art must look intentional" is a standing UI
  principle, and the layout is expected to hold up before final art arrives.
