import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeApply } from '../../src/main/station/apply';
import { emptyState, saveState, loadState } from '../../src/main/station/store';
import { projectMcpJson, resolvePaths } from '../../src/main/scanner/paths';

describe('executeApply', () => {
  it('writes all MCP to local scope, no .mcp.json, preserves other ~/.claude.json fields, records snapshot', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-ap-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({
      mcpServers: { globalA: { command: 'g' } },
      projects: { [proj]: { lastCost: 7 } },
    }));
    const s = emptyState();
    s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
    s.library.mcp['firecrawl'] = { id: 'firecrawl', def: { command: 'npx', env: { K: 'v' } }, hasSecrets: true };
    s.assignments[proj] = { mcp: ['exa', 'firecrawl'], skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260608-010101', home);

    // 全部走 local scope,不写 .mcp.json
    expect(existsSync(projectMcpJson(proj))).toBe(false);
    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(cj.mcpServers).toEqual({ globalA: { command: 'g' } });
    expect(cj.projects[proj].lastCost).toBe(7);
    expect(cj.projects[proj].mcpServers).toEqual({ exa: { command: 'exa' }, firecrawl: { command: 'npx', env: { K: 'v' } } });
    const saved = loadState(home);
    expect(saved.lastApplied[proj].mcpJson).toEqual({});
    expect(saved.lastApplied[proj].localScope).toEqual({ exa: { command: 'exa' }, firecrawl: { command: 'npx', env: { K: 'v' } } });
    expect(existsSync(join(home, '.claude-orbit', 'backups', '20260608-010101'))).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });

  it('no changes → no write, returns state unchanged', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-ap2-'));
    const s = emptyState();
    const result = executeApply(s, ['/nonexistent'], '20260608-020202', home);
    expect(result).toEqual(s);
    rmSync(home, { recursive: true, force: true });
  });

  it('secret-only project with non-existent dir does not crash and writes no .mcp.json', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-ap3-'));
    const proj = join(home, 'noexist'); // dir intentionally NOT created
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ mcpServers: { globalA: { command: 'g' } } }));
    const s = emptyState();
    s.library.mcp['firecrawl'] = { id: 'firecrawl', def: { command: 'npx', env: { K: 'v' } }, hasSecrets: true };
    s.assignments[proj] = { mcp: ['firecrawl'], skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    expect(() => executeApply(s, [proj], '20260608-030303', home)).not.toThrow();
    // no .mcp.json written for a secret-only project
    expect(existsSync(projectMcpJson(proj))).toBe(false);
    // localscope still applied, globals preserved
    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(cj.mcpServers).toEqual({ globalA: { command: 'g' } });
    expect(cj.projects[proj].mcpServers).toEqual({ firecrawl: { command: 'npx', env: { K: 'v' } } });
    rmSync(home, { recursive: true, force: true });
  });

  it('applies multiple projects, preserving each others entries', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-ap4-'));
    const a = join(home, 'a'); const b = join(home, 'b');
    mkdirSync(a, { recursive: true }); mkdirSync(b, { recursive: true });
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ mcpServers: { g: { command: 'g' } } }));
    const s = emptyState();
    s.library.mcp['fc'] = { id: 'fc', def: { command: 'npx', env: { K: 'v' } }, hasSecrets: true };
    s.assignments[a] = { mcp: ['fc'], skills: [], plugins: [], snippets: [], bundles: [] };
    s.assignments[b] = { mcp: ['fc'], skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [a, b], '20260608-040404', home);
    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(cj.projects[a].mcpServers).toEqual({ fc: { command: 'npx', env: { K: 'v' } } });
    expect(cj.projects[b].mcpServers).toEqual({ fc: { command: 'npx', env: { K: 'v' } } });
    expect(cj.mcpServers).toEqual({ g: { command: 'g' } }); // globals intact
    rmSync(home, { recursive: true, force: true });
  });

  it('migrates a legacy .mcp.json to local scope and deletes the leaky file', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-ap5-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    // 模拟旧版本写下的 .mcp.json(泄漏源)
    writeFileSync(projectMcpJson(proj), JSON.stringify({ mcpServers: { exa: { command: 'exa' } } }, null, 2));
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    const s = emptyState();
    s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
    s.assignments[proj] = { mcp: ['exa'], skills: [], plugins: [], snippets: [], bundles: [] };
    // lastApplied 反映旧状态:exa 曾写在 .mcp.json
    s.lastApplied[proj] = { mcpJson: { exa: { command: 'exa' } }, localScope: {}, skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260608-050505', home);

    // .mcp.json 被删除,exa 迁移到 local scope
    expect(existsSync(projectMcpJson(proj))).toBe(false);
    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(cj.projects[proj].mcpServers).toEqual({ exa: { command: 'exa' } });
    rmSync(home, { recursive: true, force: true });
  });

  it('preserves non-station keys when cleaning up .mcp.json', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-ap6-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    // 用户在 .mcp.json 里还有别的字段——清理 mcpServers 时必须保留
    writeFileSync(projectMcpJson(proj), JSON.stringify({ mcpServers: { exa: { command: 'exa' } }, custom: 1 }, null, 2));
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    const s = emptyState();
    s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
    s.assignments[proj] = { mcp: ['exa'], skills: [], plugins: [], snippets: [], bundles: [] };
    s.lastApplied[proj] = { mcpJson: { exa: { command: 'exa' } }, localScope: {}, skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260608-060606', home);

    const remaining = JSON.parse(readFileSync(projectMcpJson(proj), 'utf8'));
    expect(remaining).toEqual({ custom: 1 }); // mcpServers 移除,custom 保留
    rmSync(home, { recursive: true, force: true });
  });
});
