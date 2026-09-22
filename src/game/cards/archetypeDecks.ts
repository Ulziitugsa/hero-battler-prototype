import { validateDeck } from '../engine/deckRules';

// Reference decks for the card-pool expansion's archetypes. They are NOT wired into the Battle Setup
// screen or the Campaign (those still use the three faction starters) - they exist to (a) prove each
// archetype can be built into a legal 15-card deck from the roster, (b) drive the AI-vs-AI sweep in
// engine/aiSweep.test.ts, and (c) serve as worked deckbuilding examples for docs/game/ARCHETYPES.md.
// Every deck deliberately mixes factions: archetype is a strategy, faction is only flavour.

function expand(entries: [string, number][]): string[] {
  const list: string[] = [];
  for (const [cardId, count] of entries) for (let i = 0; i < count; i++) list.push(cardId);
  return list;
}

export type ArchetypeDeckId = 'mage' | 'mage-slayer' | 'beast' | 'trickster' | 'general';

/** Spell-centric control: cheap triggers on Heroes, chip damage, wards and stalls, closed out by Archmage Vael. */
const MAGE: string[] = expand([
  ['kng-apprentice-mage', 2],
  ['und-grave-sage', 2],
  ['kng-archmage-vael', 1],
  ['kng-royal-guard', 2],
  ['spl-arcane-bolt', 2],
  ['spl-aegis-ward', 2],
  ['spl-stasis-field', 2],
  ['spl-ward-circle', 1],
  ['spl-weakness', 1],
]);

/** Anti-Spell: Knights that punish and shrug off Spells, backed by Continuous-Spell removal. */
const MAGE_SLAYER: string[] = expand([
  ['kng-spellbreaker', 2],
  ['kng-null-templar', 2],
  ['inf-runebreaker', 2],
  ['kng-common-knight', 2],
  ['kng-royal-guard', 2],
  ['kng-paladin', 1],
  ['spl-dispel', 2],
  ['spl-battle-banner', 1],
  ['spl-power-surge', 1],
]);

/** Board presence: a pack that grows with its neighbours and refills its own lanes. */
const BEAST: string[] = expand([
  ['inf-ash-jackal', 2],
  ['inf-packhound', 2],
  ['inf-alpha-hound', 2],
  ['inf-hellhound', 2],
  ['inf-flame-imp', 2],
  ['inf-cultist', 1],
  ['spl-weakness', 1],
  ['spl-fireball', 1],
  ['spl-blood-pact', 1],
  ['spl-siege-fire', 1],
]);

/** Bypass attackers that need a Continuous Spell up, plus the Continuous Spells to keep it there. */
const TRICKSTER: string[] = expand([
  ['und-shade-thief', 2],
  ['und-wraith-prince', 2],
  ['inf-mirage-imp', 2],
  ['und-bone-soldier', 2],
  ['und-crypt-warden', 2],
  ['spl-battle-banner', 2],
  ['spl-fortify', 1],
  ['spl-siege-fire', 1],
  ['spl-hush', 1],
]);

/** No archetype: strong general cards across all three factions. */
const GENERAL: string[] = expand([
  ['kng-common-knight', 2],
  ['und-crypt-warden', 2],
  ['inf-pit-fiend', 2],
  ['und-grave-knight', 2],
  ['inf-blood-demon', 1],
  ['und-mira', 1],
  ['spl-giants-bane', 1],
  ['spl-blood-pact', 1],
  ['spl-hush', 1],
  ['spl-weakness', 1],
  ['spl-power-surge', 1],
]);

export const ARCHETYPE_DECKS: Record<ArchetypeDeckId, string[]> = {
  mage: MAGE,
  'mage-slayer': MAGE_SLAYER,
  beast: BEAST,
  trickster: TRICKSTER,
  general: GENERAL,
};

export const ARCHETYPE_DECK_NAMES: Record<ArchetypeDeckId, string> = {
  mage: 'Arcane Control',
  'mage-slayer': 'Mage Slayers',
  beast: 'Beast Pack',
  trickster: 'Tricksters',
  general: 'General Goodstuff',
};

for (const [id, deck] of Object.entries(ARCHETYPE_DECKS)) {
  const result = validateDeck(deck);
  if (!result.valid) throw new Error(`${id} archetype deck is invalid: ${result.errors.join(', ')}`);
}
