import type { CardDefinition, Trigger } from '../types/index.js';
import { EFFECT_TIMING_LABEL, cardEffectLines, cardEffectSummary, hasEffectCopy, type CardEffectLine } from '../cards/effectText.js';
import { getCard } from '../cards/index.js';
import { getCombatCard, hasCombatOverride } from './cards.js';
import { HP_PER_LEGACY_POINT, atkFromPower } from './stats.js';

// Player-facing effect copy for card combat: what Card Inspect, hand cards and board chits say while a card
// plays under the ATK + HP Contribution model.
//
//  - Cards the approved balance pass changed (cards.ts) read their own card-combat ability text.
//  - Cards that deal or restore Player HP print the converted amount (1 legacy point = 45 HP).
//  - Every other card reads the live copy (effectText.ts), which already speaks in ATK.

const hp = (legacyPoints: number) => legacyPoints * HP_PER_LEGACY_POINT;

/** Card-combat lines for unchanged cards whose live copy speaks in legacy HP points. Index-aligned with the card's abilities. */
const HP_LINES: Record<string, { summary: string; lines: string[] }> = {
  'inf-flame-imp': { summary: `Direct hits deal +${hp(1)}`, lines: [`Deal ${hp(1)} extra damage to the enemy player.`] },
  'inf-pit-fiend': { summary: `${hp(2)} damage when destroyed`, lines: [`Deal ${hp(2)} damage to the enemy player.`, 'If an enemy Unit was destroyed this round, gain +30 ATK this round.'] },
  'inf-runebreaker': {
    summary: 'Destroy the enemy Spell here',
    lines: ['Destroy the enemy Continuous Spell in this lane.', 'While another Mage Slayer is in play, enemy Spells can’t affect this Unit.', `The second time the enemy casts a Spell in a round, deal ${hp(2)} damage to the enemy player.`],
  },
  'inf-alpha-hound': { summary: '+15 ATK per ally', lines: ['Gain +15 ATK this round for each allied Unit, including this one.', `If you control 3 Units, deal ${hp(2)} damage to the enemy player.`] },
  'kng-light-priest': { summary: `Heal ${hp(3)} · Shield`, lines: [`Restore ${hp(3)} HP to your player.`, 'This Unit gains a Shield.', 'Gain +15 ATK this round.'] },
  'spl-siege-fire': { summary: `${hp(1)} damage if the lane is open`, lines: [`If the enemy has no Unit in this lane, deal ${hp(1)} damage to the enemy player.`] },
  'spl-arcane-bolt': { summary: `${hp(3)} damage · ${hp(5)} after a Spell`, lines: [`Deal ${hp(3)} damage to the enemy player.`, `If you already cast a Spell this round, deal ${hp(2)} more.`] },
  'spl-execute': { summary: `Destroy an enemy with ${atkFromPower(3)} ATK or less`, lines: [`Destroy the enemy Unit in this lane if it has ${atkFromPower(3)} ATK or less.`] },
};

/** Short face copy for the cards the balance pass changed. */
const OVERRIDE_SUMMARY: Record<string, string> = {
  'und-dark-priest': 'Guard 2 · +30 ATK with 3+ in Graveyard',
  'und-grave-knight': `Guard 2 · Heal ${hp(2)} when an enemy falls`,
  'spl-stasis-field': 'Enemy here deals no damage',
  'spl-aegis-ward': 'Prevent your next damage · Shield',
  'und-grave-sage': 'Return a Spell · Shield allies',
  'kng-apprentice-mage': '+30 ATK when you cast a Spell',
  'kng-archmage-vael': 'First Spell each round casts twice',
  'kng-battle-captain': 'Adjacent allies +15 ATK each clash',
  'und-bone-soldier': '+15 ATK per Graveyard card (max +60)',
  'inf-blood-demon': '+15 ATK whenever an ally falls',
  'kng-paladin': `Shield · Guard 3 · Heal ${hp(1)}`,
  'und-crypt-warden': 'Guard 2 · Shield with 2+ in Graveyard',
  'spl-battle-banner': 'Your Unit here +15 ATK',
  'spl-war-cry': 'All allies +15 ATK this round',
};

/** Effect lines Card Inspect shows for a card played under card combat. */
export function cardCombatEffectLines(cardOrId: CardDefinition | string): CardEffectLine[] {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId.id;
  const card = getCard(id);
  if (hasCombatOverride(id)) {
    // Lines the balance pass kept unchanged are the live ability objects: they read the live curated copy.
    const liveLines = cardEffectLines(card);
    return getCombatCard(id)
      .abilities.filter((ability) => ability.text !== '')
      .map((ability) => {
        const liveIndex = card.abilities.indexOf(ability as (typeof card.abilities)[number]);
        return { trigger: ability.trigger, label: BATTLE_TIMING_LABEL[ability.trigger], text: liveIndex >= 0 ? liveLines[liveIndex].text : ability.text, oncePerRound: !!ability.oncePerRound };
      });
  }
  const lines = cardEffectLines(card).map((line) => ({ ...line, label: BATTLE_TIMING_LABEL[line.trigger] }));
  const hpLines = HP_LINES[id];
  return hpLines ? lines.map((line, i) => ({ ...line, text: hpLines.lines[i] ?? line.text })) : lines;
}

/** A few words for compact faces in card combat. */
export function cardCombatEffectSummary(cardOrId: CardDefinition | string): string {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId.id;
  if (getCombatCard(id).abilities.length === 0) return '';
  // Cards without curated copy fall back to their first effect line, not the legacy board text.
  return OVERRIDE_SUMMARY[id] ?? HP_LINES[id]?.summary ?? (hasEffectCopy(id) ? cardEffectSummary(id) : (cardCombatEffectLines(id)[0]?.text ?? ''));
}

// ---------------------------------------------------------------------------------------------------------------
// Battle faces (Battle UX pass): every combat effect a card has, readable on the card itself in hand and on the
// board, so Card Inspect is extra context rather than the only place a rule is written.
// ---------------------------------------------------------------------------------------------------------------

/** Timing labels on battle faces and in-battle Card Inspect: the shared labels, with "Passive" for always-on effects. */
export const BATTLE_TIMING_LABEL: Record<Trigger, string> = { ...EFFECT_TIMING_LABEL, PASSIVE: 'Passive' };

/**
 * A leading timing phrase that only repeats the label printed above the line ("Before Combat: …" under "On Clash").
 * Battle faces drop it; the card data keeps it. Guard lines keep their "Guard N" keyword.
 */
const REDUNDANT_PREFIX = /^(Before Combat|On Death|On Play|When Destroyed|Round End):\s*/;
const GUARD_PREFIX = /^(Guard \d): Before Combat, /;

function trimTiming(text: string): string {
  const guard = GUARD_PREFIX.exec(text);
  if (guard) return `${guard[1]}: ${text.slice(guard[0].length)}`;
  const stripped = text.replace(REDUNDANT_PREFIX, '');
  return stripped === text ? text : stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/**
 * Battle copy: each effect as a short, plain phrase built for recognition on a battle card (hand, board, Spell zone).
 * Card Inspect keeps the full sentences. Conventions, so the short form still says everything that matters in a fight:
 *  - an ATK change with no duration lasts for the rest of the battle; "this round" marks the temporary ones;
 *  - "here" is this lane; Units have no HP, so "damage" always hits the enemy player and "HP" is your player's;
 *  - the timing chip carries the trigger, so the phrase never repeats it.
 * Index-aligned with cardCombatEffectLines; a test keeps every card with an effect listed here.
 */
const BATTLE_LINES: Record<string, string[]> = {
  'inf-flame-imp': [`Deal ${hp(1)} extra damage`],
  'inf-cultist': ['+15 ATK this round'],
  'inf-pit-fiend': [`Deal ${hp(2)} damage`, '+30 ATK this round if an enemy fell'],
  'inf-hellhound': ['Silence enemy here this round', 'Enemy here −30 ATK this round'],
  'inf-blood-demon': ['+15 ATK (max +45)', '+30 ATK this round if an ally fell'],
  'inf-infernal-lord': ['All other Units −30 ATK this round', 'Destroy enemy Continuous Spell here'],
  'inf-runebreaker': ['Destroy enemy Continuous Spell here', 'Spell Immune with Mage Slayer ally', `2nd each round: ${hp(2)} damage`],
  'inf-ash-jackal': ['+30 ATK this round per adjacent Beast'],
  'inf-packhound': ['Beast ally: summon a Hound Pup (once a round)'],
  'inf-alpha-hound': ['+15 ATK this round per Unit you control', `With 3 Units: deal ${hp(2)} damage`],
  'inf-mirage-imp': ['Bypass with your Continuous Spell here, from next round'],
  'und-bone-soldier': ['Return to your deck (once per copy)', '+15 ATK this round per Graveyard card (max +60)'],
  'und-dark-priest': ['Guard 2: +30 ATK if losing', '+30 ATK this round with 3+ in Graveyard'],
  'und-mira': ['Hand of 4 or fewer: return weakest Graveyard Undead', 'Unit-effect Immune with 3+ Undead in Graveyard'],
  'und-cursed-warrior': ['Return to your hand'],
  'und-grave-knight': ['Guard 2: +30 ATK if losing', `Restore ${hp(2)} HP (first each round)`],
  'und-vharos': ['Revive here with 95 ATK', 'Return a random Graveyard Undead to hand'],
  'und-grave-sage': ['Return a random Graveyard Spell to hand', '2nd each round: adjacent allies gain Shield'],
  'und-shade-thief': ['Bypass while you have a Continuous Spell, from next round'],
  'und-wraith-prince': ['Bypass at −15 ATK while you have a Continuous Spell, from next round', '+15 ATK'],
  'und-crypt-warden': ['Guard 2: +30 ATK if losing', 'Gain Shield with 2+ in Graveyard'],
  'kng-royal-guard': ['Adjacent allies +15 ATK', 'Spell Immune with Kingdom ally'],
  'kng-light-priest': [`Restore ${hp(3)} HP`, 'Gain Shield', '+15 ATK this round'],
  'kng-archer': ['+30 ATK this round with your Continuous Spell here'],
  'kng-battle-captain': ['Adjacent allies +15 ATK this round', 'Unit-effect Immune with Knight ally'],
  'kng-paladin': ['Gain Shield', 'Guard 3: +45 ATK if losing', `Enemy here: restore ${hp(1)} HP`],
  'kng-apprentice-mage': ['+30 ATK this round', 'Return a random Graveyard Spell to hand'],
  'kng-archmage-vael': ['First one‑time Spell each round casts twice', `2nd each round: ${hp(2)} damage`, 'Empty hand: get a Graveyard Spell'],
  'kng-spellbreaker': ['+30 ATK this round'],
  'kng-null-templar': ['First enemy Spell on it each round fails'],
  'wld-forest-wolf': ['+30 ATK if the lane opposite is empty'],
  'wld-ancient-treant': ['+15 ATK'],
  'wld-titanroot': ['+30 ATK'],
  'spl-power-surge': ['Your Unit here +45 ATK this round'],
  'spl-weakness': ['Enemy here −45 ATK this round'],
  'spl-execute': [`Destroy enemy here with ${atkFromPower(3)} ATK or less`],
  'spl-second-chance': ['Return your strongest Graveyard Unit to hand'],
  'spl-raise-fallen': ['3+ Graveyard Undead: revive the weakest here'],
  'spl-fireball': ['Enemy here −60 ATK', 'Enemy Continuous Spell here: ATK becomes 50 instead'],
  'spl-war-cry': ['All allies +15 ATK this round', '2+ Kingdom Units: +15 more'],
  'spl-death-wave': ['All enemies −30 ATK this round'],
  'spl-dispel': ['Destroy enemy Continuous Spell here'],
  'spl-soul-burn': ['Exile strongest Unit in enemy Graveyard'],
  'spl-arcane-bolt': [`Deal ${hp(3)} damage`, `After another Spell this round: +${hp(2)}`],
  'spl-aegis-ward': ['Prevent your next damage this round', 'Your Unit here gains Shield'],
  'spl-ward-circle': ['Summon a Ward in up to 2 empty lanes'],
  'spl-stasis-field': ['Enemy here deals no damage this round', 'It gets −15 ATK'],
  'spl-hush': ['Silence enemy here this round'],
  'spl-giants-bane': ['Enemy has more Units: destroy enemy here'],
  'spl-blood-pact': ['Destroy your Unit here, then enemy here if 125 ATK or less'],
  'spl-battle-banner': ['Your Unit here +15 ATK'],
  'spl-burning-ground': ['Enemy here −15 ATK'],
  'spl-growth-totem': ['Your Unit here +15 ATK'],
  'spl-fortify': ['Your Unit here +15 ATK'],
  'spl-cursed-ground': ['Your Unit here +15 ATK'],
  'spl-siege-fire': [`No enemy here: deal ${hp(1)} damage`],
  'spl-grave-totem': ['First ally lost here each round returns to hand'],
};

/** How many battle-copy lines a card has (tests keep this equal to its effect count). */
export function battleCopyLineCount(id: string): number {
  return BATTLE_LINES[id]?.length ?? 0;
}

/** Timing chips on battle cards: short, and visually secondary to the effect. Card Inspect uses BATTLE_TIMING_LABEL. */
export const BATTLE_CHIP_LABEL: Record<Trigger, string> = {
  ON_PLAY: 'On Play',
  ROUND_START: 'Round Start',
  BEFORE_COMBAT: 'Clash',
  AFTER_COMBAT: 'After Clash',
  ON_DEATH: 'Destroyed',
  ON_ALLY_DEATH: 'Ally Falls',
  ON_ENEMY_DEATH: 'Enemy Falls',
  ON_DIRECT_DAMAGE: 'Direct Hit',
  ROUND_END: 'Round End',
  ON_ALLY_SPELL_PLAYED: 'Your Spell',
  ON_ENEMY_SPELL_PLAYED: 'Enemy Spell',
  CONTINUOUS: 'Passive',
  PASSIVE: 'Passive',
};

export interface BattleEffectLine {
  trigger: Trigger;
  /** Timing label, e.g. "On Play", "On Clash", "Passive" (Card Inspect wording). */
  label: string;
  /** Short timing chip for battle cards, e.g. "Clash", "Destroyed". */
  chip: string;
  /** The full rule, as Card Inspect reads it (without a timing phrase the label already shows). */
  text: string;
  /** Battle copy: the same rule as a short phrase, shown on hand, board and Spell-zone cards. */
  compact: string;
  oncePerRound: boolean;
  /** Index of the ability this line describes in the card-combat card's own ability list. */
  abilityIndex: number;
}

/** Every effect line of a card in card combat, in order, with both wordings (battle copy falls back to the full line). Empty for a card with no effect. */
export function cardCombatBattleEffects(cardOrId: CardDefinition | string): BattleEffectLine[] {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId.id;
  const abilities = getCombatCard(id).abilities;
  const visible = abilities.map((ability, index) => ({ ability, index })).filter(({ ability }) => !hasCombatOverride(id) || ability.text !== '');
  const compact = BATTLE_LINES[id];
  return cardCombatEffectLines(id).map((line, i) => {
    const text = trimTiming(line.text);
    return { trigger: line.trigger, label: BATTLE_TIMING_LABEL[line.trigger], chip: BATTLE_CHIP_LABEL[line.trigger], text, compact: compact?.[i] ?? text, oncePerRound: line.oncePerRound, abilityIndex: visible[i]?.index ?? i };
  });
}
