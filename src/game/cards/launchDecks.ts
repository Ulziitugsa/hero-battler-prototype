import type { ArchetypeBoxId } from './launchRoster.js';

// The launch set's reference decks. Every list is a legal 15-card deck (a test checks it). The optimized, budget and
// Structure Deck lists were rebuilt on 2026-10-09 by archetype-restricted search on the production resolver and card AI
// (scripts/measure-legendary-soup.mjs --only tune, two passes: against the old field, then against the first pass):
// each list keeps at least 11 (budget 10) of its archetype's own cards, takes the rest only from its faction's Core
// cards and neutral Core Spells, never holds another archetype's Legendary or an event card, and the Structure Decks
// keep their debut and featured cards. The starters are unchanged.
//   - starter: the free Core starter of each faction (STARTER_DECKS);
//   - optimized: the strongest list of each archetype, headline Legendary included (AI fixtures, playtest selection);
//   - budget: Commons, Rares and Core where possible (the low-rarity entry path of each archetype);
//   - structure-deck: the three Structure Decks as sold (structureDecks/definitions.ts reads these lists).
// They are fixtures for the AI, regression tests and dev / playtest deck selection, never balance claims: the matrices
// that measured them live in the study files.

export type LaunchDeckKind = 'starter' | 'optimized' | 'budget' | 'structure-deck';

export interface LaunchDeck {
  id: string;
  name: string;
  kind: LaunchDeckKind;
  archetype: ArchetypeBoxId | null;
  cards: readonly (readonly [string, number])[];
}

export const LAUNCH_DECKS: readonly LaunchDeck[] = [
  { id: 'kingdom-starter', name: 'Kingdom Starter', kind: 'starter', archetype: null, cards: [['kng-common-knight', 2], ['kng-archer', 2], ['kng-shieldbearer', 2], ['kng-royal-guard', 2], ['kng-light-priest', 2], ['kng-paladin', 1], ['spl-power-surge', 2], ['spl-battle-banner', 2]] },
  { id: 'undead-starter', name: 'Undead Starter', kind: 'starter', archetype: null, cards: [['und-bone-soldier', 2], ['und-cursed-warrior', 2], ['und-crypt-warden', 2], ['und-dark-priest', 2], ['und-ghoul-brute', 2], ['und-vharos', 1], ['und-grave-sexton', 1], ['spl-second-chance', 1], ['spl-raise-fallen', 2]] },
  { id: 'infernal-starter', name: 'Infernal Starter', kind: 'starter', archetype: null, cards: [['inf-flame-imp', 2], ['inf-cultist', 2], ['inf-pit-fiend', 2], ['inf-hellhound', 1], ['inf-brimstone-ogre', 2], ['inf-soot-imp', 1], ['inf-infernal-lord', 1], ['spl-weakness', 2], ['spl-fireball', 2]] },
  { id: 'vanguard', name: 'Vanguard', kind: 'optimized', archetype: 'vanguard', cards: [['kng-marshal-aldric', 1], ['kng-paladin', 1], ['kng-battle-captain', 2], ['kng-common-knight', 2], ['kng-knight-errant', 2], ['kng-royal-guard', 2], ['spl-consecrate', 2], ['spl-power-surge', 1], ['spl-war-cry', 2]] },
  { id: 'bone-legion', name: 'Bone Legion', kind: 'optimized', archetype: 'bone-legion', cards: [['und-morwen', 1], ['und-vharos', 1], ['und-bone-dragon', 2], ['und-bone-soldier', 2], ['und-dark-priest', 2], ['und-ghoul-brute', 1], ['und-grave-knight', 2], ['und-rot-ghoul', 2], ['spl-grave-totem', 2]] },
  { id: 'hellpack', name: 'Hellpack', kind: 'optimized', archetype: 'hellpack', cards: [['inf-cerberus', 1], ['inf-alpha-hound', 2], ['inf-ash-jackal', 2], ['inf-brimstone-matriarch', 1], ['inf-brimstone-ogre', 2], ['inf-hellhound', 2], ['inf-runebreaker', 2], ['spl-power-surge', 1], ['spl-war-cry', 2]] },
  { id: 'arcane', name: 'Arcane', kind: 'optimized', archetype: 'arcane', cards: [['kng-archmage-vael', 1], ['kng-apprentice-mage', 2], ['kng-battlemage', 2], ['kng-common-knight', 1], ['kng-moonlit-savant', 1], ['und-grave-sage', 1], ['spl-aegis-ward', 2], ['spl-arcane-bolt', 2], ['spl-mirror-image', 2], ['spl-weakness', 1]] },
  { id: 'phantoms', name: 'Phantoms', kind: 'optimized', archetype: 'phantoms', cards: [['und-duchess-nyx', 1], ['und-banshee', 2], ['und-bone-soldier', 2], ['und-dark-priest', 1], ['und-grave-sage', 1], ['und-shade-thief', 1], ['und-spectral-assassin', 2], ['und-wraith-prince', 2], ['spl-cursed-ground', 2], ['spl-weakness', 1]] },
  { id: 'hellfire', name: 'Hellfire', kind: 'optimized', archetype: 'hellfire', cards: [['inf-ignis', 1], ['inf-infernal-lord', 1], ['inf-ember-witch', 1], ['inf-flame-herald', 2], ['inf-hellfire-warlock', 1], ['inf-hellhound', 2], ['inf-pit-fiend', 2], ['spl-arcane-bolt', 2], ['spl-inferno', 2], ['spl-meteor', 1]] },
  { id: 'crusade', name: 'Crusade', kind: 'optimized', archetype: 'crusade', cards: [['kng-saint-aveline', 1], ['kng-banner-knight', 2], ['kng-common-knight', 1], ['kng-crusader-champion', 2], ['kng-knight-errant', 2], ['kng-royal-guard', 2], ['spl-consecrate', 1], ['spl-oath-blade', 2], ['spl-reliquary-blade', 2]] },
  { id: 'wither', name: 'Wither', kind: 'optimized', archetype: 'wither', cards: [['und-plague-mother', 1], ['und-blightcaster', 2], ['und-bone-soldier', 2], ['und-dark-priest', 1], ['und-grave-knight', 2], ['und-grave-sexton', 1], ['und-rot-ghoul', 2], ['und-withering-lich', 2], ['spl-cursed-ground', 2]] },
  { id: 'bloodbound', name: 'Bloodbound', kind: 'optimized', archetype: 'bloodbound', cards: [['inf-kathra', 1], ['inf-blood-demon', 2], ['inf-blood-imp', 2], ['inf-blood-thrall', 2], ['inf-hellhound', 2], ['inf-pit-fiend', 2], ['inf-soot-imp', 2], ['und-rot-ghoul', 2]] },
  { id: 'vanguard-budget', name: 'Vanguard (budget)', kind: 'budget', archetype: 'vanguard', cards: [['kng-paladin', 1], ['kng-common-knight', 2], ['kng-knight-errant', 2], ['kng-null-templar', 1], ['kng-royal-guard', 2], ['kng-spellbreaker', 2], ['spl-consecrate', 2], ['spl-power-surge', 1], ['spl-war-cry', 2]] },
  { id: 'sd-bone-legion', name: 'Bone Legion Structure Deck', kind: 'structure-deck', archetype: 'bone-legion', cards: [['und-barrow-knight', 2], ['und-bone-dragon', 1], ['und-bone-soldier', 2], ['und-cursed-warrior', 2], ['und-dark-priest', 1], ['und-grave-knight', 1], ['und-rattling-horde', 1], ['und-rot-ghoul', 2], ['spl-grave-totem', 1], ['spl-raise-fallen', 2]] },
  { id: 'hellpack-budget', name: 'Hellpack (budget)', kind: 'budget', archetype: 'hellpack', cards: [['inf-ash-jackal', 2], ['inf-blood-thrall', 2], ['inf-brimstone-ogre', 2], ['inf-hellhound', 2], ['inf-packhound', 2], ['inf-pit-fiend', 2], ['spl-war-cry', 2], ['spl-weakness', 1]] },
  { id: 'arcane-budget', name: 'Arcane (budget)', kind: 'budget', archetype: 'arcane', cards: [['kng-apprentice-mage', 2], ['kng-battlemage', 2], ['kng-common-knight', 2], ['kng-royal-guard', 2], ['und-grave-sage', 2], ['spl-arcane-bolt', 2], ['spl-consecrate', 2], ['spl-weakness', 1]] },
  { id: 'phantoms-budget', name: 'Phantoms (budget)', kind: 'budget', archetype: 'phantoms', cards: [['inf-mirage-imp', 2], ['und-bone-soldier', 2], ['und-dark-priest', 1], ['und-grave-sage', 2], ['und-shade-thief', 2], ['und-spectral-assassin', 2], ['spl-aegis-ward', 2], ['spl-cursed-ground', 2]] },
  { id: 'sd-hellfire', name: 'Hellfire Structure Deck', kind: 'structure-deck', archetype: 'hellfire', cards: [['inf-cinder-imp', 2], ['inf-ember-witch', 2], ['inf-flame-herald', 2], ['inf-hellfire-warlock', 1], ['inf-hellhound', 1], ['inf-pit-fiend', 2], ['spl-arcane-bolt', 2], ['spl-cinder-bolt', 1], ['spl-inferno', 1], ['spl-meteor', 1]] },
  { id: 'sd-crusade', name: 'Crusade Structure Deck', kind: 'structure-deck', archetype: 'crusade', cards: [['kng-paladin', 1], ['kng-archer', 1], ['kng-banner-knight', 2], ['kng-common-knight', 2], ['kng-crusader-champion', 1], ['kng-royal-guard', 2], ['kng-standard-bearer', 2], ['spl-battle-banner', 2], ['spl-reliquary-blade', 2]] },
  { id: 'wither-budget', name: 'Wither (budget)', kind: 'budget', archetype: 'wither', cards: [['und-bone-soldier', 2], ['und-dark-priest', 2], ['und-ghoul-brute', 2], ['und-grave-knight', 2], ['und-grave-sexton', 1], ['und-rot-ghoul', 2], ['spl-cursed-ground', 2], ['spl-enfeeble', 2]] },
  { id: 'bloodbound-budget', name: 'Bloodbound (budget)', kind: 'budget', archetype: 'bloodbound', cards: [['inf-blood-imp', 2], ['inf-blood-thrall', 2], ['inf-brimstone-ogre', 2], ['inf-cultist', 1], ['inf-hellhound', 2], ['inf-pit-fiend', 2], ['inf-soot-imp', 1], ['und-rot-ghoul', 2], ['spl-power-surge', 1]] },
];

/** A deck as a flat list of 15 card ids (copies repeated). */
export function launchDeckList(deck: LaunchDeck): string[] {
  return deck.cards.flatMap(([id, n]) => Array.from({ length: n }, () => id));
}

export function getLaunchDeck(id: string): LaunchDeck {
  const deck = LAUNCH_DECKS.find((d) => d.id === id);
  if (!deck) throw new Error(`Unknown launch deck: ${id}`);
  return deck;
}
