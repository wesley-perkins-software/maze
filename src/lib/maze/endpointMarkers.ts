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

export type EndpointMarkerPositionOptions = {
  mazeWidth: number;
  mazeHeight: number;
  cellSize: number;
  bounds: RenderedMazeBounds;
  portal: Point;
  portalSide: PortalSide;
  markerRadius: number;
  /**
   * How much of the marker radius should extend back over the maze border.
   * The marker center remains outside the maze whenever this is less than the
   * marker radius.
   */
  overhangAmount: number;
};

export type EndpointMarkerCenter = { x: number; y: number };

const SIDE_TO_WALL: Record<PortalSide, number> = {
  top: WALL_N,
  right: WALL_E,
  bottom: WALL_S,
  left: WALL_W,
};

/**
 * Infer the side of a portal from the opened perimeter wall. Coordinate checks
 * are used as a fallback for synthetic/test mazes that do not include wall data.
 */
export function inferPortalSide(maze: MazeData, portal: Point): PortalSide {
  const cell = maze.grid[portal.y * maze.width + portal.x];
  const candidates: PortalSide[] = [];

  if (portal.y === 0) candidates.push('top');
  if (portal.x === maze.width - 1) candidates.push('right');
  if (portal.y === maze.height - 1) candidates.push('bottom');
  if (portal.x === 0) candidates.push('left');

  const openCandidate = candidates.find((side) => (cell & SIDE_TO_WALL[side]) === 0);
  if (openCandidate) return openCandidate;

  return candidates[0] ?? 'top';
}

/**
 * Compute an endpoint marker center from rendered maze geometry and portal side.
 * The marker aligns with the portal opening along the edge axis and projects
 * outside the matching maze border on the perpendicular axis.
 */
export function getEndpointMarkerCenter({
  mazeWidth,
  mazeHeight,
  cellSize,
  bounds,
  portal,
  portalSide,
  markerRadius,
  overhangAmount,
}: EndpointMarkerPositionOptions): EndpointMarkerCenter {
  const left = bounds.x;
  const top = bounds.y;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const clampedOverhang = Math.min(Math.max(0, overhangAmount), markerRadius);
  const outsideOffset = markerRadius - clampedOverhang;
  const portalCenterX = left + (Math.min(Math.max(portal.x, 0), mazeWidth - 1) + 0.5) * cellSize;
  const portalCenterY = top + (Math.min(Math.max(portal.y, 0), mazeHeight - 1) + 0.5) * cellSize;

  switch (portalSide) {
    case 'top':
      return { x: portalCenterX, y: top - outsideOffset };
    case 'bottom':
      return { x: portalCenterX, y: bottom + outsideOffset };
    case 'left':
      return { x: left - outsideOffset, y: portalCenterY };
    case 'right':
      return { x: right + outsideOffset, y: portalCenterY };
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
