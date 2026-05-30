import { describe, expect, it } from 'vitest';
import { difficultyForCustomSize, CUSTOM_RANGE } from '../../src/components/maze/MazeGenerator';

describe('difficultyForCustomSize', () => {
  it('matches preset difficulty tiers at preset dimensions', () => {
    expect(difficultyForCustomSize(20, 20)).toBe('small');
    expect(difficultyForCustomSize(40, 40)).toBe('medium');
    expect(difficultyForCustomSize(60, 60)).toBe('large');
  });

  it('assigns custom sizes to the closest preset complexity tier by area', () => {
    expect(difficultyForCustomSize(25, 25)).toBe('small');
    expect(difficultyForCustomSize(35, 35)).toBe('medium');
    expect(difficultyForCustomSize(55, 55)).toBe('large');
  });

  it('enforces a minimum custom dimension of 10', () => {
    expect(CUSTOM_RANGE.min).toBe(10);
  });

  it('assigns difficulty correctly at the minimum custom size of 10×10', () => {
    expect(difficultyForCustomSize(10, 10)).toBe('small');
  });
});
