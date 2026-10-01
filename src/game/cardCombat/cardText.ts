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
// Battle faces (Battle UX pass). Card text is read in three layers:
//  1. the card face in hand and on the board: every effect as a short battle line (BATTLE_LINES), so nothing that
//     matters in a fight needs a tap;
//  2. the focus panel a tap opens in battle: the full rule of each effect (`text`) and the card's live state;
//  3. Card Inspect: the full rules again, with stat meanings, keywords and collection detail.
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
 * One effect's battle copy: the face line, an optional tighter board line, and an optional label that replaces the
 * timing chip when a keyword says more than the timing does ("Guard 2" for a Clash effect, "Your 2nd Spell" for a
 * Spell-count trigger).
 */
type BattleCopy = string | { face: string; board?: string; chip?: string };

/**
 * Battle copy: each effect as a short battle line under its label ("On Play: Adjacent allies +15 ATK."), written to be
 * read at a glance in hand and on the board. The focus panel and Card Inspect keep the full sentences. Conventions,
 * so the short form still says everything that matters in a fight:
 *  - an ATK change with no duration lasts for the rest of the battle; "this round" marks the temporary ones;
 *  - "here" is this lane; "allies" are your other Units; "the enemy here" is the enemy Unit in this lane;
 *  - "gain a … Spell / Undead / Unit" puts that card in your hand from the Graveyard;
 *  - Units have no HP, so "damage" always hits the enemy player and "HP" is your player's;
 *  - "with …" holds while the condition does (a Passive's dot on the board shows whether it does right now);
 *  - the label carries the trigger, so the line never repeats it; no abbreviations beyond ATK and HP.
 * A board line is only given where a phrase stops mattering once the card is in play ("from next round" on a Bypass,
 * whose dot shows when it starts; an On Play condition that has already been checked).
 * Index-aligned with cardCombatEffectLines; a test keeps every card with an effect listed here.
 */
const BATTLE_LINES: Record<string, BattleCopy[]> = {
  'inf-flame-imp': ['+45 damage.'],
  'inf-cultist': ['+15 ATK this round.'],
  'inf-pit-fiend': [`Deal ${hp(2)} damage.`, '+30 ATK this round if an enemy fell.'],
  'inf-hellhound': ['Silence the enemy here this round.', 'Enemy here −30 ATK this round.'],
  'inf-blood-demon': ['+15 ATK, up to +45.', '+30 ATK this round if an ally fell.'],
  'inf-infernal-lord': ['All other Units −30 ATK this round.', 'Destroy enemy Continuous Spell here.'],
  'inf-runebreaker': ['Destroy enemy Continuous Spell here.', 'Spell Immune with Mage Slayer ally.', { face: `Deal ${hp(2)} damage.`, chip: 'Enemy’s 2nd Spell' }],
  'inf-ash-jackal': ['+30 ATK this round per adjacent Beast.'],
  'inf-packhound': [{ face: 'Summon a Hound Pup, once per round.', chip: 'Beast Ally Falls' }],
  'inf-alpha-hound': ['+15 ATK this round per Unit you control.', `With 3 Units, deal ${hp(2)} damage.`],
  'inf-mirage-imp': [{ face: 'Bypass with your Continuous Spell here, from next round.', board: 'Bypass with your Continuous Spell here.' }],
  'und-bone-soldier': ['Return to your deck.', '+15 ATK this round per Graveyard card, up to +60.'],
  'und-dark-priest': [{ face: '+30 ATK this round if losing.', chip: 'Guard 2' }, '+30 ATK this round with 3+ Graveyard cards.'],
  'und-mira': [{ face: 'With 4 or fewer in hand, gain weakest Graveyard Undead.', board: 'Gain weakest Graveyard Undead.' }, 'Immune to Unit effects with 3+ Graveyard Undead.'],
  'und-cursed-warrior': ['Return to your hand.'],
  'und-grave-knight': [{ face: '+30 ATK this round if losing.', chip: 'Guard 2' }, `Restore ${hp(2)} HP, once per round.`],
  'und-vharos': ['Revive here with 95 ATK.', 'Gain a random Graveyard Undead.'],
  'und-grave-sage': ['Gain a random Graveyard Spell.', { face: 'Adjacent allies gain a Shield.', chip: 'Your 2nd Spell' }],
  'und-shade-thief': [{ face: 'Bypass while you have a Continuous Spell, from next round.', board: 'Bypass while you have a Continuous Spell.' }],
  'und-wraith-prince': [{ face: 'Bypass at −15 ATK while you have a Continuous Spell, from next round.', board: 'Bypass at −15 ATK while you have a Continuous Spell.' }, '+15 ATK.'],
  'und-crypt-warden': [{ face: '+30 ATK this round if losing.', chip: 'Guard 2' }, 'Gain a Shield with 2+ Graveyard cards.'],
  'kng-royal-guard': ['Adjacent allies +15 ATK.', 'Spell Immune with Kingdom ally.'],
  'kng-light-priest': [`Restore ${hp(3)} HP.`, 'Gain a Shield.', '+15 ATK this round.'],
  'kng-archer': ['+30 ATK this round with your Continuous Spell here.'],
  'kng-battle-captain': ['Adjacent allies +15 ATK this round.', 'Immune to Unit effects with Knight ally.'],
  'kng-paladin': ['Gain a Shield.', { face: '+45 ATK this round if losing.', chip: 'Guard 3' }, `If it fell here, restore ${hp(1)} HP.`],
  'kng-apprentice-mage': ['+30 ATK this round.', 'Gain a random Graveyard Spell.'],
  'kng-archmage-vael': ['Your first one-time Spell each round repeats.', { face: `Deal ${hp(2)} damage.`, chip: 'Your 2nd Spell' }, 'If hand is empty, gain a Graveyard Spell.'],
  'kng-spellbreaker': ['+30 ATK this round.'],
  'kng-null-templar': ['Ignores the first enemy Spell on it each round.'],
  'wld-forest-wolf': ['+30 ATK if no enemy is here.'],
  'wld-ancient-treant': ['+15 ATK.'],
  'wld-titanroot': ['+30 ATK.'],
  'spl-power-surge': ['Your Unit here +45 ATK this round.'],
  'spl-weakness': ['Enemy here −45 ATK this round.'],
  'spl-execute': [`Destroy the enemy here if it has ${atkFromPower(3)} ATK or less.`],
  'spl-second-chance': ['Gain your strongest Graveyard Unit.'],
  'spl-raise-fallen': ['With 3+ Graveyard Undead, revive the weakest here.'],
  'spl-fireball': ['Enemy here −60 ATK.', 'With their Continuous Spell here, it becomes 50 ATK instead.'],
  'spl-war-cry': ['All allies +15 ATK this round.', 'With 2+ Kingdom Units, +15 more.'],
  'spl-death-wave': ['All enemies −30 ATK this round.'],
  'spl-dispel': ['Destroy enemy Continuous Spell here.'],
  'spl-soul-burn': ['Exile their strongest Graveyard Unit.'],
  'spl-arcane-bolt': [`Deal ${hp(3)} damage.`, `+${hp(2)} damage if you already cast a Spell this round.`],
  'spl-aegis-ward': ['Prevent the next damage to you this round.', 'Shield your Unit here.'],
  'spl-ward-circle': ['Summon a Ward in up to 2 empty lanes.'],
  'spl-stasis-field': ['Enemy here deals no damage this round.', 'It also gets −15 ATK.'],
  'spl-hush': ['Silence the enemy here this round.'],
  'spl-giants-bane': ['If they have more Units, destroy the enemy here.'],
  'spl-blood-pact': ['Destroy your Unit here, then theirs if it has 125 ATK or less.'],
  'spl-battle-banner': ['Your Unit here +15 ATK.'],
  'spl-burning-ground': ['Enemy here −15 ATK.'],
  'spl-growth-totem': ['Your Unit here +15 ATK.'],
  'spl-fortify': ['Your Unit here +15 ATK.'],
  'spl-cursed-ground': ['Your Unit here +15 ATK.'],
  'spl-siege-fire': [`If no enemy is here, deal ${hp(1)} damage.`],
  'spl-grave-totem': ['First ally lost here each round returns to hand.'],
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
  /** The label on battle cards, the focus panel and the battle log: a short timing chip ("Clash", "Destroyed"), or a keyword that says more ("Guard 2"). */
  chip: string;
  /** The full rule, as the focus panel and Card Inspect read it (without a timing phrase or keyword the chip already shows). */
  text: string;
  /** Battle copy: the same rule as a short line, shown on hand cards and in Spell zones. */
  compact: string;
  /** The board's wording: the battle copy, or a tighter line where part of it no longer matters once in play. */
  board: string;
  oncePerRound: boolean;
  /** Index of the ability this line describes in the card-combat card's own ability list. */
  abilityIndex: number;
}

/** Every effect line of a card in card combat, in order, with both wordings (battle copy falls back to the full line). Empty for a card with no effect. */
export function cardCombatBattleEffects(cardOrId: CardDefinition | string): BattleEffectLine[] {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId.id;
  const abilities = getCombatCard(id).abilities;
  const visible = abilities.map((ability, index) => ({ ability, index })).filter(({ ability }) => !hasCombatOverride(id) || ability.text !== '');
  const copy = BATTLE_LINES[id];
  return cardCombatEffectLines(id).map((line, i) => {
    const full = trimTiming(line.text);
    const entry = copy?.[i];
    const face = typeof entry === 'string' ? entry : (entry?.face ?? full);
    const chip = (typeof entry === 'object' && entry.chip) || BATTLE_CHIP_LABEL[line.trigger];
    // A keyword chip ("Guard 2") already says what the full rule's own keyword prefix does.
    const text = full.startsWith(`${chip}: `) ? capitalize(full.slice(chip.length + 2)) : full;
    return {
      trigger: line.trigger,
      label: BATTLE_TIMING_LABEL[line.trigger],
      chip,
      text,
      compact: face,
      board: (typeof entry === 'object' && entry.board) || face,
      oncePerRound: line.oncePerRound,
      abilityIndex: visible[i]?.index ?? i,
    };
  });
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
