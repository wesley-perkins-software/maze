import { useReducer, useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import type { MazeData } from '../../types/maze';
import { MazeRenderer } from './MazeRenderer';
import { Timer } from './Timer';
import { gameReducer, createInitialState } from '../../lib/gameplay/reducer';
import { useKeyboardInput, useTouchInput } from '../../lib/gameplay/input';
import { DPad } from './DPad';

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
const SIDEBAR_W = 192;
const SIDEBAR_MINIMAP_SIZE = 160;
const HINT_LOOKAHEAD = 6;
const PERSONAL_BEST_KEY = (slug: string) => `pb:${slug}`;

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
  onSolve?: (stats: SolveStats) => void;
  onClose: () => void;
}

export function FullscreenMazePlayer({ maze, onSolve, onClose }: FullscreenMazePlayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mazeViewportRef = useRef<HTMLDivElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isNewBestRef = useRef(false);
  const camXRef = useRef<number | null>(null);
  const camYRef = useRef<number | null>(null);
  const prevStatusRef = useRef<ReturnType<typeof createInitialState>['status']>('idle');
  const controlStripRef = useRef<HTMLDivElement>(null);
  const [controlStripH, setControlStripH] = useState(128);
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Synchronously notify parent on solve — useLayoutEffect guarantees this runs before
  // the browser paints and before any ghost-click events can fire, so the parent's
  // PostSolveOverlay is in the DOM before any touch events can reach the Exit button.
  useLayoutEffect(() => {
    if (state.status === 'solved') {
      const isNewBest = maze.slug ? savePersonalBest(maze.slug, state.elapsedMs) : false;
      isNewBestRef.current = isNewBest;
      onSolve?.({ elapsedMs: state.elapsedMs, stepCount: state.trail.length, hintsUsed: state.hintsUsed, isNewBest });
    }
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

  const handleHint = useCallback(() => {
    const { solution } = maze;
    if (!solution.length) return;
    const currentIdx = state.playerPosition.y * maze.width + state.playerPosition.x;
    const pos = solution.indexOf(currentIdx);
    const slice = solution.slice(pos !== -1 ? pos + 1 : 0, (pos !== -1 ? pos + 1 : 0) + HINT_LOOKAHEAD);
    if (!slice.length) return;
    dispatch({ type: 'USE_HINT', cells: slice });
    setTimeout(() => dispatch({ type: 'USE_HINT', cells: [] }), 3000);
  }, [maze, state.playerPosition]);

  // ── Follow-camera math ───────────────────────────────────────────────────────
  const mazeW = maze.width  * PLAY_CELL_SIZE + MAZE_PADDING * 2;
  const mazeH = maze.height * PLAY_CELL_SIZE + MAZE_PADDING * 2;

  const playerPx = MAZE_PADDING + state.playerPosition.x * PLAY_CELL_SIZE + PLAY_CELL_SIZE / 2;
  const playerPy = MAZE_PADDING + state.playerPosition.y * PLAY_CELL_SIZE + PLAY_CELL_SIZE / 2;

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
        className="relative rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-white"
        style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
        aria-hidden="true"
      >
        <MazeRenderer
          maze={maze}
          cellSize={minimapCell}
          wallThickness={1}
          padding={2}
          playerPosition={state.playerPosition}
          playerMarkerRadius={5}
          markerRadius={8}
        />
        {/* Current viewport frame */}
        <div
          className="absolute border-2 border-blue-500 rounded pointer-events-none"
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
        <div className="flex-1 flex justify-center text-sm">
          {state.status === 'playing' && (
            <span className="flex items-center gap-1.5 font-mono font-medium text-slate-700">
              <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                <polyline points="12 6 12 12 16 14" strokeWidth="2"/>
              </svg>
              <Timer elapsedMs={state.elapsedMs} />
            </span>
          )}
          {state.status === 'paused'  && <span className="text-amber-500 font-medium text-xs">Paused</span>}
          {state.status === 'idle' && (
            <>
              <span className="md:hidden text-slate-400 text-xs">Swipe or use D-pad to move</span>
              <span className="hidden md:inline text-slate-400 text-xs">Arrow keys or WASD to move</span>
            </>
          )}
          {state.status === 'solved'  && <span className="text-emerald-600 font-semibold text-xs">Solved — {formatTime(state.elapsedMs)}</span>}
        </div>

        {/* Right: pause + overflow menu */}
        <div className="flex items-center gap-1 shrink-0">
          {(state.status === 'playing' || state.status === 'paused') && (
            <button
              onClick={() => dispatch({ type: state.status === 'playing' ? 'PAUSE' : 'RESUME' })}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors text-sm"
              aria-label={state.status === 'playing' ? 'Pause timer' : 'Resume timer'}
            >
              {state.status === 'playing' ? '⏸' : '▶'}
            </button>
          )}

          {/* ⋯ overflow menu */}
          <div ref={menuRef} className="relative">
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
              <div className="absolute top-full right-0 mt-1.5 w-36 rounded-xl shadow-lg border border-slate-200 bg-white overflow-hidden z-10">
                {state.status !== 'solved' && (
                  <button
                    onClick={() => { handleHint(); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-amber-600 font-medium hover:bg-amber-50 transition-colors flex items-center gap-2"
                  >
                    <span>💡</span>
                    {state.hintsUsed > 0 ? `Hint (${state.hintsUsed})` : 'Hint'}
                  </button>
                )}
                <button
                  onClick={() => { dispatch({ type: 'TOGGLE_SOLUTION' }); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <span>{state.solutionVisible ? '🙈' : '🗺️'}</span>
                  {state.solutionVisible ? 'Hide solution' : 'Show solution'}
                </button>
                <div className="h-px bg-slate-100" />
                <button
                  onClick={() => { dispatch({ type: 'RESET', startPosition: maze.entry }); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <span>↩️</span>
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
              solution={maze.solution}
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

        {/* Desktop sidebar — minimap + actions */}
        <div className="hidden md:flex flex-col w-48 bg-white border-l border-slate-200 shrink-0">
          <div className="p-4 pb-3">
            <div
              className="relative rounded-lg overflow-hidden border border-slate-200 bg-white"
              style={{ width: SIDEBAR_MINIMAP_SIZE, height: SIDEBAR_MINIMAP_SIZE }}
              aria-hidden="true"
            >
              <MazeRenderer
                maze={maze}
                cellSize={sidebarMinimapCell}
                wallThickness={1}
                padding={2}
                playerPosition={state.playerPosition}
                playerMarkerRadius={6}
                markerRadius={12}
              />
              <div
                className="absolute border-2 border-blue-500 rounded pointer-events-none"
                style={{
                  left: dmFrameX,
                  top: dmFrameY,
                  width: dmFrameW,
                  height: dmFrameH,
                  opacity: 0.65,
                }}
              />
            </div>
          </div>

          <div className="h-px bg-slate-100 mx-4" />

          <div className="flex flex-col p-2 gap-0.5">
            {state.status !== 'solved' && (
              <button
                onClick={handleHint}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-amber-50 transition-colors flex items-center gap-2 text-amber-600 font-medium"
              >
                <span>💡</span>
                {state.hintsUsed > 0 ? `Hint (${state.hintsUsed})` : 'Hint'}
              </button>
            )}
            <button
              onClick={() => dispatch({ type: 'TOGGLE_SOLUTION' })}
              className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 text-slate-600"
            >
              <span>{state.solutionVisible ? '🙈' : '🗺️'}</span>
              {state.solutionVisible ? 'Hide solution' : 'Show solution'}
            </button>
            <button
              onClick={() => dispatch({ type: 'RESET', startPosition: maze.entry })}
              className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 text-slate-500"
            >
              <span>↩️</span>
              Reset
            </button>
          </div>
        </div>

      </div>

      {/* AD_SLOT: Banner ad goes here — between maze and controls.
          This placement preserves the full maze viewport height and sits naturally
          above the controls, matching standard mobile game ad placement.
          To enable: set AD_SLOT_H = 50 and un-comment the div below. */}
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
        className="md:hidden bg-slate-50 border-t border-slate-200 shrink-0 flex items-stretch"
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
