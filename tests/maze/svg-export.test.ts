import { describe, expect, it } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { renderDownloadSVG } from '../../src/lib/svg/renderToString';

function getViewBox(svg: string): number[] {
  const match = svg.match(/viewBox="([^"]+)"/);
  expect(match).not.toBeNull();
  return match![1].split(/\s+/).map(Number);
}

function getPathD(svg: string): string {
  const match = svg.match(/<path d="([^"]+)"/);
  expect(match).not.toBeNull();
  return match![1];
}

describe('renderDownloadSVG', () => {
  it.each([
    [20, 20],
    [40, 40],
    [60, 60],
    [100, 100],
    [5, 5],
    [80, 50],
    [50, 80],
  ])('exports a centered, artwork-sized, clean %ix%i SVG', (width, height) => {
    const maze = generateMaze({ width, height, difficulty: 'medium', seed: 12345 });
    const svg = renderDownloadSVG(maze);
    const [minX, minY, viewBoxW, viewBoxH] = getViewBox(svg);
    const wallPath = getPathD(svg);

    const cellSize = 960 / Math.max(width, height);
    const wallThickness = Math.max(1.75, Math.min(3.5, cellSize * 0.16));
    const halfStroke = wallThickness / 2;
    const expectedPadding = Math.max(18, wallThickness * 6, 960 * 0.035);
    const mazeW = width * cellSize;
    const mazeH = height * cellSize;

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="')).toBe(true);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).not.toMatch(/<svg[^>]*\swidth="/);
    expect(svg).not.toMatch(/<svg[^>]*\sheight="/);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('style=');
    expect(svg).not.toContain('#3b82f6');
    expect(svg).not.toContain('#22c55e');

    expect(minX).toBeCloseTo(-halfStroke - expectedPadding, 3);
    expect(minY).toBeCloseTo(-halfStroke - expectedPadding, 3);
    expect(viewBoxW).toBeCloseTo(mazeW + wallThickness + expectedPadding * 2, 3);
    expect(viewBoxH).toBeCloseTo(mazeH + wallThickness + expectedPadding * 2, 3);

    const firstMove = wallPath.match(/^M([\d.]+),([\d.]+)/);
    expect(firstMove).not.toBeNull();
    expect(Number(firstMove![1])).toBe(0);
    expect(Number(firstMove![2])).toBe(0);

    const artworkAspect = mazeW / mazeH;
    const canvasAspect = viewBoxW / viewBoxH;
    if (width === height) {
      expect(canvasAspect).toBeCloseTo(1, 3);
    } else {
      expect(canvasAspect > 1).toBe(width > height);
      expect(Math.abs(canvasAspect - artworkAspect) / artworkAspect).toBeLessThan(0.12);
    }
  });
});
