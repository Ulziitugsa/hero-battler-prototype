import { buildStarterCollection } from '../collection/starterCollection';
import { readStoredCollection, sanitizeOwned, writeStoredCollection } from '../collection/persistence';
import { reloadCollection } from '../collection/collection';
import { COLLECTION_VERSION } from '../collection/types';
import { getDuplicatesSpent } from '../ascension/store';
import { findNode, loadProgress } from './progress';

/**
 * What a player who already first-cleared these stages is owed: starter cards plus every claimed card
 * reward (with its copy count), MINUS copies already spent on Ascension. The collection quantity is the
 * copies AVAILABLE (spending lowers it), so anything rebuilt from everything-ever-acquired must net the
 * spend out - otherwise a rebuilt or topped-up collection would refund duplicates that were already spent.
 */
function expectedFromProgress(): Record<string, number> {
  const owned: Record<string, number> = { ...buildStarterCollection() };
  for (const nodeId of loadProgress().firstClearClaimed) {
    const node = findNode(nodeId);
    const reward = node?.encounter?.firstClearReward ?? node?.reward;
    if (reward?.cardId) owned[reward.cardId] = (owned[reward.cardId] ?? 0) + (reward.count ?? 1);
  }
  for (const id of Object.keys(owned)) owned[id] = Math.max(0, owned[id] - getDuplicatesSpent(id));
  return owned;
}

/**
 * Startup migration for the collection. Saved decks, Campaign progress and the active-deck preference
 * are never modified here.
 *  - No usable collection: write the starter collection plus rewards for stages already first-cleared
 *    (the prototype's rewards were only visual, so existing progress must not be shortchanged).
 *  - Older collection (v1): one-time top-up. Rewards became multi-copy, so a player who cleared a stage
 *    when it gave 1 copy would otherwise be stuck short of a starter deck forever. Owned counts are only
 *    ever raised (max of what they have and what their cleared stages now give), then stamped v2.
 *  - Current version: untouched.
 */
export function migrateToRealCollection(): void {
  const stored = readStoredCollection();
  if (stored.status === 'ok' && stored.version >= COLLECTION_VERSION) return;
  const expected = expectedFromProgress();
  const base = stored.status === 'ok' ? stored.owned : {};
  const merged: Record<string, number> = { ...base };
  for (const [id, n] of Object.entries(expected)) merged[id] = Math.max(merged[id] ?? 0, n);
  writeStoredCollection(sanitizeOwned(merged));
  reloadCollection();
}
