import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectDrift, buildCurrentDiskSnapshot, checkAllDrift } from '../../src/main/station/drift';
import { emptyState } from '../../src/main/station/store';
import { resolvePaths } from '../../src/main/scanner/paths';
import type { AppliedSnapshot } from '../../src/main/station/types';

describe('detectDrift', () => {
  const snap = (mcp: string[]): AppliedSnapshot => ({ mcpJson: {}, localScope: {}, skills: mcp, plugins: [], snippets: [], bundles: [] });

  it('same snapshot → no drift', () => {
    expect(detectDrift(snap(['a']), snap(['a']))).toBe(false);
  });
  it('different skills → drift', () => {
    expect(detectDrift(snap(['a']), snap(['b']))).toBe(true);
  });
  it('undefined snapshot → no drift', () => {
    expect(detectDrift(undefined, snap(['a']))).toBe(false);
  });
  // key-order canonicalisation
  it('canonicalises object key order to avoid false-positive', () => {
    // stableStringify sorts keys so {b:2,a:1} ≡ {a:1,b:2}
    const a: AppliedSnapshot = { mcpJson: {}, localScope: {}, skills: ['x'], plugins: [], snippets: [], bundles: [] };
    // construct a snapshot with deliberately reversed key order in localScope
    const b: AppliedSnapshot = {
      mcpJson: {}, localScope: { z: { command: 'z' }, a: { command: 'a' } },
      skills: ['x'], plugins: [], snippets: [], bundles: [],
    };
    const c: AppliedSnapshot = {
      mcpJson: {}, localScope: { a: { command: 'a' }, z: { command: 'z' } },
      skills: ['x'], plugins: [], snippets: [], bundles: [],
    };
    expect(detectDrift(b, c)).toBe(false);
  });
});

describe('buildCurrentDiskSnapshot', () => {
  it('reads localScope and skills from disk', () => {
    const home = mkdtempSync(join(tmpdir(), 'drift-'));
    const proj = join(home, 'p'); mkdirSync(proj, { recursive: true });
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({
      projects: { [proj]: { mcpServers: { exa: { command: 'exa' } } } },
    }));
    const skDir = join(proj, '.claude', 'skills');
    mkdirSync(skDir, { recursive: true });
    mkdirSync(join(skDir, 's1'));
    const disk = buildCurrentDiskSnapshot(proj, home);
    expect(Object.keys(disk.localScope)).toEqual(['exa']);
    expect(disk.skills).toContain('s1');
    rmSync(home, { recursive: true, force: true });
  });
});

describe('checkAllDrift', () => {
  it('returns empty for aligned project', () => {
    const home = mkdtempSync(join(tmpdir(), 'drift2-'));
    const proj = join(home, 'p'); mkdirSync(proj, { recursive: true });
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({
      projects: { [proj]: { mcpServers: { exa: { command: 'exa' } } } },
    }));
    const s = emptyState();
    s.assignments[proj] = { mcp: ['exa'], skills: [], plugins: [], snippets: [], bundles: [] };
    s.lastApplied[proj] = { mcpJson: {}, localScope: { exa: { command: 'exa' } }, skills: [], plugins: [], snippets: [], bundles: [] };
    expect(checkAllDrift(s, home).drifted).toEqual([]);
    rmSync(home, { recursive: true, force: true });
  });
});
