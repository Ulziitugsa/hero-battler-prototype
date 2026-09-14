import { STARTER_DECKS, STARTER_DECK_NAMES, type StarterFaction } from '../cards/starterDecks';
import { loadSavedDecks } from './localDecks';

export interface DeckOption {
  id: string;
  label: string;
  faction: StarterFaction;
  cardIds: string[];
}

const STARTER_FACTIONS: StarterFaction[] = ['kingdom', 'undead', 'infernal'];

/** Every deck the player can currently pick from: the 3 starters plus anything saved in the Deck Builder. */
export function listDeckOptions(): DeckOption[] {
  return [
    ...STARTER_FACTIONS.map((f) => ({ id: `starter-${f}`, label: STARTER_DECK_NAMES[f], faction: f, cardIds: STARTER_DECKS[f] })),
    ...loadSavedDecks().map((d) => ({ id: d.id, label: d.name, faction: d.faction, cardIds: d.cardIds })),
  ];
}

export function findDeckOption(id: string): DeckOption | undefined {
  return listDeckOptions().find((d) => d.id === id);
}
