# Moonwater card system

Status: the one card system for every player-facing card (global card UX migration, 2026-10-01). Presentation only:
no rule, stat, effect, Mastery, Starting HP, deck-out or economy value changes here.

## Three layers

1. **Card face** (`GameCard`): name, art, ATK (a Spell names its kind there), and every effect's compact battle line
   after its timing label. Collection-style tiles add HP Contribution beside ATK; battle faces never show it.
2. **Focused card detail** (`CardFocusPanel`): the full rule of every effect, current and printed ATK, HP
   Contribution where it applies, live state (each ATK change by source and how long it lasts, Shield, Silence, entry
   ATK, a Continuous Spell's lane), and an Inspect button. In battle it is a dock over the hand apron
   (`layout="dock"`), so the board, the HP bars and Fight stay visible; outside battle it is a bottom sheet
   (`layout="sheet"`, via `CardViewer`) with the screen's own actions (Deck Builder: Add to deck / Remove one).
3. **Card Inspect** (`CardInspect`): the large card, rarity / faction / type, traits, ATK and HP Contribution spelled
   out, every rule with keyword help, copies owned (historical Mastery progress is kept in the save but never shown; there is no
   combat Card Mastery since 2026-10-03),
   where it comes from, the deck it is in, lore, previous/next in the Collection, and treatment hooks.

The battle log (`components/battleInfo/battleLog.ts`) sits beside layer 2 in battle: optional, a Log pill by the HP
bar, grouped by round, newest at the bottom, built from the resolver's own events.

## One model for every surface

`src/game/cards/cardPresentation.ts` is the only place card wording is assembled. `cardEffects(card, { rules,
masteryRank })` returns each effect with:

| Field | Use |
| --- | --- |
| `label` | timing label or keyword label every surface prints ("On Play", "Guard 2", "Your 2nd Spell") |
| `timing` | the trigger's own label (Inspect shows both when a keyword replaces it) |
| `compact` | the battle line on every card face ("Adjacent allies +15 ATK.") |
| `board` | the board's wording (equal to `compact`, or tighter where part of it stops mattering in play) |
| `full` | the full rule (focus detail, Inspect) |
| `oncePerRound`, `mastery`, `abilityIndex` | tags and live Passive state lookup |

Both wordings are authored side by side (`BATTLE_LINES` in `cardCombat/cardText.ts`, `LEGACY_LINES` and
`MASTERY_LINES` in `cardPresentation.ts`); the compact line is never cut from the full rule. Other helpers:
`printedAtk`, `legacyAtk`, `cardKeywords`, `cardIdentity` ("Rare · Kingdom · Unit · Knight"), `cardSearchText`
(Collection and Deck Builder search), `masteryRankCopy`. `src/game/cards/cardCopy.ts` `cardCopyView` gives the player's
copy of a card (owned, copies, printed HP Contribution).

Timing labels: On Play, Passive, Clash, After Clash, Destroyed, Ally Falls, Enemy Falls, Round Start, Round End, Your
Spell, Enemy Spell, Direct Attack. Keyword labels replace the timing where they say more (Guard N, Your 2nd Spell,
Enemy's 2nd Spell).

## Densities

`<GameCard cardId density rules? masteryRank? atk? tempAtk? silenced? shielded? passiveState? name? hpContribution?
owned? copies? treatment? artId? animated? />`

| Density | Where | Notes |
| --- | --- | --- |
| `hand` | battle hand (117×176 at 390) | most readable: 10px rules |
| `board` | Units on the board (118×168 at 390) | 9.5px rules, current ATK with printed beside it, active-state dots |
| `spell` | Spell zones (full-width strip) | name inline with the rule |
| `tile` | Collection, Deck Builder, Box contents, Pull Results, Structure Decks, events, banners, Campaign rewards, focus sheet | hand proportions, HP Contribution beside ATK |
| `inspect` | Card Inspect | 12.5px rules, animated art |

All densities share the frame, the Cinzel name bar, Alegreya rules, Alegreya SC labels, the rarity frame (pewter,
steel, amethyst, gold; Legendary crest), the faction sigil and gems, the ATK socket and the effect language. A card
whose text is long first tightens its spacing, then gives the text box room from the art box, then uses smaller type
(never below 9px, the last step slightly condensed). Text never scrolls and is never cut off. Treatments
(`foil`, `moonlit`, `animated`, `alt-art`, `premium-frame`, `event`) are a `data-treatment` attribute and an overlay layer
on the art.

## Rules sets in battle

Every battle mode renders the same faces, focus dock, log and Inspect. `CombatDisplayContext`
(`components/combatDisplay.ts`) tells them which rules the battle plays:

- `card` (card combat): the approved ATK, effects and HP Contribution (Starting HP; shown in the focus detail and
  Inspect only).
- `legacy` (historical rules; since 2026-10-01 only a development build's `?combat=legacy` and an old Friendly match record that is still finishing play them, see CARD-COMBAT-DESIGN.md section 16): ATK is the Power band (15 × Power + 35), effects are the legacy rules
  plus the copy's legacy Ascension abilities (marked), HP Contribution is not shown in battle (Inspect says it is not used
  there), and Legacy Level shows as an ATK change. So a card in play never claims a number the battle will not use.

Every production battle plays `card`, so a card shows the same numbers and wording in battle as in the Collection. Resolver selection lives in `combat/combatModel.ts`.

## Tests

`components/card/GameCard.test.ts`: every effect on every card in hand, on the board / in its Spell zone and on its
tile, for both rule sets; grouped labels; buffed ATK with printed ATK; no HP Contribution on battle faces; focus
detail full text; Inspect and the viewer open; legacy ATK and Mastery effects. `battleInfo/*.test.ts`: focus detail
content and the log in both rule sets. `cards/effectText.test.ts`: copy vocabulary and numbers.
