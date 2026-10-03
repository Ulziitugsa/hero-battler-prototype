import { STARTER_DECKS } from '../cards/starterDecks';
import type { RANKS } from './store';

// Ranked AI opponents on card combat: one explicit deck list per rival, played at printed card values. Nothing here
// reads the player's decks, Legacy Level, old Power or progression, and rivals have no Card Mastery or any other
// vertical stat: a rival is the same deck for every player in that division. Rivals get harder through deck
// construction only (plain Commons -> a clear plan -> faction synergy -> tuned and optimized decks).
// Re-simulated on the production resolver: scripts/simulate-modes.mjs. Master once differed from Diamond only by rival
// Mastery; with printed values it plays the two hardest Diamond decks (Blood Onslaught, Iron Rank) and drops Ember Pact.

export type Division = (typeof RANKS)[number];

export interface RankedRivalDeck {
  id: string;
  name: string;
  cardIds: string[];
}

export interface RankedTier {
  division: Division;
  /** One line for the Ranked screen. */
  blurb: string;
  decks: RankedRivalDeck[];
}

const deck = (entries: [string, number][]): string[] => entries.flatMap(([id, n]) => Array.from({ length: n }, () => id));

const ASHEN_PATROL = deck([['und-bone-soldier', 2], ['und-cursed-warrior', 2], ['inf-cultist', 2], ['inf-flame-imp', 2], ['und-shade-thief', 1], ['spl-power-surge', 2], ['spl-weakness', 2], ['spl-hush', 2]]);
const ROAD_RAIDERS = deck([['und-bone-soldier', 2], ['und-cursed-warrior', 2], ['und-shade-thief', 2], ['kng-archer', 2], ['inf-cultist', 1], ['spl-power-surge', 2], ['spl-weakness', 2], ['spl-aegis-ward', 1], ['spl-hush', 1]]);
const BORDER_MILITIA = deck([['kng-royal-guard', 2], ['kng-null-templar', 2], ['und-grave-knight', 2], ['und-crypt-warden', 2], ['inf-packhound', 2], ['kng-battle-captain', 1], ['spl-power-surge', 1], ['spl-weakness', 1], ['spl-giants-bane', 1], ['spl-blood-pact', 1]]);
const KNIGHT_COMMAND = deck([['kng-common-knight', 2], ['und-crypt-warden', 2], ['inf-pit-fiend', 2], ['und-grave-knight', 2], ['inf-blood-demon', 1], ['und-mira', 1], ['spl-giants-bane', 1], ['spl-blood-pact', 1], ['spl-hush', 1], ['spl-weakness', 1], ['spl-power-surge', 1]]);
const SPELLBREAKERS = deck([['kng-spellbreaker', 2], ['kng-null-templar', 2], ['inf-runebreaker', 2], ['kng-common-knight', 2], ['kng-royal-guard', 2], ['kng-paladin', 1], ['spl-dispel', 2], ['spl-battle-banner', 1], ['spl-power-surge', 1]]);
const HOUND_PACK = deck([['inf-ash-jackal', 2], ['inf-packhound', 2], ['inf-alpha-hound', 2], ['inf-hellhound', 2], ['inf-flame-imp', 2], ['inf-cultist', 1], ['spl-weakness', 1], ['spl-fireball', 1], ['spl-blood-pact', 1], ['spl-siege-fire', 1]]);
const MOONLIT_TRICKSTERS = deck([['und-shade-thief', 2], ['und-wraith-prince', 2], ['inf-mirage-imp', 2], ['und-bone-soldier', 2], ['und-crypt-warden', 2], ['spl-battle-banner', 2], ['spl-fortify', 1], ['spl-siege-fire', 1], ['spl-hush', 1]]);
const CROWN_RELICS = deck([['kng-battle-captain', 2], ['kng-paladin', 1], ['inf-blood-demon', 2], ['inf-infernal-lord', 1], ['und-vharos', 1], ['inf-runebreaker', 2], ['und-mira', 2], ['spl-war-cry', 2], ['spl-fortify', 1], ['spl-giants-bane', 1]]);
const IRON_RANK = deck([['kng-common-knight', 2], ['inf-pit-fiend', 2], ['kng-archer', 2], ['und-bone-soldier', 2], ['und-crypt-warden', 2], ['inf-cultist', 1], ['spl-power-surge', 2], ['spl-weakness', 2]]);
const BLOOD_ONSLAUGHT = deck([['kng-common-knight', 2], ['inf-blood-demon', 2], ['inf-pit-fiend', 2], ['inf-hellhound', 2], ['inf-runebreaker', 2], ['inf-infernal-lord', 1], ['und-vharos', 1], ['spl-power-surge', 2], ['spl-weakness', 1]]);

const rival = (id: string, name: string, cardIds: string[]): RankedRivalDeck => ({ id, name, cardIds });

export const RANKED_TIERS: readonly RankedTier[] = [
  { division: 'Bronze', blurb: 'Plain decks of Common Units and simple Spells.', decks: [rival('ashen-patrol', 'Ashen Patrol', ASHEN_PATROL), rival('road-raiders', 'Road Raiders', ROAD_RAIDERS), rival('border-militia', 'Border Militia', BORDER_MILITIA)] },
  { division: 'Silver', blurb: 'Built decks with a clear plan.', decks: [rival('knight-command', 'Knight Command', KNIGHT_COMMAND), rival('spellbreakers', 'Spellbreakers', SPELLBREAKERS), rival('hound-pack', 'Hound Pack', HOUND_PACK)] },
  { division: 'Gold', blurb: 'Faction synergy and trickier effects.', decks: [rival('kingdom-vanguard', 'Kingdom Vanguard', [...STARTER_DECKS.kingdom]), rival('grave-watch', 'Grave Watch', [...STARTER_DECKS.undead]), rival('moonlit-tricksters', 'Moonlit Tricksters', MOONLIT_TRICKSTERS), rival('crown-relics', 'Crown Relics', CROWN_RELICS)] },
  { division: 'Platinum', blurb: 'Tuned decks with strong Epics and Legendaries.', decks: [rival('ember-pact', 'Ember Pact', [...STARTER_DECKS.infernal]), rival('crown-relics', 'Crown Relics', CROWN_RELICS), rival('iron-rank', 'Iron Rank', IRON_RANK)] },
  { division: 'Diamond', blurb: 'Optimized decks with sharp synergies.', decks: [rival('iron-rank', 'Iron Rank', IRON_RANK), rival('ember-pact', 'Ember Pact', [...STARTER_DECKS.infernal]), rival('blood-onslaught', 'Blood Onslaught', BLOOD_ONSLAUGHT)] },
  { division: 'Master', blurb: 'The strongest decks in the game.', decks: [rival('blood-onslaught', 'Blood Onslaught', BLOOD_ONSLAUGHT), rival('iron-rank', 'Iron Rank', IRON_RANK)] },
];

export function tierFor(division: Division): RankedTier {
  return RANKED_TIERS.find((t) => t.division === division) ?? RANKED_TIERS[0];
}
