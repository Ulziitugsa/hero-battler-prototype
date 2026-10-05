import { describe, expect, it } from 'vitest';
import { productAcquisitionLines } from './productSources';

const IN_EVENT = Date.parse('2026-10-05T12:00:00Z');
const AFTER_EVENT = Date.parse('2026-12-01T12:00:00Z');

describe('productAcquisitionLines', () => {
  it('lists only live events: Boxes and Structure Decks are acquisition sources (acquisition.ts)', () => {
    expect(productAcquisitionLines('kng-archer', IN_EVENT)).toEqual([]);
    expect(productAcquisitionLines('spl-meteor', IN_EVENT)).toEqual([]);
  });

  it('lists a live event reward and drops it once the event ends', () => {
    expect(productAcquisitionLines('und-wraith-prince', IN_EVENT)).toContain('Event · The Long Vigil');
    expect(productAcquisitionLines('und-wraith-prince', AFTER_EVENT)).not.toContain('Event · The Long Vigil');
  });
});
