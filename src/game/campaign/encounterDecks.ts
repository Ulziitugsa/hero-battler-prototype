import { STARTER_DECKS } from '../cards/starterDecks';

const pairs = (...ids: string[]) => ids.flatMap(id => [id, id]);
/** Legal decks built around a lesson, with the legendary reserved for the final encounter. */
export const ENCOUNTER_DECKS: Record<string, string[]> = {
  patrol: [...pairs('und-bone-soldier', 'und-cursed-warrior', 'kng-common-knight', 'kng-archer', 'spl-power-surge', 'spl-weakness', 'spl-second-chance'), 'spl-fireball'],
  crossing: [...pairs('und-bone-soldier', 'und-cursed-warrior', 'und-dark-priest', 'kng-common-knight', 'spl-weakness', 'spl-second-chance', 'spl-power-surge'), 'spl-fireball'],
  ford: [...pairs('und-bone-soldier', 'und-cursed-warrior', 'und-dark-priest', 'und-grave-knight', 'spl-grave-totem', 'spl-cursed-ground', 'spl-second-chance'), 'spl-raise-fallen'],
  orchard: [...pairs('und-bone-soldier', 'und-cursed-warrior', 'und-grave-knight', 'kng-archer', 'spl-power-surge', 'spl-battle-banner', 'spl-cursed-ground'), 'spl-second-chance'],
  chapel: [...pairs('und-bone-soldier', 'und-dark-priest', 'und-grave-knight', 'und-cursed-warrior', 'spl-second-chance', 'spl-grave-totem', 'spl-raise-fallen'), 'spl-cursed-ground'],
  mira: [...pairs('und-bone-soldier', 'und-cursed-warrior', 'und-dark-priest', 'und-mira', 'spl-grave-totem', 'spl-second-chance', 'spl-raise-fallen'), 'und-grave-knight'],
  vanguard: [...pairs('und-bone-soldier', 'und-dark-priest', 'und-grave-knight', 'und-mira', 'spl-cursed-ground', 'spl-grave-totem', 'spl-raise-fallen'), 'spl-second-chance'],
  tyrant: [...STARTER_DECKS.undead],
};

const NODE_DECK: Record<string, string> = {
  'battle-broken-palisade': 'patrol', 'battle-dust-crossing': 'crossing',
  'battle-ford-of-ash': 'ford', 'challenge-toll-of-the-ford': 'ford',
  'battle-grey-orchard': 'orchard', 'battle-chapel-of-dust': 'chapel',
  'elite-mira-grave-warden': 'mira', 'battle-barrow-steps': 'vanguard', 'boss-grave-tyrant': 'tyrant',
};
export function campaignEnemyDeck(nodeId: string): string[] | undefined {
  return ENCOUNTER_DECKS[NODE_DECK[nodeId]];
}
