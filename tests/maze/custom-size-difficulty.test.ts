import { describe, expect, it } from 'vitest';
import { difficultyForCustomSize } from '../../src/components/maze/MazeGenerator';

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
});
