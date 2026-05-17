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

const FLAG_PENNANT_PATH = 'M9.15 6.9 L18.05 9.95 L9.15 13 Z';

export function FinishFlagGlyph({ className, opacity = 0.95 }: SvgGlyphProps) {
  return (
    <g className={className} opacity={opacity}>
      <rect x="7.7" y="6.55" width="1.75" height="10.8" rx="0.875" fill="white" />
      <path d={FLAG_PENNANT_PATH} fill="white" />
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
