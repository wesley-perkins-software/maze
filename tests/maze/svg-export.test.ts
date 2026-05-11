import { describe, expect, it } from 'vitest';
import { generateMaze } from '../../src/lib/maze/generator';
import { renderDownloadSVG } from '../../src/lib/svg/renderToString';

function getViewBox(svg: string): number[] {
  const match = svg.match(/viewBox="([^"]+)"/);
  expect(match).not.toBeNull();
  return match![1].split(/\s+/).map(Number);
}

function getAttr(svg: string, name: string): string {
  const match = svg.match(new RegExp(`${name}="([^"]+)"`));
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
  ])('exports a centered, padded, clean %ix%i SVG', (width, height) => {
    const maze = generateMaze({ width, height, difficulty: 'medium', seed: 12345 });
    const svg = renderDownloadSVG(maze);
    const [minX, minY, viewBoxW, viewBoxH] = getViewBox(svg);
    const wallPath = getAttr(svg, 'd');

    expect(minX).toBe(0);
    expect(minY).toBe(0);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain('width="');
    expect(svg).toContain('height="');
    expect(svg).toContain('<rect width="');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('style=');
    expect(svg).not.toContain('#3b82f6');
    expect(svg).not.toContain('#22c55e');

    const firstMove = wallPath.match(/^M([\d.]+),([\d.]+)/);
    expect(firstMove).not.toBeNull();
    const leftPadding = Number(firstMove![1]);
    const topPadding = Number(firstMove![2]);
    const longestMazeEdge = Math.max(width, height) * (960 / Math.max(width, height));
    const expectedPadding = Math.max(32, (960 / Math.max(width, height)) * 0.65);

    expect(leftPadding).toBeCloseTo(expectedPadding, 6);
    expect(topPadding).toBeCloseTo(expectedPadding, 6);
    expect(viewBoxW).toBeCloseTo(width * (960 / Math.max(width, height)) + expectedPadding * 2, 6);
    expect(viewBoxH).toBeCloseTo(height * (960 / Math.max(width, height)) + expectedPadding * 2, 6);
    expect(longestMazeEdge).toBe(960);
  });
});
