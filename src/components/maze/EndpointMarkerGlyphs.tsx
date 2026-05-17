export const START_MARKER_COLOR = '#0d9488';
export const FINISH_MARKER_COLOR = '#f59e0b';

interface SvgGlyphProps {
  className?: string;
  opacity?: number | string;
}

interface PositionedGlyphProps extends SvgGlyphProps {
  cx: number;
  cy: number;
  r: number;
}

const FLAG_GLYPH_PATH = [
  // A waved/tapered flag silhouette with two oversized checker cutouts. The
  // negative-space checks are intentionally sparse so the glyph still reads at
  // minimap sizes without becoming a box/window grid.
  'M8.35 7.25',
  'C10.35 6.35 12.15 7.55 14.25 7.05',
  'C15.35 6.78 16.35 6.35 17.2 6.05',
  'L16.25 9.55',
  'L17.2 13.05',
  'C15.15 13.85 13.3 13.08 11.45 12.82',
  'C10.28 12.66 9.32 12.9 8.35 13.35',
  'Z',
  'M10.05 8.35 L12.25 8.35 L12.25 10.18 L10.05 10.18 Z',
  'M13.25 10.25 L15.55 10.25 L15.55 12.05 L13.25 12.05 Z',
].join(' ');

export function FinishFlagGlyph({ className, opacity = 0.95 }: SvgGlyphProps) {
  return (
    <g className={className} opacity={opacity}>
      <rect x="7" y="6.35" width="1.75" height="11.3" rx="0.875" fill="white" />
      <path d={FLAG_GLYPH_PATH} fill="white" fillRule="evenodd" clipRule="evenodd" />
    </g>
  );
}

export function PositionedFinishFlagGlyph({ cx, cy, r, className, opacity = 0.95 }: PositionedGlyphProps) {
  const scale = (r * 2) / 24;

  return (
    <g transform={`translate(${cx - r} ${cy - r}) scale(${scale})`}>
      <FinishFlagGlyph className={className} opacity={opacity} />
    </g>
  );
}
