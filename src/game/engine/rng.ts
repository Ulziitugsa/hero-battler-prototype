// Small deterministic PRNG (mulberry32). The engine never calls Math.random() directly -
// every random decision threads a numeric state through so identical seeds reproduce identical matches.

export function nextRandom(state: number): { value: number; nextState: number } {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState: t };
}

/** Pick an integer index in [0, length). Returns -1 for an empty list. */
export function randomIndex(state: number, length: number): { index: number; nextState: number } {
  if (length <= 0) return { index: -1, nextState: state };
  const { value, nextState } = nextRandom(state);
  return { index: Math.floor(value * length), nextState };
}

export function makeSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
