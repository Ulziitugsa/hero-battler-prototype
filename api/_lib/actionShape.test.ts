import { describe, expect, it } from 'vitest';
import { isActionShape } from './actionShape.js';

describe('untrusted friendly battle actions', () => {
  it.each([null, {}, { plays: null }, { plays: [null] }, { plays: [3] }, { plays: [{ handId: 'h1', cardId: 'kng-squire', lane: '__proto__' }] }, { plays: Array(7).fill({ handId: 'h', cardId: 'c', lane: 'left' }) }])('rejects malformed or oversized stored actions: %j', action => {
    expect(isActionShape(action)).toBe(false);
  });
  it('accepts a pass and a structurally valid deployment for engine validation', () => {
    expect(isActionShape({ plays: [] })).toBe(true);
    expect(isActionShape({ plays: [{ handId: 'h1', cardId: 'kng-squire', lane: 'center' }] })).toBe(true);
  });
});
