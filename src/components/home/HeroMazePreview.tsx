import { useMemo } from 'react';
import { createDailyMaze } from '../../lib/maze/dailyMaze';
import { renderMazeToSVGString } from '../../lib/svg/renderToString';
import { getDailyNow } from '../../lib/utils/dailyNow';

export default function HeroMazePreview({ className = '' }: { className?: string }) {
  const svgString = useMemo(() => {
    const maze = createDailyMaze(getDailyNow());
    return renderMazeToSVGString(maze, {
      cellSize: 10,
      wallThickness: 1.5,
      padding: 2,
      showSolution: false,
      showEndpointMarkers: false,
    });
  }, []);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: svgString }}
      aria-hidden="true"
    />
  );
}
