import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Difficulty, MazeData, Point } from '../../types/maze';
import { generateMaze } from '../../lib/maze/index';
import { MazeRenderer } from './MazeRenderer';
import { FullscreenMazePlayer } from './FullscreenMazePlayer';
import type { SolveStats } from './FullscreenMazePlayer';
import { PostSolveOverlay } from './PostSolveOverlay';
import { renderDownloadSVG } from '../../lib/svg/renderToString';
import { getEndpointMarkerCenter, getMazeBodyBounds, inferPortalSide } from '../../lib/maze/endpointMarkers';

type SizePreset = 'small' | 'medium' | 'large' | 'expert' | 'monster';

const SIZE_OPTIONS: { value: SizePreset; label: string; detail: string }[] = [
  { value: 'small',   label: 'Small',   detail: '20 × 20' },
  { value: 'medium',  label: 'Medium',  detail: '40 × 40' },
  { value: 'large',   label: 'Large',   detail: '60 × 60' },
  { value: 'expert',  label: 'Expert',  detail: '80 × 80' },
  { value: 'monster', label: 'Monster', detail: '100 × 100' },
];

const SIZE_MAP: Record<SizePreset, { w: number; h: number }> = {
  small:   { w: 20,  h: 20 },
  medium:  { w: 40,  h: 40 },
  large:   { w: 60,  h: 60 },
  expert:  { w: 80,  h: 80 },
  monster: { w: 100, h: 100 },
};

export const CUSTOM_RANGE = { min: 10, max: 100 };

const PREVIEW_PADDING = 6;

export function getPreviewMarkerPosition(
  maze: MazeData,
  point: Point,
  cellSize: number,
): { left: string; top: string } {
  const totalW = maze.width * cellSize + PREVIEW_PADDING * 2;
  const totalH = maze.height * cellSize + PREVIEW_PADDING * 2;

  const markerRadius = cellSize * 0.9;
  const marker = getEndpointMarkerCenter({
    mazeWidth: maze.width,
    mazeHeight: maze.height,
    cellSize,
    bounds: getMazeBodyBounds(maze.width, maze.height, cellSize, PREVIEW_PADDING),
    portal: point,
    portalSide: inferPortalSide(maze, point),
    markerRadius,
    overhangAmount: markerRadius * 0.6,
  });

  const markerX = marker.x;
  const markerY = marker.y;

  return {
    left: `${(markerX / totalW) * 100}%`,
    top: `${(markerY / totalH) * 100}%`,
  };
}

function getPreviewEntryArrowPoints(maze: MazeData): string {
  const { entry } = maze;

  const side = inferPortalSide(maze, entry);

  if (side === 'top') return '6.72,8.92 17.28,8.92 12,16.84';
  if (side === 'bottom') return '6.72,15.08 17.28,15.08 12,7.16';
  if (side === 'left') return '8.92,6.72 16.84,12 8.92,17.28';
  if (side === 'right') return '15.08,6.72 7.16,12 15.08,17.28';

  return '6.72,8.92 17.28,8.92 12,16.84';
}

function PreviewEndpointMarkers({ maze, cellSize }: { maze: MazeData; cellSize: number }) {
  const markerBase = 'pointer-events-none absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 overflow-visible drop-shadow-[0_2px_4px_rgba(15,23,42,0.32)] md:h-7 md:w-7';
  const entryArrowPoints = getPreviewEntryArrowPoints(maze);

  return (
    <>
      <svg
        viewBox="0 0 24 24"
        className={markerBase}
        style={getPreviewMarkerPosition(maze, maze.entry, cellSize)}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="white" />
        <circle cx="12" cy="12" r="8.8" fill="#0d9488" opacity="0.9" />
        <polygon points={entryArrowPoints} fill="white" opacity="0.95" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className={markerBase}
        style={getPreviewMarkerPosition(maze, maze.exit, cellSize)}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="white" />
        <circle cx="12" cy="12" r="8.8" fill="#f59e0b" />
        <polygon points="12,5 13.8,9.6 18.7,9.8 14.9,12.9 16.1,17.7 12,15 7.9,17.7 9.2,12.9 5.3,9.8 10.2,9.6" fill="white" />
      </svg>
    </>
  );
}

function presetDifficulty(preset: SizePreset): Difficulty {
  if (preset === 'expert' || preset === 'monster') return 'large';
  return preset;
}

function newSeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }

  return Math.floor(Math.random() * 0xffffffff);
}

export function difficultyForCustomSize(w: number, h: number): Difficulty {
  const area = w * h;
  const smallArea  = SIZE_MAP.small.w  * SIZE_MAP.small.h;
  const mediumArea = SIZE_MAP.medium.w * SIZE_MAP.medium.h;
  const largeArea  = SIZE_MAP.large.w  * SIZE_MAP.large.h;

  const smallMediumMidpoint = (smallArea  + mediumArea) / 2;
  const mediumLargeMidpoint = (mediumArea + largeArea)  / 2;

  if (area <= smallMediumMidpoint) return 'small';
  if (area <= mediumLargeMidpoint) return 'medium';
  return 'large';
}

export function MazeGenerator() {
  const [sizePreset, setSizePreset] = useState<SizePreset>('medium');
  const [showCustom, setShowCustom] = useState(false);
  const [customWidth,  setCustomWidth]  = useState(40);
  const [customHeight, setCustomHeight] = useState(40);
  const [playing,   setPlaying]   = useState(false);
  const [solved,    setSolved]    = useState(false);
  const [solveStats, setSolveStats] = useState<SolveStats | null>(null);
  const [playerKey, setPlayerKey] = useState(0);
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  const hasPlayedRef = useRef(false);
  const lastSeedRef = useRef<number | null>(null);
  const customPreviewTimerRef = useRef<number | null>(null);
  const customPreviewRequestRef = useRef(0);


  useEffect(() => {
    setPrintRoot(document.body);
  }, []);

  const getDimensions = useCallback(
    () => showCustom ? { w: customWidth, h: customHeight } : SIZE_MAP[sizePreset],
    [showCustom, customWidth, customHeight, sizePreset],
  );

  const [maze, setMaze] = useState(() => {
    const { w, h } = SIZE_MAP['medium'];
    const seed = newSeed();
    lastSeedRef.current = seed;
    return generateMaze({ width: w, height: h, difficulty: 'medium', seed, anyPortalSide: true });
  });

  const nextSeed = useCallback(() => {
    let seed = newSeed();

    while (seed === lastSeedRef.current) {
      seed = newSeed();
    }

    lastSeedRef.current = seed;
    return seed;
  }, []);

  const cancelScheduledCustomPreview = useCallback(() => {
    if (customPreviewTimerRef.current !== null) {
      window.clearTimeout(customPreviewTimerRef.current);
      customPreviewTimerRef.current = null;
    }

    customPreviewRequestRef.current += 1;
  }, []);

  const generate = useCallback((preset: SizePreset | null, dims: { w: number; h: number }, lightMode = false) => {
    const difficulty: Difficulty = preset
      ? presetDifficulty(preset)
      : difficultyForCustomSize(dims.w, dims.h);
    const m = generateMaze({ width: dims.w, height: dims.h, difficulty, seed: nextSeed(), anyPortalSide: true, lightMode });
    setMaze(m);
    setPlaying(false);
    setSolved(false);
    setSolveStats(null);
  }, [nextSeed]);

  useEffect(() => {
    if (!showCustom) {
      cancelScheduledCustomPreview();
      return;
    }

    const requestId = customPreviewRequestRef.current + 1;
    customPreviewRequestRef.current = requestId;

    if (customPreviewTimerRef.current !== null) {
      window.clearTimeout(customPreviewTimerRef.current);
    }

    customPreviewTimerRef.current = window.setTimeout(() => {
      customPreviewTimerRef.current = null;

      if (customPreviewRequestRef.current !== requestId) return;

      generate(null, { w: customWidth, h: customHeight }, true);
    }, 220);

    return () => {
      if (customPreviewTimerRef.current !== null) {
        window.clearTimeout(customPreviewTimerRef.current);
        customPreviewTimerRef.current = null;
      }
    };
  }, [showCustom, customWidth, customHeight, generate, cancelScheduledCustomPreview]);

  const handleSizeChange = useCallback((s: SizePreset) => {
    cancelScheduledCustomPreview();
    setSizePreset(s);
    setShowCustom(false);
    generate(s, SIZE_MAP[s]);
  }, [generate, cancelScheduledCustomPreview]);

  const handleGenerate = useCallback(() => {
    cancelScheduledCustomPreview();

    if (showCustom) {
      generate(null, { w: customWidth, h: customHeight });
    } else {
      generate(sizePreset, SIZE_MAP[sizePreset]);
    }
  }, [showCustom, customWidth, customHeight, sizePreset, generate, cancelScheduledCustomPreview]);

  const handlePlay = useCallback(() => {
    hasPlayedRef.current = true;
    setPlaying(true);
    setSolved(false);
  }, []);

  const handleSolve = useCallback((stats: SolveStats) => {
    setSolveStats(stats);
    setSolved(true);
  }, []);

  const handleTryLarger = useCallback(() => {
    cancelScheduledCustomPreview();
    const presets: SizePreset[] = ['small', 'medium', 'large', 'expert', 'monster'];
    const idx  = presets.indexOf(sizePreset);
    const next = presets[Math.min(idx + 1, presets.length - 1)];
    setSizePreset(next);
    generate(next, SIZE_MAP[next]);
  }, [sizePreset, generate, cancelScheduledCustomPreview]);

  const handleDownloadSVG = useCallback(() => {
    const svg = renderDownloadSVG(maze);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `maze-${maze.width}x${maze.height}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [maze]);

  const handlePrint = useCallback(() => {
    window.requestAnimationFrame(() => window.print());
  }, []);

  const toggleCustom = useCallback(() => {
    setShowCustom((prev) => {
      if (!prev) {
        const { w, h } = SIZE_MAP[sizePreset];
        setCustomWidth(w);
        setCustomHeight(h);
      }
      return !prev;
    });
  }, [sizePreset]);

  const { w: width, h: height } = getDimensions();
  const cellSize = Math.max(8, Math.min(28, Math.floor(400 / Math.max(width, height))));

  const btnBase    = 'rounded-sm border py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-arch-accent';
  const activeBtn  = 'border-arch-charcoal bg-arch-charcoal text-white';
  const inactiveBtn = 'border-arch-200 bg-arch-surface text-arch-600 hover:border-arch-charcoal hover:text-arch-charcoal hover:bg-arch-bg';

  const presetLabel = showCustom ? 'Custom' : sizePreset.charAt(0).toUpperCase() + sizePreset.slice(1);

  const printMaze = (
    <div className="print-only" aria-hidden="true">
      <div className="print-maze-sheet">
        <div className="print-maze-art">
          <MazeRenderer
            maze={maze}
            cellSize={12}
            wallThickness={2}
            padding={6}
            showEndpointMarkers={false}
            showPlayer={false}
            showTrail={false}
            showHintPath={false}
            showSolution={false}
            showPlayerGlow={false}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
    <div className="screen-only flex flex-col lg:grid lg:grid-cols-[320px_1fr] gap-7 lg:gap-10 lg:items-start">

      {/* ── Maze panel — top on mobile, right column on desktop ── */}
      <div className="min-w-0 w-full lg:col-start-2 lg:row-start-1">

        {/* Preview card — square, viewport-fitted */}
        <div
          className="maze-generator-svg border border-arch-400/60 bg-arch-surface overflow-visible mx-auto"
          style={{
            width: 'min(100%, calc(100vh - 140px))',
            aspectRatio: '1 / 1',
            boxShadow: 'inset 0 0 0 6px #FFFFFF, inset 0 0 0 7px #B0AEA8',
          }}
        >
          <div className="flex justify-center items-center w-full h-full overflow-visible p-3">
            <div
              className="relative overflow-visible"
              style={{
                aspectRatio: `${maze.width * cellSize + PREVIEW_PADDING * 2} / ${maze.height * cellSize + PREVIEW_PADDING * 2}`,
                width: maze.width >= maze.height ? '100%' : 'auto',
                height: maze.width >= maze.height ? 'auto' : '100%',
                maxWidth: '100%',
                maxHeight: '100%',
              }}
            >
              <MazeRenderer
                maze={maze}
                cellSize={cellSize}
                padding={PREVIEW_PADDING}
                fillContainer
                showEndpointMarkers={false}
              />
              <PreviewEndpointMarkers maze={maze} cellSize={cellSize} />
            </div>
          </div>
        </div>

        {/* Identity caption — below card, flush with card edges */}
        <div
          className="flex justify-between items-center pt-2 pb-1 mx-auto"
          style={{ width: 'min(100%, calc(100vh - 140px))' }}
        >
          <span className="text-sm font-mono font-medium text-arch-600">{width} × {height}</span>
          <span className="text-sm font-mono font-medium text-arch-600">{presetLabel}</span>
        </div>

        {playing && (
          <FullscreenMazePlayer
            key={playerKey}
            maze={maze}
            onSolve={handleSolve}
            onClose={() => setPlaying(false)}
          />
        )}

        {solveStats && (
          <div className="fixed inset-0 z-[60]">
            <PostSolveOverlay
              elapsedMs={solveStats.elapsedMs}
              stepCount={solveStats.stepCount}
              hintsUsed={solveStats.hintsUsed}
              isNewBest={solveStats.isNewBest}
              personalBest={null}
              onPlayAgain={() => {
                setSolveStats(null);
                setSolved(false);
                setPlayerKey(k => k + 1);
              }}
              onClose={() => {
                setSolveStats(null);
                setPlaying(false);
              }}
            />
          </div>
        )}

        {/* Post-solve CTA */}
        {solved && (
          <div className="mt-3 rounded-sm border border-green-200 bg-green-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm font-medium text-green-800">Nice work! Ready for another?</p>
            <div className="flex gap-2 shrink-0">
              {sizePreset !== 'monster' && !showCustom && (
                <button
                  onClick={handleTryLarger}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                >
                  Try Larger →
                </button>
              )}
              <button
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 rounded-sm border border-green-300 bg-white px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 transition-colors"
              >
                New Maze
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Controls panel — below maze on mobile, left column on desktop ──
          Order: size selector → [rule] → actions → [rule] → browse */}
      <div className="w-full shrink-0 flex flex-col gap-4 lg:col-start-1 lg:row-start-1">

        {/* Desktop-only editorial header — hidden on mobile (page renders heading above) */}
        <div className="hidden lg:block">
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex items-center gap-1">
              <li>
                <a href="/" className="text-xs font-mono text-arch-400 hover:text-arch-600 transition-colors">
                  Home
                </a>
              </li>
              <li><span className="text-xs font-mono text-arch-400 mx-1.5">/</span></li>
              <li><span className="text-xs font-mono text-arch-600">Maze Generator</span></li>
            </ol>
          </nav>
          <p className="text-xs tracking-widest uppercase font-semibold text-arch-accent mb-2">Free Maze Generator</p>
          {/* aria-hidden because the real h1 lives in the page (lg:hidden) for SEO */}
          <div className="font-display text-5xl text-arch-charcoal leading-none mb-2" aria-hidden="true">
            Build Your Own Maze
          </div>
          <p className="text-sm text-arch-600 leading-relaxed mb-4">
            Choose a size, generate a maze, then play online or print.
          </p>
        </div>

        {/* Size selector — always first */}
        <fieldset>
          <legend className="block text-xs tracking-widest uppercase font-semibold text-arch-600 mb-2">Size</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {SIZE_OPTIONS.map(({ value, label, detail }) => (
              <button
                key={value}
                onClick={() => handleSizeChange(value)}
                className={`${btnBase} flex flex-col items-center leading-tight px-1 ${
                  !showCustom && sizePreset === value ? activeBtn : inactiveBtn
                }`}
                aria-pressed={!showCustom && sizePreset === value}
              >
                <span>{label}</span>
                <span className={`text-xs font-mono font-medium ${!showCustom && sizePreset === value ? 'text-white/85' : 'text-arch-600'}`}>{detail}</span>
              </button>
            ))}
            {/* Custom — sixth slot */}
            <button
              onClick={toggleCustom}
              className={`${btnBase} flex flex-col items-center leading-tight px-1 ${
                showCustom ? activeBtn : inactiveBtn
              }`}
              aria-pressed={showCustom}
            >
              <span>Custom</span>
              <span className={`text-xs font-mono font-medium ${showCustom ? 'text-white/85' : 'text-arch-600'}`}>Up to 100</span>
            </button>
          </div>

          {/* Custom inputs — compact inline rows: Label [slider] Value */}
          {showCustom && (
            <div className="mt-3 space-y-2.5 border-t border-arch-200 pt-3">
              <div className="flex items-center gap-2">
                <label htmlFor="maze-width" className="text-sm font-semibold text-arch-charcoal w-12 shrink-0">Width</label>
                <input
                  id="maze-width"
                  type="range"
                  min={CUSTOM_RANGE.min}
                  max={CUSTOM_RANGE.max}
                  value={customWidth}
                  onChange={(e) => setCustomWidth(Number(e.target.value))}
                  className="generator-range flex-1 min-w-0"
                />
                <span className="text-sm font-mono font-semibold text-arch-charcoal w-9 text-right shrink-0">{customWidth}</span>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="maze-height" className="text-sm font-semibold text-arch-charcoal w-12 shrink-0">Height</label>
                <input
                  id="maze-height"
                  type="range"
                  min={CUSTOM_RANGE.min}
                  max={CUSTOM_RANGE.max}
                  value={customHeight}
                  onChange={(e) => setCustomHeight(Number(e.target.value))}
                  className="generator-range flex-1 min-w-0"
                />
                <span className="text-sm font-mono font-semibold text-arch-charcoal w-9 text-right shrink-0">{customHeight}</span>
              </div>
            </div>
          )}
        </fieldset>

        {/* Divider */}
        <div className="border-t border-arch-200" />

        {/* Actions */}
        <div className="space-y-2.5">
          {/* Primary generator action */}
          <button
            onClick={handleGenerate}
            className="w-full inline-flex items-center justify-center gap-2 rounded-sm border-2 border-arch-charcoal bg-arch-surface px-5 py-3 text-base font-semibold text-arch-charcoal hover:bg-arch-bg active:bg-arch-bg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Generate New Maze
          </button>

          {/* Primary play action */}
          <button
            onClick={handlePlay}
            className="w-full inline-flex items-center justify-center gap-2 rounded-sm bg-arch-accent px-5 py-3 text-base font-semibold text-white hover:bg-arch-accent-dark active:bg-arch-accent-dark transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Play This Maze
          </button>

          {/* Utility */}
          <div className="flex gap-2">
            <button
              onClick={handleDownloadSVG}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-sm border border-arch-200 bg-arch-surface px-3 py-2 text-sm font-medium text-arch-600 hover:bg-arch-bg hover:border-arch-400 hover:text-arch-charcoal transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Download SVG
            </button>
            <button
              onClick={handlePrint}
              className="hidden lg:inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-arch-200 bg-arch-surface px-3 py-2 text-sm font-medium text-arch-600 hover:bg-arch-bg hover:border-arch-400 hover:text-arch-charcoal transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
              Print
            </button>
          </div>
          <p className="lg:hidden border-l-2 border-arch-200 pl-3 text-sm leading-relaxed text-arch-600">
            For best print results, download the SVG and print from a desktop browser.
          </p>
        </div>

      </div>
    </div>
    {printRoot ? createPortal(printMaze, printRoot) : null}
    </>
  );
}
