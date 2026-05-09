import { useReducer, useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { MazeData } from '../../types/maze';
import { MazeRenderer } from './MazeRenderer';
import { Timer } from './Timer';
import { gameReducer, createInitialState } from '../../lib/gameplay/reducer';
import { useKeyboardInput, useTouchInput } from '../../lib/gameplay/input';
import { DPad } from './DPad';
import { inBounds } from '../../lib/maze/utils';
import { solveMazeFrom } from '../../lib/maze/solver';

export interface SolveStats {
  elapsedMs: number;
  stepCount: number;
  hintsUsed: number;
  isNewBest: boolean;
}

const PLAY_CELL_SIZE = 32;
const PAN_LOOKAHEAD = PLAY_CELL_SIZE * 1; // extra px revealed when the camera pans
const MAZE_PADDING = 32;     // must be >= SAFE_PAD to guarantee player visibility at maze edges
const TOP_BAR_H = 44;
// AD_SLOT: Reserved for future monetization.
// Recommended placement: between maze viewport and control strip (above controls, below maze).
//   - Banner (320×50): set AD_SLOT_H = 50, place the div above the control strip.
//   - Rewarded (after solve): show a full-screen ad before the "Play Again" screen — highest CPM.
// To activate banner: set AD_SLOT_H = 50 and un-comment the ad div below the maze viewport.
const AD_SLOT_H = 0;
const SAFE_PAD = 32;
const MINIMAP_SIZE = 96;
const SIDEBAR_W = 224;
const SIDEBAR_MINIMAP_SIZE = 192;
const SIDEBAR_AD_ENABLED = false;
const PERSONAL_BEST_KEY = (slug: string) => `pb:${slug}`;
const SOLVE_REVEAL_DELAY_MS = 250;

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPathStartCell(maze: MazeData, playerPosition: MazeData['entry']): MazeData['entry'] {
  return inBounds(playerPosition, maze.width, maze.height) ? playerPosition : maze.entry;
}

function getHintStepCount(maze: MazeData): number {
  return clamp(8, Math.round(Math.max(maze.width, maze.height) * 0.4), 24);
}

const MINIMAP_PADDING = 2;
const MINIMAP_ENDPOINT_MARKER_SIZE = 24;
const DESKTOP_MINIMAP_ENDPOINT_MARKER_SIZE = 26;

function getMinimapMarkerPosition(maze: MazeData, cellSize: number, point: MazeData['entry']) {
  const totalW = maze.width * cellSize + MINIMAP_PADDING * 2;
  const totalH = maze.height * cellSize + MINIMAP_PADDING * 2;
  const x = MINIMAP_PADDING + point.x * cellSize + cellSize / 2;
  const y = MINIMAP_PADDING + point.y * cellSize + cellSize / 2;

  return {
    left: `${(x / totalW) * 100}%`,
    top: `${(y / totalH) * 100}%`,
  };
}

function MinimapEndpointMarkers({
  maze,
  cellSize,
  markerSize = MINIMAP_ENDPOINT_MARKER_SIZE,
}: {
  maze: MazeData;
  cellSize: number;
  markerSize?: number;
}) {
  const entryPos = getMinimapMarkerPosition(maze, cellSize, maze.entry);
  const exitPos = getMinimapMarkerPosition(maze, cellSize, maze.exit);
  const markerStyle = {
    width: markerSize,
    height: markerSize,
    transform: 'translate(-50%, -50%)',
    filter: 'drop-shadow(0 2px 3px rgba(15, 23, 42, 0.5)) drop-shadow(0 0 7px rgba(255, 255, 255, 0.98))',
  };

  // Arrow direction based on which perimeter wall the entry is on (viewBox 0 0 24 24, circle r=8.8 at 12,12)
  const entryArrow = (() => {
    const { entry, width, height } = maze;
    if (entry.y === 0)          return '6.72,8.92 17.28,8.92 12,16.84';   // top → DOWN
    if (entry.y === height - 1) return '6.72,15.08 17.28,15.08 12,7.16';  // bottom → UP
    if (entry.x === 0)          return '8.92,6.72 16.84,12 8.92,17.28';   // left → RIGHT
    return '15.08,6.72 7.16,12 15.08,17.28';                              // right → LEFT
  })();

  return (
    <>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute z-20 overflow-visible"
        style={{ ...markerStyle, ...entryPos }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="white" />
        <circle cx="12" cy="12" r="8.8" fill="#22c55e" opacity="0.9" />
        <polygon points={entryArrow} fill="white" opacity="0.95" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute z-20 overflow-visible"
        style={{ ...markerStyle, ...exitPos }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="white" />
        <circle cx="12" cy="12" r="8.8" fill="#f59e0b" />
        <line x1="8.8" y1="17" x2="8.8" y2="6.4" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10 6.3 H16.8 L14.8 9.1 L16.8 11.9 H10 Z" fill="white" />
      </svg>
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

export interface FullscreenMazePlayerProps {
  maze: MazeData;
  /** Optional label shown in the top bar, e.g. "Today's Maze" for the daily challenge. */
  label?: string;
  onSolve?: (stats: SolveStats) => void;
  onClose: () => void;
}

export function FullscreenMazePlayer({ maze, label, onSolve, onClose }: FullscreenMazePlayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mazeViewportRef = useRef<HTMLDivElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hintTimerRef = useRef<number | null>(null);
  const isNewBestRef = useRef(false);
  const camXRef = useRef<number | null>(null);
  const camYRef = useRef<number | null>(null);
  const prevStatusRef = useRef<ReturnType<typeof createInitialState>['status']>('idle');
  const controlStripRef = useRef<HTMLDivElement>(null);
  const [controlStripH, setControlStripH] = useState(128);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetConfirming, setResetConfirming] = useState(false);
  const resetConfirmTimerRef = useRef<number | null>(null);

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

  const [vpSize, setVpSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    h: typeof window !== 'undefined' ? window.innerHeight : 844,
  }));

  const [state, dispatch] = useReducer(
    (s: ReturnType<typeof createInitialState>, a: Parameters<typeof gameReducer>[1]) =>
      gameReducer(s, a, maze),
    maze,
    createInitialState,
  );

  // Timer tick
  useEffect(() => {
    if (state.status !== 'playing' || state.startTime === null) return;
    const id = setInterval(() => {
      dispatch({ type: 'TICK', elapsedMs: Date.now() - state.startTime! });
    }, 1000);
    return () => clearInterval(id);
  }, [state.status, state.startTime]);

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

  // Track viewport size for camera math
  useEffect(() => {
    const update = () => setVpSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
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

  const isActive = state.status === 'playing' || state.status === 'idle';
  useKeyboardInput(dispatch, isActive);
  useTouchInput(mazeViewportRef, dispatch, isActive);

  const currentSolution = useMemo(() => {
    const startCell = getPathStartCell(maze, state.playerPosition);
    return solveMazeFrom(maze, startCell);
  }, [maze, state.playerPosition]);

  const handleHint = useCallback(() => {
    if (state.solutionVisible) return;

    const hintSteps = getHintStepCount(maze);
    const pathFromPlayer = currentSolution;
    if (pathFromPlayer.length <= 1) return;

    // Include the current cell so the amber hint is anchored at the player's
    // position. The reducer clears this temporary hint after the next move.
    dispatch({ type: 'USE_HINT', cells: pathFromPlayer.slice(0, hintSteps + 1) });
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => dispatch({ type: 'USE_HINT', cells: [] }), 5000);
  }, [maze, currentSolution, state.solutionVisible]);

  const handleResetRequest = useCallback(() => {
    setResetConfirming(true);
    if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current);
    resetConfirmTimerRef.current = window.setTimeout(() => setResetConfirming(false), 4000);
  }, []);

  const handleResetConfirm = useCallback(() => {
    if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setResetConfirming(false);
    dispatch({ type: 'RESET', startPosition: maze.entry });
  }, [maze.entry]);

  const handleResetCancel = useCallback(() => {
    if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current);
    setResetConfirming(false);
  }, []);

  useEffect(() => {
    return () => {
      if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  // ── Follow-camera math ───────────────────────────────────────────────────────
  const mazeW = maze.width  * PLAY_CELL_SIZE + MAZE_PADDING * 2;
  const mazeH = maze.height * PLAY_CELL_SIZE + MAZE_PADDING * 2;

  const pointOnMarker = (point: typeof maze.entry, marker: typeof maze.entry) => (
    (marker.y === 0 && point.x === marker.x && point.y === -1) ||
    (marker.y === maze.height - 1 && point.x === marker.x && point.y === maze.height) ||
    (marker.x === 0 && point.x === -1 && point.y === marker.y) ||
    (marker.x === maze.width - 1 && point.x === maze.width && point.y === marker.y)
  );
  const markerPx = (point: typeof maze.entry) => (
    point.x === 0 ? MAZE_PADDING / 2 : point.x === maze.width - 1 ? mazeW - MAZE_PADDING / 2 : MAZE_PADDING + point.x * PLAY_CELL_SIZE + PLAY_CELL_SIZE / 2
  );
  const markerPy = (point: typeof maze.entry) => (
    point.y === 0 ? MAZE_PADDING / 2 : point.y === maze.height - 1 ? mazeH - MAZE_PADDING / 2 : MAZE_PADDING + point.y * PLAY_CELL_SIZE + PLAY_CELL_SIZE / 2
  );

  const playerOnEntryMarker = pointOnMarker(state.playerPosition, maze.entry);
  const playerOnExitMarker = pointOnMarker(state.playerPosition, maze.exit);

  const playerPx = playerOnEntryMarker
    ? markerPx(maze.entry)
    : playerOnExitMarker
      ? markerPx(maze.exit)
      : MAZE_PADDING + state.playerPosition.x * PLAY_CELL_SIZE + PLAY_CELL_SIZE / 2;
  const playerPy = playerOnEntryMarker
    ? markerPy(maze.entry)
    : playerOnExitMarker
      ? markerPy(maze.exit)
      : MAZE_PADDING + state.playerPosition.y * PLAY_CELL_SIZE + PLAY_CELL_SIZE / 2;

  const stripH = vpSize.w < 768 ? controlStripH : 0;
  const sidebarW = vpSize.w >= 768 ? SIDEBAR_W : 0;
  const viewW = vpSize.w - sidebarW;
  const viewH = vpSize.h - TOP_BAR_H - AD_SLOT_H - stripH;

  // Reset camera when game resets
  if (prevStatusRef.current !== 'idle' && state.status === 'idle') {
    camXRef.current = null;
    camYRef.current = null;
  }
  prevStatusRef.current = state.status;

  // ── Safe-zone camera ─────────────────────────────────────────────────────────
  // The safe zone is shrunk by PAN_LOOKAHEAD so the camera starts to pan
  // earlier — giving the player a preview of what's ahead before they reach
  // the viewport edge and have to commit to moving that way.
  const safeW = Math.max(0, viewW / 2 - SAFE_PAD - PAN_LOOKAHEAD);
  const safeH = Math.max(0, viewH / 2 - SAFE_PAD - PAN_LOOKAHEAD);

  let camX = camXRef.current ?? playerPx;
  let camY = camYRef.current ?? playerPy;

  if (playerPx > camX + safeW) camX = playerPx - safeW;
  else if (playerPx < camX - safeW) camX = playerPx + safeW;

  if (playerPy > camY + safeH) camY = playerPy - safeH;
  else if (playerPy < camY - safeH) camY = playerPy + safeH;

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

  const tx = viewW / 2 - camX;
  const ty = viewH / 2 - camY;

  // ── Minimap ──────────────────────────────────────────────────────────────────
  const minimapCell = Math.max(1, Math.ceil(MINIMAP_SIZE / Math.max(maze.width, maze.height)));

  // Viewport frame overlay on minimap — shows which region is currently visible
  const mmFrameW = Math.min(MINIMAP_SIZE, (viewW / mazeW) * MINIMAP_SIZE);
  const mmFrameH = Math.min(MINIMAP_SIZE, (viewH / mazeH) * MINIMAP_SIZE);
  const mmFrameX = Math.max(0, Math.min(MINIMAP_SIZE - mmFrameW, (-tx / mazeW) * MINIMAP_SIZE));
  const mmFrameY = Math.max(0, Math.min(MINIMAP_SIZE - mmFrameH, (-ty / mazeH) * MINIMAP_SIZE));

  const sidebarMinimapCell = Math.max(1, Math.ceil(SIDEBAR_MINIMAP_SIZE / Math.max(maze.width, maze.height)));
  const dmFrameW = Math.min(SIDEBAR_MINIMAP_SIZE, (viewW / mazeW) * SIDEBAR_MINIMAP_SIZE);
  const dmFrameH = Math.min(SIDEBAR_MINIMAP_SIZE, (viewH / mazeH) * SIDEBAR_MINIMAP_SIZE);
  const dmFrameX = Math.max(0, Math.min(SIDEBAR_MINIMAP_SIZE - dmFrameW, (-tx / mazeW) * SIDEBAR_MINIMAP_SIZE));
  const dmFrameY = Math.max(0, Math.min(SIDEBAR_MINIMAP_SIZE - dmFrameH, (-ty / mazeH) * SIDEBAR_MINIMAP_SIZE));

  const minimapPanel = (
    <div className="flex flex-1 items-center justify-center py-2.5">
      <div
        className="relative rounded-xl overflow-visible border-2 border-stone-800 bg-white shadow-[0_2px_0_rgba(41,37,36,0.18)]"
        style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
        aria-hidden="true"
      >
        <MazeRenderer
          maze={maze}
          cellSize={minimapCell}
          wallThickness={1}
          padding={MINIMAP_PADDING}
          playerPosition={state.playerPosition}
          playerMarkerRadius={5}
          solution={currentSolution}
          showSolution={state.solutionVisible}
          showEndpointMarkers={false}
        />
        <MinimapEndpointMarkers maze={maze} cellSize={minimapCell} />
        {/* Current viewport frame */}
        <div
          className="absolute rounded border-2 border-stone-900/75 ring-1 ring-white/90 pointer-events-none"
          style={{
            left: mmFrameX,
            top: mmFrameY,
            width: mmFrameW,
            height: mmFrameH,
            opacity: 0.65,
          }}
        />
      </div>
    </div>
  );

  const dpadPanel = (
    <div className="flex flex-1 items-center justify-center py-2.5">
      <DPad dispatch={dispatch} isActive={isActive} />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white"
      style={{ touchAction: 'none' }}
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
          {state.status === 'paused' && <span className="text-amber-500 font-medium text-xs">Paused</span>}
          {state.status === 'idle' && (label
            ? <span className="text-slate-600 text-xs font-semibold tracking-wide">{label}</span>
            : (
              <>
                <span className="md:hidden text-slate-400 text-xs">Swipe or use D-pad to move</span>
                <span className="hidden md:inline text-slate-400 text-xs">Arrow keys or WASD to run</span>
              </>
            )
          )}
          {state.status === 'solved' && <span className="text-emerald-600 font-semibold text-xs">Solved — {formatTime(state.elapsedMs)}</span>}
        </div>

        {/* Right: pause + overflow menu */}
        <div className="flex items-center gap-1 shrink-0">
          {(state.status === 'playing' || state.status === 'paused') && (
            <button
              onClick={() => dispatch({ type: state.status === 'playing' ? 'PAUSE' : 'RESUME' })}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors text-sm"
              aria-label={state.status === 'playing' ? 'Pause timer' : 'Resume timer'}
            >
              {state.status === 'playing' ? '⏸' : '▶'}
            </button>
          )}

          {/* ⋯ overflow menu */}
          <div ref={menuRef} className="relative md:hidden">
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors"
              aria-label="More options"
              aria-expanded={menuOpen}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5"  cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-40 rounded-xl shadow-lg border border-slate-200 bg-white overflow-hidden z-10">
                {state.status !== 'solved' && (
                  <button
                    onClick={() => { handleHint(); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-amber-600 font-medium hover:bg-amber-50 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17H8v-2.3C6.2 13.5 5 11.4 5 9a7 7 0 0 1 7-7z"/>
                    </svg>
                    Show Hint
                  </button>
                )}
                <button
                  onClick={() => { dispatch({ type: 'TOGGLE_SOLUTION' }); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
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
                  {state.solutionVisible ? 'Hide solution' : 'Show solution'}
                </button>
                <div className="h-px bg-slate-100" />
                <button
                  onClick={() => { dispatch({ type: 'RESET', startPosition: maze.entry }); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                  </svg>
                  Reset
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle row: maze viewport + desktop sidebar */}
      <div className="flex flex-1 overflow-hidden">

        {/* Maze viewport — swipe anywhere here to move */}
        <div ref={mazeViewportRef} className="relative flex-1 overflow-hidden bg-slate-100">

          {/* Follow-camera pan container */}
          <div
            style={{
              position: 'absolute',
              width: mazeW,
              height: mazeH,
              transform: `translate(${tx}px, ${ty}px)`,
              transition: 'transform 0.12s ease-out',
              willChange: 'transform',
            }}
          >
            <MazeRenderer
              maze={maze}
              cellSize={PLAY_CELL_SIZE}
              padding={MAZE_PADDING}
              playerPosition={state.status !== 'paused' ? state.playerPosition : undefined}
              trail={state.trail}
              solution={currentSolution}
              showSolution={state.solutionVisible}
              hintCells={state.hintCells}
              interactive={isActive}
              svgRef={svgRef}
              markersOutside
            />
          </div>

          {/* Paused overlay */}
          {state.status === 'paused' && (
            <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center gap-3">
              <div className="text-3xl" aria-hidden="true">⏸</div>
              <p className="text-slate-700 font-semibold">Paused</p>
              <button
                onClick={() => dispatch({ type: 'RESUME' })}
                className="mt-1 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors shadow-sm"
                autoFocus
              >
                Resume
              </button>
            </div>
          )}

        </div>

        {/* Desktop sidebar — quiet utility rail */}
        <aside
          className="hidden md:flex flex-col w-56 shrink-0 border-l architect-dot-grid"
          style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-charcoal)' }}
        >
          <div className="flex flex-col p-4">

            {/* Minimap — no label, no legend */}
            <div
              aria-label="Minimap"
              className="relative rounded-xl overflow-visible border-2 border-[#1C1C1E] bg-white shadow-[0_2px_0_rgba(28,28,30,0.15)]"
              style={{ width: SIDEBAR_MINIMAP_SIZE, height: SIDEBAR_MINIMAP_SIZE }}
            >
              <MazeRenderer
                maze={maze}
                cellSize={sidebarMinimapCell}
                wallThickness={1}
                padding={MINIMAP_PADDING}
                playerPosition={state.playerPosition}
                playerMarkerRadius={6}
                solution={currentSolution}
                showSolution={state.solutionVisible}
                showEndpointMarkers={false}
              />
              <MinimapEndpointMarkers
                maze={maze}
                cellSize={sidebarMinimapCell}
                markerSize={DESKTOP_MINIMAP_ENDPOINT_MARKER_SIZE}
              />
              <div
                className="absolute rounded border-2 border-stone-900/75 ring-1 ring-white/90 pointer-events-none"
                style={{
                  left: dmFrameX,
                  top: dmFrameY,
                  width: dmFrameW,
                  height: dmFrameH,
                  opacity: 0.65,
                }}
              />
            </div>

            {/* Divider */}
            <div className="h-px mt-4 mb-3" style={{ backgroundColor: 'var(--color-border)' }} />

            {/* Group 1: Assist */}
            <div className="space-y-2">
              {state.status !== 'solved' && (
                <button
                  onClick={handleHint}
                  className="btn-secondary w-full rounded text-left px-3 py-2.5 gap-2.5"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17H8v-2.3C6.2 13.5 5 11.4 5 9a7 7 0 0 1 7-7z"/>
                  </svg>
                  <span>Show Hint</span>
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
                <span>{state.solutionVisible ? 'Hide solution' : 'Show solution'}</span>
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
                  <p className="text-sm font-medium text-red-800">Reset progress?</p>
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
                  <span>Reset progress</span>
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

      {/* Mobile control strip — equal halves: minimap + D-pad with left-handed swap */}
      <div
        ref={controlStripRef}
        className="md:hidden bg-[#f7f1e8] border-t border-stone-300 shrink-0 flex items-stretch"
      >
        {leftHanded ? dpadPanel : minimapPanel}

        {/* Center divider with swap toggle */}
        <div className="flex flex-col items-center justify-center px-1 gap-1">
          <div className="w-px flex-1 bg-slate-200" />
          <button
            onClick={toggleLeftHanded}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors shrink-0 shadow-sm"
            aria-label={leftHanded ? 'Switch to right-handed layout' : 'Switch to left-handed layout'}
            title={leftHanded ? 'Right-handed layout' : 'Left-handed layout'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 16V4m0 0L3 8m4-4 4 4"/><path d="M17 8v12m0 0 4-4m-4 4-4-4"/>
            </svg>
          </button>
          <div className="w-px flex-1 bg-slate-200" />
        </div>

        {leftHanded ? minimapPanel : dpadPanel}
      </div>
    </div>
  );
}
