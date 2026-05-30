export const START_MARKER_COLOR = '#0d9488';
export const FINISH_MARKER_COLOR = '#f59e0b';

export const ENDPOINT_MARKER_VIEWBOX_SIZE = 24;
export const ENDPOINT_MARKER_CENTER = ENDPOINT_MARKER_VIEWBOX_SIZE / 2;
export const ENDPOINT_MARKER_OUTER_RADIUS = 12;
export const ENDPOINT_MARKER_BADGE_RADIUS = 8.8;

interface SvgGlyphProps {
  className?: string;
  opacity?: number | string;
}

interface PositionedGlyphProps extends SvgGlyphProps {
  cx: number;
  cy: number;
  badgeRadius: number;
}

interface StartMarkerIconProps extends SvgGlyphProps {
  arrowPoints?: string;
  badgeOpacity?: number | string;
}

interface FinishMarkerIconProps extends SvgGlyphProps {
  badgeOpacity?: number | string;
}

export const DEFAULT_START_ARROW_POINTS = '6.72,8.92 17.28,8.92 12,16.84';

const FLAG_POLE = {
  x: 7.7,
  y: 6.55,
  width: 1.75,
  height: 12,
  rx: 0.875,
} as const;
const FLAG_PENNANT_PATH = 'M9.15 6.9 L18.05 9.95 L9.15 13 Z';

export function StartArrowGlyph({ className, opacity = 0.95, arrowPoints = DEFAULT_START_ARROW_POINTS }: StartMarkerIconProps) {
  return <polygon className={className} points={arrowPoints} fill="white" opacity={opacity} />;
}

export function StartMarkerIcon({
  className,
  opacity = 0.95,
  arrowPoints = DEFAULT_START_ARROW_POINTS,
  badgeOpacity = 0.9,
}: StartMarkerIconProps) {
  return (
    <>
      <circle cx={ENDPOINT_MARKER_CENTER} cy={ENDPOINT_MARKER_CENTER} r={ENDPOINT_MARKER_OUTER_RADIUS} fill="white" />
      <circle
        cx={ENDPOINT_MARKER_CENTER}
        cy={ENDPOINT_MARKER_CENTER}
        r={ENDPOINT_MARKER_BADGE_RADIUS}
        fill={START_MARKER_COLOR}
        opacity={badgeOpacity}
      />
      <StartArrowGlyph className={className} opacity={opacity} arrowPoints={arrowPoints} />
    </>
  );
}

export function FinishFlagGlyph({ className, opacity = 0.95 }: SvgGlyphProps) {
  return (
    <g className={className} opacity={opacity}>
      <rect {...FLAG_POLE} fill="white" />
      <path d={FLAG_PENNANT_PATH} fill="white" />
    </g>
  );
}

export function FinishMarkerIcon({ className, opacity = 0.95, badgeOpacity }: FinishMarkerIconProps) {
  return (
    <>
      <circle cx={ENDPOINT_MARKER_CENTER} cy={ENDPOINT_MARKER_CENTER} r={ENDPOINT_MARKER_OUTER_RADIUS} fill="white" />
      <circle
        cx={ENDPOINT_MARKER_CENTER}
        cy={ENDPOINT_MARKER_CENTER}
        r={ENDPOINT_MARKER_BADGE_RADIUS}
        fill={FINISH_MARKER_COLOR}
        opacity={badgeOpacity}
      />
      <FinishFlagGlyph className={className} opacity={opacity} />
    </>
  );
}

export function PositionedFinishFlagGlyph({ cx, cy, badgeRadius, className, opacity = 0.95 }: PositionedGlyphProps) {
  const scale = badgeRadius / ENDPOINT_MARKER_BADGE_RADIUS;
  const offset = ENDPOINT_MARKER_CENTER * scale;

  return (
    <g transform={`translate(${cx - offset} ${cy - offset}) scale(${scale})`}>
      <FinishFlagGlyph className={className} opacity={opacity} />
    </g>
  );
}
