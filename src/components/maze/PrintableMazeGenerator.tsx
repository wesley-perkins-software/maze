import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Difficulty, MazeData } from '../../types/maze';
import { generateMaze } from '../../lib/maze/index';
import { MazeRenderer } from './MazeRenderer';
import { renderDownloadSVG } from '../../lib/svg/renderToString';

type SizePreset = 'small' | 'medium' | 'large' | 'expert' | 'monster';

const SIZE_OPTIONS: { value: SizePreset; label: string; detail: string }[] = [
  { value: 'small',   label: 'Small',   detail: '20×20' },
  { value: 'medium',  label: 'Medium',  detail: '40×40' },
  { value: 'large',   label: 'Large',   detail: '60×60' },
  { value: 'expert',  label: 'Expert',  detail: '80×80' },
  { value: 'monster', label: 'Monster', detail: '100×100' },
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

const PrintIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

export function PrintableMazeGenerator() {
  const [selectedSize, setSelectedSize] = useState<SizePreset>('small');
  const [maze, setMaze] = useState<MazeData>(() => generateForPreset('small'));
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPrintRoot(document.body);
  }, []);

  const handleSizeChange = useCallback((preset: SizePreset) => {
    setSelectedSize(preset);
    setMaze(generateForPreset(preset));
  }, []);

  const handleGenerate = useCallback(() => {
    setMaze((prev) => {
      const next = generateForPreset(selectedSize);
      // Ensure different maze each time (extremely unlikely collision, but guard it)
      return next.seed !== prev.seed ? next : generateForPreset(selectedSize);
    });
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

  const btnBase = 'rounded-sm border px-4 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-arch-accent flex flex-col items-center gap-0.5 min-w-[72px]';
  const activeBtn = 'border-arch-charcoal bg-arch-charcoal text-white';
  const inactiveBtn = 'border-arch-200 bg-arch-surface text-arch-600 hover:border-arch-charcoal hover:text-arch-charcoal hover:bg-arch-bg';

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
    <div className="screen-only">
      {/* Size picker */}
      <div className="mb-5">
        <p className="text-sm font-medium mb-3 text-arch-600">Choose a size:</p>
        <div className="flex flex-wrap gap-2">
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSizeChange(opt.value)}
              className={`${btnBase} ${selectedSize === opt.value ? activeBtn : inactiveBtn}`}
              aria-pressed={selectedSize === opt.value}
            >
              <span className="font-semibold leading-tight">{opt.label}</span>
              <span className="text-xs opacity-70 font-normal leading-tight"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >{opt.detail}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Maze preview */}
      <div
        className="relative border bg-arch-surface overflow-hidden mx-auto mb-5"
        style={{
          width: 'min(100%, 520px)',
          aspectRatio: '1 / 1',
          borderColor: 'var(--color-border)',
          boxShadow: 'inset 0 0 0 6px #FFFFFF, inset 0 0 0 7px var(--color-border)',
        }}
      >
        <div className="absolute inset-3">
          <MazeRenderer
            maze={maze}
            fillContainer={true}
            showPlayer={false}
            showTrail={false}
            showEndpointMarkers={false}
            showHintPath={false}
            showSolution={false}
            showPlayerGlow={false}
          />
        </div>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Print Maze — primary, desktop only */}
        <button
          onClick={handlePrint}
          className="hidden lg:inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 active:scale-[0.98]"
          style={{ backgroundColor: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
          onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-accent-dark)'; }}
          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-accent)'; }}
        >
          <PrintIcon />
          Print Maze
        </button>

        {/* Make Another — secondary */}
        <button
          onClick={handleGenerate}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all duration-150 active:scale-[0.98]"
          style={{
            color: 'var(--color-charcoal)',
            border: '1px solid var(--color-charcoal)',
            backgroundColor: 'transparent',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-charcoal)';
            e.currentTarget.style.color = 'var(--color-bg)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--color-charcoal)';
          }}
        >
          <RefreshIcon />
          Make Another
        </button>

        {/* Download SVG — tertiary */}
        <button
          onClick={handleDownloadSVG}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150"
          style={{ color: 'var(--color-muted-strong)' }}
          onMouseOver={(e) => { e.currentTarget.style.color = 'var(--color-charcoal)'; }}
          onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-muted-strong)'; }}
        >
          <DownloadIcon />
          Download SVG
        </button>
      </div>

      {/* Mobile note */}
      <p
        className="lg:hidden mt-4 pl-3 text-sm leading-relaxed"
        style={{ borderLeft: '2px solid var(--color-border)', color: 'var(--color-muted-strong)' }}
      >
        Printing works best from a desktop browser. On mobile, download the SVG and print from your device or computer.
      </p>

      {/* Print portal — injected into document.body so print CSS applies */}
      {printRoot ? createPortal(printMaze, printRoot) : null}
    </div>
  );
}
