import { buildStarterCollection } from '../collection/starterCollection';
import { readStoredCollection, sanitizeOwned, writeStoredCollection } from '../collection/persistence';
import { reloadCollection } from '../collection/collection';
import { findNode, loadProgress } from './progress';

/**
 * One-time move from the prototype (where card rewards were only visual) to a real collection. Runs at
 * startup; does nothing when a usable collection already exists. When there is none it writes the
 * starter collection plus the card rewards for every stage the player had ALREADY first-cleared, so
 * existing Campaign progress isn't shortchanged. Saved decks, Campaign progress and the active-deck
 * preference are never modified here.
 */
export function migrateToRealCollection(): void {
  if (readStoredCollection().status === 'ok') return;
  const owned: Record<string, number> = { ...buildStarterCollection() };
  for (const nodeId of loadProgress().firstClearClaimed) {
    const node = findNode(nodeId);
    const cardId = node?.encounter?.firstClearReward.cardId ?? node?.reward?.cardId;
    if (cardId) owned[cardId] = (owned[cardId] ?? 0) + 1;
  }
  writeStoredCollection(sanitizeOwned(owned));
  reloadCollection();
}
