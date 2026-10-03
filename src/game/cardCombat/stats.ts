import type { CardDefinition, Rarity } from '../types/index.js';
import { getCard } from '../cards/index.js';

// The approved card-combat stat model (docs/CARD-COMBAT-DESIGN.md sections 3, 4 and 13), as data.
//
// This module is the ONE place ATK, HP Contribution and Starting HP come from. Card faces, Card Inspect, the
// Deck Builder's Starting HP and the card resolver all read it, so the Deck Builder preview and the battle can
// never disagree:
//
//   ATK                = 80 + 15 x (Power - 3) + an authored per-card offset (-6..+6)
//   HP Contribution    = max(45, round(0.75 x (210 - ATK))) + rarity premium (Common 0, Rare 4, Epic 8, Legendary 11)
//   Starting HP        = sum of printed HP Contribution over every Unit copy in the deck. Spells and tokens add 0.
//
// Every card plays at its printed values. There is no combat Card Mastery: no stored Mastery / Ascension rank, Legacy
// Level or other progression changes ATK, HP Contribution, Starting HP or any effect (docs/CARD-COMBAT-DESIGN.md
// section 7). Nothing in this file takes a player's progression as an input, so it cannot.
//
// The offsets were chosen once by the simulator's stable per-card hash (cardSim/statModels.ts cardJitter, the
// numbers ozi approved and the balance pass measured) and are now authored data: a test checks they still match
// the simulator, but nothing hashes at runtime. Legacy combat keeps reading `card.power`; this file never
// changes the legacy card definitions.

export const ATK_PER_POWER = 15;
/** One legacy player-HP point in Player HP (approved: a typical ~900 HP deck over the legacy 20). */
export const HP_PER_LEGACY_POINT = 45;
/** Most ATK a permanent effect can add to a Unit above the ATK it entered with (balance pass, section 14). */
export const GROWTH_CAP_ATK = 45;
/** Units in a deck that plays card combat (approved 8-Unit minimum). */
export const MIN_UNITS_CARD_COMBAT = 8;

export const RARITY_HPC_PREMIUM: Record<Rarity, number> = { common: 0, rare: 4, epic: 8, legendary: 11 };

/** Approved re-band (2026-09-29): the Power 7 Legendaries play at Power 6 in card combat. */
export const CARD_COMBAT_POWER: Readonly<Record<string, number>> = {
  'und-vharos': 6,
  'inf-infernal-lord': 6,
};

/**
 * Authored ATK offset per Unit. Kept under half a Power band so it never reorders bands; its only job is to
 * make two different cards rarely tie. Comments show the resulting printed stats.
 */
export const ATK_OFFSET: Readonly<Record<string, number>> = {
  'inf-flame-imp': -1, // P3 common: ATK 79, HPC 98
  'inf-cultist': -4, // P3 common: ATK 76, HPC 101
  'inf-pit-fiend': -5, // P5 common: ATK 105, HPC 79
  'inf-hellhound': 4, // P5 rare: ATK 114, HPC 76
  'inf-blood-demon': -1, // P6 epic: ATK 124, HPC 73
  'inf-infernal-lord': 4, // P6 legendary (re-banded from 7): ATK 129, HPC 72
  'inf-runebreaker': 5, // P5 epic: ATK 115, HPC 79
  'inf-ash-jackal': 4, // P3 common: ATK 84, HPC 95
  'inf-packhound': -3, // P4 rare: ATK 92, HPC 93
  'inf-alpha-hound': -2, // P4 epic: ATK 93, HPC 96
  'inf-mirage-imp': 2, // P4 rare: ATK 97, HPC 89
  'und-bone-soldier': -2, // P4 common: ATK 93, HPC 88
  'und-dark-priest': 4, // P3 rare: ATK 84, HPC 99
  'und-mira': 2, // P4 epic: ATK 97, HPC 93
  'und-cursed-warrior': 4, // P4 common: ATK 99, HPC 83
  'und-grave-knight': 5, // P4 rare: ATK 100, HPC 87
  'und-vharos': 5, // P6 legendary (re-banded from 7): ATK 130, HPC 71
  'und-grave-sage': -2, // P5 rare: ATK 108, HPC 81
  'und-shade-thief': -6, // P4 common: ATK 89, HPC 91
  'und-wraith-prince': -2, // P4 epic: ATK 93, HPC 96
  'und-crypt-warden': 3, // P4 common: ATK 98, HPC 84
  'kng-common-knight': 3, // P6 common: ATK 128, HPC 62
  'kng-royal-guard': 3, // P5 rare: ATK 113, HPC 77
  'kng-light-priest': -2, // P3 rare: ATK 78, HPC 103
  'kng-archer': -5, // P4 common: ATK 90, HPC 90
  'kng-battle-captain': 0, // P5 epic: ATK 110, HPC 83
  'kng-paladin': -6, // P5 legendary: ATK 104, HPC 91
  'kng-apprentice-mage': -2, // P4 common: ATK 93, HPC 88
  'kng-archmage-vael': -1, // P4 legendary: ATK 94, HPC 98
  'kng-spellbreaker': 4, // P4 common: ATK 99, HPC 83
  'kng-null-templar': 2, // P5 rare: ATK 112, HPC 78
  'wld-forest-wolf': 1, // P5 common: ATK 111, HPC 74
  'wld-ancient-treant': -2, // P4 epic: ATK 93, HPC 96
  'wld-titanroot': 2, // P8 legendary: ATK 157, HPC 51
};

/**
 * Tokens: ATK only, no HP Contribution, no offset. The Ward token is printed at 70 ATK by the approved
 * card-change table ("a plain 70-ATK blocker"); every other token enters at its Power line.
 */
export const TOKEN_ATK: Readonly<Record<string, number>> = {
  'tok-ward': 70,
};

/** ATK on the Power line (no offset): the value fixed-Power effects land on (Revive at Power 4, a Power 2 token, "set to Power 1"). */
export function atkFromPower(power: number): number {
  return 80 + ATK_PER_POWER * (power - 3);
}

/** A Unit at or below this ATK is destroyed: the legacy "Power 0 dies" line on the ATK scale (35). */
export const DEATH_LINE_ATK = atkFromPower(0);

/** Power a card plays at in card combat (approved re-band applied). */
export function cardCombatPower(card: CardDefinition): number {
  return CARD_COMBAT_POWER[card.id] ?? Math.max(1, card.power ?? 1);
}

export function isTokenCard(card: CardDefinition): boolean {
  return card.role === 'Token' || card.tags.includes('Token');
}

export interface CardCombatStats {
  atk: number;
  /** Printed HP Contribution. 0 for Spells and tokens. */
  hpc: number;
}

function hpcForAtk(atk: number, rarity: Rarity): number {
  return Math.max(45, Math.round(0.75 * (210 - atk)) + RARITY_HPC_PREMIUM[rarity]);
}

/** Printed ATK and HP Contribution of a card. Spells print neither (null). */
export function printedStats(cardOrId: CardDefinition | string): CardCombatStats | null {
  const card = typeof cardOrId === 'string' ? getCard(cardOrId) : cardOrId;
  if (card.type !== 'hero') return null;
  if (isTokenCard(card)) return { atk: TOKEN_ATK[card.id] ?? atkFromPower(Math.max(1, card.power ?? 1)), hpc: 0 };
  const atk = atkFromPower(cardCombatPower(card)) + (ATK_OFFSET[card.id] ?? 0);
  return { atk, hpc: hpcForAtk(atk, card.rarity) };
}

/** HP Contribution of one copy: always the printed value (0 for Spells and tokens). */
export function hpContribution(cardOrId: CardDefinition | string): number {
  return printedStats(cardOrId)?.hpc ?? 0;
}

export interface StartingHpBreakdown {
  /** Starting HP: the number both the Deck Builder and the battle show. */
  total: number;
  units: number;
  spells: number;
}

/**
 * THE Starting HP helper: the sum of the deck's printed Unit HP Contributions. Deck Builder, Battle Setup, Home, the
 * Campaign stage sheet, the card resolver and the simulator all call this, so the same deck always starts at the same
 * HP everywhere. It takes the deck only: no player's progression can reach it.
 */
export function deckStartingHp(cardIds: readonly string[]): StartingHpBreakdown {
  let total = 0;
  let units = 0;
  let spells = 0;
  for (const id of cardIds) {
    const card = getCard(id);
    if (card.type !== 'hero') {
      spells += 1;
      continue;
    }
    units += 1;
    total += hpContribution(card);
  }
  return { total, units, spells };
}
