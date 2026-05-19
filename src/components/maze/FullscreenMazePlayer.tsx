import { useReducer, useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { MazeData } from '../../types/maze';
import { MazeRenderer } from './MazeRenderer';
import { Timer } from './Timer';
import { gameReducer, createInitialState } from '../../lib/gameplay/reducer';
import { useKeyboardInput, useTouchInput } from '../../lib/gameplay/input';
import type { GameAction } from '../../lib/gameplay/types';
import { DPad } from './DPad';
import { inBounds } from '../../lib/maze/utils';
import { solveMazeFrom } from '../../lib/maze/solver';
import { getEndpointMarkerCenter, getMazeBodyBounds, inferPortalSide, warnInvalidPortalSide } from '../../lib/maze/endpointMarkers';
import { getMazeDebugSummary, shouldLogMazeStateDebug } from '../../lib/maze/fingerprint';
import { FinishMarkerIcon, START_MARKER_COLOR } from './EndpointMarkerGlyphs';

export interface SolveStats {
  elapsedMs: number;
  stepCount: number;
  hintsUsed: number;
  isNewBest: boolean;
}

const PLAY_CELL_SIZE = 32;
const PAN_LOOKAHEAD = PLAY_CELL_SIZE * 1; // extra px revealed when the camera pans
const MAZE_PADDING = 32;     // must be >= SAFE_PAD to guarantee player visibility at maze edges
const PLAY_ENDPOINT_MARKER_RADIUS = PLAY_CELL_SIZE * 0.38;
const TOP_BAR_H = 44;
// AD_SLOT: Reserved for future monetization.
// Recommended placement: between maze viewport and control strip (above controls, below maze).
//   - Banner (320×50): set AD_SLOT_H = 50, place the div above the control strip.
//   - Rewarded (after solve): show a full-screen ad before the "Play Again" screen — highest CPM.
// To activate banner: set AD_SLOT_H = 50 and un-comment the ad div below the maze viewport.
const AD_SLOT_H = 0;
const SAFE_PAD = 32;
function getMobileMinimapMaxSize(dockH: number): number {
  if (dockH >= 192) return 120;
  if (dockH >= 168) return 96;
  return 90;
}
const MOBILE_CONTROL_DOCK_Y_PADDING = 10;

interface ViewportSize {
  w: number;
  h: number;
}

function getWindowViewportSize(): ViewportSize {
  if (typeof window === 'undefined') return { w: 390, h: 844 };

  return {
    w: Math.round(window.visualViewport?.width ?? window.innerWidth),
    h: Math.round(window.visualViewport?.height ?? window.innerHeight),
  };
}

function getElementSize(el: HTMLElement | null): ViewportSize | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { w: Math.round(rect.width), h: Math.round(rect.height) };
}

function sizesEqual(a: ViewportSize, b: ViewportSize): boolean {
  return a.w === b.w && a.h === b.h;
}
function getMobileDockHeight(viewportH: number): number {
  if (viewportH >= 700) return 192;
  if (viewportH >= 580) return 168;
  return 148;
}
const SIDEBAR_W = 224;
const SIDEBAR_MINIMAP_SIZE = 192;
// Fixed stage height for the desktop minimap regardless of maze aspect ratio.
// 240px = 192px max minimap + ~24px breathing room on each side so endpoint
// badge artwork (radius 13px) sits fully inside the stage for square mazes.
const SIDEBAR_MINIMAP_STAGE_H = 240;
const SIDEBAR_AD_ENABLED = false;
// AD_SLOT: Pause-screen banner. Set to true when an ad provider is wired up.
// The slot renders below Resume/stats, never above the primary action.
const PAUSE_AD_ENABLED = false;
const PERSONAL_BEST_KEY = (slug: string) => `pb:${slug}`;
const TRAIL_VISIBILITY_KEY = 'maze:show-trail';
const SOLVE_REVEAL_DELAY_MS = 250;

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPathStartCell(maze: MazeData, playerPosition: MazeData['entry']): MazeData['entry'] {
  return inBounds(playerPosition, maze.width, maze.height) ? playerPosition : maze.entry;
}

function getHintStepCount(maze: MazeData): number {
  return clamp(8, Math.round(Math.max(maze.width, maze.height) * 0.4), 20);
}

const MINIMAP_PADDING = 2;
// How many px the minimap endpoint marker center is inset from the perimeter wall.
// A small value places the marker straddling the wall edge (half-inside, half-outside)
// rather than fully inside the maze body.
const MINIMAP_MARKER_EDGE_INSET_PX = 2;
// Both mobile and desktop minimap containers use border-2 (2px each side = 4px total).
// The SVG fills the content area (containerSize - 4px), so all bounds must be computed
// against the content area, not the outer box, to keep marker positions pixel-aligned
// with the rendered maze walls.
const MINIMAP_BORDER_WIDTH = 2;
const MINIMAP_ENDPOINT_MARKER_SIZE = 24;
const MINIMAP_RAIL_ENDPOINT_MARKER_SIZE = 18;
const MINIMAP_PLAYER_MARKER_SIZE = 12;
const MINIMAP_RAIL_PLAYER_MARKER_SIZE = 10;
const MINIMAP_RAIL_ASPECT_THRESHOLD = 3;
const MINIMAP_RAIL_SHORT_SIDE = 56;
const MINIMAP_RAIL_MAX_LONG_SIDE = 184;
const MINIMAP_RAIL_MIN_LONG_SIDE = 140;
const MINIMAP_RAIL_MARKER_EDGE_RESERVE = Math.ceil(MINIMAP_RAIL_ENDPOINT_MARKER_SIZE / 2);
const MINIMAP_MOBILE_CENTER_GUTTER = 36;
const MINIMAP_MOBILE_PANEL_EDGE_PADDING = 8;
const MINIMAP_MOBILE_RAIL_SAFETY_GAP = 4;
const DESKTOP_MINIMAP_ENDPOINT_MARKER_SIZE = 26;
const DESKTOP_MINIMAP_PLAYER_MARKER_SIZE = 12;
const MINIMAP_PLAYER_MARKER_COLOR = '#2563eb';
const PLAYER_MARKER_COLOR = '#2563eb';

const MINIMAP_VIEWPORT_HIDE_NEAR_FULL_RATIO = 0.94;

type MinimapLayout = 'square' | 'horizontal-rail' | 'vertical-rail';

export interface MinimapRenderedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  svgWidth: number;
  svgHeight: number;
  containerWidth: number;
  containerHeight: number;
}

function shouldShowMinimapViewportFrame(
  frameWidth: number,
  frameHeight: number,
  bounds: MinimapRenderedBounds,
): boolean {
  if (bounds.width <= 0 || bounds.height <= 0) return false;

  const widthRatio = frameWidth / bounds.width;
  const heightRatio = frameHeight / bounds.height;
  // Hide only when the viewport covers nearly the entire minimap; otherwise
  // keep the frame visible even on small/medium mazes.
  const coversNearlyAllWidth = widthRatio >= MINIMAP_VIEWPORT_HIDE_NEAR_FULL_RATIO;
  const coversNearlyAllHeight = heightRatio >= MINIMAP_VIEWPORT_HIDE_NEAR_FULL_RATIO;

  return !(coversNearlyAllWidth && coversNearlyAllHeight);
}

function getMobileMinimapLayout(maze: MazeData): MinimapLayout {
  const widthRatio = maze.width / maze.height;
  const heightRatio = maze.height / maze.width;

  if (widthRatio > MINIMAP_RAIL_ASPECT_THRESHOLD) return 'horizontal-rail';
  if (heightRatio > MINIMAP_RAIL_ASPECT_THRESHOLD) return 'vertical-rail';
  return 'square';
}

function getMobileDockPanelWidth(viewportWidth: number) {
  return Math.max(0, viewportWidth / 2);
}

function getMobileMinimapSlotWidth(panelWidth: number, layout: MinimapLayout) {
  if (layout !== 'horizontal-rail') {
    return Math.max(0, Math.floor(panelWidth));
  }

  // Endpoint badges sit outside the rail edge and have visible shadows, so use
  // the full badge diameter as a conservative safe inset rather than only the
  // mathematical center-to-edge radius. This keeps the complete marker artwork
  // inside the fixed 50% dock panel on narrow mobile screens.
  const markerSafeInset = MINIMAP_RAIL_ENDPOINT_MARKER_SIZE + MINIMAP_MOBILE_RAIL_SAFETY_GAP;
  const availableRailWidth = panelWidth
    - MINIMAP_MOBILE_CENTER_GUTTER
    - MINIMAP_MOBILE_PANEL_EDGE_PADDING * 2
    - markerSafeInset * 2;

  return Math.max(0, Math.floor(availableRailWidth));
}

function getMobileMinimapContainerSize(layout: MinimapLayout, panelWidth: number, slotH: number, minimapMaxSize: number) {
  const slotWidth = getMobileMinimapSlotWidth(panelWidth, layout);
  const squareSide = Math.min(minimapMaxSize, slotWidth, slotH);
  const verticalRailMaxLongSide = slotH - MINIMAP_RAIL_MARKER_EDGE_RESERVE * 2;

  if (layout === 'square') {
    return { width: squareSide, height: squareSide };
  }

  const horizontalMaxSide = Math.min(MINIMAP_RAIL_MAX_LONG_SIDE, slotWidth);
  const horizontalMinSide = Math.min(MINIMAP_RAIL_MIN_LONG_SIDE, horizontalMaxSide);
  const horizontalLongSide = clamp(horizontalMinSide, slotWidth, horizontalMaxSide);

  if (layout === 'horizontal-rail') {
    return {
      width: horizontalLongSide,
      height: Math.min(MINIMAP_RAIL_SHORT_SIDE, slotH),
    };
  }

  return {
    width: Math.min(MINIMAP_RAIL_SHORT_SIDE, slotWidth),
    height: Math.min(verticalRailMaxLongSide, slotH),
  };
}

function getContainedMinimapBounds({
  containerWidth,
  containerHeight,
  svgWidth,
  svgHeight,
}: {
  containerWidth: number;
  containerHeight: number;
  svgWidth: number;
  svgHeight: number;
}): MinimapRenderedBounds {
  const mazeAspect = svgWidth / svgHeight;
  const containerAspect = containerWidth / containerHeight;

  if (mazeAspect > containerAspect) {
    const renderedHeight = containerWidth / mazeAspect;

    return {
      x: 0,
      y: (containerHeight - renderedHeight) / 2,
      width: containerWidth,
      height: renderedHeight,
      svgWidth,
      svgHeight,
      containerWidth,
      containerHeight,
    };
  }

  const renderedWidth = containerHeight * mazeAspect;

  return {
    x: (containerWidth - renderedWidth) / 2,
    y: 0,
    width: renderedWidth,
    height: containerHeight,
    svgWidth,
    svgHeight,
    containerWidth,
    containerHeight,
  };
}

export function getMinimapEndpointMarkerPosition(
  maze: MazeData,
  cellSize: number,
  point: MazeData['entry'],
  markerSize: number,
  bounds?: MinimapRenderedBounds,
) {
  const totalW = maze.width * cellSize + MINIMAP_PADDING * 2;
  const totalH = maze.height * cellSize + MINIMAP_PADDING * 2;
  const side = inferPortalSide(maze, point);

  if (!side) {
    warnInvalidPortalSide(maze, point, 'minimap endpoint');
    return null;
  }

  if (!bounds) {
    const marker = getEndpointMarkerCenter({
      mazeWidth: maze.width,
      mazeHeight: maze.height,
      cellSize,
      bounds: getMazeBodyBounds(maze.width, maze.height, cellSize, MINIMAP_PADDING),
      portal: point,
      portalSide: side,
      markerRadius: MINIMAP_MARKER_EDGE_INSET_PX,
      placementMode: 'inside',
    });

    return {
      left: `${(marker.x / totalW) * 100}%`,
      top: `${(marker.y / totalH) * 100}%`,
    };
  }

  const renderedMazeWidth = (maze.width * cellSize / totalW) * bounds.width;
  const renderedCellSize = renderedMazeWidth / maze.width;
  const marker = getEndpointMarkerCenter({
    mazeWidth: maze.width,
    mazeHeight: maze.height,
    cellSize: renderedCellSize,
    bounds: {
      x: bounds.x + (MINIMAP_PADDING / totalW) * bounds.width,
      y: bounds.y + (MINIMAP_PADDING / totalH) * bounds.height,
      width: (maze.width * cellSize / totalW) * bounds.width,
      height: (maze.height * cellSize / totalH) * bounds.height,
    },
    portal: point,
    portalSide: side,
    markerRadius: MINIMAP_MARKER_EDGE_INSET_PX,
    placementMode: 'inside',
  });

  return {
    left: marker.x,
    top: marker.y,
  };
}

function getMinimapPointPosition(
  maze: MazeData,
  cellSize: number,
  point: MazeData['entry'],
  bounds: MinimapRenderedBounds,
  markerSize: number,
) {
  const totalW = maze.width * cellSize + MINIMAP_PADDING * 2;
  const totalH = maze.height * cellSize + MINIMAP_PADDING * 2;
  const x = MINIMAP_PADDING + point.x * cellSize + cellSize / 2;
  const y = MINIMAP_PADDING + point.y * cellSize + cellSize / 2;
  const markerPadding = markerSize / 2;

  return {
    left: clamp(markerPadding, bounds.x + (x / totalW) * bounds.width, bounds.containerWidth - markerPadding),
    top: clamp(markerPadding, bounds.y + (y / totalH) * bounds.height, bounds.containerHeight - markerPadding),
  };
}

function MinimapPlayerMarker({
  maze,
  cellSize,
  playerPosition,
  bounds,
  markerSize,
}: {
  maze: MazeData;
  cellSize: number;
  playerPosition: MazeData['entry'];
  bounds: MinimapRenderedBounds;
  markerSize: number;
}) {
  const pos = getMinimapPointPosition(maze, cellSize, playerPosition, bounds, markerSize);

  return (
    <svg
      viewBox="0 0 24 24"
      className="minimap-player-marker pointer-events-none absolute z-30 overflow-visible"
      style={{
        left: pos.left,
        top: pos.top,
        width: markerSize,
        height: markerSize,
        transform: 'translate(-50%, -50%)',
        // Avoid CSS filters/transitions on the moving minimap marker. Some mobile
        // compositors leave gray smear trails when a filtered SVG moves over the
        // scaled minimap, which can look like a phantom path.
      }}
      data-marker-type="player"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="11" fill="white" />
      <circle cx="12" cy="12" r="7.25" fill={MINIMAP_PLAYER_MARKER_COLOR} />
    </svg>
  );
}

function MinimapEndpointMarkers({
  maze,
  cellSize,
  markerSize = MINIMAP_ENDPOINT_MARKER_SIZE,
  bounds,
}: {
  maze: MazeData;
  cellSize: number;
  markerSize?: number;
  bounds?: MinimapRenderedBounds;
}) {
  const entryPos = getMinimapEndpointMarkerPosition(maze, cellSize, maze.entry, markerSize, bounds);
  const exitPos = getMinimapEndpointMarkerPosition(maze, cellSize, maze.exit, markerSize, bounds);
  const entrySide = inferPortalSide(maze, maze.entry);
  const markerStyle = {
    width: markerSize,
    height: markerSize,
    transform: 'translate(-50%, -50%)',
  };

  // Arrow direction based on which perimeter wall the entry is on (viewBox 0 0 24 24, circle r=8.8 at 12,12)
  const entryArrow = (() => {
    const side = entrySide;
    if (!side) return '';
    if (side === 'top')    return '6.72,8.92 17.28,8.92 12,16.84';   // top → DOWN
    if (side === 'bottom') return '6.72,15.08 17.28,15.08 12,7.16';  // bottom → UP
    if (side === 'left')   return '8.92,6.72 16.84,12 8.92,17.28';   // left → RIGHT
    return '15.08,6.72 7.16,12 15.08,17.28';                         // right → LEFT
  })();

  return (
    <>
      {entryPos && (
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute z-20 overflow-visible"
        style={{ ...markerStyle, ...entryPos }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="white" />
        <circle cx="12" cy="12" r="8.8" fill={START_MARKER_COLOR} opacity="0.9" />
        {entryArrow && <polygon points={entryArrow} fill="white" opacity="0.95" />}
      </svg>
      )}
      {exitPos && (
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute z-20 overflow-visible"
        style={{ ...markerStyle, ...exitPos }}
        aria-hidden="true"
      >
        <FinishMarkerIcon />
      </svg>
      )}
    </>
  );
}

function getPersonalBest(slug: string): number | null {
  try {
    const raw = localStorage.getItem(PERSONAL_BEST_KEY(slug));
    return raw ? parseInt(raw, 10) : null;
  } catch { return null; }
}

function savePersonalBest(slug: string, ms: number): boolean {
  try {
    const prev = getPersonalBest(slug);
    if (prev === null || ms < prev) {
      localStorage.setItem(PERSONAL_BEST_KEY(slug), String(ms));
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function formatPauseTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m === 0) return `${s} second${s !== 1 ? 's' : ''}`;
  const rem = s % 60;
  return rem === 0 ? `${m} min` : `${m} min ${String(rem).padStart(2, '0')} sec`;
}

export interface FullscreenMazePlayerProps {
  maze: MazeData;
  /** Optional label shown in the top bar, e.g. "Today's Maze" for the daily challenge. */
  label?: string;
  onSolve?: (stats: SolveStats) => void;
  onClose: () => void;
  /** Inject restored game state (from a saved session). Replaces createInitialState. */
  initialGameState?: import('../../lib/gameplay/types.js').GameState;
  /** Restore the showTrail preference from a saved session. */
  initialShowTrail?: boolean;
  /**
   * Called on state changes (debounced 500ms) and immediately on visibilitychange/pagehide.
   * Use to persist the session to localStorage. Not called when status is 'solved'.
   */
  onSessionChange?: (state: import('../../lib/gameplay/types.js').GameState, showTrail: boolean) => void;
  /** Called after a confirmed reset so the caller can clear any saved session. */
  onReset?: () => void;
}

export function FullscreenMazePlayer({
  maze,
  label,
  onSolve,
  onClose,
  initialGameState,
  initialShowTrail,
  onSessionChange,
  onReset,
}: FullscreenMazePlayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mazeViewportRef = useRef<HTMLDivElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isNewBestRef = useRef(false);
  const camXRef = useRef<number | null>(null);
  const camYRef = useRef<number | null>(null);
  const prevStatusRef = useRef<ReturnType<typeof createInitialState>['status']>('idle');
  // Mirrors cameraMode state so dispatchWithLookExit can read it without a dep.
  const cameraModeRef = useRef<'follow' | 'look'>('follow');
  // Set by exitLookMode; read once during the immediately-following render to
  // suppress the CSS transition so the camera snaps to the player rather than
  // animating back with non-integer intermediate positions.
  const justExitedLookModeRef = useRef(false);
  // Stores the camera center that was active just before entering look mode.
  // Only written on first entry; repeated minimap taps preserve the original.
  // Cleared by exitLookMode so all exit paths restore the same position.
  const previousCameraRef = useRef<{ x: number; y: number } | null>(null);
  const controlStripRef = useRef<HTMLDivElement>(null);
  const [controlStripH, setControlStripH] = useState(168);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetConfirming, setResetConfirming] = useState(false);
  const resetConfirmTimerRef = useRef<number | null>(null);
  const initialCameraReadyMazeKeyRef = useRef<string | null>(null);

  // Left-handed mode: D-pad on left, minimap on right (persisted)
  const [leftHanded, setLeftHanded] = useState(() => {
    try { return localStorage.getItem('maze:lh') === '1'; } catch { return false; }
  });

  const toggleLeftHanded = () => {
    setLeftHanded(v => {
      const next = !v;
      try { localStorage.setItem('maze:lh', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const [showTrail, setShowTrail] = useState(() => {
    if (initialShowTrail !== undefined) return initialShowTrail;
    try { return localStorage.getItem(TRAIL_VISIBILITY_KEY) === 'true'; } catch { return false; }
  });

  const toggleShowTrail = () => {
    setShowTrail(v => {
      const next = !v;
      try { localStorage.setItem(TRAIL_VISIBILITY_KEY, next ? 'true' : 'false'); } catch {}
      return next;
    });
  };

  const [vpSize, setVpSize] = useState(getWindowViewportSize);
  const [mazeViewportSize, setMazeViewportSize] = useState<ViewportSize | null>(null);
  const [initialCameraReady, setInitialCameraReady] = useState(() => getWindowViewportSize().w >= 768);

  // ── Look-mode camera state ───────────────────────────────────────────────────
  // Isolated: remove these two lines + related code blocks to fully revert the feature.
  const [cameraMode, setCameraMode] = useState<'follow' | 'look'>('follow');
  const [lookTargetPx, setLookTargetPx] = useState<{ x: number; y: number } | null>(null);
  // True only while a pointer is actively held on the minimap. Suppresses the
  // CSS transition so the camera snaps to the finger with no mid-interpolation
  // blur on high-DPR mobile screens.
  const [isMinimapDragging, setIsMinimapDragging] = useState(false);

  useEffect(() => {
    if (!shouldLogMazeStateDebug()) return;

    console.debug('[maze:state] fullscreen player initialization', getMazeDebugSummary(maze));
  }, [maze]);

  const [state, dispatch] = useReducer(
    (s: ReturnType<typeof createInitialState>, a: Parameters<typeof gameReducer>[1]) =>
      gameReducer(s, a, maze),
    // Use injected state (from a saved session) when available; otherwise derive fresh.
    initialGameState ?? createInitialState(maze),
  );

  const handleMobilePauseToggle = () => {
    if (state.status === 'playing') {
      setMenuOpen(false);
      dispatch({ type: 'PAUSE' });
      return;
    }

    dispatch({ type: 'RESUME' });
  };

  const isMobileMenuBlocked = state.status === 'paused' || state.status === 'solved';
  const toggleMobileMenu = () => {
    if (isMobileMenuBlocked) {
      setMenuOpen(false);
      return;
    }

    setMenuOpen(v => !v);
  };

  // Exits look mode and returns to follow-camera. Stable reference (empty deps).
  const exitLookMode = useCallback(() => {
    // Restore the camera refs to the saved pre-look position so the follow
    // algorithm resumes from exactly where the user was before tapping the
    // minimap. Since movement is disabled during look mode the player has not
    // moved, so these saved coordinates are still within the safe zone.
    if (previousCameraRef.current !== null) {
      camXRef.current = previousCameraRef.current.x;
      camYRef.current = previousCameraRef.current.y;
      previousCameraRef.current = null;
    }
    setCameraMode('follow');
    setLookTargetPx(null);
    setIsMinimapDragging(false);
    justExitedLookModeRef.current = true;
  }, []);

  // Wrapper passed to all movement inputs. When in look mode, the first RUN
  // only exits look mode (returns camera to player) without applying the move.
  // Uses cameraModeRef so the callback stays stable across mode changes.
  const dispatchWithLookExit = useCallback((action: GameAction) => {
    if (action.type === 'RUN' && cameraModeRef.current === 'look') {
      exitLookMode();
      return;
    }
    dispatch(action);
  }, [dispatch, exitLookMode]);

  // Timer tick
  useEffect(() => {
    if (state.status !== 'playing' || state.startTime === null) return;
    const id = setInterval(() => {
      dispatch({ type: 'TICK', elapsedMs: Date.now() - state.startTime! });
    }, 1000);
    return () => clearInterval(id);
  }, [state.status, state.startTime]);

  // ── Session autosave ─────────────────────────────────────────────────────────
  // Refs keep event handlers from going stale without re-registering listeners.
  const stateRef = useRef(state);
  stateRef.current = state;
  const showTrailRef = useRef(showTrail);
  showTrailRef.current = showTrail;
  const onSessionChangeRef = useRef(onSessionChange);
  onSessionChangeRef.current = onSessionChange;

  // Debounced save on every state/showTrail change (500ms after last update).
  // Skip idle (never moved) — there's nothing meaningful to restore.
  useEffect(() => {
    if (!onSessionChange || state.status === 'solved' || state.status === 'idle') return;
    const id = window.setTimeout(() => {
      onSessionChangeRef.current?.(stateRef.current, showTrailRef.current);
    }, 500);
    return () => clearTimeout(id);
  }, [state, showTrail, onSessionChange]);

  // Save immediately on unmount so progress is preserved when the player Exits.
  // The debounced effect's cleanup cancels the pending timeout before it fires,
  // so without this the last few seconds of movement could be lost.
  useEffect(() => {
    return () => {
      const s = stateRef.current;
      if (s.status === 'playing' || s.status === 'paused') {
        onSessionChangeRef.current?.(s, showTrailRef.current);
      }
    };
  }, []);

  // Immediate save on tab hide / page unload — critical for iOS Safari which
  // kills pages without firing beforeunload.
  useEffect(() => {
    if (!onSessionChange) return;
    const saveNow = () => {
      const s = stateRef.current;
      if (s.status === 'playing' || s.status === 'paused') {
        onSessionChangeRef.current?.(s, showTrailRef.current);
      }
    };
    document.addEventListener('visibilitychange', saveNow);
    window.addEventListener('pagehide', saveNow);
    return () => {
      document.removeEventListener('visibilitychange', saveNow);
      window.removeEventListener('pagehide', saveNow);
    };
  }, [onSessionChange]);

  // Conservative beforeunload guard while an unfinished maze is active.
  // Desktop browsers show a "Leave site?" prompt; mobile Safari ignores it,
  // which is fine — autosave handles that path.
  useEffect(() => {
    if (!onSessionChange) return;
    if (state.status !== 'playing' && state.status !== 'paused') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); return ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [onSessionChange, state.status]);

  // Delay parent completion UI long enough for the solved render to paint,
  // so players can see the cursor move onto the outside flag marker first.
  useEffect(() => {
    if (state.status !== 'solved') return;

    const isNewBest = maze.slug ? savePersonalBest(maze.slug, state.elapsedMs) : false;
    isNewBestRef.current = isNewBest;

    const id = window.setTimeout(() => {
      onSolve?.({ elapsedMs: state.elapsedMs, stepCount: state.trail.length, hintsUsed: state.hintsUsed, isNewBest });
    }, SOLVE_REVEAL_DELAY_MS);

    return () => window.clearTimeout(id);
  }, [state.status]);

  // Screen reader announcement
  useEffect(() => {
    if (state.status === 'solved' && announcerRef.current) {
      announcerRef.current.textContent = `Maze solved in ${Math.floor(state.elapsedMs / 1000)} seconds!`;
    }
  }, [state.status]);

  // Track browser viewport changes for responsive chrome and dock sizing.
  // Chrome mobile can report a different visual viewport after first paint as the
  // address bar expands/collapses, so listen to visualViewport and re-check after
  // one and two animation frames during mount/resize settling.
  useEffect(() => {
    const visualViewport = window.visualViewport;
    const rafIds = new Set<number>();

    const update = () => {
      setVpSize(prev => {
        const next = getWindowViewportSize();
        return sizesEqual(prev, next) ? prev : next;
      });
    };

    const scheduleUpdate = () => {
      update();
      const first = window.requestAnimationFrame(() => {
        rafIds.delete(first);
        update();
        const second = window.requestAnimationFrame(() => {
          rafIds.delete(second);
          update();
        });
        rafIds.add(second);
      });
      rafIds.add(first);
    };

    scheduleUpdate();
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('orientationchange', scheduleUpdate);
    visualViewport?.addEventListener('resize', scheduleUpdate);
    visualViewport?.addEventListener('scroll', scheduleUpdate);

    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', scheduleUpdate);
      visualViewport?.removeEventListener('resize', scheduleUpdate);
      visualViewport?.removeEventListener('scroll', scheduleUpdate);
      rafIds.forEach(id => window.cancelAnimationFrame(id));
    };
  }, []);

  // Measure the actual maze play viewport. This is the authoritative camera size:
  // it already excludes the top bar, mobile control dock, and safe-area padding.
  useEffect(() => {
    const el = mazeViewportRef.current;
    if (!el) return;

    const update = () => {
      const next = getElementSize(el);
      if (!next) return;
      setMazeViewportSize(prev => (prev && sizesEqual(prev, next) ? prev : next));
    };

    const rafIds = new Set<number>();
    const scheduleUpdate = () => {
      update();
      const first = window.requestAnimationFrame(() => {
        rafIds.delete(first);
        update();
        const second = window.requestAnimationFrame(() => {
          rafIds.delete(second);
          update();
        });
        rafIds.add(second);
      });
      rafIds.add(first);
    };

    const ro = new ResizeObserver(scheduleUpdate);
    ro.observe(el);
    scheduleUpdate();

    return () => {
      ro.disconnect();
      rafIds.forEach(id => window.cancelAnimationFrame(id));
    };
  }, []);

  // Measure control strip height for accurate camera math
  useEffect(() => {
    const el = controlStripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height;
      if (h) setControlStripH(Math.round(h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const mazeKey = `${maze.slug ?? 'maze'}:${maze.width}x${maze.height}:${maze.entry.x},${maze.entry.y}:${maze.exit.x},${maze.exit.y}`;

  // Mobile browsers can settle visualViewport and flex measurements shortly after
  // fullscreen play mounts. Keep the playfield hidden until the measured viewport
  // has driven one render of the initial camera transform, then reveal on the
  // following double-rAF so the first visible frame is already correctly framed.
  useEffect(() => {
    const isMobileFullscreen = vpSize.w < 768;

    if (!isMobileFullscreen) {
      initialCameraReadyMazeKeyRef.current = mazeKey;
      setInitialCameraReady(true);
      return;
    }

    if (initialCameraReadyMazeKeyRef.current === mazeKey) return;

    setInitialCameraReady(false);
    camXRef.current = null;
    camYRef.current = null;

    if (!mazeViewportSize) return;

    let cancelled = false;
    const rafIds: number[] = [];
    const first = window.requestAnimationFrame(() => {
      const second = window.requestAnimationFrame(() => {
        if (!cancelled) {
          initialCameraReadyMazeKeyRef.current = mazeKey;
          setInitialCameraReady(true);
        }
      });

      rafIds.push(second);
    });
    rafIds.push(first);

    return () => {
      cancelled = true;
      rafIds.forEach(id => window.cancelAnimationFrame(id));
    };
  }, [mazeKey, mazeViewportSize?.w, mazeViewportSize?.h, vpSize.w, vpSize.h]);

  // Close overflow menu whenever a modal/completion surface owns the UI.
  useEffect(() => {
    if (isMobileMenuBlocked) setMenuOpen(false);
  }, [isMobileMenuBlocked]);

  // Close overflow menu on outside tap/click
  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [menuOpen]);

  // Lock body scroll while fullscreen
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Clear look mode when the active maze changes or the game resets/solves.
  useEffect(() => { exitLookMode(); }, [mazeKey, exitLookMode]);
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'paused' || state.status === 'solved') exitLookMode();
  }, [state.status, exitLookMode]);

  const isActive = state.status === 'playing' || state.status === 'idle';

  // Pass dispatchWithLookExit to all movement inputs so any RUN action exits look mode.
  useKeyboardInput(dispatchWithLookExit, isActive);
  useTouchInput(mazeViewportRef, dispatchWithLookExit, isActive);

  const currentSolution = useMemo(() => {
    const startCell = getPathStartCell(maze, state.playerPosition);
    return solveMazeFrom(maze, startCell);
  }, [maze, state.playerPosition]);

  const isHintActive = state.hintCells.length > 0;

  const handleHint = useCallback(() => {
    if (isHintActive) {
      dispatch({ type: 'USE_HINT', cells: [] });
      return;
    }

    const hintSteps = getHintStepCount(maze);
    const pathFromPlayer = currentSolution;
    if (pathFromPlayer.length <= 1) return;

    // Include the current cell so the green hint is anchored at the player's
    // position and remains followable until completed or abandoned.
    dispatch({ type: 'USE_HINT', cells: pathFromPlayer.slice(0, hintSteps + 1) });
  }, [isHintActive, maze, currentSolution]);

  const handleResetRequest = useCallback(() => {
    setResetConfirming(true);
    if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current);
    resetConfirmTimerRef.current = window.setTimeout(() => setResetConfirming(false), 4000);
  }, []);

  const handleResetConfirm = useCallback(() => {
    if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current);
    setResetConfirming(false);
    dispatch({ type: 'RESET', startPosition: maze.entry });
    onReset?.();
  }, [maze.entry, onReset]);

  const handleResetCancel = useCallback(() => {
    if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current);
    setResetConfirming(false);
  }, []);

  useEffect(() => {
    return () => {
      if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current);
    };
  }, []);

  // ── Follow-camera math ───────────────────────────────────────────────────────
  const mazeW = maze.width  * PLAY_CELL_SIZE + MAZE_PADDING * 2;
  const mazeH = maze.height * PLAY_CELL_SIZE + MAZE_PADDING * 2;

  const pointEquals = (a: typeof maze.entry, b: typeof maze.entry) => a.x === b.x && a.y === b.y;
  const pointOnMarker = (point: typeof maze.entry, marker: typeof maze.entry) => (
    (marker.y === 0 && point.x === marker.x && point.y === -1) ||
    (marker.y === maze.height - 1 && point.x === marker.x && point.y === maze.height) ||
    (marker.x === 0 && point.x === -1 && point.y === marker.y) ||
    (marker.x === maze.width - 1 && point.x === maze.width && point.y === marker.y)
  );

  const mazeBounds = getMazeBodyBounds(maze.width, maze.height, PLAY_CELL_SIZE, MAZE_PADDING);
  const entrySide = inferPortalSide(maze, maze.entry);
  const exitSide = inferPortalSide(maze, maze.exit);
  if (!entrySide) warnInvalidPortalSide(maze, maze.entry, 'entry');
  if (!exitSide) warnInvalidPortalSide(maze, maze.exit, 'exit');

  const entryMarkerCenter = entrySide
    ? getEndpointMarkerCenter({
        mazeWidth: maze.width,
        mazeHeight: maze.height,
        cellSize: PLAY_CELL_SIZE,
        bounds: mazeBounds,
        portal: maze.entry,
        portalSide: entrySide,
        markerRadius: PLAY_ENDPOINT_MARKER_RADIUS,
        placementMode: 'outside',
      })
    : null;

  const exitMarkerCenter = exitSide
    ? getEndpointMarkerCenter({
        mazeWidth: maze.width,
        mazeHeight: maze.height,
        cellSize: PLAY_CELL_SIZE,
        bounds: mazeBounds,
        portal: maze.exit,
        portalSide: exitSide,
        markerRadius: PLAY_ENDPOINT_MARKER_RADIUS,
        placementMode: 'outside',
      })
    : null;

  const playerAtEntryCell = pointEquals(state.playerPosition, maze.entry);
  const playerAtExitCell = pointEquals(state.playerPosition, maze.exit);
  const playerOnEntryMarker = pointOnMarker(state.playerPosition, maze.entry);
  const playerOnExitMarker = pointOnMarker(state.playerPosition, maze.exit);

  const playerPx = (playerAtEntryCell || playerOnEntryMarker) && entryMarkerCenter
    ? entryMarkerCenter.x
    : (playerAtExitCell || playerOnExitMarker) && exitMarkerCenter
      ? exitMarkerCenter.x
      : MAZE_PADDING + state.playerPosition.x * PLAY_CELL_SIZE + PLAY_CELL_SIZE / 2;
  const playerPy = (playerAtEntryCell || playerOnEntryMarker) && entryMarkerCenter
    ? entryMarkerCenter.y
    : (playerAtExitCell || playerOnExitMarker) && exitMarkerCenter
      ? exitMarkerCenter.y
      : MAZE_PADDING + state.playerPosition.y * PLAY_CELL_SIZE + PLAY_CELL_SIZE / 2;

  const stripH = vpSize.w < 768 ? controlStripH : 0;
  const sidebarW = vpSize.w >= 768 ? SIDEBAR_W : 0;
  const fallbackViewW = Math.max(1, vpSize.w - sidebarW);
  const fallbackViewH = Math.max(1, vpSize.h - TOP_BAR_H - AD_SLOT_H - stripH);
  const viewW = Math.max(1, mazeViewportSize?.w ?? fallbackViewW);
  const viewH = Math.max(1, mazeViewportSize?.h ?? fallbackViewH);

  // Reset camera when game resets
  if (prevStatusRef.current !== 'idle' && state.status === 'idle') {
    camXRef.current = null;
    camYRef.current = null;
  }
  prevStatusRef.current = state.status;

  // Keep ref in sync with state so dispatchWithLookExit can read it without
  // adding cameraMode as a dep (which would re-register all input listeners).
  cameraModeRef.current = cameraMode;

  // ── Camera computation ───────────────────────────────────────────────────────
  // Safe zone is shrunk by PAN_LOOKAHEAD so the camera previews what's ahead.
  const safeW = Math.max(0, viewW / 2 - SAFE_PAD - PAN_LOOKAHEAD);
  const safeH = Math.max(0, viewH / 2 - SAFE_PAD - PAN_LOOKAHEAD);

  const isMobileFullscreen = vpSize.w < 768;
  const isInitializingMobileCamera = isMobileFullscreen && !initialCameraReady;

  let camX: number;
  let camY: number;

  if (cameraMode === 'look' && lookTargetPx !== null) {
    // Look mode: bypass safe-zone algorithm entirely, point at the look target.
    camX = lookTargetPx.x;
    camY = lookTargetPx.y;
  } else {
    // Follow mode: existing safe-zone algorithm, unchanged.
    camX = isInitializingMobileCamera ? playerPx : (camXRef.current ?? playerPx);
    camY = isInitializingMobileCamera ? playerPy : (camYRef.current ?? playerPy);

    if (playerPx > camX + safeW) camX = playerPx - safeW;
    else if (playerPx < camX - safeW) camX = playerPx + safeW;

    if (playerPy > camY + safeH) camY = playerPy - safeH;
    else if (playerPy < camY - safeH) camY = playerPy + safeH;
  }

  // Clamp to maze bounds — applied in both modes.
  if (mazeW > viewW) {
    camX = Math.max(viewW / 2, Math.min(mazeW - viewW / 2, camX));
  } else {
    camX = mazeW / 2;
  }
  if (mazeH > viewH) {
    camY = Math.max(viewH / 2, Math.min(mazeH - viewH / 2, camY));
  } else {
    camY = mazeH / 2;
  }

  camXRef.current = camX;
  camYRef.current = camY;

  // Round to integers so the maze always lands on pixel-aligned boundaries.
  // Fractional translate values cause blurriness on high-DPR mobile screens.
  const tx = Math.round(viewW / 2 - camX);
  const ty = Math.round(viewH / 2 - camY);

  // Compute CSS transition for the camera container. Look mode uses no
  // transition at all — CSS ease-out interpolates through non-integer
  // sub-pixel positions on each frame, which looks blurry on high-DPR
  // screens. Tap-to-look snaps instantly; drag already snaps (isMinimapDragging).
  // justExitedLookModeRef is read and immediately reset so the one render
  // immediately after exiting look mode also snaps (no return-to-player blur).
  const snapThisFrame = justExitedLookModeRef.current;
  justExitedLookModeRef.current = false;
  const lookModeTransition =
    (cameraMode === 'look' || isMinimapDragging || snapThisFrame)
      ? 'none'
      : 'transform 0.12s ease-out';
  const playerScreenX = playerPx + tx;
  const playerScreenY = playerPy + ty;
  const playerMarkerRadius = PLAY_CELL_SIZE * 0.32;
  const playerGlowRadius = PLAY_CELL_SIZE * 0.5;
  const showBottomStartPlayerOverlay = vpSize.w < 768
    && state.status !== 'paused'
    && playerOnEntryMarker
    && maze.entry.y === maze.height - 1;

  // ── Mobile dock sizing (responsive to viewport height) ───────────────────────
  const mobileDockH = getMobileDockHeight(vpSize.h);
  const mobileMiniMapSlotH = mobileDockH - MOBILE_CONTROL_DOCK_Y_PADDING * 2;
  const mobileMinimapMaxSize = getMobileMinimapMaxSize(mobileDockH);

  // ── Minimap ──────────────────────────────────────────────────────────────────
  // Minimum cellSize of 2 ensures at least 1px corridor space (cellSize=1 makes walls fill 100% → solid black).
  const minimapCell = Math.max(2, Math.ceil(mobileMinimapMaxSize / Math.max(maze.width, maze.height)));
  const mmSvgW = maze.width * minimapCell + MINIMAP_PADDING * 2;
  const mmSvgH = maze.height * minimapCell + MINIMAP_PADDING * 2;
  // Mobile fullscreen minimap: square for normal mazes, compact rails for extreme rectangles.
  const minimapLayout = getMobileMinimapLayout(maze);
  const mobileDockPanelW = getMobileDockPanelWidth(vpSize.w);
  const minimapSlotW = getMobileMinimapSlotWidth(mobileDockPanelW, minimapLayout);
  const { width: minimapContainerW, height: minimapContainerH } = getMobileMinimapContainerSize(minimapLayout, mobileDockPanelW, mobileMiniMapSlotH, mobileMinimapMaxSize);
  const isRailMinimap = minimapLayout !== 'square';
  // Use content-area dimensions (subtract the 2px border on each side) so that the
  // computed scale matches the actual scale of the SVG, which fills the content area.
  const minimapRenderedBounds = getContainedMinimapBounds({
    containerWidth: minimapContainerW - MINIMAP_BORDER_WIDTH * 2,
    containerHeight: minimapContainerH - MINIMAP_BORDER_WIDTH * 2,
    svgWidth: mmSvgW,
    svgHeight: mmSvgH,
  });

  // Viewport frame overlay on minimap — shows which region is currently visible.
  // The frame is positioned against the rendered maze bounds, not the square card bounds.
  const mmFrameW = Math.min(minimapRenderedBounds.width, (viewW / mazeW) * minimapRenderedBounds.width);
  const mmFrameH = Math.min(minimapRenderedBounds.height, (viewH / mazeH) * minimapRenderedBounds.height);
  const mmFrameX = minimapRenderedBounds.x + Math.max(0, Math.min(minimapRenderedBounds.width - mmFrameW, (-tx / mazeW) * minimapRenderedBounds.width));
  const mmFrameY = minimapRenderedBounds.y + Math.max(0, Math.min(minimapRenderedBounds.height - mmFrameH, (-ty / mazeH) * minimapRenderedBounds.height));

  const sidebarMinimapCell = Math.max(2, Math.ceil(SIDEBAR_MINIMAP_SIZE / Math.max(maze.width, maze.height)));
  const dmSvgW = maze.width * sidebarMinimapCell + MINIMAP_PADDING * 2;
  const dmSvgH = maze.height * sidebarMinimapCell + MINIMAP_PADDING * 2;
  // Desktop: always a fixed square card so the sidebar never collapses into a
  // tiny rail strip for wide/tall mazes. Maze content is letterboxed inside.
  const sidebarMinimapContainerW = SIDEBAR_MINIMAP_SIZE;
  const sidebarMinimapContainerH = SIDEBAR_MINIMAP_SIZE;

  const sidebarMinimapRenderedBounds = getContainedMinimapBounds({
    containerWidth: sidebarMinimapContainerW - MINIMAP_BORDER_WIDTH * 2,
    containerHeight: sidebarMinimapContainerH - MINIMAP_BORDER_WIDTH * 2,
    svgWidth: dmSvgW,
    svgHeight: dmSvgH,
  });
  // Frame anchored to the letterbox-aware rendered region (same pattern as mobile).
  const dmFrameW = Math.min(sidebarMinimapRenderedBounds.width, (viewW / mazeW) * sidebarMinimapRenderedBounds.width);
  const dmFrameH = Math.min(sidebarMinimapRenderedBounds.height, (viewH / mazeH) * sidebarMinimapRenderedBounds.height);
  const dmFrameX = sidebarMinimapRenderedBounds.x + Math.max(0, Math.min(sidebarMinimapRenderedBounds.width - dmFrameW, (-tx / mazeW) * sidebarMinimapRenderedBounds.width));
  const dmFrameY = sidebarMinimapRenderedBounds.y + Math.max(0, Math.min(sidebarMinimapRenderedBounds.height - dmFrameH, (-ty / mazeH) * sidebarMinimapRenderedBounds.height));

  // Keep markers in screen-space. Rail minimaps get smaller markers so they don't
  // dominate compact horizontal/vertical navigation aids.
  const minimapMarkerSize = isRailMinimap ? MINIMAP_RAIL_ENDPOINT_MARKER_SIZE : MINIMAP_ENDPOINT_MARKER_SIZE;
  const minimapPlayerMarkerSize = isRailMinimap ? MINIMAP_RAIL_PLAYER_MARKER_SIZE : MINIMAP_PLAYER_MARKER_SIZE;
  const showMinimapPlayerMarker = inBounds(state.playerPosition, maze.width, maze.height);
  // Fixed square card always has room for full-size desktop markers.
  const sidebarMarkerSize = DESKTOP_MINIMAP_ENDPOINT_MARKER_SIZE;

  const showMobileMinimapViewportFrame = shouldShowMinimapViewportFrame(mmFrameW, mmFrameH, minimapRenderedBounds);
  const showSidebarMinimapViewportFrame = shouldShowMinimapViewportFrame(dmFrameW, dmFrameH, sidebarMinimapRenderedBounds);
  const minimapViewportFrameClass = 'absolute z-10 rounded-sm pointer-events-none';
  const minimapViewportFrameStyle = { borderWidth: 2, borderStyle: 'solid' as const, borderColor: 'rgba(31, 41, 55, 0.64)', backgroundColor: 'transparent' };

  // Converts pointer event coordinates (relative to the minimap container) into
  // maze-pixel coordinates using the letterbox-aware rendered bounds. Works for
  // square, horizontal-rail, and vertical-rail layouts including 100×10 / 10×100.
  function minimapPointerToLookTarget(
    e: React.PointerEvent<HTMLDivElement>,
    bounds: MinimapRenderedBounds,
  ): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    // getBoundingClientRect() is relative to the outer box edge (includes border).
    // Subtract the border so coords are relative to the content area, matching bounds.
    const relX = e.clientX - rect.left - MINIMAP_BORDER_WIDTH;
    const relY = e.clientY - rect.top - MINIMAP_BORDER_WIDTH;
    const fracX = Math.max(0, Math.min(1, (relX - bounds.x) / bounds.width));
    const fracY = Math.max(0, Math.min(1, (relY - bounds.y) / bounds.height));
    return { x: fracX * mazeW, y: fracY * mazeH };
  }

  function handleMinimapPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    bounds: MinimapRenderedBounds,
  ) {
    e.stopPropagation();
    if (state.status === 'paused') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsMinimapDragging(true);
    if (cameraMode !== 'look') {
      // First entry into look mode: save current camera so Return can restore it.
      // Guard ensures repeated minimap taps while already in look mode never
      // overwrite the original return position.
      previousCameraRef.current =
        camXRef.current !== null && camYRef.current !== null
          ? { x: camXRef.current, y: camYRef.current }
          : null;
    }
    setLookTargetPx(minimapPointerToLookTarget(e, bounds));
    setCameraMode('look');
  }

  // Drag: update look target while the pointer is held down (capture active).
  function handleMinimapPointerMove(
    e: React.PointerEvent<HTMLDivElement>,
    bounds: MinimapRenderedBounds,
  ) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.stopPropagation();
    setLookTargetPx(minimapPointerToLookTarget(e, bounds));
  }

  // Drag end: restore transition so tap-to-look still animates smoothly.
  function handleMinimapPointerUp() {
    setIsMinimapDragging(false);
  }

  const horizontalRailMarkerSafeInset = MINIMAP_RAIL_ENDPOINT_MARKER_SIZE + MINIMAP_MOBILE_RAIL_SAFETY_GAP;
  const horizontalRailOuterInset = MINIMAP_MOBILE_PANEL_EDGE_PADDING + horizontalRailMarkerSafeInset;
  const minimapCenterGutterStyle = minimapLayout === 'horizontal-rail'
    ? leftHanded
      ? {
          paddingLeft: horizontalRailOuterInset + MINIMAP_MOBILE_CENTER_GUTTER,
          paddingRight: horizontalRailOuterInset,
        }
      : {
          paddingLeft: horizontalRailOuterInset,
          paddingRight: horizontalRailOuterInset + MINIMAP_MOBILE_CENTER_GUTTER,
        }
    : undefined;

  const minimapPanel = (
    <div
      className="flex h-full min-w-0 items-center justify-center overflow-visible box-border"
      style={minimapCenterGutterStyle}
    >
      <div
        className="flex min-w-0 items-center justify-center"
        style={{
          width: minimapSlotW,
          maxWidth: '100%',
          height: mobileMiniMapSlotH,
        }}
      >
        <div
          className="relative overflow-visible border-2 border-stone-800 bg-white shadow-sm"
          style={{
            width: minimapContainerW,
            height: minimapContainerH,
            borderRadius: isRailMinimap ? 16 : 12,
            cursor: 'crosshair',
          }}
          aria-label="Minimap — tap or drag to pan view"
          onPointerDown={(e) => handleMinimapPointerDown(e, minimapRenderedBounds)}
          onPointerMove={(e) => handleMinimapPointerMove(e, minimapRenderedBounds)}
          onPointerUp={handleMinimapPointerUp}
          onPointerCancel={handleMinimapPointerUp}
        >
          <MazeRenderer
            maze={maze}
            cellSize={minimapCell}
            wallThickness={1}
            padding={MINIMAP_PADDING}
            fillContainer
            solution={currentSolution}
            showSolution={state.solutionVisible}
            hintCells={state.hintCells}
            showEndpointMarkers={false}
          />
          <MinimapEndpointMarkers
            maze={maze}
            cellSize={minimapCell}
            markerSize={minimapMarkerSize}
            bounds={minimapRenderedBounds}
          />
          {/* Current viewport frame */}
          {showMobileMinimapViewportFrame && (
            <div
              className={minimapViewportFrameClass}
              style={{
                left: mmFrameX,
                top: mmFrameY,
                width: mmFrameW,
                height: mmFrameH,
                ...minimapViewportFrameStyle,
              }}
            />
          )}
          {showMinimapPlayerMarker && (
            <MinimapPlayerMarker
              maze={maze}
              cellSize={minimapCell}
              playerPosition={state.playerPosition}
              bounds={minimapRenderedBounds}
              markerSize={minimapPlayerMarkerSize}
            />
          )}
        </div>
      </div>
    </div>
  );

  const pauseOverlayBottomPadding = vpSize.w >= 768 ? 0 : mobileDockH;

  const dpadPanel = (
    <div
      className="flex h-full min-w-0 items-center justify-center"
      style={cameraMode === 'look' ? { opacity: 0.38 } : undefined}
    >
      <DPad
        dispatch={dispatchWithLookExit}
        isActive={isActive || state.status === 'paused'}
        disabled={state.status === 'paused'}
        compact={mobileDockH <= 148}
      />
    </div>
  );

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex flex-col bg-white"
      style={{ width: vpSize.w, height: vpSize.h, touchAction: 'none' }}
    >
      <div ref={announcerRef} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />

      {/* Top bar — Exit | Timer | ⏸ | ⋯ */}
      <div
        className="flex items-center justify-between gap-2 px-3 shrink-0 bg-white text-slate-900 border-b border-slate-200 shadow-sm"
        style={{ height: TOP_BAR_H }}
      >
        {/* Left: Exit */}
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors shrink-0"
          aria-label="Exit play mode"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          Exit
        </button>

        {/* Center: status / timer */}
        <div className="flex-1 flex justify-center items-center gap-1.5 text-sm">
          {cameraMode === 'look' ? (
            <span className="font-semibold text-sm" style={{ color: '#4f46e5' }}>
              Camera view — movement paused
            </span>
          ) : (
            <>
              {state.status === 'playing' && (
                <span className="flex items-center gap-1.5 font-mono font-medium text-slate-700">
                  {label && (
                    <span className="hidden sm:inline text-xs font-sans font-medium text-slate-400 mr-0.5">
                      {label} ·
                    </span>
                  )}
                  <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                    <polyline points="12 6 12 12 16 14" strokeWidth="2"/>
                  </svg>
                  <Timer elapsedMs={state.elapsedMs} />
                </span>
              )}
              {/* "Paused" label intentionally omitted here — the centered pause card already communicates this */}
              {state.status === 'idle' && (label
                ? <span className="text-slate-600 text-xs font-semibold tracking-wide">{label}</span>
                : (
                  <>
                    <span className="md:hidden text-slate-500 text-[16px] font-semibold leading-none">Swipe or use D-pad to move</span>
                    <span className="hidden md:inline text-slate-400 text-xs">Arrow keys or WASD to run</span>
                  </>
                )
              )}
              {state.status === 'solved' && <span className="text-emerald-600 font-semibold text-xs">Solved — {formatTime(state.elapsedMs)}</span>}
            </>
          )}
        </div>

        {/* Right: pause + overflow menu */}
        <div className="flex items-center gap-1 shrink-0">
          {(state.status === 'playing' || state.status === 'paused') && (
            <button
              onClick={handleMobilePauseToggle}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors text-sm"
              aria-label={state.status === 'playing' ? 'Pause timer' : 'Resume timer'}
            >
              {state.status === 'playing' ? '⏸' : '▶'}
            </button>
          )}

          {/* ⋯ overflow menu */}
          <div ref={menuRef} className="relative md:hidden">
            <button
              onClick={toggleMobileMenu}
              disabled={isMobileMenuBlocked}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              aria-label="More options"
              aria-expanded={menuOpen && !isMobileMenuBlocked}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5"  cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
              </svg>
            </button>

            {menuOpen && !isMobileMenuBlocked && (
              <div className="absolute top-full right-0 mt-1.5 w-48 rounded-xl shadow-lg border border-slate-200 bg-white overflow-hidden z-10">
                {state.status !== 'solved' && (
                  <button
                    onClick={() => { handleHint(); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-[15px] text-amber-600 font-medium hover:bg-amber-50 transition-colors flex items-center gap-2"
                    aria-pressed={isHintActive}
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17H8v-2.3C6.2 13.5 5 11.4 5 9a7 7 0 0 1 7-7z"/>
                    </svg>
                    {isHintActive ? 'Hide Hint' : 'Show Hint'}
                  </button>
                )}
                <button
                  onClick={() => { dispatch({ type: 'TOGGLE_SOLUTION' }); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-[15px] text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  {state.solutionVisible ? (
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                  {state.solutionVisible ? 'Hide Solution' : 'Show Solution'}
                </button>
                <button
                  onClick={() => { toggleShowTrail(); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-[15px] text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                  aria-pressed={showTrail}
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                  {showTrail ? 'Hide Traveled Path' : 'Show Traveled Path'}
                </button>
                <div className="h-px bg-slate-100" />
                {resetConfirming ? (
                  <div className="px-4 py-3 bg-red-50">
                    <p className="mb-2 text-sm font-medium text-red-800">Reset Progress?</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleResetCancel}
                        className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        autoFocus
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => { handleResetConfirm(); setMenuOpen(false); }}
                        className="flex-1 rounded-md border border-red-300 bg-red-100 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleResetRequest}
                    className="w-full text-left px-4 py-2.5 text-[15px] text-slate-500 hover:bg-slate-50 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                    </svg>
                    Reset Progress
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle row: maze viewport + desktop sidebar */}
      <div className="flex flex-1 overflow-hidden">

        {/* Maze viewport — swipe anywhere here to move */}
        <div
          ref={mazeViewportRef}
          className="relative flex-1 overflow-hidden bg-slate-100"
        >

          {/* Follow-camera pan container */}
          <div
            style={{
              position: 'absolute',
              width: mazeW,
              height: mazeH,
              opacity: initialCameraReady ? 1 : 0,
              pointerEvents: initialCameraReady ? 'auto' : 'none',
              transform: `translate3d(${tx}px, ${ty}px, 0)`,
              transition: initialCameraReady ? lookModeTransition : 'none',
              willChange: 'transform',
            }}
          >
            <MazeRenderer
              maze={maze}
              cellSize={PLAY_CELL_SIZE}
              padding={MAZE_PADDING}
              playerPosition={state.status !== 'paused' && !showBottomStartPlayerOverlay
                ? state.playerPosition
                : undefined}
              trail={state.trail}
              showTrail={showTrail}
              solution={currentSolution}
              showSolution={state.solutionVisible}
              hintCells={state.hintCells}
              interactive={isActive}
              svgRef={svgRef}
              markersOutside
            />
          </div>

          {/* Look-mode viewport overlay — sits above the maze, below the pill.
              An overlay div is required because box-shadow on the viewport div
              itself is hidden behind the absolutely-positioned pan container. */}
          {cameraMode === 'look' && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 15,
                // Crisp 3px teal ring + soft 80px inner vignette that fades to
                // nothing at the centre so maze readability is unaffected.
                boxShadow:
                  'inset 0 0 0 3px rgba(99, 102, 241, 0.65), ' +
                  'inset 0 0 80px rgba(99, 102, 241, 0.11)',
              }}
            />
          )}

          {/* Look-mode pill — shown when camera is panned away from the player */}
          {cameraMode === 'look' && (
            <button
              onClick={exitLookMode}
              style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 20,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'rgba(15, 23, 42, 0.90)',
                color: 'white',
                fontSize: 13,
                fontWeight: 600,
                padding: '6px 13px 6px 10px',
                borderRadius: 20,
                border: '1px solid rgba(79, 70, 229, 0.55)',
                cursor: 'pointer',
                letterSpacing: '0.01em',
                boxShadow: '0 2px 8px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
              aria-label="Return camera to player"
            >
              {/* Camera icon — stroke style matching the project icon set */}
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#818cf8"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Return to play
            </button>
          )}



        </div>

        {/* Desktop sidebar — quiet utility rail */}
        <aside
          className="hidden md:flex flex-col w-56 shrink-0 border-l architect-dot-grid"
          style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-charcoal)' }}
        >
          <div className="flex flex-col p-4">

            {/* Minimap stage — fixed height so buttons never shift with maze aspect ratio */}
            <div
              className="flex items-center justify-center overflow-visible"
              style={{ height: SIDEBAR_MINIMAP_STAGE_H }}
            >
            {/* Minimap card — sized to maze aspect ratio, centered inside stage */}
            <div
              aria-label="Minimap — click or drag to pan view"
              className="relative rounded-xl overflow-visible border-2 border-[#1C1C1E] bg-white shadow-[0_2px_0_rgba(28,28,30,0.15)]"
              style={{ width: sidebarMinimapContainerW, height: sidebarMinimapContainerH, cursor: 'crosshair' }}
              onPointerDown={(e) => handleMinimapPointerDown(e, sidebarMinimapRenderedBounds)}
              onPointerMove={(e) => handleMinimapPointerMove(e, sidebarMinimapRenderedBounds)}
              onPointerUp={handleMinimapPointerUp}
              onPointerCancel={handleMinimapPointerUp}
            >
              <MazeRenderer
                maze={maze}
                cellSize={sidebarMinimapCell}
                wallThickness={1}
                padding={MINIMAP_PADDING}
                fillContainer
                solution={currentSolution}
                showSolution={state.solutionVisible}
                showEndpointMarkers={false}
              />
              <MinimapEndpointMarkers
                maze={maze}
                cellSize={sidebarMinimapCell}
                markerSize={sidebarMarkerSize}
                bounds={sidebarMinimapRenderedBounds}
              />
              {inBounds(state.playerPosition, maze.width, maze.height) && (
                <MinimapPlayerMarker
                  maze={maze}
                  cellSize={sidebarMinimapCell}
                  playerPosition={state.playerPosition}
                  bounds={sidebarMinimapRenderedBounds}
                  markerSize={DESKTOP_MINIMAP_PLAYER_MARKER_SIZE}
                />
              )}
              {showSidebarMinimapViewportFrame && (
                <div
                  className={minimapViewportFrameClass}
                  style={{
                    left: dmFrameX,
                    top: dmFrameY,
                    width: dmFrameW,
                    height: dmFrameH,
                    ...minimapViewportFrameStyle,
                  }}
                />
              )}
            </div>
            </div>{/* end minimap stage */}

            {/* Divider */}
            <div className="h-px mb-3" style={{ backgroundColor: 'var(--color-border)' }} />

            {/* Group 1: Assist */}
            <div className="space-y-2">
              {state.status !== 'solved' && (
                <button
                  onClick={handleHint}
                  className="btn-secondary w-full rounded text-left px-3 py-2.5 gap-2.5"
                  aria-pressed={isHintActive}
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17H8v-2.3C6.2 13.5 5 11.4 5 9a7 7 0 0 1 7-7z"/>
                  </svg>
                  <span>{isHintActive ? 'Hide Hint' : 'Show Hint'}</span>
                </button>
              )}
              <button
                onClick={() => dispatch({ type: 'TOGGLE_SOLUTION' })}
                className="btn-secondary w-full rounded text-left px-3 py-2.5 gap-2.5"
                style={state.solutionVisible ? {
                  backgroundColor: 'var(--color-charcoal)',
                  color: 'var(--color-bg)',
                  borderColor: 'var(--color-charcoal)',
                } : undefined}
                aria-pressed={state.solutionVisible}
              >
                {state.solutionVisible ? (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
                <span>{state.solutionVisible ? 'Hide Solution' : 'Show Solution'}</span>
              </button>
              <button
                onClick={toggleShowTrail}
                className="btn-secondary w-full rounded text-left px-3 py-2.5 gap-2.5"
                aria-pressed={showTrail}
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                <span>{showTrail ? 'Hide Traveled Path' : 'Show Traveled Path'}</span>
              </button>
            </div>

            {/* Divider */}
            <div className="h-px my-3" style={{ backgroundColor: 'var(--color-border)' }} />

            {/* Group 2: Game controls */}
            <div className="space-y-2">
              {(state.status === 'playing' || state.status === 'paused') && (
                <button
                  onClick={() => dispatch({ type: state.status === 'playing' ? 'PAUSE' : 'RESUME' })}
                  className="btn-ghost w-full rounded text-left px-3 py-2.5 gap-2.5"
                  aria-label={state.status === 'playing' ? 'Pause timer' : 'Resume timer'}
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    {state.status === 'playing' ? (
                      <><rect x="3" y="2" width="3.5" height="12" rx="0.5" /><rect x="9.5" y="2" width="3.5" height="12" rx="0.5" /></>
                    ) : (
                      <polygon points="3,1 14,8 3,15" />
                    )}
                  </svg>
                  <span>{state.status === 'playing' ? 'Pause' : 'Resume'}</span>
                </button>
              )}
              {resetConfirming ? (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2.5 space-y-2.5">
                  <p className="text-sm font-medium text-red-800">Reset Progress?</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleResetCancel}
                      className="btn-ghost flex-1 rounded text-xs px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-600"
                      autoFocus
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResetConfirm}
                      className="flex-1 rounded border border-red-300 bg-red-100 px-2 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleResetRequest}
                  className="btn-ghost w-full rounded text-left px-3 py-2.5 gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                  </svg>
                  <span>Reset Progress</span>
                </button>
              )}
            </div>

          </div>

          {/* Future ad slot — hidden until SIDEBAR_AD_ENABLED = true */}
          {SIDEBAR_AD_ENABLED && (
            <div style={{ marginTop: 'auto' }}>
              <div className="h-px" style={{ backgroundColor: 'var(--color-border)' }} />
              <div className="flex items-center justify-center p-4" style={{ minHeight: 300 }}>
                {/* Ad unit */}
              </div>
            </div>
          )}
        </aside>

      </div>

      {AD_SLOT_H > 0 && (
        <div
          style={{ height: AD_SLOT_H }}
          className="bg-slate-50 border-y border-slate-200 shrink-0 flex items-center justify-center text-xs text-slate-400"
        >
          {/* Ad unit renders here */}
        </div>
      )}

      {/* Mobile control strip — fixed 50/50 panels with left-handed content swap */}
      <div
        ref={controlStripRef}
        className="md:hidden relative bg-[#F6F5F0] border-t border-[#DDD8CF] shrink-0 overflow-visible pb-[env(safe-area-inset-bottom,0px)]"
        style={{ height: mobileDockH }}
      >
        <div className="grid h-full w-full grid-cols-2 items-stretch overflow-visible">
          {leftHanded ? dpadPanel : minimapPanel}
          {leftHanded ? minimapPanel : dpadPanel}
        </div>

        {/* Center divider with swap toggle */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 flex-col items-center justify-center gap-1">
          <div className="w-px flex-1 bg-stone-200" />
          <button
            onClick={toggleLeftHanded}
            className="pointer-events-auto w-7 h-7 flex items-center justify-center rounded-full bg-white border border-stone-200 text-stone-400 hover:text-stone-600 hover:border-stone-300 transition-colors shrink-0 shadow-sm"
            aria-label={leftHanded ? 'Switch to right-handed layout' : 'Switch to left-handed layout'}
            title={leftHanded ? 'Right-handed layout' : 'Left-handed layout'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M16 3l4 4-4 4M20 17H4M8 21l-4-4 4-4"/>
            </svg>
          </button>
          <div className="w-px flex-1 bg-stone-200" />
        </div>
      </div>

      {/* Paused overlay — covers every non-menu control so only pause-menu actions are interactive. */}
      {state.status === 'paused' && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center"
          style={{
            background: 'rgba(10, 10, 14, 0.30)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            paddingTop: TOP_BAR_H,
            paddingBottom: pauseOverlayBottomPadding,
          }}
        >
          <div
            className="flex flex-col items-center w-full"
            style={{
              width: 'calc(100vw - 40px)',
              maxWidth: 460,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 20,
              boxShadow: '0 24px 64px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.10)',
              padding: '32px 36px 24px',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-menu-title"
          >
            {/* Title */}
            <p
              id="pause-menu-title"
              style={{
                color: 'var(--color-charcoal)',
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: '-0.3px',
                marginBottom: 6,
              }}
            >
              Paused
            </p>

            {/* Stats row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--color-muted-strong)',
                fontSize: 15,
                fontWeight: 500,
                marginBottom: 20,
              }}
            >
              <span>{formatPauseTime(state.elapsedMs)}</span>
              <span aria-hidden="true" style={{ color: 'var(--color-border-strong)' }}>·</span>
              <span>{maze.width} × {maze.height}</span>
              {!label && (
                <>
                  <span aria-hidden="true" style={{ color: 'var(--color-border-strong)' }}>·</span>
                  <span>Generated</span>
                </>
              )}
            </div>

            {/* Primary action */}
            <button
              onClick={() => dispatch({ type: 'RESUME' })}
              autoFocus
              style={{
                width: '100%',
                height: 52,
                borderRadius: 14,
                background: 'var(--color-charcoal)',
                color: 'white',
                border: 'none',
                fontSize: 18,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                cursor: 'pointer',
                marginBottom: 8,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-charcoal-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-charcoal)'; }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Resume
            </button>

            {/* AD_SLOT: Pause-screen banner — renders after Resume, never before.
                Un-comment ad unit and set PAUSE_AD_ENABLED = true to activate. */}
            {PAUSE_AD_ENABLED && (
              <div
                style={{
                  width: '100%',
                  height: 50,
                  background: 'var(--color-border)',
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                {/* Ad unit */}
              </div>
            )}

            {/* Divider */}
            <div
              style={{
                width: '100%',
                height: 1,
                background: 'var(--color-border)',
                margin: '8px 0 4px',
              }}
            />

            {/* Secondary actions */}
            <div style={{ width: '100%' }}>
              {resetConfirming ? (
                <div
                  style={{
                    background: 'rgba(220, 38, 38, 0.06)',
                    border: '1px solid rgba(220, 38, 38, 0.2)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginBottom: 2,
                  }}
                >
                  <p style={{ color: '#b91c1c', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                    Reset Progress?
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleResetCancel}
                      autoFocus
                      className="btn-ghost flex-1 rounded-lg text-sm py-1.5 justify-center"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResetConfirm}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        borderRadius: 8,
                        border: '1px solid rgba(220, 38, 38, 0.3)',
                        background: 'rgba(220, 38, 38, 0.1)',
                        color: '#b91c1c',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleResetRequest}
                  className="btn-ghost w-full rounded-lg px-3 py-2.5 gap-2"
                  style={{ fontSize: 15 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                  </svg>
                  Reset Progress
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="btn-ghost w-full rounded-lg px-3 py-2.5 gap-2"
                  style={{ fontSize: 15 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                  </svg>
                  Exit Maze
                </button>
              )}
            </div>
          </div>
        </div>
      )}


      {initialCameraReady && showBottomStartPlayerOverlay && (
        <svg
          className="pointer-events-none absolute left-0 top-0 z-20 overflow-visible md:hidden"
          style={{ transform: `translate(${playerScreenX}px, ${TOP_BAR_H + playerScreenY}px)` }}
          width="1"
          height="1"
          viewBox="0 0 1 1"
          aria-hidden="true"
        >
          <circle
            cx={0}
            cy={0}
            r={playerGlowRadius}
            fill={PLAYER_MARKER_COLOR}
            className="maze-player-glow"
          />
          <circle
            cx={0}
            cy={0}
            r={playerMarkerRadius}
            fill={PLAYER_MARKER_COLOR}
            stroke="white"
            strokeWidth={2}
          />
        </svg>
      )}
    </div>
  );
}
