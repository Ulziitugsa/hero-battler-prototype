// Player collection model. Persisted as card id -> copies owned; card data (name, rarity, faction,
// effects) always comes from the card definitions, never from storage.

export const COLLECTION_VERSION = 1;

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
