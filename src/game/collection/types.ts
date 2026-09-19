// Player collection model. Persisted as card id -> copies owned; card data (name, rarity, faction,
// effects) always comes from the card definitions, never from storage.

/** v2: Campaign card rewards became multi-copy, so v1 collections get a one-time top-up (see collectionMigration.ts). */
export const COLLECTION_VERSION = 2;

/** card id -> copies owned. Only ids with at least one copy appear. */
export type OwnedMap = Readonly<Record<string, number>>;

export interface PersistedCollection {
  version: number;
  owned: Record<string, number>;
}

export interface GrantResult {
  cardId: string;
  /** Copies added by this grant. */
  granted: number;
  /** Copies owned before / after. */
  previous: number;
  owned: number;
  /** True when this grant gave the player their first copy. */
  isNew: boolean;
}
