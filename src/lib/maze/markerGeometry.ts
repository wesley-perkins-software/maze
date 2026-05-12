import { START_MARKER_VARIANT, type StartMarkerVariant } from './markerStyles';

function fmt(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * Returns a filled frame path with an open cutout. The single path uses even-odd
 * fill so the start marker reads as an entrance rather than a flag, arrow, or bullseye.
 */
export function getStartMarkerPath(
  cx: number,
  cy: number,
  r: number,
  variant: StartMarkerVariant = START_MARKER_VARIANT,
): string {
  switch (variant) {
    case 'doorway': {
      const outerL = cx - r * 0.52;
      const outerR = cx + r * 0.52;
      const outerT = cy - r * 0.58;
      const outerB = cy + r * 0.58;
      const corner = r * 0.08;
      const innerL = cx - r * 0.24;
      const innerR = cx + r * 0.24;
      const innerT = cy - r * 0.24;
      return [
        `M${fmt(outerL + corner)},${fmt(outerT)}`,
        `H${fmt(outerR - corner)}`,
        `Q${fmt(outerR)},${fmt(outerT)} ${fmt(outerR)},${fmt(outerT + corner)}`,
        `V${fmt(outerB)}`,
        `H${fmt(outerL)}`,
        `V${fmt(outerT + corner)}`,
        `Q${fmt(outerL)},${fmt(outerT)} ${fmt(outerL + corner)},${fmt(outerT)}`,
        'Z',
        `M${fmt(innerL)},${fmt(outerB)}`,
        `V${fmt(innerT)}`,
        `H${fmt(innerR)}`,
        `V${fmt(outerB)}`,
        'Z',
      ].join(' ');
    }
    case 'entry-gate': {
      const leftPostL = cx - r * 0.56;
      const leftPostR = cx - r * 0.34;
      const rightPostL = cx + r * 0.34;
      const rightPostR = cx + r * 0.56;
      const topY = cy - r * 0.50;
      const barBottomY = cy - r * 0.28;
      const bottomY = cy + r * 0.58;
      return [
        `M${fmt(leftPostL)},${fmt(bottomY)}`,
        `V${fmt(topY)}`,
        `H${fmt(rightPostR)}`,
        `V${fmt(bottomY)}`,
        `H${fmt(rightPostL)}`,
        `V${fmt(barBottomY)}`,
        `H${fmt(leftPostR)}`,
        `V${fmt(bottomY)}`,
        'Z',
      ].join(' ');
    }
    case 'arched-doorway':
    default: {
      const outerL = cx - r * 0.52;
      const outerR = cx + r * 0.52;
      const outerShoulderY = cy - r * 0.16;
      const outerArchTopY = cy - r * 0.62;
      const outerB = cy + r * 0.58;
      const innerL = cx - r * 0.25;
      const innerR = cx + r * 0.25;
      const innerShoulderY = cy - r * 0.06;
      const innerArchTopY = cy - r * 0.34;
      return [
        `M${fmt(outerL)},${fmt(outerB)}`,
        `V${fmt(outerShoulderY)}`,
        `Q${fmt(cx)},${fmt(outerArchTopY)} ${fmt(outerR)},${fmt(outerShoulderY)}`,
        `V${fmt(outerB)}`,
        'Z',
        `M${fmt(innerL)},${fmt(outerB)}`,
        `V${fmt(innerShoulderY)}`,
        `Q${fmt(cx)},${fmt(innerArchTopY)} ${fmt(innerR)},${fmt(innerShoulderY)}`,
        `V${fmt(outerB)}`,
        'Z',
      ].join(' ');
    }
  }
}
