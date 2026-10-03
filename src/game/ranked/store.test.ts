import { beforeEach, describe, expect, it } from 'vitest';
import { claimRankReward, chooseRankedOpponent, getRanked, rankAt, readRanked, recordRankedMatch, resetRankedForTests } from './store';
import { RANKED_TIERS, tierFor } from './tiers';
import { validateDeck } from '../engine/deckRules';
import { getHeroLevelState, setHeroLevel } from '../heroLevel/store';
beforeEach(() => { const values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});resetRankedForTests(); });
describe('ranked progression', () => {
  it('uses configured deterministic rating changes and clamps losses at zero', () => { expect(recordRankedMatch('win', 'AI').rating).toBe(24); expect(recordRankedMatch('loss', 'AI').rating).toBe(12); resetRankedForTests(); expect(recordRankedMatch('loss', 'AI').rating).toBe(0); });
  it('unlocks and pays a division reward once', () => { for (let i=0;i<5;i++) recordRankedMatch('win','AI'); expect(getRanked().peakRating).toBe(120); expect(claimRankReward('rating-100')).toBe(true); expect(claimRankReward('rating-100')).toBe(false); });
  it('maps rating to a division and its explicit tier deck pool', () => {
    expect(rankAt(100).division).toBe('Silver');
    const rival = chooseRankedOpponent({ rating: 100, wins: 0, losses: 0 });
    expect(rival.tier.division).toBe('Silver');
    expect(tierFor('Silver').decks.map((d) => d.id)).toContain(rival.deck.id);
    expect(Object.keys(rival).sort()).toEqual(['deck', 'tier']); // a deck list and its division: no Mastery stages
  });
  it('rotates through the tier pool and never reads the player (no Legacy Level, Power or progression)', () => {
    const before = [0, 1, 2, 3].map((n) => chooseRankedOpponent({ rating: 0, wins: n, losses: 0 }).deck.id);
    setHeroLevel('kng-royal-guard', 60);
    expect(getHeroLevelState().levels['kng-royal-guard']).toBe(60);
    const after = [0, 1, 2, 3].map((n) => chooseRankedOpponent({ rating: 0, wins: n, losses: 0 }).deck.id);
    expect(after).toEqual(before);
    expect(new Set(before).size).toBe(tierFor('Bronze').decks.length);
  });
  it('9. every tier deck is legal and no tier carries a Mastery stage or any other stat bonus', () => {
    for (const tier of RANKED_TIERS) for (const deck of tier.decks) expect(validateDeck(deck.cardIds)).toMatchObject({ valid: true });
    for (const tier of RANKED_TIERS) {
      expect(Object.keys(tier).sort(), tier.division).toEqual(['blurb', 'decks', 'division']);
      expect(tier.blurb, tier.division).not.toMatch(/Mastery/);
    }
    expect(RANKED_TIERS.map((t) => t.division)).toEqual(['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master']);
    recordRankedMatch('win', 'Trial', 10);
    expect(readRanked().rating).toBe(24);
  });
  it('no division repeats the rival lineup of the division below it (difficulty comes from decks, not stats)', () => {
    const lineup = (t: (typeof RANKED_TIERS)[number]) => t.decks.map((d) => d.id).sort().join(',');
    for (let i = 1; i < RANKED_TIERS.length; i++) expect(lineup(RANKED_TIERS[i]), RANKED_TIERS[i].division).not.toBe(lineup(RANKED_TIERS[i - 1]));
  });
});
