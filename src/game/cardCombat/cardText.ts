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
 * string is a line that reads the same everywhere. `keyword` marks a keyword effect (Guard, Shield): the face prints its
 * plain meaning alone, without "label:" ("If losing, gets +30 ATK this round."), and the panels print the keyword as the
 * label with the full line.
 */
export type BattleCopy = string | { face: string; board?: string; full?: string; label?: string; faceLabel?: string; keyword?: boolean };

/**
 * THE card text of every card-combat card (docs/CARD-TEXT.md is the standard; the wording plan was
 * moonwater/card-text/WORDING-PLAN.md). Index-aligned with cardCombatEffectLines; a test keeps every card with an effect
 * listed here. Two registers:
 *  - CARD FACE (`face`, `board`): short battle text a player understands without Inspect, so the art keeps its room.
 *    Plain words, no bare keywords: "Gets +15 ATK this round.", "Enemy Unit in this lane loses 15 ATK for the battle.",
 *    "allies next to this", "The Unit with this Spell", "Survives destruction once.", "If losing, gets +30 ATK this
 *    round." (Guard), "attacks the player directly" (Bypass), "one of your empty lanes" (Summon). "for the battle" is
 *    the face's "for the rest of the battle", damage is to the enemy player, and "return a random Spell" is from your
 *    Graveyard to your hand.
 *  - FULL (`full`, focus panel and Card Inspect): one complete plain sentence. Every ATK change says "this round" or
 *    "for the rest of the battle", targets are "this Unit", "your Unit in this lane", "the enemy Unit in this lane",
 *    "allies next to this Unit", "the Unit with this Spell", and "Spell in play" is a Lane or Attached Spell on the
 *    battlefield.
 * Both registers keep: one label per effect (the timing, or a keyword), "up to +45" on repeating growth, "Once per
 * round", "Once per battle" and "once", and Graveyard counts in "Units" or "cards" exactly as the resolver counts them.
 * Legacy battles (old replays) read their own lines where the legacy rules differ (cardPresentation.ts LEGACY_LINES).
 */
export const BATTLE_LINES: Record<string, BattleCopy[]> = {
  'inf-cultist': [{ face: 'Gets +15 ATK this round.', full: 'Give this Unit +15 ATK this round.' }],
  'inf-pit-fiend': [{ face: 'Deal 90 damage.', full: 'Deal 90 damage to the enemy player.' }, { face: 'If an enemy was destroyed this round, gets +30 ATK this round.', full: 'If an enemy Unit was destroyed this round, give this Unit +30 ATK this round.' }],
  'inf-soot-imp': [{ face: 'Deal 45 damage.', full: 'Deal 45 damage to the enemy player.' }],
  'spl-weakness': [{ face: 'Enemy Unit in this lane loses 45 ATK this round.', full: 'Give the enemy Unit in this lane −45 ATK this round.' }],
  'inf-flame-imp': [{ face: 'Deal 45 extra damage.', full: 'Deal 45 extra damage to the enemy player.' }],
  'inf-infernal-lord': [{ face: 'Deal 45 damage.', full: 'Deal 45 damage to the enemy player.' }, { face: 'Each enemy Unit loses 30 ATK for the battle.', full: 'Give each enemy Unit −30 ATK for the rest of the battle.' }],
  'spl-fireball': [{ face: 'Enemy Unit in this lane loses 60 ATK for the battle.', full: 'Give the enemy Unit in this lane −60 ATK for the rest of the battle.' }, { face: 'If the enemy has a Spell in this lane, that Unit has 50 ATK instead.', full: 'If the enemy has a Spell in play in this lane, that Unit has 50 ATK instead.' }],
  'spl-cinder-bolt': [{ face: 'Deal 90 damage.', full: 'Deal 90 damage to the enemy player.' }],
  'inf-hellhound': [{ face: 'Enemy Unit in this lane loses 30 ATK this round.', full: 'Give the enemy Unit in this lane −30 ATK this round.' }],
  'kng-archer': [{ face: 'Gets +15 ATK this round.', full: 'Give this Unit +15 ATK this round.' }, { face: 'Gets +15 more if you have a Spell in this lane.', full: 'If you have a Spell in play in this lane, give this Unit +15 more ATK this round.' }],
  'spl-battle-banner': [{ face: 'The Unit with this Spell gets +15 ATK.', full: 'The Unit with this Spell has +15 ATK.' }],
  'spl-power-surge': [{ face: 'Your Unit in this lane gets +45 ATK this round.', full: 'Give your Unit in this lane +45 ATK this round.' }],
  'spl-aegis-ward': [{ face: 'Prevent the next damage to you this round.', full: 'Prevent the next damage your player would take this round, including Clash Damage.' }, { face: 'Your Unit in this lane survives destruction once.', full: 'Give your Unit in this lane a Shield.' }],
  'spl-dispel': [{ face: 'Destroy the enemy Spell in this lane.', full: 'Destroy the enemy Spell in play in this lane.' }, 'If you do, draw 1 card.'],
  'kng-shieldbearer': [{ label: 'Guard 2', keyword: true, face: 'If losing, gets +30 ATK this round.', full: 'If this Unit would lose its lane, give it +30 ATK this round.' }],
  'kng-royal-guard': [{ face: 'Allies next to this get +15 ATK.', full: 'Allies next to this Unit have +15 ATK.' }],
  'kng-light-priest': [{ label: 'Shield', keyword: true, face: 'Survives destruction once.', full: 'The first time this Unit would be destroyed, it survives instead.' }, 'Restore 45 HP.', { face: 'Gets +15 ATK this round.', full: 'Give this Unit +15 ATK this round.' }],
  'kng-paladin': [{ label: 'Shield', keyword: true, face: 'Survives destruction once.', full: 'The first time this Unit would be destroyed, it survives instead.' }, { face: 'Allies next to this that are losing get +15 ATK this round.', full: 'Allies next to this Unit that would lose their lane get +15 ATK this round.' }, { face: 'If it was in this lane, restore 45 HP. Once per round.', full: 'If the destroyed enemy Unit was in this lane, restore 45 HP. Once per round.' }],
  'und-bone-soldier': [{ face: 'Return to your deck once.', full: 'Return this card to your deck once.' }, { face: 'Gets +15 ATK this round per Unit in your Graveyard, up to +45.', full: 'Give this Unit +15 ATK this round for each Unit in your Graveyard, up to +45.' }],
  'und-cursed-warrior': [{ face: 'Return to your hand once.', full: 'Return this card to your hand once.' }],
  'und-crypt-warden': [{ label: 'Guard 1', keyword: true, face: 'If losing, gets +15 ATK this round.', full: 'If this Unit would lose its lane, give it +15 ATK this round.' }, { label: 'Shield', keyword: true, face: 'With 2+ cards in your Graveyard, survives destruction once.', full: 'While your Graveyard has 2+ cards, the first time this Unit would be destroyed, it survives instead.' }],
  'und-dark-priest': [{ label: 'Guard 2', keyword: true, face: 'If losing, gets +30 ATK this round.', full: 'If this Unit would lose its lane, give it +30 ATK this round.' }, { face: 'With 3+ cards in your Graveyard, gets +15 ATK this round.', full: 'If your Graveyard has 3+ cards, give this Unit +15 ATK this round.' }],
  'und-grave-sexton': ['If your Graveyard has 3+ Units, restore 45 HP.'],
  'und-vharos': [{ face: 'Revive in this lane with 95 ATK once.', full: 'Revive this card in this lane with 95 ATK once.' }, { face: 'Return your strongest other Undead to hand.', full: 'Return your strongest other Undead Unit from your Graveyard to your hand.' }],
  'spl-second-chance': [{ face: 'Return your strongest Graveyard Unit to hand.', full: 'Return the strongest Unit in your Graveyard to your hand.' }],
  'spl-raise-fallen': [{ face: 'If your Graveyard has 2+ Undead, revive the weakest into this lane.', full: 'If your Graveyard has 2+ Undead cards, revive your weakest Undead Unit into this lane. If this lane is not empty, nothing happens.' }],
  'spl-hush': ['Silence the enemy Unit in this lane this round.'],
  'inf-cerberus': [{ face: 'With 3 Units, each enemy Unit loses 15 ATK this round.', full: 'If you have 3 Units, give each enemy Unit −15 ATK this round.' }, { face: 'Summon a Hound Pup in one of your empty lanes.', full: 'Summon a Hound Pup (65 ATK) in an empty lane.' }],
  'inf-alpha-hound': [{ face: 'Gets +15 ATK this round per other Unit you have.', full: 'Give this Unit +15 ATK this round for each other Unit you have.' }],
  'inf-brimstone-matriarch': [{ face: 'With 3 Units, gets +15 ATK this round.', full: 'If you have 3 Units, give this Unit +15 ATK this round.' }, { face: 'Summon a Hound Pup in one of your empty lanes.', full: 'Summon a Hound Pup (65 ATK) in an empty lane.' }],
  'inf-packhound': [{ label: 'Ally Falls', face: 'If a Beast, summon a Hound Pup in one of your empty lanes. Once per round.', full: 'If it was a Beast, summon a Hound Pup (65 ATK) in an empty lane. Once per round.' }],
  'spl-call-the-pack': [{ face: 'Summon a Hound Pup in one of your empty lanes.', full: 'Summon a Hound Pup (65 ATK) in an empty lane. If there is no empty lane, nothing happens.' }, 'Draw 1 card.'],
  'inf-ash-jackal': [{ face: 'Gets +30 ATK this round per Beast next to this.', full: 'Give this Unit +30 ATK this round for each Beast ally next to this Unit.' }],
  'inf-cinder-jackal': [{ face: 'Summon a Hound Pup in one of your empty lanes.', full: 'Summon a Hound Pup (65 ATK) in an empty lane.' }],
  'inf-runebreaker': [{ face: 'Destroy the enemy Spell in this lane.', full: 'Destroy the enemy Spell in play in this lane.' }, { face: 'With another Mage Slayer, enemy Spells can’t affect this.', full: 'While you have another Mage Slayer, enemy Spells can’t affect this Unit.' }, { label: 'When the enemy casts a Spell', faceLabel: 'Enemy’s 2nd Spell', face: 'Deal 90 damage.', full: 'If it is their 2nd Spell this round, deal 90 damage to the enemy player.' }],
  'spl-war-cry': [{ face: 'Your Units get +15 ATK this round.', full: 'Give your Units +15 ATK this round.' }, { face: 'With 3 Units, they get +15 more.', full: 'If you have 3 Units, give them +15 more ATK this round.' }],
  'kng-marshal-aldric': [{ face: 'With 3 Units, your other Units get +15 ATK this round.', full: 'If you have 3 Units, give your other Units +15 ATK this round.' }, { face: 'Gets a Shield: survives destruction once. Once per round.', full: 'Give this Unit a Shield. Once per round.' }],
  'kng-battle-captain': [{ face: 'Allies next to this get +15 ATK this round.', full: 'Give allies next to this Unit +15 ATK this round.' }, { face: 'With another Knight, enemy Unit effects can’t affect this.', full: 'While you have another Knight, enemy Unit effects can’t affect this Unit.' }],
  'kng-oathkeeper': [{ label: 'Shield', keyword: true, face: 'Survives destruction once.', full: 'The first time this Unit would be destroyed, it survives instead.' }, { label: 'Guard 1', keyword: true, face: 'If losing and you have 3 Units, gets +15 ATK this round.', full: 'If you have 3 Units and this Unit would lose its lane, give it +15 ATK this round.' }],
  'kng-knight-errant': [{ face: 'Gets +15 ATK this round per other Knight.', full: 'Give this Unit +15 ATK this round for each other Knight you have.' }],
  'spl-ward-circle': [{ face: 'Summon a Ward in up to 2 of your empty lanes.', full: 'Summon a Ward (70 ATK) in up to 2 of your empty lanes.' }],
  'kng-relic-warden': [{ face: 'Exile the strongest enemy Graveyard Unit.', full: 'Exile the strongest Unit from the enemy Graveyard.' }],
  'kng-pikeman': [{ face: 'Gets +15 ATK this round per Knight next to this.', full: 'Give this Unit +15 ATK this round for each Knight next to this Unit.' }],
  'kng-spellbreaker': [{ face: 'Gets +30 ATK this round.', full: 'Give this Unit +30 ATK this round.' }],
  'kng-null-templar': [{ face: 'Ignores the first enemy Spell on it each round.', full: 'The first enemy Spell that would affect this Unit each round does nothing.' }],
  'und-morwen': [{ label: 'Guard 2', keyword: true, face: 'If losing, gets +30 ATK this round.', full: 'If this Unit would lose its lane, give it +30 ATK this round.' }, { face: 'Allies next to this that are losing get +15 ATK this round.', full: 'Allies next to this Unit that would lose their lane get +15 ATK this round.' }, { face: 'Revive your weakest Undead into one of your empty lanes.', full: 'Revive your weakest Undead Unit from your Graveyard into an empty lane. If there is no empty lane, nothing happens.' }],
  'und-mira': [{ face: 'Return your weakest other Undead to hand.', full: 'Return your weakest other Undead Unit from your Graveyard to your hand.' }, { face: 'With 3+ Undead in your Graveyard, enemy Unit effects can’t affect this.', full: 'While your Graveyard has 3+ Undead cards, enemy Unit effects can’t affect this Unit.' }],
  'spl-grave-totem': [{ face: 'If enemy cast or has a Spell, your Unit in this lane gets +30 ATK this round.', board: 'If enemy cast or has a Spell, your Unit gets +30 ATK this round.', full: 'If the enemy cast a Spell this round or has a Spell in play, give your Unit in this lane +30 ATK this round.' }, { face: 'If it was in this lane, return it to hand. Once per battle.', board: 'If it was in this lane, return it to hand once.', full: 'If your destroyed Unit was in this lane, return that card to your hand. Once per battle.' }],
  'und-bonecaller': [{ face: 'If Undead, gets +15 ATK for the battle, up to +45.', full: 'If it was Undead, give this Unit +15 ATK for the rest of the battle, up to +45.' }],
  'und-skeletal-legionnaire': [{ face: 'Summon a Skeleton in one of your empty lanes.', full: 'Summon a Skeleton (65 ATK) in an empty lane.' }],
  'spl-bone-wall': [{ face: 'Your Unit in this lane survives destruction once.', full: 'Give your Unit in this lane a Shield.' }, { face: 'With 3+ Units in your Graveyard, it gets +30 ATK this round.', full: 'If your Graveyard has 3+ Units, also give it +30 ATK this round.' }],
  'und-rattling-horde': [{ face: 'Gets +15 ATK this round per Undead you have, including this.', full: 'Give this Unit +15 ATK this round for each Undead Unit you have, including this one.' }],
  'inf-ignis': [{ face: 'Deal 45 damage per Spell you have in play.', full: 'Deal 45 damage to the enemy player for each Spell you have in play.' }, { face: 'Gets +15 ATK this round.', full: 'Give this Unit +15 ATK this round.' }],
  'inf-hellfire-warlock': [{ faceLabel: '2nd Spell', face: 'Deal 90 damage.', full: 'If it is your 2nd Spell this round, deal 90 damage to the enemy player.' }, { face: 'Deal 45 damage.', full: 'Deal 45 damage to the enemy player.' }],
  'spl-inferno': [{ face: 'Deal 45 damage.', full: 'Deal 45 damage to the enemy player.' }, { face: 'Each enemy Unit loses 15 ATK for the battle.', full: 'Give each enemy Unit −15 ATK for the rest of the battle.' }],
  'spl-burning-ground': [{ face: 'Enemy Unit in this lane loses 15 ATK for the battle.', full: 'Give the enemy Unit in this lane −15 ATK for the rest of the battle.' }],
  'inf-ember-witch': [{ face: 'Deal 45 damage. Once per round.', full: 'Deal 45 damage to the enemy player. Once per round.' }],
  'spl-siege-fire': [{ face: 'If no enemy Unit is in this lane, deal 45 damage.', full: 'If the enemy has no Unit in this lane, deal 45 damage to the enemy player.' }],
  'inf-cinder-imp': [{ face: 'If losing, deal 45 damage.', full: 'If this Unit would lose its lane, deal 45 damage to the enemy player.' }],
  'spl-wall-of-flame': [{ face: 'Enemy Unit in this lane loses 15 ATK.', full: 'The enemy Unit in this lane has −15 ATK.' }],
  'spl-arcane-bolt': [{ face: 'Deal 135 damage.', full: 'Deal 135 damage to the enemy player.' }, { face: 'Deal 90 more if you already cast a Spell this round.', full: 'If you already cast a Spell this round, deal 90 more damage.' }],
  'inf-mirage-imp': [{ face: 'With a Spell in this lane, attacks the player directly, starting next round.', board: 'With a Spell in this lane, attacks the player directly.', full: 'Attacks the enemy player directly (Bypass) while you have a Spell in play in this lane. Starts the round after you play this Unit.' }],
  'kng-archmage-vael': [{ face: 'If your first Spell is one-time, repeat it.', full: 'If the first Spell you cast each round is a one-time Spell, it happens twice.' }, { faceLabel: '2nd Spell', face: 'Deal 90 damage.', full: 'If it is your 2nd Spell this round, deal 90 damage to the enemy player.' }, { face: 'If your hand is empty, return a random Spell.', full: 'If your hand is empty, return a random Spell from your Graveyard to your hand.' }],
  'kng-moonlit-savant': [{ face: 'Gets +15 ATK for the battle, up to +45.', full: 'Give this Unit +15 ATK for the rest of the battle, up to +45.' }],
  'spl-mirror-image': [{ face: 'Return a random Spell.', full: 'Return a random Spell from your Graveyard to your hand.' }, 'Draw 1 card.'],
  'kng-battlemage': [{ face: 'Enemy Unit in this lane loses 30 ATK this round.', full: 'Give the enemy Unit in this lane −30 ATK this round.' }],
  'spl-arcane-barrier': [{ face: 'Your Unit in this lane survives destruction once.', full: 'Give your Unit in this lane a Shield.' }, 'Draw 1 card.'],
  'kng-apprentice-mage': [{ face: 'Gets +30 ATK this round.', full: 'Give this Unit +30 ATK this round.' }, { face: 'Return a random Spell.', full: 'Return a random Spell from your Graveyard to your hand.' }],
  'spl-spark': [{ face: 'Deal 45 damage.', full: 'Deal 45 damage to the enemy player.' }, 'Draw 1 card.'],
  'und-duchess-nyx': [{ face: 'With a Spell in play, attacks the player directly, starting next round.', board: 'With a Spell in play, attacks the player directly.', full: 'Attacks the enemy player directly (Bypass) while you have a Spell in play. Starts the round after you play this Unit.' }, { face: 'With no Spell in play, return a random Spell.', full: 'If you have no Spell in play, return a random Spell from your Graveyard to your hand.' }, { face: 'Gets +15 ATK for the battle, up to +45.', full: 'Give this Unit +15 ATK for the rest of the battle, up to +45.' }],
  'und-wraith-prince': [{ face: 'With a Spell in play, attacks the player directly with 15 less ATK, starting next round.', board: 'With a Spell in play, attacks the player directly with 15 less ATK.', full: 'Attacks the enemy player directly (Bypass) with 15 less ATK while you have a Spell in play. Starts the round after you play this Unit.' }, { face: 'Gets +15 ATK for the battle, up to +45.', full: 'Give this Unit +15 ATK for the rest of the battle, up to +45.' }],
  'und-banshee': [{ face: 'With 2+ Spells in play, attacks the player directly, starting next round.', board: 'With 2+ Spells in play, attacks the player directly.', full: 'Attacks the enemy player directly (Bypass) while you have 2+ Spells in play. Starts the round after you play this Unit.' }, { face: 'Return a random Spell.', full: 'Return a random Spell from your Graveyard to your hand.' }],
  'spl-cursed-ground': [{ face: 'Your Unit in this lane gets +15 ATK.', board: 'Your Unit gets +15 ATK.', full: 'Your Unit in this lane has +15 ATK.' }, { face: 'Your Unit in this lane gets +15 ATK for the battle, up to +45.', board: 'Your Unit gets +15 ATK for the battle, up to +45.', full: 'Give your Unit in this lane +15 ATK for the rest of the battle, up to +45.' }],
  'und-spectral-assassin': [{ face: 'With a Spell in play, attacks the player directly with 30 less ATK, starting next round.', board: 'With a Spell in play, attacks the player directly with 30 less ATK.', full: 'Attacks the enemy player directly (Bypass) with 30 less ATK while you have a Spell in play. Starts the round after you play this Unit.' }],
  'und-shade-thief': [{ face: 'With a Spell in play, attacks the player directly, starting next round.', board: 'With a Spell in play, attacks the player directly.', full: 'Attacks the enemy player directly (Bypass) while you have a Spell in play. Starts the round after you play this Unit.' }],
  'spl-ghost-lantern': [{ face: 'Your Unit in this lane gets +15 ATK.', full: 'Your Unit in this lane has +15 ATK.' }],
  'und-grave-sage': [{ face: 'Return a random Spell.', full: 'Return a random Spell from your Graveyard to your hand.' }, { faceLabel: '2nd Spell', face: 'Allies next to this survive destruction once.', full: 'If it is your 2nd Spell this round, give allies next to this Unit a Shield.' }],
  'inf-kathra': [{ face: 'Deal 45 damage. Gets +15 ATK for the battle, up to +45.', full: 'Deal 45 damage to the enemy player. Give this Unit +15 ATK for the rest of the battle, up to +45.' }, { face: 'Deal 90 damage.', full: 'Deal 90 damage to the enemy player.' }],
  'inf-blood-demon': [{ face: 'Gets +15 ATK for the battle, up to +45.', full: 'Give this Unit +15 ATK for the rest of the battle, up to +45.' }, { face: 'If an ally was destroyed this round, gets +30 ATK this round.', full: 'If one of your Units was destroyed this round, give this Unit +30 ATK this round.' }],
  'spl-flesh-altar': [{ face: 'Your Unit in this lane gets +15 ATK for the battle, up to +45.', full: 'Give your Unit in this lane +15 ATK for the rest of the battle, up to +45.' }],
  'spl-blood-pact': [{ face: 'Destroy your Unit in this lane, then the enemy Unit in this lane.', full: 'Destroy your Unit in this lane, then destroy the enemy Unit in this lane.' }],
  'inf-blood-imp': [{ face: 'Your other Units get +15 ATK for the battle.', full: 'Give your other Units +15 ATK for the rest of the battle.' }],
  'inf-blood-thrall': [{ face: 'If losing, deal 90 damage.', full: 'If this Unit would lose its lane, deal 90 damage to the enemy player.' }],
  'spl-dark-ritual': ['Destroy your Unit in this lane.', 'Draw 2 cards.'],
  'spl-soul-burn': [{ face: 'Exile the 2 strongest enemy Graveyard Units.', full: 'Exile the 2 strongest Units from the enemy Graveyard.' }, { face: 'Deal 45 damage.', full: 'Deal 45 damage to the enemy player.' }],
  'kng-saint-aveline': [{ face: 'When your Spell on a Unit leaves with that Unit, return it to hand. Once per round.', full: 'When your Attached Spell leaves play with its Unit, return it to your hand. Once per round.' }, { face: 'Gets +15 ATK this round.', full: 'Give this Unit +15 ATK this round.' }],
  'spl-fortify': [{ face: 'The Unit with this Spell gets +15 ATK for the battle, up to +45.', full: 'Give the Unit with this Spell +15 ATK for the rest of the battle, up to +45.' }],
  'kng-crusader-champion': [{ face: 'With your Spell in this lane, gets +30 ATK.', full: 'While you have a Spell in play in this lane, this Unit has +30 ATK.' }, { face: 'With your Spell in this lane, enemy Spells can’t affect this.', full: 'While you have a Spell in play in this lane, enemy Spells can’t affect this Unit.' }],
  'spl-oath-blade': [{ face: 'The Unit with this Spell gets +15 ATK.', full: 'The Unit with this Spell has +15 ATK.' }, 'Restore 45 HP.'],
  'kng-standard-bearer': [{ face: 'With your Spell in this lane, allies next to this get +15 ATK.', full: 'While you have a Spell in play in this lane, allies next to this Unit have +15 ATK.' }],
  'spl-consecrate': [{ face: 'Your Unit in this lane gets +15 ATK for the battle.', full: 'Give your Unit in this lane +15 ATK for the rest of the battle.' }],
  'kng-oath-acolyte': [{ face: 'If you have a Spell in this lane, restore 45 HP.', full: 'If you have a Spell in play in this lane, restore 45 HP.' }],
  'spl-giants-bane': [{ face: 'If the enemy has more Units, destroy the enemy Unit in this lane.', full: 'If the enemy has more Units than you, destroy the enemy Unit in this lane.' }],
  'spl-death-wave': [{ face: 'Each enemy Unit loses 30 ATK this round.', full: 'Give each enemy Unit −30 ATK this round.' }],
  'und-plague-mother': [{ label: 'Shield', keyword: true, face: 'Survives destruction once.', full: 'The first time this Unit would be destroyed, it survives instead.' }, { label: 'Guard 1', keyword: true, face: 'If losing, gets +15 ATK this round.', full: 'If this Unit would lose its lane, give it +15 ATK this round.' }, { face: 'Each enemy Unit loses 15 ATK for the battle.', full: 'Give each enemy Unit −15 ATK for the rest of the battle.' }],
  'und-blightcaster': [{ face: 'Enemy Unit in this lane loses 15 ATK for the battle.', full: 'Give the enemy Unit in this lane −15 ATK for the rest of the battle.' }, 'Restore 45 HP. Once per round.'],
  'und-withering-lich': [{ face: 'Gets +15 ATK for the battle, up to +45.', full: 'Give this Unit +15 ATK for the rest of the battle, up to +45.' }],
  'und-grave-knight': [{ label: 'Guard 2', keyword: true, face: 'If losing, gets +30 ATK this round.', full: 'If this Unit would lose its lane, give it +30 ATK this round.' }, 'Restore 45 HP. Once per round.'],
  'spl-stasis-field': [{ face: 'No Clash in this lane this round.', full: 'The enemy Unit in this lane can’t fight this round, so no Clash happens in this lane.' }, { face: 'Enemy Unit in this lane loses 15 ATK for the battle.', full: 'Give the enemy Unit in this lane −15 ATK for the rest of the battle.' }],
  'und-rot-ghoul': [{ face: 'Enemy Unit in this lane loses 30 ATK for the battle.', full: 'Give the enemy Unit in this lane −30 ATK for the rest of the battle.' }],
  'spl-enfeeble': [{ face: 'Enemy Unit in this lane loses 30 ATK this round and 15 ATK for the battle.', full: 'Give the enemy Unit in this lane −30 ATK this round and −15 ATK for the rest of the battle.' }],
  'inf-flame-herald': [{ face: 'Deal 45 damage.', full: 'Deal 45 damage to the enemy player.' }],
  'spl-meteor': ['Destroy the enemy Unit in this lane if it has 110 ATK or less.', { face: 'Deal 90 damage.', full: 'Deal 90 damage to the enemy player.' }],
  'kng-banner-knight': [{ face: 'With your Spell in this lane, gets +15 ATK for the battle, up to +45.', full: 'If you have a Spell in play in this lane, give this Unit +15 ATK for the rest of the battle, up to +45.' }],
  'spl-reliquary-blade': [{ face: 'The Unit with this Spell gets +30 ATK.', full: 'The Unit with this Spell has +30 ATK.' }],
  'und-bone-dragon': [{ face: 'Gets +15 ATK this round per Unit in your Graveyard, up to +45.', full: 'Give this Unit +15 ATK this round for each Unit in your Graveyard, up to +45.' }],
  'und-barrow-knight': [{ label: 'Guard 1', keyword: true, face: 'If losing, gets +15 ATK this round.', full: 'If this Unit would lose its lane, give it +15 ATK this round.' }, { face: 'Summon a Skeleton in one of your empty lanes.', full: 'Summon a Skeleton (65 ATK) in an empty lane.' }, { face: 'If the enemy cast a Spell this round, gets +30 ATK this round.', full: 'If the enemy cast a Spell this round, give this Unit +30 ATK this round.' }],
  'inf-pack-warden': [{ face: 'With an ally next to this, gets +30 ATK this round.', full: 'If you have an ally next to this Unit, give this Unit +30 ATK this round.' }],
  'spl-oath-of-vengeance': [{ face: 'Your Unit in this lane gets +30 ATK this round.', board: 'Your Unit gets +30 ATK this round.', full: 'Give your Unit in this lane +30 ATK this round.' }, { face: 'If an ally was destroyed this round, it gets +30 more.', full: 'If one of your Units was destroyed this round, give it +30 more ATK this round.' }],
  'kng-arcane-knight': [{ face: 'Allies next to this get +15 ATK this round. Once per round.', full: 'Give allies next to this Unit +15 ATK this round. Once per round.' }],
  'und-ashen-revenant': [{ face: 'Gets +15 ATK for the battle, up to +45.', full: 'Give this Unit +15 ATK for the rest of the battle, up to +45.' }, { face: 'Return to your hand once.', full: 'Return this card to your hand once.' }],
  'und-night-courier': [{ face: 'With a Spell in play, attacks the player directly, starting next round.', board: 'With a Spell in play, attacks the player directly.', full: 'Attacks the enemy player directly (Bypass) while you have a Spell in play. Starts the round after you play this Unit.' }, { face: 'Return a random Spell.', full: 'Return a random Spell from your Graveyard to your hand.' }],
  'und-grave-tyrant': [{ face: 'Exile the strongest enemy Graveyard Unit. Gets +15 ATK for the battle, up to +45.', full: 'Exile the strongest Unit from the enemy Graveyard. Give this Unit +15 ATK for the rest of the battle, up to +45.' }],
  'spl-execute': ['Destroy the enemy Unit in this lane if it has 80 ATK or less.'],
  'spl-growth-totem': [{ face: 'Your Unit in this lane gets +15 ATK for the battle, up to +45.', full: 'Give your Unit in this lane +15 ATK for the rest of the battle, up to +45.' }],
  'wld-forest-wolf': [{ face: 'Gets +30 ATK while no enemy Unit is in this lane.', full: 'While the enemy has no Unit in this lane, this Unit has +30 ATK.' }],
  'wld-ancient-treant': [{ face: 'Gets +15 ATK for the battle, up to +45.', full: 'Give this Unit +15 ATK for the rest of the battle, up to +45.' }],
  'wld-titanroot': [{ face: 'Gets +30 ATK for the battle, up to +45.', full: 'Give this Unit +30 ATK for the rest of the battle, up to +45.' }],
};

/** How many battle lines a card has (tests keep this equal to its effect count). */
export function battleCopyLineCount(id: string): number {
  return BATTLE_LINES[id]?.length ?? 0;
}
