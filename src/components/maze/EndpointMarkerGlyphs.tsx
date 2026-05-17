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

const FLAG_PENNANT_PATH = 'M8.45 7.15 L17.35 10.2 L8.45 13.25 Z';

export function FinishFlagGlyph({ className, opacity = 0.95 }: SvgGlyphProps) {
  return (
    <g className={className} opacity={opacity}>
      <rect x="7" y="6.35" width="1.75" height="11.3" rx="0.875" fill="white" />
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
