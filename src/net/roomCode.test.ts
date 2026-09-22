import { describe, expect, it } from 'vitest';
import { generateRoomCode } from './roomCode';

const CONFUSABLE = new Set(['0', 'O', '1', 'I', 'L']);

describe('generateRoomCode', () => {
  it('is 6 characters long', () => {
    expect(generateRoomCode()).toHaveLength(6);
  });

  it('never contains a confusable character (0/O/1/I/L)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      for (const ch of code) {
        expect(CONFUSABLE.has(ch)).toBe(false);
      }
    }
  });

  it('is uppercase alphanumeric only', () => {
    expect(generateRoomCode()).toMatch(/^[A-Z0-9]+$/);
  });
});
