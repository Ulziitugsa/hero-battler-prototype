/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { easeOutCubic, tweenValue } from './useCountUp';
import { LOADING_LINES } from '../loadingCopy';
import { fightBanner, roundBanner } from '../battle/bannerSpecs';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const feedbackCss = ['tokens', 'press', 'motion', 'rarity', 'rewards', 'nav', 'battle'].map((name) => [name, read(`../../styles/feedback/${name}.css`)] as const);

describe('count-up', () => {
  it('eases out and lands exactly on both ends', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(tweenValue(100, 200, 0)).toBe(100);
    expect(tweenValue(100, 200, 1)).toBe(200);
    expect(tweenValue(100, 200, 2)).toBe(200);
    expect(Number.isInteger(tweenValue(0, 77, 0.37))).toBe(true);
    expect(tweenValue(936, 836, 0.5)).toBeLessThan(936);
  });
});

describe('loading screen', () => {
  it('the static boot screen in index.html says the same lines as the in-app loader', () => {
    const html = read('../../../index.html');
    expect(html).toContain('id="boot-splash"');
    for (const line of LOADING_LINES) expect(html).toContain(line);
  });
  it('is styled inline, so it paints before any stylesheet downloads, on a dark page rather than a white one', () => {
    const html = read('../../../index.html');
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).not.toMatch(/<link rel="stylesheet"/);
    expect(head).toMatch(/<style>[\s\S]*:where\(html, body\) \{[^}]*background: #081723;[\s\S]*\.mw-boot \{/);
    const viteConfig = read('../../../vite.config.ts');
    expect(viteConfig).toContain('bootScreenFirst()');
    // Lazy screens' stylesheets must still land after the main one, as they did when it was in the head.
    expect(viteConfig).toContain("'document.body.appendChild(link)'");
  });
  it('the boot screen stops moving under reduced motion', () => {
    expect(read('../../../index.html')).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.mw-boot,/);
  });
});

describe('round banners', () => {
  it('replay once per round and per match, and name the first round', () => {
    expect(roundBanner(1, 7).subtitle).toBe('Deploy your cards');
    expect(roundBanner(2, 7).subtitle).toBe('Deploy');
    expect(roundBanner(2, 7).key).not.toBe(roundBanner(2, 8).key);
    expect(fightBanner(2, 7).key).not.toBe(roundBanner(2, 7).key);
    expect(fightBanner(3, 7).title).toBe('Fight!');
  });
});

describe('the feedback layer respects reduced motion', () => {
  it.each(feedbackCss.filter(([name]) => name !== 'tokens' && name !== 'press'))('%s.css has a reduced-motion block', (_name, css) => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
  it('the motion tokens collapse and the press squash is removed', () => {
    const tokens = feedbackCss.find(([name]) => name === 'tokens')![1];
    expect(tokens).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*:root \{[^}]*--mw-press-scale: 1;/);
    expect(feedbackCss.find(([name]) => name === 'press')![1]).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*scale: none/);
  });
  it('press feedback is a default only: it lives in a cascade layer and uses the composable scale property', () => {
    const press = feedbackCss.find(([name]) => name === 'press')![1];
    expect(press).toContain('@layer mw-feedback');
    expect(press).not.toMatch(/\btransform:/);
  });
  it('a control with its own :active squash opts out of the layer squash, so the two never multiply', () => {
    const press = feedbackCss.find(([name]) => name === 'press')![1];
    const optOut = press.slice(press.indexOf('Controls that already squash'), press.indexOf('--mw-press-scale: 1;'));
    const stylesDir = new URL('../../styles/', import.meta.url);
    const sheets = readdirSync(stylesDir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.css') && !f.includes('feedback'));
    const squashing = new Set<string>();
    for (const sheet of sheets) {
      for (const [, selector, body] of read(`../../styles/${sheet.replaceAll('\\', '/')}`).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/transform:[^;]*scale\(/.test(body)) continue;
        for (const part of selector.split(',')) if (part.includes(':active')) squashing.add(part.trim().match(/\.([\w-]+)/)![1]);
      }
    }
    expect(squashing.size).toBeGreaterThan(0);
    for (const cls of squashing) expect(optOut, cls).toMatch(new RegExp(`\\.${cls}[,\\s]`));
  });
  it('entrances never leave a transform behind', () => {
    const motion = feedbackCss.find(([name]) => name === 'motion')![1];
    for (const cls of ['.mw-enter {', '.mw-stagger > * {', '.mw-pop-in {']) {
      const rule = motion.slice(motion.indexOf(cls)).split('}')[0];
      expect(rule, cls).toContain('backwards');
    }
  });
});
