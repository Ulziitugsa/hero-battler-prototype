import type { CombatModelId, GameState } from '../types/index.js';
import { CARD_RESOLVER_VERSION } from '../cardCombat/engine.js';

// Resolver identity for a match: which engine created it and at which version. Stored in the match state itself
// (GameState.combatModel + GameState.cardCombat.version), so Friendly Battle, replays and match history read it from
// the record, never from a date. Pure and dependency-free so api/ (Friendly Battle's server) can import it.

/** The legacy resolver predates explicit versions; its matches read as version 1. */
export const LEGACY_RESOLVER_VERSION = 1;
export { CARD_RESOLVER_VERSION };

export interface MatchResolver {
  combatModel: CombatModelId;
  resolverVersion: number;
}

/** The resolver that created a match. A state with no combatModel is a legacy match (every match before card combat). */
export function matchResolver(state: Pick<GameState, 'combatModel' | 'cardCombat'>): MatchResolver {
  const combatModel = state.combatModel ?? 'legacy';
  if (combatModel === 'card') return { combatModel, resolverVersion: state.cardCombat?.version ?? 0 };
  return { combatModel, resolverVersion: LEGACY_RESOLVER_VERSION };
}

/** True when this build's card resolver can continue a card match (same model, same version). */
export function isCurrentCardResolver(state: Pick<GameState, 'combatModel' | 'cardCombat'>): boolean {
  const r = matchResolver(state);
  return r.combatModel === 'card' && r.resolverVersion === CARD_RESOLVER_VERSION;
}

/** The rules this build plays new matches with. Friendly Battle clients send it with their deck; the server builds a match
 * only when both players and the server agree on it (api/create-match.ts). */
export const PRODUCTION_RULES: MatchResolver = { combatModel: 'card', resolverVersion: CARD_RESOLVER_VERSION };

/** True when a client's declared rules match this build's. A client that declares nothing predates versioning. */
export function sameRules(declared: Partial<MatchResolver> | null | undefined, current: MatchResolver = PRODUCTION_RULES): boolean {
  return !!declared && declared.combatModel === current.combatModel && declared.resolverVersion === current.resolverVersion;
}
