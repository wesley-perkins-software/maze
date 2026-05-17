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

const FINISH_FLAG_PATH = [
  // A simple solid pennant: wide enough to read instantly at minimap sizes,
  // with a subtle fly-edge notch so the pole + flag does not become a "P".
  'M8.35 7.25',
  'C10.85 6.62 13.15 7.38 16.85 6.95',
  'L14.95 9.62',
  'L16.85 12.3',
  'C13.9 12.72 11.25 11.72 8.35 12.35',
  'Z',
].join(' ');

export function FinishFlagGlyph({ className, opacity = 0.95 }: SvgGlyphProps) {
  return (
    <g className={className} opacity={opacity}>
      <rect x="7.15" y="6.45" width="1.7" height="11.1" rx="0.85" fill="white" />
      <path d={FINISH_FLAG_PATH} fill="white" />
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
