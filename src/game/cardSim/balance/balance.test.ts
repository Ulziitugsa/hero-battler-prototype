import { describe, expect, it } from 'vitest';
import { getCard as liveCard } from '../../cards';
import { getCard, registerSimCards, withSimCards } from '../cardSource';
import { getStatModel } from '../statModels';
import { approvedReband } from './approved';
import { aliasModel, powerVariant, reworkCard, vanillaVariant } from './powerAudit';
import { PACKAGES, SINGLE_CANDIDATES, THREAD_C_PACKAGE } from './threadC';

describe('balance study card overrides', () => {
  it('overrides a card for the simulator only and restores it afterwards', () => {
    const live = liveCard('und-vharos');
    withSimCards(approvedReband(), () => {
      expect(getCard('und-vharos').power).toBe(6);
      expect(getCard('inf-infernal-lord').power).toBe(6);
      expect(liveCard('und-vharos')).toBe(live);
    });
    expect(getCard('und-vharos')).toBe(live);
    expect(live.power).toBe(7);
  });

  it('prices a study variant with its live card’s per-card offset', () => {
    const model = aliasModel(getStatModel('baseline'));
    const live = model.stats(liveCard('inf-hellhound'));
    expect(model.stats(vanillaVariant('inf-hellhound'))).toEqual(live);
    expect(model.stats(powerVariant('inf-hellhound', -1)).atk).toBe(live.atk - 15);
  });

  it('reworks abilities by index and can clear them', () => {
    expect(reworkCard('inf-blood-demon', { abilities: [] }).abilities).toEqual([]);
    const captain = reworkCard('kng-battle-captain', { replace: { 1: null } });
    expect(captain.abilities).toHaveLength(1);
    expect(captain.id).toBe('kng-battle-captain');
  });

  it('builds every candidate from live ids without leaving overrides registered', () => {
    for (const c of [...SINGLE_CANDIDATES, ...PACKAGES]) {
      const cards = c.cards();
      for (const card of cards) expect(() => liveCard(card.id), c.id).not.toThrow();
      registerSimCards(cards)();
    }
    expect(getCard('kng-battle-captain')).toBe(liveCard('kng-battle-captain'));
    expect(THREAD_C_PACKAGE.cards().map((c) => c.id)).toEqual(['kng-battle-captain']);
  });
});
