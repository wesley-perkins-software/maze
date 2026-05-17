/**
 * Finish marker glyph components for the 24×24-viewBox SVG badge contexts
 * (MazeGenerator preview and FullscreenMazePlayer minimap).
 *
 * MazeRenderer uses a parametric equivalent that scales from markerR directly.
 */

/** Matches FINISH_MARKER_COLOR — used as the "amber cell" fill inside the flag body. */
const FINISH_AMBER = '#f59e0b';

/**
 * White pole-and-flag finish glyph for a 24×24 viewBox where the amber badge
 * circle sits at r=8.8, center (12,12).
 *
 * Layout (all coordinates in viewBox units):
 *   • Pole:  x=6.5, y=6.5, 1.5 wide × 12 tall — tip rises 1 unit above the flag
 *   • Flag:  x=8, y=7.5, 8.5 wide × 5.5 tall — 2×2 checker grid
 *     - (col0,row0) white  (col1,row0) amber  ← top-right amber cell
 *     - (col0,row1) amber  (col1,row1) white  ← bottom-left amber cell
 *
 * The amber cells are drawn explicitly with FINISH_AMBER so the flag reads as
 * a coherent unified rectangle rather than two disconnected white patches.
 */
export function FinishFlagGlyph() {
  return (
    <>
      {/* Pole — tip above flag gives flagpole silhouette */}
      <rect x="6.5" y="6.5" width="1.5" height="12" fill="white" opacity="0.95" />
      {/* Flag body — white background for the 2×2 checker */}
      <rect x="8" y="7.5" width="8.5" height="5.5" fill="white" opacity="0.95" />
      {/* Amber cells overlay — top-right and bottom-left create checker pattern */}
      <rect x="12.25" y="7.5"  width="4.25" height="2.75" fill={FINISH_AMBER} />
      <rect x="8"     y="10.25" width="4.25" height="2.75" fill={FINISH_AMBER} />
    </>
  );
}
