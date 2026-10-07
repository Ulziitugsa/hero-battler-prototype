# Moonwater card text standard

Card rules text is simple, consistent and readable in basic English. Flavor lives in names and art; rules text uses the
game words below and nothing else. The text is `BATTLE_LINES` in `src/game/cardCombat/cardText.ts` (face, board and full
line of every effect); `src/game/cards/cardTextStandard.test.ts` checks labels and banned words. The pass that set this
standard (2026-10-07, short faces the same day) is the project file `moonwater/card-text/WORDING-PLAN.md`.

## Two registers

**Card face = short, readable battle text.** **Focus panel and Card Inspect = the full plain-English explanation.**
Each effect has a `face` line (hand, Collection tile, Card Inspect's card) and a `full` line (focus panel, Card Inspect
rules list, battle log). A face line is short so the art keeps its room: text fitting is solved by shorter words, not by
shrinking the art.

| | Card face | Full line |
| --- | --- | --- |
| Royal Guard | `Passive: Adjacent allies +15 ATK.` | `Passive: Adjacent allies have +15 ATK.` |
| Archmage Vael | `2nd Spell: Deal 90 damage.` | `When you cast a Spell: If it is your 2nd Spell this round, deal 90 damage to the enemy player.` |
| Enfeeble | `Enemy Unit here −30 ATK this round and −15 ATK for the battle.` | `Give the enemy Unit in this lane −30 ATK this round and −15 ATK for the rest of the battle.` |

Face shorthand (the full line always spells it out):

- "this Unit" goes without saying: `+15 ATK this round.`
- "here" is this lane: `your Unit here`, `Enemy Unit here`, `a Spell here` (= a Spell in play in this lane).
- "for the battle" is "for the rest of the battle"; "this round" stays "this round".
- `Deal 45 damage.` is to the enemy player. `Return a random Spell.` is from your Graveyard to your hand.
- `Summon a Hound Pup.` is into an empty lane; the token's ATK is in the full line.
- `enemy cast or has a Spell` = the enemy cast a Spell this round or has a Spell in play.
- `Adjacent allies losing their lane` = adjacent allies that would lose their lane.
- Short labels: `Your Spell` (When you cast a Spell), `Enemy Spell` (When the enemy casts a Spell), `2nd Spell`,
  `Enemy’s 2nd Spell` (a condition the full line states).
- Cards with three effects get the tightest faces. Checked by `cardTextStandard.test.ts`: a face line is at most 85
  characters and a card's whole face text at most 165.

## Shape

- One label per effect, then one plain sentence: `Clash: +15 ATK this round.` (full: `Give this Unit +15 ATK this round.`)
- One-time Spells print no label (their effect happens once, when cast).
- Keywords print alone: `Shield.` `Guard 2.` A conditional keyword names its condition: `Guard 1 with 3 Units.`
  The focus panel and Card Inspect print the keyword as the label and say what it does.
- A board line (a Unit on the board, a Spell in its Spell zone) may drop what being in play already says: a Bypass's
  "starting next round", "here" for a Spell sitting in that lane.

## Labels

| Label | Meaning |
| --- | --- |
| Passive | Always on while this card is in play. |
| Round Start / Round End | At the start / end of each round. |
| Clash | Each round, just before the lanes fight (also when the lane has no enemy Unit). |
| Destroyed | When this Unit is destroyed: it loses or ties a fight, or an effect destroys it. |
| Ally Falls / Enemy Falls | When one of your other Units / an enemy Unit is destroyed. |
| When you cast a Spell / When the enemy casts a Spell | Each time a Spell is cast. The face says `Your Spell` / `Enemy Spell`, or `2nd Spell` where the full line is `If it is your 2nd Spell this round, ...` |
| Direct Attack | When this Unit hits the enemy player directly. |

## Templates (full line)

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

- Targets (full line): this Unit; your Unit in this lane; the enemy Unit in this lane; adjacent allies; your Units /
  your other Units; each enemy Unit; the attached Unit; the enemy player. "here" is face shorthand only. Never
  "allied" or "control".
- Durations: every ATK change says "this round" or "for the rest of the battle" (face: "for the battle"). A Passive's
  "has +15 ATK" lasts while its source is in play.
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
