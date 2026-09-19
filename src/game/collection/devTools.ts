import { grantCard, removeCard, resetCollection, setAllOwned, getCollection } from './collection';

// DEV ONLY - attached to window.skyloomDev by main.tsx behind import.meta.env.DEV, so it never ships.
// e.g. skyloomDev.grant('und-mira'), skyloomDev.setAllOwned(), skyloomDev.reset().
export const devTools = {
  grant: (cardId: string, count = 1) => grantCard(cardId, count),
  remove: (cardId: string, count = 1) => removeCard(cardId, count),
  setAllOwned: (copies = 2) => setAllOwned(copies),
  reset: () => resetCollection(),
  get: () => getCollection(),
};
