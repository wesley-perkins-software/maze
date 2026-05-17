import { describe, expect, it, vi } from 'vitest';
import type { MazeData, Point } from '../../src/types/maze';
import { WALL_E, WALL_N, WALL_S, WALL_W } from '../../src/types/maze';
import { getPreviewMarkerPosition } from '../../src/components/maze/MazeGenerator';
import { getMinimapEndpointMarkerPosition } from '../../src/components/maze/FullscreenMazePlayer';
import { ENDPOINT_MARKER_OUTSIDE_GAP_PX, getEndpointMarkerCenter, getMazeBodyBounds, inferPortalSide, type PortalSide } from '../../src/lib/maze/endpointMarkers';

const PREVIEW_PADDING = 6;
const MINIMAP_PADDING = 2;
const CELL_SIZE = 8;
const MARKER_RADIUS = CELL_SIZE * 0.9;
const PREVIEW_BADGE_RADIUS = 14;
const MINIMAP_BADGE_RADIUS = 14;
const OUTSIDE_OFFSET = MARKER_RADIUS + ENDPOINT_MARKER_OUTSIDE_GAP_PX;
// Preview markers use zero gap (badge edge touches the wall).
const PREVIEW_OUTSIDE_OFFSET = PREVIEW_BADGE_RADIUS;
// Minimap markers use a small inset so the center straddles the wall edge.
const MINIMAP_EDGE_INSET = 2;

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
    x: evaluateCssLength(position.left, width * CELL_SIZE + MINIMAP_PADDING * 2),
    y: evaluateCssLength(position.top, height * CELL_SIZE + MINIMAP_PADDING * 2),
  };
}

function expectOutsideCorrectSide(point: Point, side: PortalSide, coords: Point, width: number, height: number, padding = PREVIEW_PADDING, edgeOffset = OUTSIDE_OFFSET) {
  const left = padding;
  const top = padding;
  const right = padding + width * CELL_SIZE;
  const bottom = padding + height * CELL_SIZE;

  if (side === 'top') {
    expect(coords.y).toBeLessThanOrEqual(top - edgeOffset);
    expect(coords.x).toBeCloseTo(padding + point.x * CELL_SIZE + CELL_SIZE / 2, 8);
  } else if (side === 'bottom') {
    expect(coords.y).toBeGreaterThanOrEqual(bottom + edgeOffset);
    expect(coords.x).toBeCloseTo(padding + point.x * CELL_SIZE + CELL_SIZE / 2, 8);
  } else if (side === 'left') {
    expect(coords.x).toBeLessThanOrEqual(left - edgeOffset);
    expect(coords.y).toBeCloseTo(padding + point.y * CELL_SIZE + CELL_SIZE / 2, 8);
  } else {
    expect(coords.x).toBeGreaterThanOrEqual(right + edgeOffset);
    expect(coords.y).toBeCloseTo(padding + point.y * CELL_SIZE + CELL_SIZE / 2, 8);
  }

  expect(coords.x > left && coords.x < right && coords.y > top && coords.y < bottom).toBe(false);
}

// Tolerance for floating-point round-trips through CSS percentage strings.
// The no-bounds path converts pixel → % → pixel, which can drift by ~1e-12.
const FP_EPSILON = 1e-9;

function expectInsideCorrectSide(point: Point, side: PortalSide, coords: Point, width: number, height: number, padding = MINIMAP_PADDING, edgeInset = MINIMAP_EDGE_INSET) {
  const left = padding;
  const top = padding;
  const right = padding + width * CELL_SIZE;
  const bottom = padding + height * CELL_SIZE;

  if (side === 'top') {
    expect(coords.y).toBeGreaterThanOrEqual(top - FP_EPSILON);
    expect(coords.y).toBeLessThanOrEqual(top + edgeInset + FP_EPSILON);
    expect(coords.x).toBeCloseTo(padding + point.x * CELL_SIZE + CELL_SIZE / 2, 8);
  } else if (side === 'bottom') {
    expect(coords.y).toBeGreaterThanOrEqual(bottom - edgeInset - FP_EPSILON);
    expect(coords.y).toBeLessThanOrEqual(bottom + FP_EPSILON);
    expect(coords.x).toBeCloseTo(padding + point.x * CELL_SIZE + CELL_SIZE / 2, 8);
  } else if (side === 'left') {
    expect(coords.x).toBeGreaterThanOrEqual(left - FP_EPSILON);
    expect(coords.x).toBeLessThanOrEqual(left + edgeInset + FP_EPSILON);
    expect(coords.y).toBeCloseTo(padding + point.y * CELL_SIZE + CELL_SIZE / 2, 8);
  } else {
    expect(coords.x).toBeGreaterThanOrEqual(right - edgeInset - FP_EPSILON);
    expect(coords.x).toBeLessThanOrEqual(right + FP_EPSILON);
    expect(coords.y).toBeCloseTo(padding + point.y * CELL_SIZE + CELL_SIZE / 2, 8);
  }
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
      });

      if (expected.x !== undefined) expect(marker.x).toBeCloseTo(expected.x, 8);
      if (expected.y !== undefined) expect(marker.y).toBeCloseTo(expected.y, 8);
    }
  });

  it('insets minimap markers inside the rendered maze body when requested', () => {
    const width = 100;
    const height = 10;
    const bounds = getMazeBodyBounds(width, height, CELL_SIZE, PREVIEW_PADDING);
    const cases: Array<{ side: PortalSide; point: Point; expected: Partial<Point> }> = [
      { side: 'top', point: { x: 50, y: 0 }, expected: { y: PREVIEW_PADDING + MARKER_RADIUS } },
      { side: 'bottom', point: { x: 50, y: height - 1 }, expected: { y: PREVIEW_PADDING + height * CELL_SIZE - MARKER_RADIUS } },
      { side: 'left', point: { x: 0, y: 5 }, expected: { x: PREVIEW_PADDING + MARKER_RADIUS } },
      { side: 'right', point: { x: width - 1, y: 5 }, expected: { x: PREVIEW_PADDING + width * CELL_SIZE - MARKER_RADIUS } },
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
        placementMode: 'inside',
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
      expectOutsideCorrectSide(entryPoint, entrySide, previewCoordinates(entryPosition!, size, size), size, size, PREVIEW_PADDING, PREVIEW_OUTSIDE_OFFSET);
      expectOutsideCorrectSide(exitPoint, exitSide, previewCoordinates(exitPosition!, size, size), size, size, PREVIEW_PADDING, PREVIEW_OUTSIDE_OFFSET);
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
    expectOutsideCorrectSide(entryPoint, entrySide, previewCoordinates(entryPosition!, width, height), width, height, PREVIEW_PADDING, PREVIEW_OUTSIDE_OFFSET);
    expectOutsideCorrectSide(exitPoint, exitSide, previewCoordinates(exitPosition!, width, height), width, height, PREVIEW_PADDING, PREVIEW_OUTSIDE_OFFSET);
  });

  it('fails safe instead of returning an inside-maze preview position when side inference fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const point = { x: 20, y: 0 };
    const maze = mazeWithPortals(40, 40, { point, side: 'top' }, { point: { x: 20, y: 39 }, side: 'bottom' });
    maze.grid[point.y * maze.width + point.x] |= WALL_N;

    expect(getPreviewMarkerPosition(maze, point, CELL_SIZE, 'entry')).toBeNull();
    warnSpy.mockRestore();
  });


  it('keeps minimap markers inset inside square and rail minimap footprints', () => {
    const minimapSizes = [
      ...sizes.map((size) => ({ width: size, height: size })),
      ...aspectSizes,
    ];

    for (const { width, height } of minimapSizes) {
      for (const { entrySide, exitSide, label } of portalPairs) {
        const entryPoint = pointOnSide(width, height, entrySide, -2);
        const exitPoint = pointOnSide(width, height, exitSide, 2);
        const maze = mazeWithPortals(width, height, { point: entryPoint, side: entrySide }, { point: exitPoint, side: exitSide });
        const entryPosition = getMinimapEndpointMarkerPosition(maze, CELL_SIZE, maze.entry, MINIMAP_BADGE_RADIUS * 2);
        const exitPosition = getMinimapEndpointMarkerPosition(maze, CELL_SIZE, maze.exit, MINIMAP_BADGE_RADIUS * 2);

        expect(entryPosition, `${label} entry ${width}x${height}`).not.toBeNull();
        expect(exitPosition, `${label} exit ${width}x${height}`).not.toBeNull();
        expectInsideCorrectSide(entryPoint, entrySide, minimapCoordinates(entryPosition!, width, height), width, height);
        expectInsideCorrectSide(exitPoint, exitSide, minimapCoordinates(exitPosition!, width, height), width, height);
      }
    }
  });

  it('places preview outside while minimap stays inset for the same portal sides', () => {
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

    expect(previewEntry.y).toBeGreaterThanOrEqual(PREVIEW_PADDING + height * CELL_SIZE + PREVIEW_OUTSIDE_OFFSET);
    expect(minimapEntry.y).toBeGreaterThanOrEqual(MINIMAP_PADDING + height * CELL_SIZE - MINIMAP_EDGE_INSET - FP_EPSILON);
    expect(minimapEntry.y).toBeLessThanOrEqual(MINIMAP_PADDING + height * CELL_SIZE + FP_EPSILON);
    expect(previewExit.x).toBeGreaterThanOrEqual(PREVIEW_PADDING + width * CELL_SIZE + PREVIEW_OUTSIDE_OFFSET);
    expect(minimapExit.x).toBeGreaterThanOrEqual(MINIMAP_PADDING + width * CELL_SIZE - MINIMAP_EDGE_INSET - FP_EPSILON);
    expect(minimapExit.x).toBeLessThanOrEqual(MINIMAP_PADDING + width * CELL_SIZE + FP_EPSILON);
  });

  it('with-bounds: along-edge normalized position t matches the no-bounds path for all sides', () => {
    // The "with bounds" path is what runs in the actual app (bounds are always passed).
    // It must produce the same normalized along-edge position t = (portal + 0.5) / dimension
    // as the no-bounds path (used as a reference here), regardless of container size.
    const containerSizes = [
      { w: 80, h: 80 },   // square container, square maze
      { w: 150, h: 40 },  // wide container, square maze (letterboxed top/bottom)
      { w: 40, h: 150 },  // tall container, square maze (letterboxed left/right)
      { w: 90, h: 20 },   // wide container, rail maze
    ];
    const mazeSize = { width: 40, height: 40 };
    const sides: PortalSide[] = ['top', 'bottom', 'left', 'right'];

    for (const { w, h } of containerSizes) {
      for (const side of sides) {
        const point = pointOnSide(mazeSize.width, mazeSize.height, side, 3);
        const maze = mazeWithPortals(
          mazeSize.width, mazeSize.height,
          { point, side },
          { point, side },
        );
        const markerSize = MINIMAP_BADGE_RADIUS * 2;
        const totalW = mazeSize.width * CELL_SIZE + MINIMAP_PADDING * 2;
        const totalH = mazeSize.height * CELL_SIZE + MINIMAP_PADDING * 2;

        // Compute bounds that would be used by getContainedMinimapBounds.
        // Replicate the letterbox logic directly so the test has no extra deps.
        const mazeAspect = totalW / totalH;
        const containerAspect = w / h;
        let bounds;
        if (mazeAspect > containerAspect) {
          const rh = w / mazeAspect;
          bounds = { x: 0, y: (h - rh) / 2, width: w, height: rh, svgWidth: totalW, svgHeight: totalH, containerWidth: w, containerHeight: h };
        } else {
          const rw = h * mazeAspect;
          bounds = { x: (w - rw) / 2, y: 0, width: rw, height: h, svgWidth: totalW, svgHeight: totalH, containerWidth: w, containerHeight: h };
        }

        const withBoundsPos = getMinimapEndpointMarkerPosition(maze, CELL_SIZE, point, markerSize, bounds as import('../../src/components/maze/FullscreenMazePlayer').MinimapRenderedBounds);
        const noBoundsPos = getMinimapEndpointMarkerPosition(maze, CELL_SIZE, point, markerSize);

        expect(withBoundsPos, `${side} ${w}x${h}`).not.toBeNull();
        expect(noBoundsPos).not.toBeNull();

        // The no-bounds path uses the SVG coordinate space (totalW × totalH).
        // Convert both to normalized maze-body fraction to compare t.
        const mazeBodyW = mazeSize.width * CELL_SIZE;
        const mazeBodyH = mazeSize.height * CELL_SIZE;

        // No-bounds: convert % back to SVG pixels, then subtract padding to get maze-body offset.
        const nbX = evaluateCssLength(noBoundsPos!.left, totalW) - MINIMAP_PADDING;
        const nbY = evaluateCssLength(noBoundsPos!.top, totalH) - MINIMAP_PADDING;

        // With-bounds: convert pixel back to SVG scale using the same scale factor.
        const scale = bounds.width / totalW;
        const wbX = (Number(withBoundsPos!.left) - bounds.x - (MINIMAP_PADDING * scale)) / scale;
        const wbY = (Number(withBoundsPos!.top) - bounds.y - (MINIMAP_PADDING * scale)) / scale;

        // Along-edge coordinate: both must produce the same t = (portal + 0.5) / dimension.
        if (side === 'top' || side === 'bottom') {
          const tNo = nbX / mazeBodyW;
          const tWith = wbX / mazeBodyW;
          expect(tWith).toBeCloseTo(tNo, 6);
        } else {
          const tNo = nbY / mazeBodyH;
          const tWith = wbY / mazeBodyH;
          expect(tWith).toBeCloseTo(tNo, 6);
        }
      }
    }
  });

  it('with-bounds: along-edge position matches portal cell center and perpendicular is inside maze', () => {
    const testCases = [
      { mw: 20,  mh: 20,  cw: 80,  ch: 80  },
      { mw: 40,  mh: 40,  cw: 90,  ch: 90  },
      { mw: 60,  mh: 60,  cw: 150, ch: 150 },
      { mw: 100, mh: 10,  cw: 150, ch: 40  },
      { mw: 10,  mh: 100, cw: 40,  ch: 150 },
    ];
    const sides: PortalSide[] = ['top', 'bottom', 'left', 'right'];

    for (const { mw, mh, cw, ch } of testCases) {
      for (const side of sides) {
        const point = pointOnSide(mw, mh, side);
        const maze = mazeWithPortals(mw, mh, { point, side }, { point, side });
        const markerSize = MINIMAP_BADGE_RADIUS * 2;
        const totalW = mw * CELL_SIZE + MINIMAP_PADDING * 2;
        const totalH = mh * CELL_SIZE + MINIMAP_PADDING * 2;
        const mazeAspect = totalW / totalH;
        const containerAspect = cw / ch;
        let bounds;
        if (mazeAspect > containerAspect) {
          const rh = cw / mazeAspect;
          bounds = { x: 0, y: (ch - rh) / 2, width: cw, height: rh, svgWidth: totalW, svgHeight: totalH, containerWidth: cw, containerHeight: ch };
        } else {
          const rw = ch * mazeAspect;
          bounds = { x: (cw - rw) / 2, y: 0, width: rw, height: ch, svgWidth: totalW, svgHeight: totalH, containerWidth: cw, containerHeight: ch };
        }

        const pos = getMinimapEndpointMarkerPosition(maze, CELL_SIZE, point, markerSize, bounds as import('../../src/components/maze/FullscreenMazePlayer').MinimapRenderedBounds);
        expect(pos, `${side} ${mw}x${mh} in ${cw}x${ch}`).not.toBeNull();

        const px = Number(pos!.left);
        const py = Number(pos!.top);
        const scale = bounds.width / totalW;
        const mazeLeft   = bounds.x + MINIMAP_PADDING * scale;
        const mazeTop    = bounds.y + MINIMAP_PADDING * scale;
        const mazeRight  = mazeLeft + mw * CELL_SIZE * scale;
        const mazeBottom = mazeTop  + mh * CELL_SIZE * scale;

        // Along-edge: marker center must align with the portal cell center (t = (portal + 0.5) / dim).
        // Perpendicular: marker must be within the maze content rect (not outside walls).
        if (side === 'top' || side === 'bottom') {
          const expectedX = mazeLeft + (point.x + 0.5) * CELL_SIZE * scale;
          expect(px).toBeCloseTo(expectedX, 5);
          expect(py).toBeGreaterThanOrEqual(mazeTop - FP_EPSILON);
          expect(py).toBeLessThanOrEqual(mazeBottom + FP_EPSILON);
        } else {
          const expectedY = mazeTop + (point.y + 0.5) * CELL_SIZE * scale;
          expect(py).toBeCloseTo(expectedY, 5);
          expect(px).toBeGreaterThanOrEqual(mazeLeft - FP_EPSILON);
          expect(px).toBeLessThanOrEqual(mazeRight + FP_EPSILON);
        }
      }
    }
  });
});
