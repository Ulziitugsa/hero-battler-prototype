import { describe, expect, it } from 'vitest';
import { getCard } from './index';
import { PLAYTEST_ROSTER } from './roster';

// UI/data coverage for the battlefield effect summary (mechanics foundation pass). There's no
// component-render test harness in this repo (no @testing-library/react, no jsdom environment - see
// vite.config.ts), so this verifies the data contract every battlefield chit renders from
// (BoardChit.tsx / SpellZoneChit.tsx: `card.boardText ? <footer with summary> : <bare name>`) rather
// than the actual DOM output. Manual verification of the rendered chit itself was done in-browser.

describe('boardText - short battlefield effect summaries', () => {
  it('a card with an ability carries a short boardText summary', () => {
    const card = getCard('und-bone-soldier');
    expect(card.boardText).toBe('Death:Return; +1/Grave card');
  });

  it('a vanilla card with no ability has no boardText - the UI falls back to a bare name, not a broken summary', () => {
    const card = getCard('kng-common-knight');
    expect(card.abilities).toEqual([]);
    expect(card.boardText).toBeUndefined();
  });

  it('every roster card that has at least one ability carries a boardText summary', () => {
    const missing = PLAYTEST_ROSTER.filter((id) => {
      const card = getCard(id);
      return card.abilities.length > 0 && !card.boardText;
    });
    expect(missing).toEqual([]);
  });

  it('boardText stays short enough to fit a battlefield chit - well under the full ability text length', () => {
    for (const id of PLAYTEST_ROSTER) {
      const card = getCard(id);
      if (!card.boardText) continue;
      expect(card.boardText.length).toBeLessThanOrEqual(30);
    }
  });
});
