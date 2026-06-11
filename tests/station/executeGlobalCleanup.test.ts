import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeGlobalCleanup } from '../../src/main/station/cleanup';
import { emptyState, saveState } from '../../src/main/station/store';
import { resolvePaths } from '../../src/main/scanner/paths';

describe('executeGlobalCleanup', () => {
  it('removes only landed+requested ids, backs up, preserves other globals + projects', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-gc-'));
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({
      mcpServers: { firecrawl: { command: 'npx' }, memory: { command: 'm' }, codegraph: { command: 'c' } },
      projects: { '/a': { lastCost: 5 } },
    }));
    const s = emptyState();
    s.lastApplied['/a'] = { mcpJson: {}, localScope: { firecrawl: { command: 'npx' } }, skills: [], plugins: [], snippets: [], bundles: [] }; // only firecrawl landed
    saveState(s, home);

    const removed = executeGlobalCleanup(['firecrawl', 'memory', 'codegraph'], '20260608-090909', home);
    expect(removed).toEqual(['firecrawl']);

    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(Object.keys(cj.mcpServers).sort()).toEqual(['codegraph', 'memory']);
    expect(cj.projects['/a'].lastCost).toBe(5);
    expect(existsSync(join(home, '.claude-orbit', 'backups', '20260608-090909'))).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });

  it('no eligible ids → no write, no backup, returns []', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-gc2-'));
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ mcpServers: { memory: { command: 'm' } } }));
    saveState(emptyState(), home);
    const removed = executeGlobalCleanup(['memory'], '20260608-101010', home);
    expect(removed).toEqual([]);
    expect(JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8')).mcpServers).toEqual({ memory: { command: 'm' } });
    expect(existsSync(join(home, '.claude-orbit', 'backups', '20260608-101010'))).toBe(false);
    rmSync(home, { recursive: true, force: true });
  });
});
