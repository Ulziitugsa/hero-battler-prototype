import { beforeEach, describe, expect, it } from 'vitest';
import { claimRankReward, chooseRankedOpponent, getRanked, rankAt, readRanked, recordRankedMatch, resetRankedForTests } from './store';
import { listDeckOptions } from '../engine/deckOptions';
import { getActiveDeck } from '../engine/activeDeck';
beforeEach(() => { const values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});resetRankedForTests(); });
describe('ranked progression', () => {
  it('uses configured deterministic rating changes and clamps losses at zero', () => { expect(recordRankedMatch('win', 'AI').rating).toBe(24); expect(recordRankedMatch('loss', 'AI').rating).toBe(12); resetRankedForTests(); expect(recordRankedMatch('loss', 'AI').rating).toBe(0); });
  it('unlocks and pays a division reward once', () => { for (let i=0;i<5;i++) recordRankedMatch('win','AI'); expect(getRanked().peakRating).toBe(120); expect(claimRankReward('rating-100')).toBe(true); expect(claimRankReward('rating-100')).toBe(false); });
  it('maps rating and selects a configured AI deck', () => { expect(rankAt(100).division).toBe('Silver'); const player=getActiveDeck(); expect(chooseRankedOpponent(listDeckOptions(),player,100).cardIds.length).toBeGreaterThan(0); });
  it('persists rating and selects the closest average Hero Power', () => { recordRankedMatch('win','Trial',10); expect(readRanked().rating).toBe(24); const player={id:'p',label:'P',faction:'kingdom' as const,cardIds:['kng-light-priest']};const close={id:'c',label:'C',faction:'undead' as const,cardIds:['und-bone-soldier']};const far={id:'f',label:'F',faction:'infernal' as const,cardIds:['und-vharos']};expect(chooseRankedOpponent([close,far],player,0).id).toBe('c'); });
});
