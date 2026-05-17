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

/**
 * SVG path data for the finish (exit) marker glyph — a simplified 3×2 checkered flag,
 * no pole, designed for a 24×24 viewBox with the amber circle at r=8.8 centered at 12,12.
 *
 * White cells occupy positions (col0,row0), (col2,row0), (col1,row1) of a 3-column × 2-row
 * grid spanning x=[6.5,17.5], y=[8,15]. The amber badge background fills the alternate cells.
 */
export const FINISH_CHECKER_PATH =
  'M6.5,8h3.67v3.5h-3.67ZM13.84,8h3.67v3.5h-3.67ZM10.17,11.5h3.67v3.5h-3.67Z';
