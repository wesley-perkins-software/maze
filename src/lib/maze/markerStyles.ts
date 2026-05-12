export const START_MARKER_COLOR = '#D94A38';
export const MARKER_BADGE_COLOR = '#ffffff';
export const FINISH_MARKER_COLOR = '#f59e0b';

export const START_MARKER_VARIANTS = {
  doorway: 'doorway',
  archedDoorway: 'arched-doorway',
  entryGate: 'entry-gate',
} as const;

export type StartMarkerVariant = typeof START_MARKER_VARIANTS[keyof typeof START_MARKER_VARIANTS];

// Toggle this value while reviewing the start icon options:
// - doorway: square doorway with a visible lintel and side jambs
// - arched-doorway: rounded entrance silhouette (default)
// - entry-gate: two posts with a top gate/arch
export const START_MARKER_VARIANT: StartMarkerVariant = START_MARKER_VARIANTS.archedDoorway;
