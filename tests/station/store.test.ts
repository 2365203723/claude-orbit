import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadState, saveState, emptyState } from '../../src/main/station/store';
import { orbitPaths } from '../../src/main/station/paths';

describe('station store', () => {
  it('returns emptyState when no file', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-st-'));
    expect(loadState(home)).toEqual(emptyState());
    rmSync(home, { recursive: true, force: true });
  });

  it('round-trips save then load', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-st-'));
    const s = emptyState();
    s.library.mcp['firecrawl'] = { id: 'firecrawl', def: { command: 'npx' }, hasSecrets: true };
    s.assignments['/p'] = { mcp: ['firecrawl'], skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);
    expect(loadState(home)).toEqual(s);
    rmSync(home, { recursive: true, force: true });
  });

  it('returns emptyState on malformed file', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-st-'));
    saveState(emptyState(), home); // ensures dir exists
    writeFileSync(orbitPaths(home).stateFile, '{ bad');
    expect(loadState(home)).toEqual(emptyState());
    rmSync(home, { recursive: true, force: true });
  });
});
