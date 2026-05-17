import { describe, expect, it } from 'vitest';
import type { MazeData, Point } from '../../src/types/maze';
import { WALL_E, WALL_N, WALL_S, WALL_W } from '../../src/types/maze';
import { getPreviewMarkerPosition } from '../../src/components/maze/MazeGenerator';
import { getEndpointMarkerCenter, getMazeBodyBounds, type PortalSide } from '../../src/lib/maze/endpointMarkers';

const PREVIEW_PADDING = 6;
const CELL_SIZE = 8;
const MARKER_RADIUS = CELL_SIZE * 0.9;
const OUTSIDE_OFFSET = MARKER_RADIUS - MARKER_RADIUS * 0.6;

const SIDE_WALL: Record<PortalSide, number> = {
  top: WALL_N,
  right: WALL_E,
  bottom: WALL_S,
  left: WALL_W,
};

function mazeWithPoint(width: number, height: number, point: Point, side: PortalSide): MazeData {
  const grid = Array(width * height).fill(WALL_N | WALL_E | WALL_S | WALL_W);
  grid[point.y * width + point.x] &= ~SIDE_WALL[side];

  return {
    id: `test-${width}x${height}`,
    slug: `test-${width}x${height}`,
    difficulty: 'large',
    width,
    height,
    seed: 1,
    entry: point,
    exit: point,
    grid,
    solution: [],
    generatedAt: '2026-05-13T00:00:00.000Z',
  };
}

function percentagesToCoordinates(position: { left: string; top: string }, width: number, height: number) {
  const totalW = width * CELL_SIZE + PREVIEW_PADDING * 2;
  const totalH = height * CELL_SIZE + PREVIEW_PADDING * 2;

  return {
    x: (Number.parseFloat(position.left) / 100) * totalW,
    y: (Number.parseFloat(position.top) / 100) * totalH,
  };
}

describe('getEndpointMarkerCenter', () => {
  it('projects all four portal sides outside the rendered maze body', () => {
    const width = 100;
    const height = 10;
    const bounds = getMazeBodyBounds(width, height, CELL_SIZE, PREVIEW_PADDING);
    const cases: Array<{ side: PortalSide; point: Point; expected: Partial<Point> }> = [
      { side: 'top', point: { x: 50, y: 0 }, expected: { y: PREVIEW_PADDING - OUTSIDE_OFFSET } },
      { side: 'bottom', point: { x: 50, y: height - 1 }, expected: { y: PREVIEW_PADDING + height * CELL_SIZE + OUTSIDE_OFFSET } },
      { side: 'left', point: { x: 0, y: 5 }, expected: { x: PREVIEW_PADDING - OUTSIDE_OFFSET } },
      { side: 'right', point: { x: width - 1, y: 5 }, expected: { x: PREVIEW_PADDING + width * CELL_SIZE + OUTSIDE_OFFSET } },
    ];

    for (const { side, point, expected } of cases) {
      const marker = getEndpointMarkerCenter({
        mazeWidth: width,
        mazeHeight: height,
        cellSize: CELL_SIZE,
        bounds,
        portal: point,
        portalSide: side,
        markerRadius: MARKER_RADIUS,
        overhangAmount: MARKER_RADIUS * 0.6,
      });

      if (expected.x !== undefined) expect(marker.x).toBeCloseTo(expected.x, 8);
      if (expected.y !== undefined) expect(marker.y).toBeCloseTo(expected.y, 8);
    }
  });
});

describe('getPreviewMarkerPosition', () => {
  const sizes = [20, 40, 60, 80, 100];

  it.each(sizes)('centers top, right, bottom, and left markers outside the outer wall for %ix%i mazes', (size) => {
    const sidePoints: Array<{ side: PortalSide; point: Point; expected: Partial<Point> }> = [
      { side: 'top', point: { x: Math.floor(size / 2), y: 0 }, expected: { y: PREVIEW_PADDING - OUTSIDE_OFFSET } },
      { side: 'right', point: { x: size - 1, y: Math.floor(size / 2) }, expected: { x: size * CELL_SIZE + PREVIEW_PADDING + OUTSIDE_OFFSET } },
      { side: 'bottom', point: { x: Math.floor(size / 2), y: size - 1 }, expected: { y: size * CELL_SIZE + PREVIEW_PADDING + OUTSIDE_OFFSET } },
      { side: 'left', point: { x: 0, y: Math.floor(size / 2) }, expected: { x: PREVIEW_PADDING - OUTSIDE_OFFSET } },
    ];

    for (const { side, point, expected } of sidePoints) {
      const maze = mazeWithPoint(size, size, point, side);
      const coordinates = percentagesToCoordinates(getPreviewMarkerPosition(maze, point, CELL_SIZE), size, size);

      if (expected.x !== undefined) {
        expect(coordinates.x).toBeCloseTo(expected.x, 8);
      }

      if (expected.y !== undefined) {
        expect(coordinates.y).toBeCloseTo(expected.y, 8);
      }
    }
  });

  it('uses width and height independently for non-square maze previews', () => {
    const width = 100;
    const height = 10;
    const point = { x: width - 1, y: Math.floor(height / 2) };
    const maze = mazeWithPoint(width, height, point, 'right');
    const coordinates = percentagesToCoordinates(getPreviewMarkerPosition(maze, point, CELL_SIZE), width, height);

    expect(coordinates.x).toBeCloseTo(width * CELL_SIZE + PREVIEW_PADDING + OUTSIDE_OFFSET, 8);
    expect(coordinates.y).toBeCloseTo(PREVIEW_PADDING + point.y * CELL_SIZE + CELL_SIZE / 2, 8);
  });
});
