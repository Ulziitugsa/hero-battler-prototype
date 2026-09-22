import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { MoonwellVoyage } from './MoonwellVoyage';
import { buildMeteors, meteorPoint } from '../game/summon/meteors';
import type { Rarity } from '../game/types';

describe('summon reward lights', () => {
  it('one pull has one meteor regardless of rarity', () => {
    for (const tier of ['common','rare','epic','legendary'] as Rarity[]) {
      const pulls=[{rarity:tier}];
      expect(buildMeteors(pulls)).toHaveLength(1);
      const html=renderToStaticMarkup(createElement(MoonwellVoyage,{phase:'telegraph',tier,pulls}));
      expect(html).toContain('data-summon-count="1"');
    }
  });
  it('ten pulls preserve count, rarity and order with distinct paths and staggered entry', () => {
    const rarities: Rarity[]=['common','rare','epic','common','legendary','rare','common','epic','rare','common'];
    const lights=buildMeteors(rarities.map(rarity=>({rarity})));
    expect(lights.map(m=>m.rarity)).toEqual(rarities);
    expect(lights.map(m=>m.index)).toEqual(rarities.map((_,i)=>i));
    expect(new Set(lights.map(m=>`${m.x},${m.y}`)).size).toBe(10);
    expect(new Set(lights.map(m=>m.delay)).size).toBe(10);
    expect(new Set(lights.map(m=>m.depth)).size).toBeGreaterThan(1);
    for(const m of lights) {
      const start=meteorPoint(m,0), end=meteorPoint(m,1);
      expect(start.x-end.x).toBeGreaterThan(.75);
      expect(end.y-start.y).toBeGreaterThan(.2);
      expect(end.y-start.y).toBeLessThan(.45);
      expect(meteorPoint(m,1)).toEqual({x:m.x,y:m.y});
      expect(meteorPoint(m,2)).toEqual(meteorPoint(m,1));
      expect(meteorPoint(m,-1)).toEqual(meteorPoint(m,0));
    }
  });
});
