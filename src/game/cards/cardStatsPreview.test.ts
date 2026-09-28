import { describe, expect, it } from 'vitest';
import { getCard } from './index';
import { cardStatsPreview, deckLifePreview } from './cardStatsPreview';

describe('provisional ATK and LP card face values', () => {
  it('maps the existing Unit Power band to a bounded two-stat preview', () => {
    expect(cardStatsPreview(getCard('kng-light-priest'))).toEqual({ atk: 85, lp: 115 });
    expect(cardStatsPreview(getCard('kng-common-knight'))).toEqual({ atk: 130, lp: 85 });
    expect(cardStatsPreview(getCard('und-vharos'))).toEqual({ atk: 145, lp: 75 });
  });

  it('counts Unit LP only; Spells contribute zero to deck Life', () => {
    const cards = ['kng-light-priest', 'spl-fireball', 'kng-common-knight'].map(getCard);
    expect(cardStatsPreview(cards[1])).toBeNull();
    expect(deckLifePreview(cards)).toBe(200);
  });

  it('tracks a temporary effective ATK change without changing LP contribution', () => {
    expect(cardStatsPreview(getCard('kng-common-knight'), 7)).toEqual({ atk: 145, lp: 85 });
  });
});
