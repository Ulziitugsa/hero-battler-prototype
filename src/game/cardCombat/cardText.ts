import type { CardDefinition } from '../types/index.js';
import { TIMING_LABEL, cardEffectLines, type CardEffectLine } from '../cards/effectText.js';
import { getCard } from '../cards/index.js';
import { getCombatCard, hasCombatOverride } from './cards.js';
import { HP_PER_LEGACY_POINT } from './stats.js';

// Player-facing wording for the card-combat rules: the approved ATK + HP Contribution model that card faces show on
// every surface (cardPresentation.ts pairs these lines into card effects).
//  - BATTLE_LINES (below) is the card text: the short face line, the board line and the full line of every effect.
//  - cardCombatEffectLines lists a card's effects (trigger, once per round) in order. Its text is the rules data's own
//    sentence: tests and the legacy fallback read it, no card surface prints it.

const hp = (legacyPoints: number) => legacyPoints * HP_PER_LEGACY_POINT;

/** Card-combat full lines for unchanged cards whose live copy speaks in legacy HP points. Index-aligned with the card's abilities. */
const HP_LINES: Record<string, string[]> = {
  'inf-flame-imp': [`Deal ${hp(1)} extra damage to the enemy player.`],
  'inf-pit-fiend': [`Deal ${hp(2)} damage to the enemy player.`, 'If an enemy Unit was destroyed this round, gain +30 ATK this round.'],
  'inf-runebreaker': ['Destroy the enemy Continuous Spell in this lane.', 'While another Mage Slayer is in play, enemy Spells can’t affect this Unit.', `The second time the enemy casts a Spell in a round, deal ${hp(2)} damage to the enemy player.`],
  'spl-arcane-bolt': [`Deal ${hp(3)} damage to the enemy player.`, `If you already cast a Spell this round, deal ${hp(2)} more.`],
};

/** Full effect lines of a card under card combat, in order (abilities with no text of their own are left out). */
export function cardCombatEffectLines(cardOrId: CardDefinition | string): CardEffectLine[] {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId.id;
  const card = getCard(id);
  const hpLines = HP_LINES[id];
  const liveLines = hpLines ? cardEffectLines(card).map((line, i) => ({ ...line, text: hpLines[i] ?? line.text })) : cardEffectLines(card);
  // An ability with no text of its own continues the line above it (Ignis's stacked thresholds, Enfeeble's second half).
  if (!hasCombatOverride(id)) return liveLines.filter((_, i) => card.abilities[i].text !== '');
  // Lines a change kept as they were are the live ability objects (or, for a one-time Spell's effect re-timed to Cast,
  // share its actions): they read the live curated copy. Everything else reads its card-combat ability text.
  return getCombatCard(id)
    .abilities.filter((ability) => ability.text !== '')
    .map((ability) => {
      const liveIndex = card.abilities.findIndex((live) => live === ability || live.actions === ability.actions);
      return { trigger: ability.trigger, label: TIMING_LABEL[ability.trigger], text: liveIndex >= 0 ? liveLines[liveIndex].text : ability.text, oncePerRound: !!ability.oncePerRound };
    });
}

/**
 * A leading timing phrase that only repeats the label printed before the line ("Before Combat: …" after "Clash").
 * Card surfaces drop it; the card data keeps it. Guard lines keep their "Guard N" keyword.
 */
const REDUNDANT_PREFIX = /^(Before Combat|On Death|When Destroyed|Round End|Round Start):\s*/;
const GUARD_PREFIX = /^(Guard \d): Before Combat, /;

export function trimTiming(text: string): string {
  const guard = GUARD_PREFIX.exec(text);
  if (guard) return `${guard[1]}: ${text.slice(guard[0].length)}`;
  const stripped = text.replace(REDUNDANT_PREFIX, '');
  return stripped === text ? text : stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/**
 * One effect's wording: the short card-face line, an optional tighter board line, the full plain-English line (focus
 * panel, Card Inspect) when it says more than the face, an optional label that replaces the timing label everywhere,
 * and an optional face label that replaces it on the card face only ("2nd Spell" for "When you cast a Spell"). A plain
 * string is a line that reads the same everywhere. `keyword` marks a keyword effect (Guard, Shield): the panels print the
 * keyword as the label with the full line.
 */
export type BattleCopy = string | { face: string; board?: string; full?: string; label?: string; faceLabel?: string; keyword?: boolean };

/**
 * THE card text of every card-combat card (docs/CARD-TEXT.md is the standard; the wording plan was
 * moonwater/card-text/WORDING-PLAN.md). Index-aligned with cardCombatEffectLines; a test keeps every card with an effect
 * listed here. Two registers:
 *  - CARD FACE (`face`, `board`): one natural sentence per effect that says what happens, to whom, when and for how
 *    long, with no timing label: "Before lanes fight, this gets +15 ATK this round.", "When this is destroyed, deal 45
 *    damage to the enemy player.", "If this would lose its lane, it gets +30 ATK this round." (Guard), "Survives
 *    destruction once." (Shield), "this attacks the enemy player directly" (Bypass), "allies next to this", "in this
 *    lane", "The Unit with this Spell", "one of your empty lanes", "loses 15 ATK", "until the battle ends".
 *  - FULL (`full`, focus panel and Card Inspect): one complete plain sentence after its timing label. Every ATK change says "this round" or
 *    "until the battle ends", targets are "this Unit", "your Unit in this lane", "the enemy Unit in this lane",
 *    "allies next to this Unit", "the Unit with this Spell", and "Spell in play" is a Lane or Attached Spell on the
 *    battlefield.
 * Both registers keep: "up to +45" on repeating growth, "Once per
 * round", "Once per battle" and "once", and Graveyard counts in "Units" or "cards" exactly as the resolver counts them.
 * Legacy battles (old replays) read their own lines where the legacy rules differ (cardPresentation.ts LEGACY_LINES).
 */
export const BATTLE_LINES: Record<string, BattleCopy[]> = {
  'inf-cultist': [{ face: 'Before lanes fight, this gets +15 ATK this round.', full: 'Give this Unit +15 ATK this round.' }],
  'inf-pit-fiend': [{ face: 'When this is destroyed, deal 90 damage to the enemy player.', full: 'Deal 90 damage to the enemy player.' }, { face: 'Before lanes fight, if an enemy Unit was destroyed this round, this gets +30 ATK this round.', full: 'If an enemy Unit was destroyed this round, give this Unit +30 ATK this round.' }],
  'inf-soot-imp': [{ face: 'When this is destroyed, deal 45 damage to the enemy player.', full: 'Deal 45 damage to the enemy player.' }],
  'spl-weakness': [{ face: 'Enemy Unit in this lane loses 45 ATK this round.', full: 'Give the enemy Unit in this lane −45 ATK this round.' }],
  'inf-flame-imp': [{ face: 'When this attacks the enemy player directly, deal 45 extra damage.', full: 'Deal 45 extra damage to the enemy player.' }],
  'inf-infernal-lord': [{ face: 'At the end of each round, if you cast a Spell this round, deal 45 damage to the enemy player.', full: 'If you cast a Spell this round, deal 45 damage to the enemy player.' }, { face: 'When this is destroyed, each enemy Unit loses 30 ATK until the battle ends.', full: 'Give each enemy Unit −30 ATK until the battle ends.' }],
  'spl-fireball': [{ face: 'Enemy Unit in this lane loses 60 ATK until the battle ends.', full: 'Give the enemy Unit in this lane −60 ATK until the battle ends.' }, { face: 'Then, if the enemy has a Spell in this lane, set that Unit’s ATK to 50 until the battle ends.', full: 'Then, if the enemy has a Spell in play in this lane, set that Unit’s ATK to 50 until the battle ends. Its Spell’s bonus still adds on top.' }],
  'spl-cinder-bolt': ['Deal 90 damage to the enemy player.'],
  'inf-hellhound': [{ face: 'Before lanes fight, enemy Unit in this lane loses 30 ATK this round.', full: 'Give the enemy Unit in this lane −30 ATK this round.' }],
  'kng-archer': [{ face: 'Before lanes fight, this gets +15 ATK this round.', full: 'Give this Unit +15 ATK this round.' }, { face: 'If you have a Spell in this lane, it gets +15 more.', full: 'If you have a Spell in play in this lane, give this Unit +15 more ATK this round.' }],
  'spl-battle-banner': [{ face: 'The Unit with this Spell gets +15 ATK.', full: 'The Unit with this Spell has +15 ATK.' }],
  'spl-power-surge': [{ face: 'Your Unit in this lane gets +45 ATK this round.', full: 'Give your Unit in this lane +45 ATK this round.' }],
  'spl-aegis-ward': [{ face: 'Prevent the next damage to you this round.', full: 'Prevent the next damage your player would take this round, including Clash Damage.' }, { face: 'Your Unit in this lane survives destruction once.', full: 'Give your Unit in this lane a Shield.' }],
  'spl-dispel': [{ face: 'Destroy the enemy Spell in this lane.', full: 'Destroy the enemy Spell in play in this lane.' }, { face: 'If you do, then draw 1 card.', full: 'If you do, draw 1 card.' }],
  'kng-shieldbearer': [{ label: 'Guard 2', keyword: true, face: 'If this would lose its lane, it gets +30 ATK this round.', full: 'If this Unit would lose its lane, give it +30 ATK this round.' }],
  'kng-royal-guard': [{ face: 'Allies next to this get +15 ATK.', full: 'Allies next to this Unit have +15 ATK.' }],
  'kng-light-priest': [{ label: 'Shield', keyword: true, face: 'Survives destruction once.', full: 'This Unit survives the first time it would be destroyed.' }, { face: 'At the end of each round, restore 45 HP.', full: 'Restore 45 HP.' }, { face: 'When you cast a Spell, this gets +15 ATK this round.', full: 'Give this Unit +15 ATK this round.' }],
  'kng-paladin': [{ label: 'Shield', keyword: true, face: 'Survives destruction once.', full: 'This Unit survives the first time it would be destroyed.' }, { face: 'Before lanes fight, allies next to this that would lose their lane get +15 ATK this round.', full: 'Allies next to this Unit that would lose their lane get +15 ATK this round.' }, { face: 'When an enemy Unit is destroyed, if it was in this lane, restore 45 HP. Once per round.', full: 'If the destroyed enemy Unit was in this lane, restore 45 HP. Once per round.' }],
  'und-bone-soldier': [{ face: 'When this is destroyed, return it to your deck. Only once.', full: 'Return this card to your deck once.' }, { face: 'Before lanes fight, this gets +15 ATK this round per Unit in your Graveyard, up to +45.', full: 'Give this Unit +15 ATK this round for each Unit in your Graveyard, up to +45.' }],
  'und-cursed-warrior': [{ face: 'When this is destroyed, return it to your hand. Only once.', full: 'Return this card to your hand once.' }],
  'und-crypt-warden': [{ label: 'Guard 1', keyword: true, face: 'If this would lose its lane, it gets +15 ATK this round.', full: 'If this Unit would lose its lane, give it +15 ATK this round.' }, { label: 'Shield', keyword: true, face: 'While your Graveyard has 2+ cards, this survives destruction once.', full: 'While your Graveyard has 2+ cards, this Unit survives the first time it would be destroyed.' }],
  'und-dark-priest': [{ label: 'Guard 2', keyword: true, face: 'If this would lose its lane, it gets +30 ATK this round.', full: 'If this Unit would lose its lane, give it +30 ATK this round.' }, { face: 'Before lanes fight, if your Graveyard has 3+ cards, this gets +15 ATK this round.', full: 'If your Graveyard has 3+ cards, give this Unit +15 ATK this round.' }],
  'und-grave-sexton': [{ face: 'At the end of each round, if your Graveyard has 3+ Units, restore 45 HP.', full: 'If your Graveyard has 3+ Units, restore 45 HP.' }],
  'und-vharos': [{ face: 'When this is destroyed, revive it in this lane with 95 ATK. Only once.', full: 'Revive this card in this lane with 95 ATK once.' }, { face: 'When this is destroyed, return your strongest other Undead to your hand.', full: 'Return your strongest other Undead Unit from your Graveyard to your hand.' }],
  'spl-second-chance': [{ face: 'Return your strongest Graveyard Unit to your hand.', full: 'Return the strongest Unit in your Graveyard to your hand.' }],
  'spl-raise-fallen': [{ face: 'If your Graveyard has 2+ Undead, revive the weakest into this lane.', full: 'If your Graveyard has 2+ Undead cards, revive your weakest Undead Unit into this lane. If this lane is not empty, nothing happens.' }],
  'spl-hush': ['Silence the enemy Unit in this lane this round.'],
  'inf-cerberus': [{ face: 'Before lanes fight, if you have 3 Units, each enemy Unit loses 15 ATK this round.', full: 'If you have 3 Units, give each enemy Unit −15 ATK this round.' }, { face: 'When this is destroyed, summon a Hound Pup in one of your empty lanes.', full: 'Summon a Hound Pup (65 ATK) in an empty lane.' }],
  'inf-alpha-hound': [{ face: 'Before lanes fight, this gets +15 ATK this round per other Unit you have.', full: 'Give this Unit +15 ATK this round for each other Unit you have.' }],
  'inf-brimstone-matriarch': [{ face: 'Before lanes fight, if you have 3 Units, this gets +15 ATK this round.', full: 'If you have 3 Units, give this Unit +15 ATK this round.' }, { face: 'When this is destroyed, summon a Hound Pup in one of your empty lanes.', full: 'Summon a Hound Pup (65 ATK) in an empty lane.' }],
  'inf-packhound': [{ label: 'Ally Falls', face: 'When an ally Beast is destroyed, summon a Hound Pup in one of your empty lanes. Once per round.', full: 'If it was a Beast, summon a Hound Pup (65 ATK) in an empty lane. Once per round.' }],
  'spl-call-the-pack': [{ face: 'Summon a Hound Pup in one of your empty lanes.', full: 'Summon a Hound Pup (65 ATK) in an empty lane. If there is no empty lane, nothing happens.' }, 'Draw 1 card.'],
  'inf-ash-jackal': [{ face: 'Before lanes fight, this gets +30 ATK this round per Beast next to this.', full: 'Give this Unit +30 ATK this round for each Beast ally next to this Unit.' }],
  'inf-cinder-jackal': [{ face: 'When this is destroyed, summon a Hound Pup in one of your empty lanes.', full: 'Summon a Hound Pup (65 ATK) in an empty lane.' }],
  'inf-runebreaker': [{ face: 'Before lanes fight, destroy the enemy Spell in this lane.', full: 'Destroy the enemy Spell in play in this lane.' }, { face: 'While you have another Mage Slayer, enemy Spells can’t affect this.', full: 'While you have another Mage Slayer, enemy Spells can’t affect this Unit.' }, { label: 'When the enemy casts a Spell', face: 'When the enemy casts their 2nd Spell in a round, deal 90 damage to the enemy player.', full: 'If it is their 2nd Spell this round, deal 90 damage to the enemy player.' }],
  'spl-war-cry': [{ face: 'Your Units get +15 ATK this round.', full: 'Give your Units +15 ATK this round.' }, { face: 'If you have 3 Units, they get +15 more.', full: 'If you have 3 Units, give them +15 more ATK this round.' }],
  'kng-marshal-aldric': [{ face: 'Before lanes fight, if you have 3 Units, your other Units get +15 ATK this round.', full: 'If you have 3 Units, give your other Units +15 ATK this round.' }, { face: 'When an ally is destroyed, this gets a Shield: it survives destruction once. Once per round.', full: 'Give this Unit a Shield. Once per round.' }],
  'kng-battle-captain': [{ face: 'Before lanes fight, allies next to this get +15 ATK this round.', full: 'Give allies next to this Unit +15 ATK this round.' }, { face: 'While you have another Knight, enemy Unit effects can’t affect this.', full: 'While you have another Knight, enemy Unit effects can’t affect this Unit.' }],
  'kng-oathkeeper': [{ label: 'Shield', keyword: true, face: 'Survives destruction once.', full: 'This Unit survives the first time it would be destroyed.' }, { label: 'Guard 1', keyword: true, face: 'If this would lose its lane and you have 3 Units, it gets +15 ATK this round.', full: 'If you have 3 Units and this Unit would lose its lane, give it +15 ATK this round.' }],
  'kng-knight-errant': [{ face: 'Before lanes fight, this gets +15 ATK this round per other Knight you have.', full: 'Give this Unit +15 ATK this round for each other Knight you have.' }],
  'spl-ward-circle': [{ face: 'Summon a Ward in up to 2 of your empty lanes.', full: 'Summon a Ward (70 ATK) in up to 2 of your empty lanes.' }],
  'kng-relic-warden': [{ face: 'Before lanes fight, exile the strongest Unit in the enemy Graveyard.', full: 'Exile the strongest Unit from the enemy Graveyard.' }],
  'kng-pikeman': [{ face: 'Before lanes fight, this gets +15 ATK this round per Knight next to this.', full: 'Give this Unit +15 ATK this round for each Knight next to this Unit.' }],
  'kng-spellbreaker': [{ face: 'When the enemy casts a Spell, this gets +30 ATK this round.', full: 'Give this Unit +30 ATK this round.' }],
  'kng-null-templar': [{ face: 'The first enemy Spell on this each round does nothing.', full: 'The first enemy Spell that would affect this Unit each round does nothing.' }],
  'und-morwen': [{ label: 'Guard 2', keyword: true, face: 'If this would lose its lane, it gets +30 ATK this round.', full: 'If this Unit would lose its lane, give it +30 ATK this round.' }, { face: 'Before lanes fight, allies next to this that would lose their lane get +15 ATK this round.', full: 'Allies next to this Unit that would lose their lane get +15 ATK this round.' }, { face: 'Before lanes fight, revive your weakest Undead into one of your empty lanes.', full: 'Revive your weakest Undead Unit from your Graveyard into an empty lane. If there is no empty lane, nothing happens.' }],
  'und-mira': [{ face: 'When this is destroyed, return your weakest other Undead to your hand.', full: 'Return your weakest other Undead Unit from your Graveyard to your hand.' }, { face: 'While your Graveyard has 3+ Undead, enemy Unit effects can’t affect this.', full: 'While your Graveyard has 3+ Undead cards, enemy Unit effects can’t affect this Unit.' }],
  'spl-grave-totem': [{ face: 'Before lanes fight, if the enemy cast or has a Spell, your Unit in this lane gets +30 ATK this round.', board: 'Before lanes fight, if the enemy cast or has a Spell, your Unit gets +30 ATK this round.', full: 'If the enemy cast a Spell this round or has a Spell in play, give your Unit in this lane +30 ATK this round.' }, { face: 'When your Unit in this lane is destroyed, return it to your hand. Once per battle.', board: 'When your Unit in this lane is destroyed, return it to hand. Once per battle.', full: 'If your destroyed Unit was in this lane, return that card to your hand. Once per battle.' }],
  'und-bonecaller': [{ face: 'When an ally Undead is destroyed, this gets +15 ATK until the battle ends, up to +45.', full: 'If it was Undead, give this Unit +15 ATK until the battle ends, up to +45.' }],
  'und-skeletal-legionnaire': [{ face: 'When this is destroyed, summon a Skeleton in one of your empty lanes.', full: 'Summon a Skeleton (65 ATK) in an empty lane.' }],
  'spl-bone-wall': [{ face: 'Your Unit in this lane survives destruction once.', full: 'Give your Unit in this lane a Shield.' }, { face: 'If your Graveyard has 3+ Units, it also gets +30 ATK this round.', full: 'If your Graveyard has 3+ Units, also give it +30 ATK this round.' }],
  'und-rattling-horde': [{ face: 'Before lanes fight, this gets +15 ATK this round per Undead you have, including this.', full: 'Give this Unit +15 ATK this round for each Undead Unit you have, including this one.' }],
  'inf-ignis': [{ face: 'At the end of each round, deal 45 damage to the enemy player per Spell you have in play.', full: 'Deal 45 damage to the enemy player for each Spell you have in play.' }, { face: 'When you cast a Spell, this gets +15 ATK this round.', full: 'Give this Unit +15 ATK this round.' }],
  'inf-hellfire-warlock': [{ face: 'When you cast your 2nd Spell in a round, deal 90 damage to the enemy player.', full: 'If it is your 2nd Spell this round, deal 90 damage to the enemy player.' }, { face: 'When this is destroyed, deal 45 damage to the enemy player.', full: 'Deal 45 damage to the enemy player.' }],
  'spl-inferno': ['Deal 45 damage to the enemy player.', { face: 'Each enemy Unit loses 15 ATK until the battle ends.', full: 'Give each enemy Unit −15 ATK until the battle ends.' }],
  'spl-burning-ground': [{ face: 'At the end of each round, enemy Unit in this lane loses 15 ATK until the battle ends.', full: 'Give the enemy Unit in this lane −15 ATK until the battle ends.' }],
  'inf-ember-witch': [{ face: 'When you cast a Spell, deal 45 damage to the enemy player. Once per round.', full: 'Deal 45 damage to the enemy player. Once per round.' }],
  'spl-siege-fire': [{ face: 'At the end of each round, if no enemy Unit is in this lane, deal 45 damage to the enemy player.', full: 'If the enemy has no Unit in this lane, deal 45 damage to the enemy player.' }],
  'inf-cinder-imp': [{ face: 'If this would lose its lane, deal 45 damage to the enemy player.', full: 'If this Unit would lose its lane, deal 45 damage to the enemy player.' }],
  'spl-wall-of-flame': [{ face: 'Enemy Unit in this lane loses 15 ATK.', full: 'The enemy Unit in this lane has −15 ATK.' }],
  'spl-arcane-bolt': ['Deal 135 damage to the enemy player.', { face: 'If you already cast a Spell this round, deal 90 more damage to the enemy player.', full: 'If you already cast a Spell this round, deal 90 more damage.' }],
  'inf-mirage-imp': [{ face: 'If you have a Spell in this lane, this attacks the enemy player directly, starting next round.', board: 'If you have a Spell in this lane, this attacks the enemy player directly.', full: 'Attacks the enemy player directly (Bypass) while you have a Spell in play in this lane. Starts the round after you play this Unit.' }],
  'kng-archmage-vael': [{ face: 'If your first Spell each round is one-time, it happens twice.', full: 'If the first Spell you cast each round is a one-time Spell, it happens twice.' }, { face: 'When you cast your 2nd Spell in a round, deal 90 damage to the enemy player.', full: 'If it is your 2nd Spell this round, deal 90 damage to the enemy player.' }, { face: 'At the end of each round, if your hand is empty, return a random Spell to your hand.', full: 'If your hand is empty, return a random Spell from your Graveyard to your hand.' }],
  'kng-moonlit-savant': [{ face: 'When you cast a Spell, this gets +15 ATK until the battle ends, up to +45.', full: 'Give this Unit +15 ATK until the battle ends, up to +45.' }],
  'spl-mirror-image': ['Return a random Spell from your Graveyard to your hand.', 'Draw 1 card.'],
  'kng-battlemage': [{ face: 'When you cast a Spell, enemy Unit in this lane loses 30 ATK this round.', full: 'Give the enemy Unit in this lane −30 ATK this round.' }],
  'spl-arcane-barrier': [{ face: 'Your Unit in this lane survives destruction once.', full: 'Give your Unit in this lane a Shield.' }, 'Draw 1 card.'],
  'kng-apprentice-mage': [{ face: 'When you cast a Spell, this gets +30 ATK this round.', full: 'Give this Unit +30 ATK this round.' }, { face: 'When this is destroyed, return a random Spell to your hand.', full: 'Return a random Spell from your Graveyard to your hand.' }],
  'spl-spark': ['Deal 45 damage to the enemy player.', 'Draw 1 card.'],
  'und-duchess-nyx': [{ face: 'If you have a Spell in play, this attacks the enemy player directly, starting next round.', board: 'If you have a Spell in play, this attacks the enemy player directly.', full: 'Attacks the enemy player directly (Bypass) while you have a Spell in play. Starts the round after you play this Unit.' }, { face: 'At the end of each round, if you have no Spell in play, return a random Spell to your hand.', full: 'If you have no Spell in play, return a random Spell from your Graveyard to your hand.' }, { face: 'When this attacks the enemy player directly, it gets +15 ATK until the battle ends, up to +45.', full: 'Give this Unit +15 ATK until the battle ends, up to +45.' }],
  'und-wraith-prince': [{ face: 'If you have a Spell in play, this attacks the enemy player directly with 15 less ATK, starting next round.', board: 'If you have a Spell in play, this attacks the enemy player directly with 15 less ATK.', full: 'Attacks the enemy player directly (Bypass) with 15 less ATK while you have a Spell in play. Starts the round after you play this Unit.' }, { face: 'When this attacks the enemy player directly, it gets +15 ATK until the battle ends, up to +45.', full: 'Give this Unit +15 ATK until the battle ends, up to +45.' }],
  'und-banshee': [{ face: 'If you have 2+ Spells in play, this attacks the enemy player directly, starting next round.', board: 'If you have 2+ Spells in play, this attacks the enemy player directly.', full: 'Attacks the enemy player directly (Bypass) while you have 2+ Spells in play. Starts the round after you play this Unit.' }, { face: 'When this attacks the enemy player directly, return a random Spell to your hand. Once per round.', full: 'Return a random Spell from your Graveyard to your hand.' }],
  'spl-cursed-ground': [{ face: 'Your Unit in this lane gets +15 ATK.', full: 'Your Unit in this lane has +15 ATK.' }, { face: 'When an enemy Unit is destroyed, your Unit in this lane gets +15 ATK until the battle ends, up to +45.', board: 'When an enemy Unit is destroyed, your Unit gets +15 ATK until the battle ends, up to +45.', full: 'Give your Unit in this lane +15 ATK until the battle ends, up to +45.' }],
  'und-spectral-assassin': [{ face: 'If you have a Spell in play, this attacks the enemy player directly with 30 less ATK, starting next round.', board: 'If you have a Spell in play, this attacks the enemy player directly with 30 less ATK.', full: 'Attacks the enemy player directly (Bypass) with 30 less ATK while you have a Spell in play. Starts the round after you play this Unit.' }],
  'und-shade-thief': [{ face: 'If you have a Spell in play, this attacks the enemy player directly, starting next round.', board: 'If you have a Spell in play, this attacks the enemy player directly.', full: 'Attacks the enemy player directly (Bypass) while you have a Spell in play. Starts the round after you play this Unit.' }],
  'spl-ghost-lantern': [{ face: 'Your Unit in this lane gets +15 ATK.', full: 'Your Unit in this lane has +15 ATK.' }],
  'und-grave-sage': [{ face: 'When this is destroyed, return a random Spell to your hand.', full: 'Return a random Spell from your Graveyard to your hand.' }, { face: 'When you cast your 2nd Spell in a round, allies next to this survive destruction once.', full: 'If it is your 2nd Spell this round, give allies next to this Unit a Shield.' }],
  'inf-kathra': [{ face: 'When an ally is destroyed, this gets +15 ATK until the battle ends, up to +45.', full: 'Give this Unit +15 ATK until the battle ends, up to +45.' }, { face: 'When one of your own cards destroys one of your Units, deal 45 damage to the enemy player.', full: 'If one of your own cards destroyed that Unit, deal 45 damage to the enemy player.' }, { face: 'When this is destroyed, deal 90 damage to the enemy player.', full: 'Deal 90 damage to the enemy player.' }],
  'inf-blood-demon': [{ face: 'When an ally is destroyed, this gets +15 ATK until the battle ends, up to +45.', full: 'Give this Unit +15 ATK until the battle ends, up to +45.' }, { face: 'Before lanes fight, if an ally was destroyed this round, this gets +30 ATK this round.', full: 'If one of your Units was destroyed this round, give this Unit +30 ATK this round.' }],
  'spl-flesh-altar': [{ face: 'When an ally is destroyed, your Unit in this lane gets +15 ATK until the battle ends, up to +45.', board: 'When an ally is destroyed, your Unit gets +15 ATK until the battle ends, up to +45.', full: 'Give your Unit in this lane +15 ATK until the battle ends, up to +45.' }],
  'spl-blood-pact': [{ face: 'Destroy your Unit in this lane, then the enemy Unit in this lane.', full: 'Destroy your Unit in this lane, then destroy the enemy Unit in this lane.' }],
  'inf-blood-imp': [{ face: 'When this is destroyed, your other Units get +15 ATK until the battle ends.', full: 'Give your other Units +15 ATK until the battle ends.' }],
  'inf-blood-thrall': [{ face: 'If this would lose its lane, deal 90 damage to the enemy player.', full: 'If this Unit would lose its lane, deal 90 damage to the enemy player.' }],
  'spl-dark-ritual': ['Destroy your Unit in this lane.', 'Draw 2 cards.'],
  'spl-soul-burn': [{ face: 'Exile the 2 strongest Units in the enemy Graveyard.', full: 'Exile the 2 strongest Units from the enemy Graveyard.' }, 'Deal 45 damage to the enemy player.'],
  'kng-saint-aveline': [{ face: 'When your Spell on a Unit leaves play with that Unit, return the Spell to your hand. Once per round.', full: 'When your Attached Spell leaves play with its Unit, return it to your hand. Once per round.' }, { face: 'When you cast a Spell, this gets +15 ATK this round.', full: 'Give this Unit +15 ATK this round.' }],
  'spl-fortify': [{ face: 'At the end of each round, the Unit with this Spell gets +15 ATK until the battle ends, up to +45.', full: 'Give the Unit with this Spell +15 ATK until the battle ends, up to +45.' }],
  'kng-crusader-champion': [{ face: 'While you have a Spell in this lane, this gets +30 ATK.', full: 'While you have a Spell in play in this lane, this Unit has +30 ATK.' }, { face: 'While you have a Spell in this lane, enemy Spells can’t affect this.', full: 'While you have a Spell in play in this lane, enemy Spells can’t affect this Unit.' }],
  'spl-oath-blade': [{ face: 'The Unit with this Spell gets +15 ATK.', full: 'The Unit with this Spell has +15 ATK.' }, { face: 'At the end of each round, restore 45 HP.', full: 'Restore 45 HP.' }],
  'kng-standard-bearer': [{ face: 'While you have a Spell in this lane, allies next to this get +15 ATK.', full: 'While you have a Spell in play in this lane, allies next to this Unit have +15 ATK.' }],
  'spl-consecrate': [{ face: 'Your Unit in this lane gets +15 ATK until the battle ends.', full: 'Give your Unit in this lane +15 ATK until the battle ends.' }],
  'kng-oath-acolyte': [{ face: 'At the end of each round, if you have a Spell in this lane, restore 45 HP.', full: 'If you have a Spell in play in this lane, restore 45 HP.' }],
  'spl-giants-bane': ['If the enemy has more Units than you, destroy the enemy Unit in this lane.'],
  'spl-death-wave': [{ face: 'Each enemy Unit loses 30 ATK this round.', full: 'Give each enemy Unit −30 ATK this round.' }],
  'und-plague-mother': [{ label: 'Shield', keyword: true, face: 'Survives destruction once.', full: 'This Unit survives the first time it would be destroyed.' }, { label: 'Guard 1', keyword: true, face: 'If this would lose its lane, it gets +15 ATK this round.', full: 'If this Unit would lose its lane, give it +15 ATK this round.' }, { face: 'At the end of each round, the enemy Unit in this lane loses 15 ATK until the battle ends. Each other enemy Unit that already lost ATK until the battle ends loses 15 more.', full: 'Give the enemy Unit in this lane −15 ATK until the battle ends. Give every other enemy Unit with lasting ATK loss −15 ATK more until the battle ends.' }],
  'und-blightcaster': [{ face: 'At the end of each round, enemy Unit in this lane loses 15 ATK until the battle ends.', full: 'Give the enemy Unit in this lane −15 ATK until the battle ends.' }, { face: 'When an enemy Unit is destroyed, restore 45 HP. Once per round.', full: 'Restore 45 HP. Once per round.' }],
  'und-withering-lich': [{ face: 'When an enemy Unit is destroyed, this gets +15 ATK until the battle ends, up to +45.', full: 'Give this Unit +15 ATK until the battle ends, up to +45.' }],
  'und-grave-knight': [{ label: 'Guard 2', keyword: true, face: 'If this would lose its lane, it gets +30 ATK this round.', full: 'If this Unit would lose its lane, give it +30 ATK this round.' }, { face: 'When an enemy Unit is destroyed, restore 45 HP. Once per round.', full: 'Restore 45 HP. Once per round.' }],
  'spl-stasis-field': [{ face: 'The Units in this lane don’t fight this round.', full: 'The enemy Unit in this lane can’t fight this round, so no Clash happens in this lane.' }, { face: 'Enemy Unit in this lane loses 15 ATK until the battle ends.', full: 'Give the enemy Unit in this lane −15 ATK until the battle ends.' }],
  'und-rot-ghoul': [{ face: 'When this is destroyed, enemy Unit in this lane loses 30 ATK until the battle ends.', full: 'Give the enemy Unit in this lane −30 ATK until the battle ends.' }],
  'spl-enfeeble': [{ face: 'Enemy Unit in this lane loses 30 ATK this round and 15 ATK until the battle ends.', full: 'Give the enemy Unit in this lane −30 ATK this round and −15 ATK until the battle ends.' }],
  'inf-flame-herald': [{ face: 'Before lanes fight, deal 45 damage to the enemy player.', full: 'Deal 45 damage to the enemy player.' }],
  'spl-meteor': ['Destroy the enemy Unit in this lane if it has 110 ATK or less.', 'Deal 90 damage to the enemy player.'],
  'kng-banner-knight': [{ face: 'At the end of each round, if you have a Spell in this lane, this gets +15 ATK until the battle ends, up to +45.', full: 'If you have a Spell in play in this lane, give this Unit +15 ATK until the battle ends, up to +45.' }],
  'spl-reliquary-blade': [{ face: 'The Unit with this Spell gets +30 ATK.', full: 'The Unit with this Spell has +30 ATK.' }],
  'und-bone-dragon': [{ face: 'Before lanes fight, this gets +15 ATK this round per Unit in your Graveyard, up to +45.', full: 'Give this Unit +15 ATK this round for each Unit in your Graveyard, up to +45.' }],
  'und-barrow-knight': [{ label: 'Guard 1', keyword: true, face: 'If this would lose its lane, it gets +15 ATK this round.', full: 'If this Unit would lose its lane, give it +15 ATK this round.' }, { face: 'When this is destroyed, summon a Skeleton in one of your empty lanes.', full: 'Summon a Skeleton (65 ATK) in an empty lane.' }, { face: 'Before lanes fight, if the enemy cast a Spell this round, this gets +30 ATK this round.', full: 'If the enemy cast a Spell this round, give this Unit +30 ATK this round.' }],
  'inf-pack-warden': [{ face: 'Before lanes fight, if you have an ally next to this, it gets +30 ATK this round.', full: 'If you have an ally next to this Unit, give this Unit +30 ATK this round.' }],
  'spl-oath-of-vengeance': [{ face: 'Your Unit in this lane gets +30 ATK this round.', full: 'Give your Unit in this lane +30 ATK this round.' }, { face: 'If an ally was destroyed this round, it gets +30 more.', full: 'If one of your Units was destroyed this round, give it +30 more ATK this round.' }],
  'kng-arcane-knight': [{ face: 'When you cast a Spell, allies next to this get +15 ATK this round. Once per round.', full: 'Give allies next to this Unit +15 ATK this round. Once per round.' }],
  'und-ashen-revenant': [{ face: 'When an ally is destroyed, this gets +15 ATK until the battle ends, up to +45.', full: 'Give this Unit +15 ATK until the battle ends, up to +45.' }, { face: 'When this is destroyed, return it to your hand. Only once.', full: 'Return this card to your hand once.' }],
  'und-night-courier': [{ face: 'If you have a Spell in play, this attacks the enemy player directly, starting next round.', board: 'If you have a Spell in play, this attacks the enemy player directly.', full: 'Attacks the enemy player directly (Bypass) while you have a Spell in play. Starts the round after you play this Unit.' }, { face: 'When this is destroyed, return a random Spell to your hand.', full: 'Return a random Spell from your Graveyard to your hand.' }],
  'und-grave-tyrant': [{ face: 'At the end of each round, exile the strongest Unit in the enemy Graveyard, and this gets +15 ATK until the battle ends, up to +45.', full: 'Exile the strongest Unit from the enemy Graveyard. Give this Unit +15 ATK until the battle ends, up to +45.' }],
  'spl-execute': ['Destroy the enemy Unit in this lane if it has 80 ATK or less.'],
  'spl-growth-totem': [{ face: 'At the end of each round, your Unit in this lane gets +15 ATK until the battle ends, up to +45.', full: 'Give your Unit in this lane +15 ATK until the battle ends, up to +45.' }],
  'wld-forest-wolf': [{ face: 'While no enemy Unit is in this lane, this gets +30 ATK.', full: 'While the enemy has no Unit in this lane, this Unit has +30 ATK.' }],
  'wld-ancient-treant': [{ face: 'At the end of each round, this gets +15 ATK until the battle ends, up to +45.', full: 'Give this Unit +15 ATK until the battle ends, up to +45.' }],
  'wld-titanroot': [{ face: 'At the end of each round, this gets +30 ATK until the battle ends, up to +45.', full: 'Give this Unit +30 ATK until the battle ends, up to +45.' }],
};

/** How many battle lines a card has (tests keep this equal to its effect count). */
export function battleCopyLineCount(id: string): number {
  return BATTLE_LINES[id]?.length ?? 0;
}
