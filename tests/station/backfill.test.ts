import { describe, it, expect } from 'vitest';
import { backfillState } from '../../src/main/station/backfill';
import { emptyState } from '../../src/main/station/store';
import type { StationState } from '../../src/main/station/types';
import type { InferredState } from '../../src/main/types';

function inferred(over: Partial<InferredState['userScope']> = {}, projects: InferredState['projects'] = []): InferredState {
  return {
    userScope: { mcp: over.mcp ?? [], skills: over.skills ?? [], plugins: over.plugins ?? [] },
    projects,
  };
}

describe('backfillState', () => {
  it('does not backfill items already covered by an assigned bundle', () => {
    const s = emptyState();
    s.library.bundles['bnd'] = { id: 'bnd', name: 'B', version: '1', mcp: ['m1'], skills: ['s1'], plugins: ['p1'] };
    const proj = '/proj';
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: ['bnd'] };
    const inf = inferred({}, [{
      path: proj,
      mcp: [{ id: 'm1', scope: 'project-local', def: { command: 'm' }, hasSecrets: false }],
      skills: [{ id: 's1', scope: 'project', path: '/x/s1' }],
      plugins: [{ id: 'p1', enabled: true }],
    }]);
    const r = backfillState(s, inf);
    const a = r.state.assignments[proj];
    expect(a.mcp).not.toContain('m1');
    expect(a.skills).not.toContain('s1');
    expect(a.plugins).not.toContain('p1');
  });

  it('adds a new non-bundle item and reports dirty', () => {
    const s = emptyState();
    const proj = '/proj';
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    const inf = inferred({}, [{
      path: proj,
      mcp: [{ id: 'm2', scope: 'project-local', def: { command: 'm' }, hasSecrets: false }],
      skills: [],
      plugins: [],
    }]);
    const r = backfillState(s, inf);
    expect(r.dirty).toBe(true);
    expect(r.state.assignments[proj].mcp).toContain('m2');
    expect(r.state.library.mcp['m2']).toBeUndefined(); // userScope 才补 library
  });

  it('does not backfill a disabled plugin', () => {
    const s = emptyState();
    const proj = '/proj';
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    const inf = inferred({}, [{
      path: proj, mcp: [], skills: [],
      plugins: [{ id: 'off', enabled: false }],
    }]);
    const r = backfillState(s, inf);
    expect(r.state.assignments[proj].plugins).not.toContain('off');
  });

  it('nothing new → dirty=false', () => {
    const s = emptyState();
    const r = backfillState(s, inferred());
    expect(r.dirty).toBe(false);
    expect(r.bundlesDetected).toBe(false);
  });

  it('backfills userScope items into library and marks dirty', () => {
    const s = emptyState();
    const r = backfillState(s, inferred({
      skills: [{ id: 's1', scope: 'user', path: '/u/s1' }],
      plugins: [{ id: 'p1', enabled: true }],
      mcp: [{ id: 'm1', scope: 'user', def: { command: 'm' }, hasSecrets: false }],
    }));
    expect(r.dirty).toBe(true);
    expect(r.state.library.skills['s1'].sourcePath).toBe('/u/s1');
    expect(r.state.library.plugins['p1']).toBeTruthy();
    expect(r.state.library.mcp['m1']).toBeTruthy();
  });

  it('does not run detectBundles when library.bundles is already non-empty', () => {
    const s = emptyState();
    s.library.bundles['existing'] = { id: 'existing', name: 'E', version: '1', mcp: [], skills: [], plugins: [] };
    // 若运行检测会基于 library.mcp/skills 生成新 bundle
    s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
    s.library.skills['exa-search'] = { id: 'exa-search', name: 'x', sourcePath: '/x' };
    const r = backfillState(s, inferred());
    expect(r.bundlesDetected).toBe(false);
    expect(Object.keys(r.state.library.bundles)).toEqual(['existing']);
  });

  it('runs detectBundles when library.bundles is empty', () => {
    const s = emptyState();
    s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
    s.library.skills['exa-search'] = { id: 'exa-search', name: 'x', sourcePath: '/x' };
    const r = backfillState(s, inferred());
    expect(r.bundlesDetected).toBe(true);
    expect(r.state.library.bundles['exa']).toBeTruthy();
  });

  it('skips a project present on disk but absent from state.assignments', () => {
    const s = emptyState();
    const inf = inferred({}, [{
      path: '/unmounted',
      mcp: [{ id: 'm1', scope: 'project-local', def: { command: 'm' }, hasSecrets: false }],
      skills: [], plugins: [],
    }]);
    const r = backfillState(s, inf);
    expect(r.dirty).toBe(false);
    expect(r.state.assignments['/unmounted']).toBeUndefined();
  });
});
