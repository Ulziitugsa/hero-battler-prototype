import { STARTER_DECKS } from '../cards/starterDecks';

// Campaign encounter decks for card combat (ATK + HP Contribution, docs/CARD-COMBAT-DESIGN.md). Every deck is a legal
// 15-card deck (2 copies, 1 Legendary, at least 8 Units) built from roster cards, so its Starting HP is simply its own
// Units' HP Contributions: no stat multipliers, no hidden bonuses. Difficulty comes from deck composition: early decks
// are plain, low-ATK Commons with few Spells; mid decks add Spells, Continuous Spells, Guard and conditional effects;
// late decks are synergy-heavy Undead Graveyard decks; the boss plays the full Undead starter, Vharos included, behind
// a boss HP pool (chapter1.ts). Re-simulated on the production resolver: scripts/simulate-modes.mjs.

const deck = (entries: [string, number][]): string[] => entries.flatMap(([id, n]) => Array.from({ length: n }, () => id));

export const ENCOUNTER_DECKS: Record<string, string[]> = {
  // Lesson: Unit placement. Low-ATK Commons (76-99 ATK), 9 Units, a few simple Spells.
  patrol: deck([['und-bone-soldier', 2], ['und-cursed-warrior', 2], ['inf-cultist', 2], ['inf-flame-imp', 2], ['und-shade-thief', 1], ['spl-power-surge', 2], ['spl-weakness', 2], ['spl-hush', 2]]),
  // Lesson: Spells. Same plain bodies, more one-time Spells that swing a clash.
  crossing: deck([['und-bone-soldier', 2], ['und-cursed-warrior', 2], ['und-shade-thief', 2], ['kng-archer', 2], ['inf-cultist', 1], ['spl-power-surge', 2], ['spl-weakness', 2], ['spl-aegis-ward', 1], ['spl-hush', 1]]),
  // Lesson: Continuous Spells. Grave Totem and Cursed Ground stay on the board; Guard appears (Crypt Warden, Dark Priest).
  ford: deck([['und-bone-soldier', 2], ['und-cursed-warrior', 2], ['und-crypt-warden', 2], ['und-shade-thief', 2], ['und-dark-priest', 2], ['spl-grave-totem', 1], ['spl-cursed-ground', 2], ['spl-power-surge', 1], ['spl-second-chance', 1]]),
  // Lesson: Clash Damage. High-ATK Common Knights and Battle Banners: a lost clash costs the difference.
  orchard: deck([['und-bone-soldier', 2], ['und-cursed-warrior', 2], ['und-grave-knight', 2], ['kng-common-knight', 2], ['und-crypt-warden', 1], ['spl-power-surge', 2], ['spl-battle-banner', 2], ['spl-cursed-ground', 2]]),
  // Lesson: conditional effects. Guard, Graveyard thresholds and Grave Knight's Enemy Falls heal.
  chapel: deck([['und-bone-soldier', 2], ['und-dark-priest', 2], ['und-grave-knight', 2], ['und-cursed-warrior', 2], ['und-crypt-warden', 2], ['spl-second-chance', 2], ['spl-grave-totem', 1], ['spl-cursed-ground', 2]]),
  // Elite. Lesson: Graveyard synergy. Mira and Grave Sage pull cards back; Raise Fallen revives.
  mira: deck([['und-bone-soldier', 2], ['und-cursed-warrior', 2], ['und-dark-priest', 2], ['und-mira', 2], ['und-grave-knight', 2], ['und-grave-sage', 1], ['spl-grave-totem', 1], ['spl-second-chance', 2], ['spl-raise-fallen', 1]]),
  // Lesson: archetype synergy. A tuned Undead Graveyard deck: Guard, recursion and Cursed Ground growth together.
  vanguard: deck([['und-bone-soldier', 2], ['und-dark-priest', 2], ['und-grave-knight', 2], ['und-mira', 2], ['und-crypt-warden', 2], ['und-grave-sage', 1], ['spl-cursed-ground', 2], ['spl-raise-fallen', 1], ['spl-second-chance', 1]]),
  // Boss: the full Undead starter, Vharos included, behind the boss HP pool set on the node.
  tyrant: [...STARTER_DECKS.undead],
};

const NODE_DECK: Record<string, string> = {
  'battle-broken-palisade': 'patrol', 'battle-dust-crossing': 'crossing',
  'battle-ford-of-ash': 'ford', 'challenge-toll-of-the-ford': 'orchard',
  'battle-grey-orchard': 'orchard', 'battle-chapel-of-dust': 'chapel',
  'elite-mira-grave-warden': 'mira', 'battle-barrow-steps': 'vanguard', 'boss-grave-tyrant': 'tyrant',
};
export function campaignEnemyDeck(nodeId: string): string[] | undefined {
  return ENCOUNTER_DECKS[NODE_DECK[nodeId]];
}
