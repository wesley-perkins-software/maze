import { describe, expect, it } from 'vitest';
import type { MazeData, Point } from '../../src/types/maze';
import { getPreviewMarkerPosition } from '../../src/components/maze/MazeGenerator';

const PREVIEW_PADDING = 6;
const CELL_SIZE = 8;

function mazeWithPoint(size: number, point: Point): MazeData {
  return {
    id: `test-${size}`,
    slug: `test-${size}`,
    difficulty: 'large',
    width: size,
    height: size,
    seed: 1,
    entry: point,
    exit: point,
    grid: Array(size * size).fill(0),
    solution: [],
    generatedAt: '2026-05-13T00:00:00.000Z',
  };
}

function percentagesToCoordinates(position: { left: string; top: string }, size: number) {
  const total = size * CELL_SIZE + PREVIEW_PADDING * 2;

  return {
    x: (Number.parseFloat(position.left) / 100) * total,
    y: (Number.parseFloat(position.top) / 100) * total,
  };
}

describe('getPreviewMarkerPosition', () => {
  const sizes = [20, 40, 60, 80, 100];

  it.each(sizes)('centers top, right, bottom, and left markers on the outer wall for %ix%i mazes', (size) => {
    const sidePoints = [
      { point: { x: Math.floor(size / 2), y: 0 }, expected: { y: PREVIEW_PADDING } },
      { point: { x: size - 1, y: Math.floor(size / 2) }, expected: { x: size * CELL_SIZE + PREVIEW_PADDING } },
      { point: { x: Math.floor(size / 2), y: size - 1 }, expected: { y: size * CELL_SIZE + PREVIEW_PADDING } },
      { point: { x: 0, y: Math.floor(size / 2) }, expected: { x: PREVIEW_PADDING } },
    ];

    for (const { point, expected } of sidePoints) {
      const maze = mazeWithPoint(size, point);
      const coordinates = percentagesToCoordinates(getPreviewMarkerPosition(maze, point, CELL_SIZE), size);

      if (expected.x !== undefined) {
        expect(coordinates.x).toBeCloseTo(expected.x, 8);
      }

      if (expected.y !== undefined) {
        expect(coordinates.y).toBeCloseTo(expected.y, 8);
      }
    }
  });
});
