import { heldCoreFactions } from '../core/coreAccess';
import { withCorePackages } from '../core/corePackages';
import type { OwnedMap } from './types';

/**
 * The deterministic collection a profile begins with: the Core packages it holds (core/coreAccess.ts). A new account
 * holds the Kingdom package provisionally until it picks its starter faction, which swaps that package for the chosen
 * one; the other two packages unlock in the Campaign. Every package contains its faction's whole starter deck.
 */
export function buildStarterCollection(): OwnedMap {
  return withCorePackages({}, heldCoreFactions());
}
