/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeWorld } from './HomeWorld';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url));
const css = read('../../styles/home.css').toString('utf8').replaceAll('\r\n', '\n');

describe('Home world artwork', () => {
  it('the pixel-art world asset exists (the Moonwater scene shared with the pixel-art concept page)', () => {
    const b = read('../../../public/art/pixel/moonwater.png');
    expect(b.toString('ascii', 1, 4)).toBe('PNG');
  });
  it('renders the world layer as a plain background div, plus the readability shade', () => {
    const html = renderToStaticMarkup(createElement(HomeWorld));
    expect(html).toContain('class="hh-world"');
    expect(html).toContain('hh-shade');
    expect(html).toContain('aria-hidden="true"');
  });
  it('the world layer paints the pixel-art scene as a cover background, not a stretched foreground image', () => {
    const rule = css.slice(css.indexOf('.hh-world {')).split('}')[0];
    expect(rule).toMatch(/background:\s*url\('\/art\/pixel\/moonwater\.png'\)/);
    expect(rule).toMatch(/cover/);
  });
  it('the terrace no longer paints an opaque panel over the art', () => {
    const rule = css.slice(css.indexOf('.hh .hh-terrace {')).split('}')[0];
    expect(rule).toMatch(/background:\s*none/);
  });
  it('has a gradient fallback on the Home background for when the image cannot load', () => {
    const rule = css.slice(css.indexOf('.hh {')).split('}')[0];
    expect(rule).toMatch(/background:\s*linear-gradient/);
  });
});
