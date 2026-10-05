import type { ArchetypeBoxId } from './launchRoster.js';

// The launch set's reference decks (second balance pass, unchanged by the final pass; project file
// moonwater/card-set-120/sim/second-pass/decklists.md). Every list is a legal 15-card deck (a test checks it):
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
  { id: 'vanguard', name: 'Vanguard', kind: 'optimized', archetype: 'vanguard', cards: [['kng-marshal-aldric', 1], ['kng-paladin', 1], ['kng-battle-captain', 2], ['kng-oathkeeper', 2], ['kng-royal-guard', 2], ['kng-knight-errant', 2], ['kng-common-knight', 2], ['kng-relic-warden', 2], ['spl-war-cry', 1]] },
  { id: 'bone-legion', name: 'Bone Legion', kind: 'optimized', archetype: 'bone-legion', cards: [['und-morwen', 1], ['und-vharos', 1], ['und-mira', 1], ['und-bone-dragon', 1], ['und-barrow-knight', 2], ['und-crypt-warden', 2], ['und-bone-soldier', 2], ['und-bonecaller', 1], ['und-cursed-warrior', 1], ['spl-grave-totem', 1], ['spl-raise-fallen', 1], ['spl-bone-wall', 1]] },
  { id: 'hellpack', name: 'Hellpack', kind: 'optimized', archetype: 'hellpack', cards: [['inf-cerberus', 1], ['inf-alpha-hound', 2], ['inf-brimstone-matriarch', 2], ['inf-packhound', 2], ['inf-hellhound', 2], ['inf-ash-jackal', 2], ['spl-call-the-pack', 2], ['spl-war-cry', 1], ['spl-weakness', 1]] },
  { id: 'arcane', name: 'Arcane', kind: 'optimized', archetype: 'arcane', cards: [['kng-archmage-vael', 1], ['kng-moonlit-savant', 2], ['kng-battlemage', 2], ['kng-apprentice-mage', 2], ['und-grave-sage', 1], ['kng-light-priest', 1], ['spl-mirror-image', 1], ['spl-arcane-barrier', 1], ['spl-spark', 2], ['spl-arcane-bolt', 2]] },
  { id: 'phantoms', name: 'Phantoms', kind: 'optimized', archetype: 'phantoms', cards: [['und-duchess-nyx', 1], ['und-wraith-prince', 2], ['und-banshee', 2], ['und-spectral-assassin', 2], ['und-shade-thief', 2], ['inf-mirage-imp', 1], ['spl-ghost-lantern', 2], ['spl-wall-of-flame', 2], ['spl-cursed-ground', 1]] },
  { id: 'hellfire', name: 'Hellfire', kind: 'optimized', archetype: 'hellfire', cards: [['inf-ignis', 1], ['inf-infernal-lord', 1], ['inf-hellfire-warlock', 2], ['inf-ember-witch', 2], ['inf-flame-imp', 2], ['inf-cinder-imp', 2], ['spl-siege-fire', 2], ['spl-inferno', 1], ['spl-arcane-bolt', 2]] },
  { id: 'crusade', name: 'Crusade', kind: 'optimized', archetype: 'crusade', cards: [['kng-saint-aveline', 1], ['kng-crusader-champion', 2], ['kng-standard-bearer', 2], ['kng-archer', 2], ['kng-banner-knight', 2], ['kng-light-priest', 1], ['spl-battle-banner', 2], ['spl-fortify', 1], ['spl-reliquary-blade', 1], ['spl-oath-blade', 1]] },
  { id: 'wither', name: 'Wither', kind: 'optimized', archetype: 'wither', cards: [['und-plague-mother', 1], ['und-grave-tyrant', 1], ['und-blightcaster', 2], ['und-withering-lich', 2], ['und-grave-knight', 2], ['und-rot-ghoul', 2], ['und-crypt-warden', 1], ['spl-stasis-field', 2], ['spl-enfeeble', 1], ['spl-death-wave', 1]] },
  { id: 'bloodbound', name: 'Bloodbound', kind: 'optimized', archetype: 'bloodbound', cards: [['inf-kathra', 1], ['inf-infernal-lord', 1], ['inf-blood-demon', 2], ['inf-blood-imp', 2], ['inf-pit-fiend', 2], ['inf-blood-thrall', 2], ['inf-soot-imp', 2], ['spl-blood-pact', 1], ['spl-flesh-altar', 1], ['spl-dark-ritual', 1]] },
  { id: 'vanguard-budget', name: 'Vanguard (budget)', kind: 'budget', archetype: 'vanguard', cards: [['kng-paladin', 1], ['kng-royal-guard', 2], ['kng-knight-errant', 2], ['kng-common-knight', 2], ['kng-shieldbearer', 2], ['kng-pikeman', 2], ['kng-relic-warden', 2], ['spl-war-cry', 1], ['spl-power-surge', 1]] },
  { id: 'sd-bone-legion', name: 'Bone Legion Structure Deck', kind: 'structure-deck', archetype: 'bone-legion', cards: [['und-bone-dragon', 1], ['und-barrow-knight', 2], ['und-bone-soldier', 2], ['und-cursed-warrior', 2], ['und-crypt-warden', 2], ['und-dark-priest', 2], ['und-bonecaller', 1], ['spl-grave-totem', 1], ['spl-raise-fallen', 2]] },
  { id: 'hellpack-budget', name: 'Hellpack (budget)', kind: 'budget', archetype: 'hellpack', cards: [['inf-hellhound', 2], ['inf-packhound', 2], ['inf-ash-jackal', 2], ['inf-cinder-jackal', 2], ['inf-pack-warden', 2], ['inf-brimstone-ogre', 2], ['spl-call-the-pack', 1], ['spl-weakness', 2]] },
  { id: 'arcane-budget', name: 'Arcane (budget)', kind: 'budget', archetype: 'arcane', cards: [['kng-apprentice-mage', 2], ['kng-battlemage', 2], ['und-grave-sage', 2], ['kng-light-priest', 1], ['kng-common-knight', 2], ['inf-brimstone-ogre', 1], ['spl-spark', 2], ['spl-arcane-bolt', 2], ['spl-power-surge', 1]] },
  { id: 'phantoms-budget', name: 'Phantoms (budget)', kind: 'budget', archetype: 'phantoms', cards: [['und-shade-thief', 2], ['und-spectral-assassin', 2], ['inf-mirage-imp', 2], ['und-crypt-warden', 2], ['und-night-courier', 2], ['spl-ghost-lantern', 2], ['spl-cursed-ground', 1], ['spl-hush', 2]] },
  { id: 'sd-hellfire', name: 'Hellfire Structure Deck', kind: 'structure-deck', archetype: 'hellfire', cards: [['inf-flame-herald', 2], ['inf-cinder-imp', 2], ['inf-pit-fiend', 2], ['inf-brimstone-ogre', 2], ['inf-ember-witch', 2], ['inf-hellhound', 1], ['spl-meteor', 1], ['spl-cinder-bolt', 2], ['spl-fireball', 1]] },
  { id: 'sd-crusade', name: 'Crusade Structure Deck', kind: 'structure-deck', archetype: 'crusade', cards: [['kng-banner-knight', 2], ['kng-standard-bearer', 2], ['kng-shieldbearer', 2], ['kng-common-knight', 2], ['kng-royal-guard', 1], ['kng-pikeman', 1], ['kng-paladin', 1], ['spl-reliquary-blade', 1], ['spl-battle-banner', 2], ['spl-power-surge', 1]] },
  { id: 'wither-budget', name: 'Wither (budget)', kind: 'budget', archetype: 'wither', cards: [['und-grave-knight', 2], ['und-rot-ghoul', 2], ['und-crypt-warden', 2], ['und-dark-priest', 2], ['und-ghoul-brute', 2], ['und-barrow-knight', 1], ['spl-stasis-field', 2], ['spl-enfeeble', 2]] },
  { id: 'bloodbound-budget', name: 'Bloodbound (budget)', kind: 'budget', archetype: 'bloodbound', cards: [['inf-pit-fiend', 2], ['inf-blood-imp', 2], ['inf-blood-thrall', 2], ['inf-cultist', 2], ['inf-hellhound', 2], ['inf-brimstone-ogre', 2], ['inf-soot-imp', 1], ['spl-weakness', 2]] },
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
