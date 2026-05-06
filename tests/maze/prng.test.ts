import { describe, it, expect } from 'vitest';
import { createPRNG, randomInt, shuffle } from '../../src/lib/maze/prng';

describe('createPRNG', () => {
  it('returns values in [0, 1)', () => {
    const rng = createPRNG(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for the same seed', () => {
    const rng1 = createPRNG(12345);
    const rng2 = createPRNG(12345);
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createPRNG(1);
    const rng2 = createPRNG(2);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });
});

describe('randomInt', () => {
  it('returns values in [0, max)', () => {
    const rng = createPRNG(99);
    for (let i = 0; i < 1000; i++) {
      const v = randomInt(rng, 10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('shuffle', () => {
  it('preserves all elements', () => {
    const rng = createPRNG(7);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle([...arr], rng);
    expect(shuffled.sort()).toEqual(arr.sort());
  });

  it('is deterministic', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = shuffle([...arr], createPRNG(42));
    const s2 = shuffle([...arr], createPRNG(42));
    expect(s1).toEqual(s2);
  });
});
