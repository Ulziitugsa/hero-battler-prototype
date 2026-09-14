import type { Rarity } from '../game/types';

// Shared between board zone cards and hand cards (Battle Screen v8) - the gem count per rarity tier,
// per the Embervale card frame spec (docs/design/DESIGN-SOURCE-OF-TRUTH.md section 6).
export const RARITY_GEMS: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 4 };
