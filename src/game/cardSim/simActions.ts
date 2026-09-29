import type { AbilityDefinition, ActionDef, ConditionDef, TargetScope, Trigger } from '../types/index.js';

// Sim-only effect primitives proposed by the effect/archetype balance pass (docs/CARD-COMBAT-DESIGN.md).
// They are not part of the live ActionDef union: the simulator's engine handles them in a separate branch,
// and card patches (overrides.ts) attach them to cards for an experiment. A primitive graduates into
// types/index.ts and the production resolver only once its card change is approved.

export type SimAction =
  /** The enemy Unit in the target lane deals no damage this round: no clash and no direct hit. */
  | { type: 'PACIFY'; target: TargetScope }
  /** Prevent up to `amount` legacy HP points (x the model's hpUnit) of damage to your player this round. */
  | { type: 'PLAYER_SHIELD'; amount: number };

export const SIM_ACTION_TYPES = new Set<string>(['PACIFY', 'PLAYER_SHIELD']);

/** The action as a sim-only primitive, or null for a live ActionDef. */
export function asSimAction(action: ActionDef | SimAction): SimAction | null {
  return SIM_ACTION_TYPES.has(action.type) ? (action as SimAction) : null;
}

/** Builds an ability whose actions may include sim-only primitives. */
export function simAbility(spec: { trigger: Trigger; actions: (ActionDef | SimAction)[]; conditions?: ConditionDef[]; oncePerRound?: boolean; text: string }): AbilityDefinition {
  return spec as unknown as AbilityDefinition;
}
