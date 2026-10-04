import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OFFERS, type OfferId } from './definitions';
import { GROWTH_PACK_MIN_CLEARED_STAGES, isOfferEligible } from './eligibility';

const eligible = (clearedStages: number, openedPacks: boolean): OfferId[] =>
  OFFERS.filter((o) => isOfferEligible(o, { clearedStages, openedPacks })).map((o) => o.id);

describe('offer visibility uses current progression, not historical Mastery', () => {
  it('the Growth Pack appears after enough Campaign stages are cleared', () => {
    expect(eligible(0, true)).not.toContain('growth-pack');
    expect(eligible(GROWTH_PACK_MIN_CLEARED_STAGES - 1, true)).not.toContain('growth-pack');
    expect(eligible(GROWTH_PACK_MIN_CLEARED_STAGES, false)).toContain('growth-pack');
  });
  it('the Starter Pack and Gem bundles keep their pack-opened rule', () => {
    expect(eligible(0, false)).toEqual(['season-pass-preview']);
    expect(eligible(0, true)).toEqual(['starter-pack', 'gem-pack-small', 'gem-pack-medium', 'gem-pack-large', 'season-pass-preview']);
    expect(eligible(GROWTH_PACK_MIN_CLEARED_STAGES, false)).toContain('starter-pack');
  });
  it('neither offer surface reads Ascension (historical Mastery) state', () => {
    for (const rel of ['../../pages/ShopPage.tsx', '../../components/OffersSheet.tsx', './eligibility.ts']) {
      const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
      expect(src, rel).not.toMatch(/ascension\/|getAscensionRank|useAscension/);
      if (rel !== './eligibility.ts') expect(src, rel).toMatch(/isOfferEligible\(/);
    }
  });
});
