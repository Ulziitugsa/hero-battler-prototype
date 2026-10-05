import type { Faction } from '../types/index.js';
import { getCard } from './index.js';
import { LAUNCH_CARD_IDS } from './launchRoster.js';

// Card Set v0.1 - the curated playtest roster (see README "Card Set v0.1"). This is the set the
// deckbuilder, Collection screen and starter/AI decks all draw from. Older prototype cards that
// predate this set (extra Undead spells, the whole Wild faction, ...) stay defined in their card
// files - existing engine tests still reference a few of them by id - but are intentionally left out
// of this list so the playtest surface stays at "roughly 30 cards, 3 factions", not "everything ever
// added to the file".

export const KINGDOM_ROSTER: string[] = [
  'kng-common-knight',
  'kng-archer',
  'kng-royal-guard',
  'kng-light-priest',
  'kng-battle-captain',
  'kng-paladin',
  'spl-power-surge',
  'spl-war-cry',
  'spl-dispel',
  'spl-battle-banner',
  'spl-fortify',
  // Expansion (appended - the pixel-art atlas maps the FIRST six ids of each roster, see pixelArt.ts)
  'kng-apprentice-mage',
  'kng-archmage-vael',
  'kng-spellbreaker',
  'kng-null-templar',
  'spl-aegis-ward',
  'spl-ward-circle',
  'spl-giants-bane',
];

export const UNDEAD_ROSTER: string[] = [
  'und-bone-soldier',
  'und-cursed-warrior',
  'und-dark-priest',
  'und-grave-knight',
  'und-mira',
  'und-vharos',
  'spl-second-chance',
  'spl-raise-fallen',
  'spl-grave-totem',
  'spl-cursed-ground',
  'und-grave-sage',
  'und-shade-thief',
  'und-wraith-prince',
  'und-crypt-warden',
  'spl-hush',
  'spl-stasis-field',
];

export const INFERNAL_ROSTER: string[] = [
  'inf-flame-imp',
  'inf-cultist',
  'inf-pit-fiend',
  'inf-hellhound',
  'inf-blood-demon',
  'inf-infernal-lord',
  'spl-weakness',
  'spl-fireball',
  'spl-soul-burn',
  'spl-burning-ground',
  'spl-siege-fire',
  'inf-runebreaker',
  'inf-ash-jackal',
  'inf-packhound',
  'inf-alpha-hound',
  'inf-mirage-imp',
  'spl-arcane-bolt',
  'spl-blood-pact',
];

// The launch set (launchRoster.ts, 116 cards): every launch card not listed above is appended to its faction's list, in
// launch-roster order, so the first six ids of each list (the pixel-art atlas) never move.
const LISTED = new Set([...KINGDOM_ROSTER, ...UNDEAD_ROSTER, ...INFERNAL_ROSTER]);
for (const id of LAUNCH_CARD_IDS) {
  if (LISTED.has(id)) continue;
  const faction = getCard(id).faction;
  if (faction === 'kingdom') KINGDOM_ROSTER.push(id);
  else if (faction === 'undead') UNDEAD_ROSTER.push(id);
  else if (faction === 'infernal') INFERNAL_ROSTER.push(id);
}

export const ROSTER_BY_FACTION: Record<'kingdom' | 'undead' | 'infernal', string[]> = {
  kingdom: KINGDOM_ROSTER,
  undead: UNDEAD_ROSTER,
  infernal: INFERNAL_ROSTER,
};

/** The launch roster (116 cards), flattened by faction. This - not `ALL_CARDS` - is the collectible card set. */
export const PLAYTEST_ROSTER: string[] = [...KINGDOM_ROSTER, ...UNDEAD_ROSTER, ...INFERNAL_ROSTER];

export function rosterFactionOf(cardId: string): Faction {
  return getCard(cardId).faction;
}
