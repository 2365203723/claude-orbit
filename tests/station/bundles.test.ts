import { describe, it, expect } from 'vitest';
import { detectBundles, createBundle, updateBundle, deleteBundle, assignBundle, unassignBundle, resolveBundleIds, expandProjectBundles, isInAssignedBundle } from '../../src/main/station/bundles';
import type { StationState } from '../../src/main/station/types';

function fresh(): StationState {
  return {
    version: 2,
    library: { mcp: {}, skills: {}, plugins: {}, snippets: {}, bundles: {} },
    assignments: {},
    lastApplied: {},
  };
}

describe('detectBundles', () => {
  it('bundles skills prefixed by MCP id with dash', () => {
    const s = fresh();
    s.library.mcp['firecrawl'] = { id: 'firecrawl', def: {}, hasSecrets: true };
    s.library.skills['firecrawl-scrape'] = { id: 'firecrawl-scrape', name: 'Scrape', sourcePath: '/tmp' };
    s.library.skills['firecrawl-search'] = { id: 'firecrawl-search', name: 'Search', sourcePath: '/tmp' };
    s.library.skills['codegraph'] = { id: 'codegraph', name: 'Codegraph', sourcePath: '/tmp' };

    const bundles = detectBundles(s);
    expect(bundles['firecrawl']).toBeDefined();
    expect(bundles['firecrawl'].skills).toContain('firecrawl-scrape');
    expect(bundles['firecrawl'].skills).toContain('firecrawl-search');
    expect(bundles['firecrawl'].skills).not.toContain('codegraph');
    expect(bundles['firecrawl'].autoDetected).toBe(true);
  });

  it('matches underscore and colon separators', () => {
    const s = fresh();
    s.library.mcp['my_mcp'] = { id: 'my_mcp', def: {}, hasSecrets: false };
    s.library.skills['my_mcp_helper'] = { id: 'my_mcp_helper', name: 'H', sourcePath: '/t' };
    const bundles = detectBundles(s);
    expect(bundles['my_mcp']).toBeDefined();
    expect(bundles['my_mcp'].skills).toContain('my_mcp_helper');
  });

  it('does not bundle when no skills/plugins match', () => {
    const s = fresh();
    s.library.mcp['standalone'] = { id: 'standalone', def: {}, hasSecrets: false };
    const bundles = detectBundles(s);
    expect(Object.keys(bundles)).toHaveLength(0);
  });
});

describe('CRUD', () => {
  it('createBundle', () => {
    const s = fresh();
    const next = createBundle(s, { id: 'b1', name: 'B1', version: '1.0', mcp: [], skills: [], plugins: [] });
    expect(next.library.bundles['b1']).toBeDefined();
    expect(next.library.bundles['b1'].name).toBe('B1');
  });
  it('updateBundle', () => {
    const s = createBundle(fresh(), { id: 'b1', name: 'B1', version: '1.0', mcp: [], skills: [], plugins: [] });
    const next = updateBundle(s, 'b1', { name: 'Renamed' });
    expect(next.library.bundles['b1'].name).toBe('Renamed');
  });
  it('deleteBundle', () => {
    const s = createBundle(fresh(), { id: 'b1', name: 'B1', version: '1.0', mcp: [], skills: [], plugins: [] });
    const next = deleteBundle(s, 'b1');
    expect(next.library.bundles['b1']).toBeUndefined();
  });
  it('deleteBundle cascades: removes dangling refs from project assignments', () => {
    let s = createBundle(fresh(), { id: 'b1', name: 'B1', version: '1.0', mcp: [], skills: [], plugins: [] });
    s = assignBundle(s, '/proj', 'b1');
    expect(s.assignments['/proj'].bundles).toEqual(['b1']);
    const next = deleteBundle(s, 'b1');
    expect(next.library.bundles['b1']).toBeUndefined();
    expect(next.assignments['/proj'].bundles).toEqual([]);
  });
});

describe('assignBundle / unassignBundle', () => {
  it('assigns bundle id only (components expanded at compile time)', () => {
    const s = fresh();
    s.library.mcp['firecrawl'] = { id: 'firecrawl', def: {}, hasSecrets: false };
    s.library.skills['firecrawl-scrape'] = { id: 'firecrawl-scrape', name: 'S', sourcePath: '/t' };
    s.library.plugins['firecrawl-sync'] = { id: 'firecrawl-sync' };
    s.library.bundles['firecrawl'] = {
      id: 'firecrawl', name: 'Firecrawl', version: '1.0',
      mcp: ['firecrawl'], skills: ['firecrawl-scrape'], plugins: ['firecrawl-sync'],
    };
    const next = assignBundle(s, '/project', 'firecrawl');
    const a = next.assignments['/project'];
    // Bundle 只存 bundle ID; 个体 mcp/skills/plugins 不在 assignments 里
    expect(a.bundles).toContain('firecrawl');
    expect(a.mcp).not.toContain('firecrawl');
    expect(a.skills).not.toContain('firecrawl-scrape');
    expect(a.plugins).not.toContain('firecrawl-sync');

    // 编译时展开
    const expanded = expandProjectBundles(next, '/project');
    expect(expanded.mcpIds.has('firecrawl')).toBe(true);
    expect(expanded.skillIds.has('firecrawl-scrape')).toBe(true);
    expect(expanded.pluginIds.has('firecrawl-sync')).toBe(true);
  });

  it('unassigns bundle id only', () => {
    const s = fresh();
    s.library.mcp['firecrawl'] = { id: 'firecrawl', def: {}, hasSecrets: false };
    s.library.skills['firecrawl-scrape'] = { id: 'firecrawl-scrape', name: 'S', sourcePath: '/t' };
    s.library.bundles['firecrawl'] = { id: 'firecrawl', name: 'F', version: '1.0', mcp: ['firecrawl'], skills: ['firecrawl-scrape'], plugins: [] };
    const assigned = assignBundle(s, '/p', 'firecrawl');
    const next = unassignBundle(assigned, '/p', 'firecrawl');
    expect(next.assignments['/p'].bundles).not.toContain('firecrawl');
  });

  it('idempotent: assignBundle called twice', () => {
    const s = fresh();
    s.library.bundles['b'] = { id: 'b', name: 'B', version: '1.0', mcp: [], skills: [], plugins: [] };
    const first = assignBundle(s, '/p', 'b');
    const second = assignBundle(first, '/p', 'b');
    expect(second.assignments['/p'].bundles.length).toBe(1);
  });
});

describe('isInAssignedBundle', () => {
  it('returns true for skill inside assigned bundle', () => {
    const s = fresh();
    s.library.skills['firecrawl-search'] = { id: 'firecrawl-search', name: 'Search', sourcePath: '/t' };
    s.library.bundles['firecrawl'] = { id: 'firecrawl', name: 'F', version: '1', mcp: [], skills: ['firecrawl-search'], plugins: [] };
    const assigned = assignBundle(s, '/p', 'firecrawl');
    expect(isInAssignedBundle(assigned, '/p', 'firecrawl-search', 'skill')).toBe(true);
  });

  it('returns false for item not in any bundle', () => {
    const s = fresh();
    s.library.skills['standalone'] = { id: 'standalone', name: 'S', sourcePath: '/t' };
    expect(isInAssignedBundle(s, '/p', 'standalone', 'skill')).toBe(false);
  });
});

describe('resolveBundleIds', () => {
  it('returns null for unknown bundle', () => {
    expect(resolveBundleIds(fresh(), 'nope')).toBeNull();
  });
});
