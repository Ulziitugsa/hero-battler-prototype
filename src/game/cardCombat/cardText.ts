import type { CardDefinition } from '../types/index.js';
import { TIMING_LABEL, cardEffectLines, type CardEffectLine } from '../cards/effectText.js';
import { getCard } from '../cards/index.js';
import { getCombatCard, hasCombatOverride } from './cards.js';
import { HP_PER_LEGACY_POINT, atkFromPower } from './stats.js';

// Player-facing wording for the card-combat rules: the approved ATK + HP Contribution model that card faces show on
// every surface (cardPresentation.ts pairs these lines into card effects). Two wordings per effect:
//  - the full rule (cardCombatEffectLines): the focus panel and Card Inspect;
//  - the battle line (BATTLE_LINES): every card face, in battle and out of it.
//
//  - Cards the approved balance pass changed (cards.ts) read their own card-combat ability text.
//  - Cards that deal or restore Player HP print the converted amount (1 legacy point = 45 HP).
//  - Every other card reads the live copy (effectText.ts), which already speaks in ATK.

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
 * One effect's battle line: the face line, an optional tighter board line, and an optional label that replaces the
 * timing label when a keyword says more than the timing does ("Guard 2" for a Clash effect, "Your 2nd Spell" for a
 * Spell-count trigger).
 */
export type BattleCopy = string | { face: string; board?: string; label?: string };

/**
 * Battle copy: each effect as a short battle line under its label ("Passive: Adjacent allies +15 ATK."), written to be
 * read at a glance in hand and on the board. The focus panel and Card Inspect keep the full sentences. Conventions,
 * so the short form still says everything that matters in a fight:
 *  - an ATK change with no duration lasts for the rest of the battle; "this round" marks the temporary ones;
 *  - "here" is this lane; "allies" are your other Units; "the enemy here" is the enemy Unit in this lane;
 *  - "gain a … Spell / Undead / Unit" puts that card in your hand from the Graveyard;
 *  - Units have no HP, so "damage" always hits the enemy player and "HP" is your player's;
 *  - "with …" holds while the condition does (a Passive's dot on the board shows whether it does right now);
 *  - the label carries the trigger, so the line never repeats it; no abbreviations beyond ATK and HP.
 * A board line is only given where a phrase stops mattering once the card is in play ("from next round" on a Bypass,
 * whose dot shows when it starts).
 * Index-aligned with cardCombatEffectLines; a test keeps every card with an effect listed here. Legacy battles read
 * their own lines where the legacy rules differ (cardPresentation.ts LEGACY_LINES).
 */
export const BATTLE_LINES: Record<string, BattleCopy[]> = {
  'inf-flame-imp': ['+45 damage.'],
  'inf-cultist': ['+15 ATK this round.'],
  'inf-pit-fiend': [`Deal ${hp(2)} damage.`, '+30 ATK this round if an enemy fell.'],
  'inf-hellhound': ['Enemy here −30 ATK this round.'],
  'inf-blood-demon': ['+15 ATK, up to +45.', '+30 ATK this round if an ally fell.'],
  'inf-infernal-lord': [`Deal ${hp(1)} damage.`, 'Every enemy Unit −30 ATK.'],
  'inf-runebreaker': ['Destroy enemy Continuous Spell here.', 'Spell Immune with Mage Slayer ally.', { face: `Deal ${hp(2)} damage.`, label: 'Enemy’s 2nd Spell' }],
  'inf-ash-jackal': ['+30 ATK this round per adjacent Beast.'],
  'inf-packhound': [{ face: 'Summon a Hound Pup, once per round.', label: 'Beast Ally Falls' }],
  'inf-alpha-hound': ['+15 ATK this round per other Unit you control.'],
  'inf-mirage-imp': [{ face: 'Bypass with your Continuous Spell here, from next round.', board: 'Bypass with your Continuous Spell here.' }],
  'und-bone-soldier': ['Return to your deck.', '+15 ATK this round per Graveyard Unit, up to +45.'],
  'und-dark-priest': [{ face: '+30 ATK this round if losing.', label: 'Guard 2' }, '+15 ATK this round with 3+ Graveyard cards.'],
  'und-mira': ['Gain your weakest other Graveyard Undead.', 'Immune to Unit effects with 3+ Graveyard Undead.'],
  'und-cursed-warrior': ['Return to your hand.'],
  'und-grave-knight': [{ face: '+30 ATK this round if losing.', label: 'Guard 2' }, `Restore ${hp(1)} HP, once per round.`],
  'und-vharos': ['Revive here with 95 ATK.', 'Gain your strongest other Graveyard Undead.'],
  'und-grave-sage': ['Gain a random Graveyard Spell.', { face: 'Adjacent allies gain a Shield.', label: 'Your 2nd Spell' }],
  'und-shade-thief': [{ face: 'Bypass while you have a Continuous Spell, from next round.', board: 'Bypass while you have a Continuous Spell.' }],
  'und-wraith-prince': [{ face: 'Bypass at −15 ATK while you have a Continuous Spell, from next round.', board: 'Bypass at −15 ATK while you have a Continuous Spell.' }, '+15 ATK.'],
  'und-crypt-warden': [{ face: '+15 ATK this round if losing.', label: 'Guard 1' }, { face: 'With 2+ Graveyard cards, survives being destroyed once.', label: 'Shield' }],
  'kng-royal-guard': ['Adjacent allies +15 ATK.'],
  'kng-light-priest': [{ face: 'Survives being destroyed once.', label: 'Shield' }, `Restore ${hp(1)} HP.`, '+15 ATK this round.'],
  'kng-archer': ['+15 ATK this round.', '+15 ATK more with your Continuous Spell here.'],
  'kng-battle-captain': ['Adjacent allies +15 ATK this round.', 'Immune to Unit effects with Knight ally.'],
  'kng-paladin': [{ face: 'Survives being destroyed once.', label: 'Shield' }, 'Adjacent allies that would lose +15 ATK this round.', `If it fell here, restore ${hp(1)} HP.`],
  'kng-apprentice-mage': ['+30 ATK this round.', 'Gain a random Graveyard Spell.'],
  'kng-archmage-vael': ['Your first one-time Spell each round repeats.', { face: `Deal ${hp(2)} damage.`, label: 'Your 2nd Spell' }, 'If hand is empty, gain a Graveyard Spell.'],
  'kng-spellbreaker': ['+30 ATK this round.'],
  'kng-null-templar': ['Ignores the first enemy Spell on it each round.'],
  'wld-forest-wolf': ['+30 ATK while no enemy is here.'],
  'wld-ancient-treant': ['+15 ATK.'],
  'wld-titanroot': ['+30 ATK.'],
  'spl-power-surge': ['Your Unit here +45 ATK this round.'],
  'spl-weakness': ['Enemy here −45 ATK this round.'],
  'spl-execute': [`Destroy the enemy here if it has ${atkFromPower(3)} ATK or less.`],
  'spl-second-chance': ['Gain your strongest Graveyard Unit.'],
  'spl-raise-fallen': ['With 2+ Graveyard Undead, revive the weakest here.'],
  'spl-fireball': ['Enemy here −60 ATK.', 'With their Continuous Spell here, it becomes 50 ATK instead.'],
  'spl-war-cry': ['All allies +15 ATK this round.', 'With 3 Units, +15 more.'],
  'spl-death-wave': ['All enemies −30 ATK this round.'],
  'spl-dispel': ['Destroy enemy Continuous Spell here.', 'If it did, draw a card.'],
  'spl-soul-burn': ['Exile their 2 strongest Graveyard Units.', `Deal ${hp(1)} damage.`],
  'spl-arcane-bolt': [`Deal ${hp(3)} damage.`, `+${hp(2)} damage if you already cast a Spell this round.`],
  'spl-aegis-ward': ['Prevent the next damage to you this round.', 'Shield your Unit here.'],
  'spl-ward-circle': ['Summon a Ward in up to 2 empty lanes.'],
  'spl-stasis-field': ['Enemy here deals no damage this round.', 'It also gets −15 ATK.'],
  'spl-hush': ['Silence the enemy here this round.'],
  'spl-giants-bane': ['If they have more Units, destroy the enemy here.'],
  'spl-blood-pact': ['Destroy your Unit here, then the enemy here.'],
  'spl-battle-banner': ['Attached Unit +15 ATK.'],
  'spl-burning-ground': ['Enemy here −15 ATK.'],
  'spl-growth-totem': ['Your Unit here +15 ATK.'],
  'spl-fortify': ['Attached Unit +15 ATK.'],
  'spl-cursed-ground': ['Your Unit here +15 ATK.', 'Your Unit here gains +15 ATK.'],
  'spl-siege-fire': [`If no enemy is here, deal ${hp(1)} damage.`],
  // Launch set: the new cards.
  'kng-shieldbearer': [{ face: '+30 ATK this round if losing.', label: 'Guard 2' }],
  'und-grave-sexton': ['If your Graveyard has 3+ Units, restore 45 HP.'],
  'inf-soot-imp': ['Deal 45 damage.'],
  'spl-cinder-bolt': ['Deal 90 damage.'],
  'kng-marshal-aldric': ['If you control 3 Units, your other Units gain +15 ATK this round.', 'Gain a Shield, once per round.'],
  'kng-oathkeeper': [{ face: 'Survives being destroyed once.', label: 'Shield' }, { face: 'With 3 Units, +15 ATK this round if losing.', label: 'Guard 1' }],
  'kng-knight-errant': ['+15 ATK this round for each other Knight you control.'],
  'kng-relic-warden': ['Exile the strongest Unit in the enemy Graveyard.'],
  'kng-pikeman': ['+15 ATK this round for each adjacent Knight.'],
  'und-morwen': [{ face: '+30 ATK this round if losing.', label: 'Guard 2' }, 'Adjacent allies that would lose +15 ATK this round.', 'Revive your weakest Graveyard Undead in an empty lane.'],
  'und-bonecaller': ['If it was Undead, +15 ATK, up to +45.'],
  'und-skeletal-legionnaire': ['Summon a Skeleton in an empty lane.'],
  'spl-bone-wall': ['Shield your Unit here.', 'If your Graveyard has 3+ Units, it also gains +30 ATK this round.'],
  'und-rattling-horde': ['+15 ATK this round per Undead Unit you control, including this one.'],
  'inf-cerberus': ['If you control 3 Units, every enemy Unit gets −15 ATK this round.', 'Summon a Hound Pup in an empty lane.'],
  'inf-brimstone-matriarch': ['+15 ATK this round if you control 3 Units.', 'Summon a Hound Pup in an empty lane.'],
  'spl-call-the-pack': ['Summon a Hound Pup in an empty lane.', 'Draw a card.'],
  'inf-cinder-jackal': ['Summon a Hound Pup in an empty lane.'],
  'kng-moonlit-savant': ['+15 ATK, up to +45.'],
  'spl-mirror-image': ['Return a random Spell from your Graveyard to your hand.', 'Draw a card.'],
  'kng-battlemage': ['The enemy here gets −30 ATK this round.'],
  'spl-arcane-barrier': ['Shield your Unit here.', 'Draw a card.'],
  'spl-spark': ['Deal 45 damage.', 'Draw a card.'],
  'und-duchess-nyx': [{ face: 'Bypass while you control a Continuous Spell, from next round.', board: 'Bypass while you control a Continuous Spell.' }, 'If you control no Continuous Spell, gain a random Graveyard Spell.', '+15 ATK, up to +45.'],
  'und-banshee': [{ face: 'Bypass while you control 2+ Continuous Spells, from next round.', board: 'Bypass while you control 2+ Continuous Spells.' }, 'Gain a random Graveyard Spell.'],
  'und-spectral-assassin': [{ face: 'Bypass at −30 ATK with your Continuous Spell, from next round.', board: 'Bypass at −30 ATK with your Continuous Spell.' }],
  'spl-ghost-lantern': ['Your Unit here has +15 ATK.'],
  'inf-ignis': ['Deal 45 damage for each Continuous Spell you control.', '+15 ATK this round.'],
  'inf-hellfire-warlock': [{ face: 'Deal 90 damage.', label: 'Your 2nd Spell' }, 'Deal 45 damage.'],
  'spl-inferno': ['Deal 45 damage.', 'Every enemy Unit −15 ATK.'],
  'inf-ember-witch': ['Deal 45 damage, once per round.'],
  'inf-cinder-imp': ['If this Unit would lose its lane, deal 45 damage.'],
  'spl-wall-of-flame': ['The enemy here has −15 ATK.'],
  'kng-saint-aveline': ['Your Attached Spell that expires returns to hand, once per round.', '+15 ATK this round.'],
  'kng-crusader-champion': ['+30 ATK with your Continuous Spell here.', 'Spell Immune with your Continuous Spell here.'],
  'spl-oath-blade': ['The attached Unit has +15 ATK.', 'Restore 45 HP.'],
  'kng-standard-bearer': ['Adjacent allies +15 ATK with your Continuous Spell here.'],
  'spl-consecrate': ['Your Unit here gains +15 ATK.'],
  'kng-oath-acolyte': ['With your Continuous Spell here, restore 45 HP.'],
  'und-plague-mother': [{ face: 'Survives being destroyed once.', label: 'Shield' }, { face: '+15 ATK this round if losing.', label: 'Guard 1' }, 'Every enemy Unit −15 ATK.'],
  'und-blightcaster': ['The enemy here gets −15 ATK.', 'Restore 45 HP, once per round.'],
  'und-withering-lich': ['+15 ATK, up to +45.'],
  'und-rot-ghoul': ['The enemy here gets −30 ATK.'],
  'spl-enfeeble': ['Enemy here −30 ATK this round and −15 ATK.'],
  'inf-kathra': ['Deal 45 damage and gain +15 ATK, up to +45.', 'Deal 90 damage.'],
  'spl-flesh-altar': ['When one of your Units falls, your Unit here gains +15 ATK.'],
  'inf-blood-imp': ['Your other Units gain +15 ATK.'],
  'inf-blood-thrall': ['If this Unit would lose its lane, deal 90 damage.'],
  'spl-dark-ritual': ['Destroy your Unit here.', 'Draw 2 cards.'],
  'und-bone-dragon': ['+15 ATK this round per Graveyard Unit, up to +45.'],
  'und-barrow-knight': [{ face: '+15 ATK this round if losing.', label: 'Guard 1' }, 'Summon a Skeleton in an empty lane.', '+30 ATK this round if the enemy cast a Spell this round.'],
  'inf-flame-herald': ['Deal 45 damage.'],
  'spl-meteor': ['Destroy the enemy here if it has 110 ATK or less.', 'Deal 90 damage.'],
  'kng-banner-knight': ['With your Continuous Spell here, +15 ATK, up to +45.'],
  'spl-reliquary-blade': ['The attached Unit has +30 ATK.'],
  'und-grave-tyrant': ['Exile their strongest Graveyard Unit and gain +15 ATK, up to +45.'],
  'und-ashen-revenant': ['+15 ATK, up to +45.', 'Return to your hand, once.'],
  'kng-arcane-knight': ['Adjacent allies gain +15 ATK this round.'],
  'und-night-courier': [{ face: 'Bypass while you have a Continuous Spell, from next round.', board: 'Bypass while you have a Continuous Spell.' }, 'Gain a random Graveyard Spell.'],
  'inf-pack-warden': ['+30 ATK this round if an ally is adjacent.'],
  'spl-oath-of-vengeance': ['Your Unit here +30 ATK this round.', 'If an ally fell this round, +30 more.'],
  'spl-grave-totem': ['Your Unit here +30 ATK this round if the enemy cast or has a Spell.', 'First ally lost here returns to hand, once per battle.'],
};

/** How many battle lines a card has (tests keep this equal to its effect count). */
export function battleCopyLineCount(id: string): number {
  return BATTLE_LINES[id]?.length ?? 0;
}
