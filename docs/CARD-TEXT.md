# Moonwater card text standard

Card rules text is simple, consistent and readable in basic English. Flavor lives in names and art; rules text uses the
game words below and nothing else. The text is `BATTLE_LINES` in `src/game/cardCombat/cardText.ts` (face, board and full
line of every effect); `src/game/cards/cardTextStandard.test.ts` checks labels and banned words. The pass that set this
standard (2026-10-07) is the project file `moonwater/card-text/WORDING-PLAN.md`.

## Shape

- One label per effect, then one plain sentence: `Clash: Give this Unit +15 ATK this round.`
- One-time Spells print no label (their effect happens once, when cast).
- Keywords print alone: `Shield.` `Guard 2.` A conditional keyword names its condition: `Guard 1 while you have 3 Units.`
  The focus panel and Card Inspect print the keyword as the label and say what it does.
- The card face and the full line (focus panel, Card Inspect) use the same sentence. The full line only adds what a card
  has no room for: "to the enemy player" after damage, a token's ATK, "If there is no empty lane, nothing happens.",
  what a keyword does.
- A board line (a Unit on the board, a Spell in its Spell zone) may drop what being in play already says: a Bypass's
  "starting next round", "in this lane" for a Spell sitting in that lane. Only Grave Totem's Spell-zone line is
  compressed further ("If the enemy cast or has a Spell, ...") so the strip never cuts text.

## Labels

| Label | Meaning |
| --- | --- |
| Passive | Always on while this card is in play. |
| Round Start / Round End | At the start / end of each round. |
| Clash | Each round, just before the lanes fight (also when the lane has no enemy Unit). |
| Destroyed | When this Unit is destroyed: it loses or ties a fight, or an effect destroys it. |
| Ally Falls / Enemy Falls | When one of your other Units / an enemy Unit is destroyed. |
| When you cast a Spell / When the enemy casts a Spell | Each time a Spell is cast. "2nd Spell" is a condition: `If it is your 2nd Spell this round, ...` |
| Direct Attack | When this Unit hits the enemy player directly. |

## Templates

| Effect | Text |
| --- | --- |
| ATK this round | Give this Unit +15 ATK this round. |
| ATK for the battle | Give this Unit +15 ATK for the rest of the battle. |
| Repeating growth (capped by the engine) | Give this Unit +15 ATK for the rest of the battle, up to +45. |
| Count | Give this Unit +15 ATK this round for each Unit in your Graveyard, up to +45. |
| Condition | If you have 3 Units, give this Unit +15 ATK this round. |
| While in play | Adjacent allies have +15 ATK. / Your Unit in this lane has +15 ATK. / The attached Unit has +15 ATK. |
| ATK loss | Give the enemy Unit in this lane −30 ATK this round. / Give each enemy Unit −15 ATK for the rest of the battle. |
| Damage | Deal 45 damage to the enemy player. (Card face: Deal 45 damage.) |
| Heal | Restore 45 HP. |
| Draw | Draw 1 card. |
| Shield | Give your Unit in this lane a Shield. |
| Return | Return this card to your deck once. / Return a random Spell from your Graveyard to your hand. |
| Revive | Revive your weakest Undead Unit from your Graveyard into an empty lane. |
| Summon | Summon a Hound Pup in an empty lane. |
| Exile | Exile the strongest Unit from the enemy Graveyard. |
| Spell repeat | If the first Spell you cast each round is a one-time Spell, it happens twice. |
| Bypass | Bypass while you have a Spell in play, starting next round. |

## Words

- Targets: this Unit; your Unit in this lane; the enemy Unit in this lane; adjacent allies; your Units / your other
  Units; each enemy Unit; the attached Unit; the enemy player. Never "here", "allied" or "control".
- Durations: every ATK change says "this round" or "for the rest of the battle". A Passive's "has +15 ATK" lasts while
  its source is in play.
- Once: "Once per round.", "Once per battle.", or "once" for a card that returns itself. Printed on the card.
- Spell conditions, one phrase each: if you cast a Spell this round; if the enemy cast a Spell this round; if you have a
  Spell in play; if the enemy has a Spell in play; if you have a Spell in play in this lane.
- Card types: Unit, Spell (one-time), Lane Spell, Attached Spell. "Spell in play" is a Lane Spell or Attached Spell on
  the battlefield ("Continuous Spell" is only the umbrella word in the rules data).
- Graveyard counts say "Units" when Spells don't count and "cards" when they do, exactly as the resolver counts.
  Thresholds read "3+".
- Summon makes a token in an empty lane; Revive moves a Unit from the Graveyard into a lane; Return goes to hand or deck.
- Avoid: may, nearby, empower, weaken, curse, restore strength, fallen, grave, died, if losing, gain (a card).

## Glossary

`CARD_GLOSSARY` in `src/game/cards/effectText.ts`, shown under "Card words" in How to Play. Keyword and timing help in
Card Inspect reads the same definitions (`KEYWORD_HELP`, `TIMING_HELP`).
