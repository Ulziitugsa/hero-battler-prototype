# Moonwater card face and Card Inspect

Status: implemented (Thread A of the collectible-card pass). Presentation only; the combat resolver is unchanged.

## Stats on the card

Every Unit prints two numbers, from `src/game/cards/cardFace.ts`:

| Stat | Icon | Meaning | Value today |
| --- | --- | --- | --- |
| ATK | diagonal longsword (`AtkIcon`) | Strength in a lane clash. The higher ATK wins the lane. | `40 + 15 × Power` |
| HP Contribution | heart with a plus (`HpIcon`) | Adds this amount to your starting HP. Not the Unit's own health. | `max(45, 145 − 10 × base Power)` |

`deckStartingHp(cards)` sums HP Contribution for the Deck Builder. The ATK mapping is linear and increasing, so comparing ATK always gives the same lane winner as the engine's Power comparison, and every Power change converts exactly (1 Power = 15 ATK). In battle the default resolver still uses Power and the fixed 20 match HP; card faces show live ATK translated from live Power, and player HP/damage numbers stay on the old scale until the combat migration.

The experimental per-unit-HP combat (v2) keeps its own chit readout and is not promoted by this work.

## One card component, three modes

`CollectibleCard` (`src/components/CollectibleCard.tsx`):

```tsx
<CollectibleCard
  cardId="kng-paladin"
  mode="battle" | "standard" | "inspect"   // default "standard"; legacy `compact` = "battle"
  treatment="base"                          // reserved: foil, moonlit, animated, alt-art, premium-frame, event
  artId?                                    // alternate art: paint another art id on the same face
  livePower?                                // battle: current Power → live ATK, green/red vs printed
  owned? copies? masteryRank?               // Collection overlays (veil + lock, ×N, Mastery numeral)
  animated?                                 // pixel animation; defaults on only in inspect
/>
```

- **battle**: art, ATK, HP Contribution, effect indicator, short name. Used by the battle hand.
- **standard**: adds full name, rarity gems, faction sigil and a one-line effect summary. Collection, pack results, banners.
- **inspect**: large face with type line and set footer. Card Inspect and the Collection sheet.

Sizing is container-relative (`cqi`), so a page only sets the card's width. Rarity changes frame material (pewter, steel, amethyst, gold), trim and ornament; Epic adds corner ornaments; only Legendary adds a crest, a soft aura and a slow frame sheen (off under reduced motion).

Treatments: the face carries `data-treatment` and renders a `.collectible-treatment` layer over the art when the treatment is not `base`. Future foil/moonlit/animated looks are CSS (or a canvas) on that layer; no component change is needed.

Standalone pieces: `CardStats` (the stat pair, sizes compact/standard/full), `CardStatsPanel` and `CardEffectList` (inspect sections), `AtkIcon` / `HpIcon` / `EffectIcon`.

## Effect copy

`src/game/cards/effectText.ts` holds player-facing copy for every curated roster card and token, one line per ability, index-aligned with `card.abilities`. The engine's `abilities[].text` and `boardText` are untouched (battle log and older surfaces read them).

Timing labels, one per engine trigger: On Play, On Clash (before combat), After Clash, Round Start, Round End, When Destroyed, Ally Destroyed, Enemy Destroyed, Direct Attack, You Cast a Spell, Enemy Casts a Spell, While Active (continuous Spell), Always (passive). Durations are "this round" or "for the rest of the battle". "Once per round" is a tag from `oncePerRound`. Keywords explained in Inspect: Shield, Silence, Bypass, Token, Exile, Continuous Spell.

`effectText.test.ts` checks every ATK number in the copy against the engine actions, bans old vocabulary (Hero, Power, `w/`, `Adj`, `;`), and caps summaries at 34 characters. Cards outside the roster (and Mastery-evolved abilities) fall back to the engine text with Hero→Unit and Power→ATK normalised.

`cardSearchText(card)` gives Deck Builder / Collection search a lower-cased string of name, faction, tags, summary and effect text.

## Card Inspect

`CardDetail` props: `cardId`, `onClose`, and optional `context` (`collection | deck | battle | opponent | pack | shop | other`), `livePower`, `masteryRank`, `treatment`. Battle contexts show the face, stats and exact effect only; other contexts add copies owned, Card Mastery stage, how to get it, card style and lore. Opening it tracks `card_inspect_opened` with the context.

Entry points wired in this pass: Collection tiles and sheet; battle hand (info button, 30px with an enlarged hit area, or long-press anywhere on the card); own and enemy board chits (tap), with live ATK and the copy's Mastery rank; graveyard sheet.

Still to hook up (Thread F): Deck Builder (`DecksPage` should pass `context="deck"` and render pool/deck tiles with `CollectibleCard mode="standard"`), pack and Box results (`RitualStage`, `PrototypeBoxPanel`, `PoolSheet`: `context="pack"`), and Ranked opponent deck info if it lists cards (`context="opponent"`).
