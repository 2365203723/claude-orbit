import { describe, it, expect } from 'vitest';
import { computeOrbitLayout } from '../../src/renderer/canvas/orbitLayout';

describe('computeOrbitLayout', () => {
  it('returns empty array for no projects', () => {
    expect(computeOrbitLayout([])).toEqual([]);
  });

  it('returns deterministic positions for given input', () => {
    const a = computeOrbitLayout([
      { path: '/a', mcpCount: 2 },
      { path: '/b', mcpCount: 5 },
    ]);
    const b = computeOrbitLayout([
      { path: '/a', mcpCount: 2 },
      { path: '/b', mcpCount: 5 },
    ]);
    expect(a).toEqual(b);
  });

  it('positions one project at origin', () => {
    const r = computeOrbitLayout([{ path: '/a', mcpCount: 0 }]);
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeGreaterThanOrEqual(0);
    expect(r[0].y).toBeGreaterThanOrEqual(0);
  });

  it('7 projects are all non-overlapping by safe radius', () => {
    const inputs = Array.from({ length: 7 }, (_, i) => ({
      path: `/p${i}`,
      mcpCount: Math.floor(Math.random() * 6),
    }));
    const r = computeOrbitLayout(inputs);
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const dx = r[i].x - r[j].x;
        const dy = r[i].y - r[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeGreaterThanOrEqual(r[i].safeRadius + r[j].safeRadius);
      }
    }
  });

  it('planet radius is bounded between min and max regardless of mcpCount', () => {
    const tiny = computeOrbitLayout([{ path: '/a', mcpCount: 0 }]);
    const huge = computeOrbitLayout([{ path: '/a', mcpCount: 100 }]);
    expect(tiny[0].planetRadius).toBeGreaterThanOrEqual(48);
    expect(huge[0].planetRadius).toBeLessThanOrEqual(100);
    expect(huge[0].planetRadius).toBeGreaterThanOrEqual(tiny[0].planetRadius);
  });
});
