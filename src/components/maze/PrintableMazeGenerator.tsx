import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Difficulty, MazeData } from '../../types/maze';
import { generateMaze } from '../../lib/maze/index';
import { MazeRenderer } from './MazeRenderer';
import { renderDownloadSVG } from '../../lib/svg/renderToString';

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

function presetDifficulty(preset: SizePreset): Difficulty {
  if (preset === 'expert' || preset === 'monster') return 'large';
  return preset;
}

function newSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
}

function generateForPreset(preset: SizePreset): MazeData {
  const { w, h } = SIZE_MAP[preset];
  return generateMaze({
    width: w,
    height: h,
    difficulty: presetDifficulty(preset),
    seed: newSeed(),
    anyPortalSide: true,
  });
}

const PREVIEW_PADDING = 6;

export function PrintableMazeGenerator() {
  const [selectedSize, setSelectedSize] = useState<SizePreset>('small');
  const [maze, setMaze] = useState<MazeData>(() => generateForPreset('small'));
  const [showSolution, setShowSolution] = useState(false);
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPrintRoot(document.body);
  }, []);

  const handleSizeChange = useCallback((preset: SizePreset) => {
    setSelectedSize(preset);
    setMaze(generateForPreset(preset));
  }, []);

  const handleGenerate = useCallback(() => {
    setMaze(generateForPreset(selectedSize));
  }, [selectedSize]);

  const handlePrint = useCallback(() => {
    window.requestAnimationFrame(() => window.print());
  }, []);

  const handleDownloadSVG = useCallback(() => {
    const svg = renderDownloadSVG(maze);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maze-${maze.width}x${maze.height}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [maze]);

  const btnBase = 'rounded-sm border py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-arch-accent';
  const activeBtn = 'border-arch-charcoal bg-arch-charcoal text-white dark:bg-arch-dark-surface-raised dark:border-arch-400 dark:text-arch-charcoal';
  const inactiveBtn = 'border-arch-200 bg-arch-surface text-arch-600 hover:border-arch-charcoal hover:text-arch-charcoal hover:bg-arch-bg';

  const cellSize = Math.max(8, Math.min(28, Math.floor(400 / Math.max(maze.width, maze.height))));
  const selectedLabel = SIZE_OPTIONS.find(o => o.value === selectedSize)?.label ?? '';

  const printMaze = (
    <div className={`print-only${showSolution ? ' print-two-page' : ''}`} aria-hidden="true">
      {/* Page 1: clean maze worksheet — always printed */}
      <div className="print-maze-sheet">
        {showSolution && <p className="print-page-label">Maze Worksheet</p>}
        <div className="print-maze-art">
          <MazeRenderer
            maze={maze}
            cellSize={12}
            wallThickness={2}
            padding={6}
            showSolution={false}
            showEndpointMarkers={false}
            showPlayer={false}
            showTrail={false}
            showHintPath={false}
            showPlayerGlow={false}
          />
        </div>
      </div>
      {/* Page 2: answer key — only when "Include answer key page" is checked */}
      {showSolution && (
        <div className="print-maze-sheet">
          <p className="print-page-label">Answer Key</p>
          <div className="print-maze-art print-with-solution">
            <MazeRenderer
              maze={maze}
              cellSize={12}
              wallThickness={2}
              padding={6}
              solution={maze.solution}
              showSolution={true}
              showEndpointMarkers={false}
              showPlayer={false}
              showTrail={false}
              showHintPath={false}
              showPlayerGlow={false}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
    <div className="screen-only flex flex-col lg:grid lg:grid-cols-[320px_1fr] gap-7 lg:gap-10 lg:items-start">

      {/* ── Maze preview — top on mobile, right column on desktop ── */}
      <div className="min-w-0 w-full lg:col-start-2 lg:row-start-1">

        {/* Preview card */}
        <div
          className="border border-arch-400/60 bg-arch-surface overflow-hidden mx-auto"
          style={{
            width: 'min(100%, calc(100vh - 140px))',
            aspectRatio: '1 / 1',
            boxShadow: 'inset 0 0 0 6px #FFFFFF, inset 0 0 0 7px #B0AEA8',
          }}
        >
          <div className="flex justify-center items-center w-full h-full p-3">
            <div
              className="relative"
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
                showSolution={false}
                showEndpointMarkers={false}
                showPlayer={false}
                showTrail={false}
                showHintPath={false}
                showPlayerGlow={false}
              />
            </div>
          </div>
        </div>

        {/* Caption — dimensions + size label */}
        <div
          className="flex items-center justify-between pt-2 pb-1 mx-auto"
          style={{ width: 'min(100%, calc(100vh - 140px))' }}
          aria-label="Maze info"
        >
          <span className="text-sm font-mono font-medium text-arch-600 sm:text-base">
            {maze.width} × {maze.height}
          </span>
          <span className="text-sm font-mono font-medium text-arch-600 sm:text-base">
            {selectedLabel}
          </span>
        </div>
      </div>

      {/* ── Controls panel — below preview on mobile, left column on desktop ── */}
      <div className="w-full shrink-0 flex flex-col gap-4 lg:col-start-1 lg:row-start-1">

        {/* Desktop-only editorial header */}
        <div className="hidden lg:block">
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex items-center gap-1">
              <li>
                <a href="/" className="text-xs font-mono text-arch-400 hover:text-arch-600 transition-colors">
                  Home
                </a>
              </li>
              <li><span className="text-xs font-mono text-arch-400 mx-1.5">/</span></li>
              <li><span className="text-xs font-mono text-arch-600">Printable Mazes</span></li>
            </ol>
          </nav>
          <p className="text-xs tracking-widest uppercase font-semibold text-arch-accent mb-2">
            Free Maze Printables
          </p>
          {/* aria-hidden: real H1 lives in the page (lg:hidden) for SEO */}
          <div className="font-display text-5xl text-arch-charcoal leading-none mb-2" aria-hidden="true">
            Print Your Own<br />Maze Worksheet
          </div>
          <p className="text-base text-arch-600 leading-relaxed mb-4">
            Choose a size, generate a clean maze, then print an ad-free worksheet or download the SVG.
          </p>
        </div>

        {/* Size selector */}
        <fieldset>
          <legend className="block text-sm tracking-widest uppercase font-semibold text-arch-600 mb-2">
            Size
          </legend>
          <div className="grid grid-cols-3 gap-1.5">
            {SIZE_OPTIONS.map(({ value, label, detail }) => (
              <button
                key={value}
                onClick={() => handleSizeChange(value)}
                className={`${btnBase} flex flex-col items-center leading-tight px-1 py-2.5 ${
                  selectedSize === value ? activeBtn : inactiveBtn
                }`}
                aria-pressed={selectedSize === value}
              >
                <span className="text-sm font-semibold">{label}</span>
                <span className={`text-xs font-mono font-medium ${
                  selectedSize === value ? 'text-white/85 dark:text-arch-charcoal/70' : 'text-arch-600'
                }`}>
                  {detail}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Answer key toggle */}
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSolution}
              onChange={(e) => setShowSolution(e.target.checked)}
              className="w-4 h-4 accent-arch-accent shrink-0"
            />
            <span className="text-sm font-medium text-arch-600">Include answer key page</span>
          </label>
          <p className="text-sm text-arch-600 pl-[26px]">Adds a second printed page with the solution.</p>
        </div>

        {/* Divider */}
        <div className="border-t border-arch-200" />

        {/* Actions — generate → print → download */}
        <div className="space-y-2.5">

          {/* Primary: Generate New Maze */}
          <button
            onClick={handleGenerate}
            className="w-full inline-flex items-center justify-center gap-2 rounded-sm border-2 border-arch-charcoal bg-arch-surface px-5 py-3 text-base font-semibold text-arch-charcoal hover:bg-arch-bg active:bg-arch-bg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Generate New Maze
          </button>

          {/* Primary action: Print Maze — desktop only */}
          <button
            onClick={handlePrint}
            className="hidden lg:flex w-full items-center justify-center gap-2 rounded-sm px-5 py-3 text-base font-semibold transition-colors bg-arch-accent text-white hover:bg-arch-accent-dark active:bg-arch-accent-dark"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Maze
          </button>

          {/* Tertiary: Download SVG */}
          <button
            onClick={handleDownloadSVG}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-sm border border-arch-200 bg-arch-surface px-3 py-2.5 text-sm font-medium text-arch-600 hover:bg-arch-bg hover:border-arch-400 hover:text-arch-charcoal transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download SVG
          </button>

          {/* Mobile note — print unavailable on mobile */}
          <p className="lg:hidden border-l-2 border-arch-200 pl-3 text-sm leading-relaxed text-arch-600">
            Printing works best from a desktop browser. On mobile, download the SVG and print from your device or computer.
          </p>
        </div>

      </div>
    </div>

    {/* Print portal — appended to body so @media print CSS applies */}
    {printRoot ? createPortal(printMaze, printRoot) : null}
    </>
  );
}
