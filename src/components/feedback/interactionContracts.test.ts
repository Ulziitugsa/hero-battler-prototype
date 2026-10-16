/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RevealStage } from '../reveal/RevealStage';
import { HandCard } from '../HandCard';
import { CardInspect } from '../card/CardInspect';
import { buildPackTimeline, planPackReveal, viewAt } from '../../game/reveal/sequence';
import { pullRevealOutcome } from '../../game/reveal/outcome';
import { revealFixtureBoxName, revealFixturePulls } from '../../game/reveal/fixtures';
import { getCard } from '../../game/cards';
import { STARTER_DECKS } from '../../game/cards/starterDecks';

// Polish Pass 4: interaction and animation refinement.

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const reducedBlock = (css: string) => css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));

describe('the Box ceremony builds up to its stage cards instead of pausing on an empty sky', () => {
  const pulls = revealFixturePulls('ten');
  const outcome = pullRevealOutcome(revealFixtureBoxName(), pulls);
  const rarities = outcome.cards.map((c) => c.rarity);
  const plan = planPackReveal(rarities);
  const timeline = buildPackTimeline(rarities);
  const render = (index: number) =>
    renderToStaticMarkup(createElement(RevealStage, { outcome, plan, view: viewAt(timeline, index), onAdvance: () => {}, onSkip: () => {}, onIntroFinished: () => {} }));

  it('the headline card is on the stage, sealed, from its telegraph and through the seal breaking', () => {
    const headline = timeline.findIndex((s) => s.headline && s.phase === 'telegraph');
    expect(headline).toBeGreaterThan(0);
    const tier = timeline[headline].tier;
    const telegraph = render(headline);
    expect(telegraph).toContain('class="rc rc-telegraph');
    expect(telegraph).toContain(tier === 'legendary' ? '>A Legendary card rises<' : '>An Epic card rises<');
    const opening = timeline.findIndex((s, i) => i > headline && s.headline && s.phase === 'opening');
    if (opening > 0) expect(render(opening)).toContain('class="rc rc-opening');
  });

  it('the ceremony itself is no longer: the timeline is untouched (the build-up fills existing beats)', () => {
    // The same rarities give the same steps and durations as before Pass 4 (sequence.ts is not changed by it).
    expect(timeline.map((s) => s.phase).filter((p) => p === 'telegraph').length).toBeGreaterThan(1);
    const css = read('../reveal/moonwellArrival.css');
    for (const kf of ['rc-gather', 'rc-tremble', 'rc-rise-in', 'rc-charge', 'rc-charge-hot']) expect(css).toContain(`@keyframes ${kf}`);
    expect(reducedBlock(css)).toMatch(/\.rc-telegraph, \.rc-opening, \.rc-emerge\)[\s\S]*animation: none/);
  });
});

describe('battle cards are dragged with the pointer, not HTML drag-and-drop', () => {
  it('a hand card is no longer an HTML draggable (on a phone that starts only on long press, which inspects)', () => {
    const html = renderToStaticMarkup(
      createElement(HandCard, { hand: { handId: 'h1', cardId: STARTER_DECKS.kingdom[0] } as never, selected: false, style: {}, onSelect: () => {}, onInspect: () => {}, onDragStart: () => {}, onDragEnd: () => {} }),
    );
    expect(html).not.toContain('draggable');
    expect(html).toContain('class="hand-card card-face');
  });
  it('the hand takes the gesture, the left-behind card fades and the slot under the finger answers', () => {
    const css = read('../../styles/feedback/battle.css');
    expect(css).toContain('.hand-fan .hand-card { touch-action: none; }');
    expect(css).toMatch(/\.hand-drag-ghost \{[^}]*pointer-events: none/);
    expect(css).toContain('.battle-zone.targetable.drag-over');
  });
  it('the Clash Damage beat marks the beaten and the winning Unit, and stops easing under reduced motion', () => {
    const css = read('../../styles/feedback/battle.css');
    expect(css).toMatch(/\.zone-card\.chit-beaten \{[^}]*filter/);
    expect(reducedBlock(css)).toContain('.zone-card.chit-victor { transition: none; }');
  });
});

describe('Card Inspect picks the card up', () => {
  it('the card wears its rarity in the inspect frame, keyed so paging replays the entrance', () => {
    const id = STARTER_DECKS.kingdom.find((c) => getCard(c).rarity !== 'common')!;
    const html = renderToStaticMarkup(createElement(CardInspect, { cardId: id, onClose: () => {}, battle: { owner: 'player', rules: 'card', atk: 1, hpContribution: 1 } as never }));
    expect(html).toContain(`class="hr-sheet-frame hr-sheet-card ci-presence mw-rarity mw-rarity-static" data-rarity="${getCard(id).rarity}"`);
  });
  it('the entrance is short, and off under reduced motion', () => {
    const css = read('../../styles/cardInspect.css');
    expect(css).toMatch(/\.card-inspect \.ci-presence \{ animation: ci-card-rise 300ms/);
    expect(reducedBlock(css)).toContain('.hr-sheet.card-inspect .ci-presence,');
  });
});
