import type { MazeData, Point } from '../../types/maze';
import { WALL_E, WALL_N, WALL_S, WALL_W } from '../../types/maze';

export type PortalSide = 'top' | 'right' | 'bottom' | 'left';

export type RenderedMazeBounds = {
  /** x coordinate of the maze body's left outer wall in rendered units. */
  x: number;
  /** y coordinate of the maze body's top outer wall in rendered units. */
  y: number;
  /** Width of the maze body between the left and right outer walls. */
  width: number;
  /** Height of the maze body between the top and bottom outer walls. */
  height: number;
};

export type EndpointMarkerPlacementMode = 'outside' | 'inside';

export type EndpointMarkerPositionOptions = {
  mazeWidth: number;
  mazeHeight: number;
  cellSize: number;
  bounds: RenderedMazeBounds;
  portal: Point;
  portalSide: PortalSide;
  markerRadius: number;
  /** Whether to place the badge outside the maze body or inset it inside compact surfaces. */
  placementMode?: EndpointMarkerPlacementMode;
  /** Optional gap between the marker badge edge and the maze body for outside placement. */
  outsideGap?: number;
  /** Optional inset gap beyond the marker radius for inside placement. */
  insideGap?: number;
};

export type EndpointMarkerCenter = { x: number; y: number };

export const ENDPOINT_MARKER_OUTSIDE_GAP_PX = 2;
export const ENDPOINT_MARKER_INSIDE_GAP_PX = 0;

const SIDE_TO_WALL: Record<PortalSide, number> = {
  top: WALL_N,
  right: WALL_E,
  bottom: WALL_S,
  left: WALL_W,
};

function isDevEnvironment(): boolean {
  return Boolean(import.meta.env?.DEV);
}

/**
 * Infer the side of a portal from the opened perimeter wall. Returns null when
 * the point is not on a perimeter edge or no outward wall has been opened,
 * because guessing a side can put an endpoint marker inside the maze body.
 */
export function inferPortalSide(maze: MazeData, portal: Point): PortalSide | null {
  if (
    portal.x < 0 ||
    portal.y < 0 ||
    portal.x >= maze.width ||
    portal.y >= maze.height
  ) {
    return null;
  }

  const cell = maze.grid[portal.y * maze.width + portal.x];
  const candidates: PortalSide[] = [];

  if (portal.y === 0) candidates.push('top');
  if (portal.x === maze.width - 1) candidates.push('right');
  if (portal.y === maze.height - 1) candidates.push('bottom');
  if (portal.x === 0) candidates.push('left');

  if (candidates.length === 0) return null;

  return candidates.find((side) => (cell & SIDE_TO_WALL[side]) === 0) ?? null;
}

export function warnInvalidPortalSide(maze: MazeData, portal: Point, label: string): void {
  if (!isDevEnvironment()) return;

  console.warn('[maze:endpoint-marker] Unable to infer portal side; marker will not be rendered.', {
    label,
    maze: { slug: maze.slug, width: maze.width, height: maze.height, seed: maze.seed },
    portal,
    cell: maze.grid[portal.y * maze.width + portal.x],
  });
}

/**
 * Compute an endpoint marker center from rendered maze geometry and portal side.
 * The marker aligns with the portal opening along the edge axis. Outside mode
 * projects away from the matching maze border; inside mode insets the marker
 * into the maze body for compact surfaces such as minimaps.
 */
export function getEndpointMarkerCenter({
  mazeWidth,
  mazeHeight,
  cellSize,
  bounds,
  portal,
  portalSide,
  markerRadius,
  placementMode = 'outside',
  outsideGap = ENDPOINT_MARKER_OUTSIDE_GAP_PX,
  insideGap = ENDPOINT_MARKER_INSIDE_GAP_PX,
}: EndpointMarkerPositionOptions): EndpointMarkerCenter {
  const left = bounds.x;
  const top = bounds.y;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const edgeOffset = markerRadius + Math.max(0, placementMode === 'inside' ? insideGap : outsideGap);
  const portalCenterX = left + (Math.min(Math.max(portal.x, 0), mazeWidth - 1) + 0.5) * cellSize;
  const portalCenterY = top + (Math.min(Math.max(portal.y, 0), mazeHeight - 1) + 0.5) * cellSize;

  switch (portalSide) {
    case 'top':
      return { x: portalCenterX, y: placementMode === 'inside' ? top + edgeOffset : top - edgeOffset };
    case 'bottom':
      return { x: portalCenterX, y: placementMode === 'inside' ? bottom - edgeOffset : bottom + edgeOffset };
    case 'left':
      return { x: placementMode === 'inside' ? left + edgeOffset : left - edgeOffset, y: portalCenterY };
    case 'right':
      return { x: placementMode === 'inside' ? right - edgeOffset : right + edgeOffset, y: portalCenterY };
  }
}

export function getMazeBodyBounds(width: number, height: number, cellSize: number, padding: number): RenderedMazeBounds {
  return {
    x: padding,
    y: padding,
    width: width * cellSize,
    height: height * cellSize,
  };
}
