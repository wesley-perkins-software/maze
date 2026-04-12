/**
 * Mulberry32 — fast, seedable PRNG with good distribution.
 * Returns a function that yields numbers in [0, 1).
 */
export function createPRNG(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Return a random integer in [0, max). */
export function randomInt(rng: () => number, max: number): number {
  return Math.floor(rng() * max);
}

/** Shuffle array in-place using Fisher-Yates. */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
