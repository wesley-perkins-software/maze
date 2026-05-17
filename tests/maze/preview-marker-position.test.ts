import { describe, expect, it, vi } from 'vitest';
import type { MazeData, Point } from '../../src/types/maze';
import { WALL_E, WALL_N, WALL_S, WALL_W } from '../../src/types/maze';
import { getPreviewMarkerPosition } from '../../src/components/maze/MazeGenerator';
import { getMinimapEndpointMarkerPosition } from '../../src/components/maze/FullscreenMazePlayer';
import { getEndpointMarkerCenter, getMazeBodyBounds, inferPortalSide, type PortalSide } from '../../src/lib/maze/endpointMarkers';

const PREVIEW_PADDING = 6;
const CELL_SIZE = 8;
const MARKER_RADIUS = CELL_SIZE * 0.9;
const PREVIEW_BADGE_RADIUS = 14;
const OUTSIDE_OFFSET = MARKER_RADIUS;

const SIDE_WALL: Record<PortalSide, number> = {
  top: WALL_N,
  right: WALL_E,
  bottom: WALL_S,
  left: WALL_W,
};

const OPPOSITE_SIDE: Record<PortalSide, PortalSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

function pointOnSide(width: number, height: number, side: PortalSide, offset = 0): Point {
  if (side === 'top') return { x: Math.min(width - 2, Math.max(1, Math.floor(width / 2) + offset)), y: 0 };
  if (side === 'bottom') return { x: Math.min(width - 2, Math.max(1, Math.floor(width / 2) + offset)), y: height - 1 };
  if (side === 'left') return { x: 0, y: Math.min(height - 2, Math.max(1, Math.floor(height / 2) + offset)) };
  return { x: width - 1, y: Math.min(height - 2, Math.max(1, Math.floor(height / 2) + offset)) };
}

function mazeWithPortals(
  width: number,
  height: number,
  entry: { point: Point; side: PortalSide },
  exit: { point: Point; side: PortalSide },
): MazeData {
  const grid = Array(width * height).fill(WALL_N | WALL_E | WALL_S | WALL_W);
  grid[entry.point.y * width + entry.point.x] &= ~SIDE_WALL[entry.side];
  grid[exit.point.y * width + exit.point.x] &= ~SIDE_WALL[exit.side];

  return {
    id: `test-${width}x${height}`,
    slug: `test-${width}x${height}`,
    difficulty: 'large',
    width,
    height,
    seed: 1,
    entry: entry.point,
    exit: exit.point,
    grid,
    solution: [],
    generatedAt: '2026-05-13T00:00:00.000Z',
  };
}

function mazeWithPoint(width: number, height: number, point: Point, side: PortalSide): MazeData {
  return mazeWithPortals(width, height, { point, side }, { point, side });
}

function evaluateCssLength(value: unknown, totalPx: number): number {
  const text = String(value);
  const calc = text.match(/^calc\((-?\d+(?:\.\d+)?)% ([+-]) (\d+(?:\.\d+)?)px\)$/);
  if (calc) {
    const percentValue = (Number.parseFloat(calc[1]) / 100) * totalPx;
    const px = Number.parseFloat(calc[3]);
    return calc[2] === '+' ? percentValue + px : percentValue - px;
  }

  if (text.endsWith('%')) return (Number.parseFloat(text) / 100) * totalPx;
  if (text.endsWith('px')) return Number.parseFloat(text);
  return Number.parseFloat(text);
}

function previewCoordinates(position: NonNullable<ReturnType<typeof getPreviewMarkerPosition>>, width: number, height: number) {
  return {
    x: evaluateCssLength(position.left, width * CELL_SIZE + PREVIEW_PADDING * 2),
    y: evaluateCssLength(position.top, height * CELL_SIZE + PREVIEW_PADDING * 2),
  };
}

function minimapCoordinates(position: NonNullable<ReturnType<typeof getMinimapEndpointMarkerPosition>>, width: number, height: number) {
  return {
    x: evaluateCssLength(position.left, width * CELL_SIZE + 2 * 2),
    y: evaluateCssLength(position.top, height * CELL_SIZE + 2 * 2),
  };
}

function expectOutsideCorrectSide(point: Point, side: PortalSide, coords: Point, width: number, height: number, padding = PREVIEW_PADDING, markerRadius = MARKER_RADIUS) {
  const left = padding;
  const top = padding;
  const right = padding + width * CELL_SIZE;
  const bottom = padding + height * CELL_SIZE;

  if (side === 'top') {
    expect(coords.y).toBeLessThanOrEqual(top - markerRadius);
    expect(coords.x).toBeCloseTo(padding + point.x * CELL_SIZE + CELL_SIZE / 2, 8);
  } else if (side === 'bottom') {
    expect(coords.y).toBeGreaterThanOrEqual(bottom + markerRadius);
    expect(coords.x).toBeCloseTo(padding + point.x * CELL_SIZE + CELL_SIZE / 2, 8);
  } else if (side === 'left') {
    expect(coords.x).toBeLessThanOrEqual(left - markerRadius);
    expect(coords.y).toBeCloseTo(padding + point.y * CELL_SIZE + CELL_SIZE / 2, 8);
  } else {
    expect(coords.x).toBeGreaterThanOrEqual(right + markerRadius);
    expect(coords.y).toBeCloseTo(padding + point.y * CELL_SIZE + CELL_SIZE / 2, 8);
  }

  expect(coords.x > left && coords.x < right && coords.y > top && coords.y < bottom).toBe(false);
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
        outsideGap: 0,
      });

      if (expected.x !== undefined) expect(marker.x).toBeCloseTo(expected.x, 8);
      if (expected.y !== undefined) expect(marker.y).toBeCloseTo(expected.y, 8);
    }
  });

  it('does not infer a side when the perimeter wall is still closed', () => {
    const point = { x: 20, y: 0 };
    const maze = mazeWithPortals(40, 40, { point, side: 'top' }, { point: { x: 20, y: 39 }, side: 'bottom' });
    maze.grid[point.y * maze.width + point.x] |= WALL_N;

    expect(inferPortalSide(maze, point)).toBeNull();
  });
});

describe('getPreviewMarkerPosition', () => {
  const sizes = [20, 40, 60, 100] as const;
  const aspectSizes = [
    { width: 100, height: 10 },
    { width: 10, height: 100 },
  ] as const;
  const portalPairs: Array<{ entrySide: PortalSide; exitSide: PortalSide; label: string }> = [
    { entrySide: 'top', exitSide: 'bottom', label: 'start top / finish bottom' },
    { entrySide: 'bottom', exitSide: 'top', label: 'start bottom / finish top' },
    { entrySide: 'left', exitSide: 'right', label: 'start left / finish right' },
    { entrySide: 'right', exitSide: 'left', label: 'start right / finish left' },
    { entrySide: 'top', exitSide: 'left', label: 'mixed top / left' },
    { entrySide: 'right', exitSide: 'bottom', label: 'mixed right / bottom' },
    { entrySide: 'top', exitSide: 'top', label: 'same-side top' },
  ];

  it.each(sizes)('keeps start and finish preview markers outside the maze body for all side pairs in %ix%i mazes', (size) => {
    for (const { entrySide, exitSide, label } of portalPairs) {
      const entryPoint = pointOnSide(size, size, entrySide, -2);
      const exitPoint = pointOnSide(size, size, exitSide, 2);
      const maze = mazeWithPortals(size, size, { point: entryPoint, side: entrySide }, { point: exitPoint, side: exitSide });
      const entryPosition = getPreviewMarkerPosition(maze, maze.entry, CELL_SIZE, `${label} entry`);
      const exitPosition = getPreviewMarkerPosition(maze, maze.exit, CELL_SIZE, `${label} exit`);

      expect(entryPosition, `${label} entry`).not.toBeNull();
      expect(exitPosition, `${label} exit`).not.toBeNull();
      expectOutsideCorrectSide(entryPoint, entrySide, previewCoordinates(entryPosition!, size, size), size, size, PREVIEW_PADDING, PREVIEW_BADGE_RADIUS);
      expectOutsideCorrectSide(exitPoint, exitSide, previewCoordinates(exitPosition!, size, size), size, size, PREVIEW_PADDING, PREVIEW_BADGE_RADIUS);
    }
  });

  it.each(aspectSizes)('uses width and height independently for non-square preview markers ($width×$height)', ({ width, height }) => {
    const entrySide: PortalSide = width > height ? 'right' : 'bottom';
    const exitSide = OPPOSITE_SIDE[entrySide];
    const entryPoint = pointOnSide(width, height, entrySide);
    const exitPoint = pointOnSide(width, height, exitSide);
    const maze = mazeWithPortals(width, height, { point: entryPoint, side: entrySide }, { point: exitPoint, side: exitSide });

    const entryPosition = getPreviewMarkerPosition(maze, maze.entry, CELL_SIZE, 'entry');
    const exitPosition = getPreviewMarkerPosition(maze, maze.exit, CELL_SIZE, 'exit');

    expect(entryPosition).not.toBeNull();
    expect(exitPosition).not.toBeNull();
    expectOutsideCorrectSide(entryPoint, entrySide, previewCoordinates(entryPosition!, width, height), width, height, PREVIEW_PADDING, PREVIEW_BADGE_RADIUS);
    expectOutsideCorrectSide(exitPoint, exitSide, previewCoordinates(exitPosition!, width, height), width, height, PREVIEW_PADDING, PREVIEW_BADGE_RADIUS);
  });

  it('fails safe instead of returning an inside-maze preview position when side inference fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const point = { x: 20, y: 0 };
    const maze = mazeWithPortals(40, 40, { point, side: 'top' }, { point: { x: 20, y: 39 }, side: 'bottom' });
    maze.grid[point.y * maze.width + point.x] |= WALL_N;

    expect(getPreviewMarkerPosition(maze, point, CELL_SIZE, 'entry')).toBeNull();
    warnSpy.mockRestore();
  });

  it('preview and minimap agree on endpoint sides for the same maze', () => {
    const width = 60;
    const height = 60;
    const entrySide: PortalSide = 'bottom';
    const exitSide: PortalSide = 'right';
    const entryPoint = pointOnSide(width, height, entrySide);
    const exitPoint = pointOnSide(width, height, exitSide);
    const maze = mazeWithPortals(width, height, { point: entryPoint, side: entrySide }, { point: exitPoint, side: exitSide });

    const previewEntry = previewCoordinates(getPreviewMarkerPosition(maze, maze.entry, CELL_SIZE, 'entry')!, width, height);
    const previewExit = previewCoordinates(getPreviewMarkerPosition(maze, maze.exit, CELL_SIZE, 'exit')!, width, height);
    const minimapEntry = minimapCoordinates(getMinimapEndpointMarkerPosition(maze, CELL_SIZE, maze.entry, 28)!, width, height);
    const minimapExit = minimapCoordinates(getMinimapEndpointMarkerPosition(maze, CELL_SIZE, maze.exit, 28)!, width, height);

    expect(previewEntry.y).toBeGreaterThanOrEqual(PREVIEW_PADDING + height * CELL_SIZE + PREVIEW_BADGE_RADIUS);
    expect(minimapEntry.y).toBeGreaterThanOrEqual(2 + height * CELL_SIZE + 14);
    expect(previewExit.x).toBeGreaterThanOrEqual(PREVIEW_PADDING + width * CELL_SIZE + PREVIEW_BADGE_RADIUS);
    expect(minimapExit.x).toBeGreaterThanOrEqual(2 + width * CELL_SIZE + 14);
  });
});
