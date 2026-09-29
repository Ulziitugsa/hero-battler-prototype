import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CollectibleCard } from './CollectibleCard';

const render = (props: Parameters<typeof CollectibleCard>[0]) => renderToStaticMarkup(createElement(CollectibleCard, props));

describe('CollectibleCard modes', () => {
  it('battle: ATK, HP Contribution, effect indicator and short name, no rules text', () => {
    const html = render({ cardId: 'kng-royal-guard', mode: 'battle' });
    expect(html).toContain('data-mode="battle"');
    expect(html).toContain('>113<');
    expect(html).toContain('>+77<');
    expect(html).toContain('collectible-effect-dot');
    expect(html).not.toContain('collectible-rule');
    expect(html).not.toContain('Adj+1');
  });

  it('standard: full name, rarity, faction and a player-facing effect summary', () => {
    const html = render({ cardId: 'kng-royal-guard', copies: 3 });
    expect(html).toContain('data-mode="standard"');
    expect(html).toContain('Royal Guard');
    expect(html).toContain('r-rare');
    expect(html).toContain('kingdom');
    expect(html).toContain('Adjacent allies +15 ATK');
    expect(html).toContain('×3');
  });

  it('inspect: type line and set footer; live Power shows buffed ATK', () => {
    const html = render({ cardId: 'kng-paladin', mode: 'inspect', livePower: 7 });
    expect(html).toContain('Unit · Tank');
    expect(html).toContain('collectible-number');
    expect(html).toContain('>134<');
    expect(html).toContain('atk up');
    expect(html).toContain('collectible-crest');
  });

  it('spells show their kind instead of stats; vanilla units say they have no effect', () => {
    expect(render({ cardId: 'spl-battle-banner' })).toContain('Continuous');
    expect(render({ cardId: 'spl-battle-banner' })).not.toContain('card-stats');
    expect(render({ cardId: 'kng-common-knight' })).toContain('No effect');
  });

  it('carries the treatment slot and legacy compact alias', () => {
    const html = render({ cardId: 'kng-archer', treatment: 'foil', compact: true });
    expect(html).toContain('data-treatment="foil"');
    expect(html).toContain('collectible-treatment');
    expect(html).toContain('data-mode="battle"');
    expect(render({ cardId: 'kng-archer' })).not.toContain('collectible-treatment');
  });
});
