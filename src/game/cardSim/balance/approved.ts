import type { CardDefinition } from '../../types/index.js';
import { getCard as liveCard } from '../../cards/index.js';
import { BASE_RULES, type Rules } from '../engine.js';

// The card-combat baseline ozi approved on 2026-09-29, as simulator inputs:
//   - stat model H ('baseline'): ATK = 80 + 15 x (Power - 3) ± 6, HPC = 0.75 x (210 - ATK) + rarity HP, 45 HP per legacy point
//   - no overflow, a tie destroys both Units, each card returns from the Graveyard at most once per match
//   - Spells contribute no Starting HP (already true in the model)
//   - Power 7 Legendaries re-banded to Power 6
// Balance studies start from these and register their proposed card changes on top.

export const APPROVED_RULES: Rules = { ...BASE_RULES, recursionCap: 1 };

/** The approved Power 7 -> 6 re-band (Vharos, Infernal Lord), as simulator card overrides. */
export function approvedReband(): CardDefinition[] {
  return ['und-vharos', 'inf-infernal-lord'].map((id) => ({ ...liveCard(id), power: 6 }));
}
