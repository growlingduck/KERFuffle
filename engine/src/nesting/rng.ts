/** A small seeded random number generator (mulberry32): the same seed always gives the same sequence. */
export interface Rng {
  /** In [0, 1). */
  next(): number;
  /** An integer in [0, n). */
  int(n: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n) => Math.floor(next() * n) };
}
