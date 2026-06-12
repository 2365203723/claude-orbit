import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
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

  it('preserves malformed file as .corrupt-* and returns emptyState', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-st-'));
    saveState(emptyState(), home); // ensures dir exists
    const { stateFile } = orbitPaths(home);
    writeFileSync(stateFile, '{ bad');
    expect(loadState(home)).toEqual(emptyState());
    // 损坏文件被改名保留,原始字节不丢
    expect(existsSync(stateFile)).toBe(false);
    const corrupt = readdirSync(join(home, '.claude-orbit')).find(n => n.startsWith('state.json.corrupt-'));
    expect(corrupt).toBeTruthy();
    expect(readFileSync(join(home, '.claude-orbit', corrupt!), 'utf8')).toBe('{ bad');
    // 随后的 saveState 不会覆盖损坏前的字节
    saveState(emptyState(), home);
    expect(readFileSync(join(home, '.claude-orbit', corrupt!), 'utf8')).toBe('{ bad');
    rmSync(home, { recursive: true, force: true });
  });
});
