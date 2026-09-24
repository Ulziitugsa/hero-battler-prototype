import type { GrantResult } from '../collection/types';
import type { Rarity } from '../types';
import { getPool } from './pool';
import { highestRarityOf, type SummonPull, type SummonSuccess } from './summon';

// DEV-ONLY visual test mode. Builds a SYNTHETIC outcome for the reveal presentation so every rarity /
// featured / 10x case can be inspected on demand. It touches nothing: no Gems spent, no cards granted, no
// pity or history written, and it never changes real rates. (The Summon page only offers it when
// import.meta.env.DEV; production builds don't reach it.)

export type PreviewScenario = 'common' | 'rare' | 'epic' | 'legendary' | 'featured-legendary' | 'ten-common' | 'ten-rare' | 'ten-epic' | 'ten-legendary' | 'ten-multi';

export const PREVIEW_SCENARIOS: { id: PreviewScenario; label: string }[] = [
  { id: 'common', label: 'Common' },
  { id: 'rare', label: 'Rare' },
  { id: 'epic', label: 'Epic' },
  { id: 'legendary', label: 'Legendary' },
  { id: 'featured-legendary', label: 'Featured Legendary' },
  { id: 'ten-common', label: '10x low' },
  { id: 'ten-rare', label: '10x Rare' },
  { id: 'ten-epic', label: '10x Epic' },
  { id: 'ten-legendary', label: '10x Legendary' },
  { id: 'ten-multi', label: '10x multi' },
];

const TEN: Record<string, Rarity[]> = {
  'ten-common': ['common', 'common', 'common', 'rare', 'common', 'common', 'common', 'rare', 'common', 'common'],
  'ten-rare': ['common', 'rare', 'common', 'common', 'rare', 'common', 'rare', 'common', 'common', 'common'],
  'ten-epic': ['common', 'common', 'rare', 'common', 'common', 'epic', 'common', 'rare', 'common', 'common'],
  'ten-legendary': ['common', 'common', 'rare', 'common', 'common', 'legendary', 'common', 'epic', 'common', 'rare'],
  'ten-multi': ['common', 'epic', 'rare', 'legendary', 'common', 'common', 'epic', 'common', 'rare', 'common'],
};

export function buildPreviewOutcome(bannerId: string, scenario: PreviewScenario): SummonSuccess {
  const pool = getPool(bannerId);
  const rarities: Rarity[] = scenario.startsWith('ten-') ? TEN[scenario] : [scenario === 'featured-legendary' ? 'legendary' : (scenario as Rarity)];
  const counters: Partial<Record<Rarity, number>> = {};
  const pulls: SummonPull[] = rarities.map((rarity, i) => {
    let entries = pool.entries.filter((e) => e.rarity === rarity);
    if (scenario === 'featured-legendary') entries = entries.filter((e) => e.featured === 'main');
    if (entries.length === 0) entries = [...pool.entries];
    const n = counters[rarity] ?? 0;
    counters[rarity] = n + 1;
    const entry = entries[n % entries.length];
    const owned = (i % 3) + 1; // deterministic mix of New (1) and duplicates (2, 3)
    const grant: GrantResult = { cardId: entry.cardId, granted: 1, previous: owned - 1, owned, isNew: owned === 1 };
    return { cardId: entry.cardId, rarity: entry.rarity, featured: entry.featured, pityBefore: 0, pityAfter: 0, pityTriggered: false, grant, ascensionAvailable: !grant.isNew && i % 2 === 0 };
  });
  return { ok: true, kind: pulls.length === 1 ? 'single' : 'ten', bannerId, seed: 0, currency: 'gems', cost: 0, pulls, pityBefore: 0, pityAfter: 0, highestRarity: highestRarityOf(pulls.map((p) => p.rarity)), starterProgress: [] };
}
