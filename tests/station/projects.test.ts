import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, symlinkSync, lstatSync, readlinkSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unmountProject, relinkProjectSkill, addProject } from '../../src/main/station/projects';
import type { InferredState } from '../../src/main/types';
import { emptyState, saveState } from '../../src/main/station/store';
import { resolvePaths } from '../../src/main/scanner/paths';

describe('unmountProject', () => {
  it('removes only Orbit-managed MCP servers, preserving history/allowedTools and foreign servers', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-um-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({
      oauthAccount: { id: 'me' },
      projects: {
        [proj]: {
          history: [{ display: 'hi' }],
          allowedTools: ['Bash'],
          hasTrustDialogAccepted: true,
          mcpServers: { orbitMcp: { command: 'o' }, userMcp: { command: 'u' } },
        },
      },
    }));
    const s = emptyState();
    s.library.mcp['orbitMcp'] = { id: 'orbitMcp', def: { command: 'o' }, hasSecrets: false };
    s.assignments[proj] = { mcp: ['orbitMcp'], skills: [], plugins: [], snippets: [], bundles: [] };
    s.lastApplied[proj] = { mcpJson: {}, localScope: { orbitMcp: { command: 'o' } }, skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    const next = unmountProject(s, proj, home);

    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    const entry = cj.projects[proj];
    expect(entry).toBeTruthy();
    expect(entry.history).toEqual([{ display: 'hi' }]);
    expect(entry.allowedTools).toEqual(['Bash']);
    expect(entry.hasTrustDialogAccepted).toBe(true);
    expect(entry.mcpServers.userMcp).toEqual({ command: 'u' });
    expect(entry.mcpServers.orbitMcp).toBeUndefined();
    expect(cj.oauthAccount).toEqual({ id: 'me' });
    expect(next.assignments[proj]).toBeUndefined();
    expect(next.lastApplied[proj]).toBeUndefined();
    // 写入前有备份
    expect(existsSync(join(home, '.claude-orbit', 'backups'))).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });

  it('removes Orbit skill symlinks and managed plugins, keeps user content', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-um2-'));
    const proj = join(home, 'proj');
    const skillSrc = join(home, 'lib-skill'); mkdirSync(skillSrc, { recursive: true });
    const skillsDir = join(proj, '.claude', 'skills'); mkdirSync(skillsDir, { recursive: true });
    symlinkSync(skillSrc, join(skillsDir, 'sk1'), 'dir');
    writeFileSync(join(proj, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { orbitP: true, userP: true }, permissions: { allow: ['Bash'] } }));
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    const s = emptyState();
    s.library.skills['sk1'] = { id: 'sk1', name: 'sk1', sourcePath: skillSrc };
    s.library.plugins['orbitP'] = { id: 'orbitP' };
    s.assignments[proj] = { mcp: [], skills: ['sk1'], plugins: ['orbitP'], snippets: [], bundles: [] };
    s.lastApplied[proj] = { mcpJson: {}, localScope: {}, skills: ['sk1'], plugins: ['orbitP'], snippets: [], bundles: [] };
    saveState(s, home);

    unmountProject(s, proj, home);

    expect(existsSync(join(skillsDir, 'sk1'))).toBe(false);
    const settings = JSON.parse(readFileSync(join(proj, '.claude', 'settings.json'), 'utf8'));
    expect(settings.enabledPlugins.orbitP).toBeUndefined();
    expect(settings.enabledPlugins.userP).toBe(true);
    expect(settings.permissions).toEqual({ allow: ['Bash'] });
    rmSync(home, { recursive: true, force: true });
  });

  it('is a no-op for unknown projects', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-um3-'));
    const s = emptyState();
    expect(unmountProject(s, '/nope', home)).toBe(s);
    rmSync(home, { recursive: true, force: true });
  });
});

describe('relinkProjectSkill', () => {
  it('rebuilds project symlinks to the new source and reports no failures', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-rl-'));
    const proj = join(home, 'proj');
    const oldSrc = join(home, 'old-src'); mkdirSync(oldSrc, { recursive: true });
    const newSrc = join(home, 'new-src'); mkdirSync(newSrc, { recursive: true });
    const skillsDir = join(proj, '.claude', 'skills'); mkdirSync(skillsDir, { recursive: true });
    symlinkSync(oldSrc, join(skillsDir, 'sk1'), 'dir');
    const s = emptyState();
    s.lastApplied[proj] = { mcpJson: {}, localScope: {}, skills: ['sk1'], plugins: [], snippets: [], bundles: [] };

    const failures = relinkProjectSkill(s, 'sk1', newSrc);
    expect(failures).toEqual([]);
    expect(readlinkSync(join(skillsDir, 'sk1'))).toBe(newSrc);
    rmSync(home, { recursive: true, force: true });
  });

  it('does not touch projects lacking the skill in lastApplied', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-rl3-'));
    const projB = join(home, 'projB');
    const oldSrc = join(home, 'old-src'); mkdirSync(oldSrc, { recursive: true });
    const newSrc = join(home, 'new-src'); mkdirSync(newSrc, { recursive: true });
    const skillsDir = join(projB, '.claude', 'skills'); mkdirSync(skillsDir, { recursive: true });
    symlinkSync(oldSrc, join(skillsDir, 'sk1'), 'dir');
    const s = emptyState();
    // B 的快照里没有 sk1 —— 即便磁盘上有同名 symlink 也不应被改动
    s.lastApplied[projB] = { mcpJson: {}, localScope: {}, skills: [], plugins: [], snippets: [], bundles: [] };

    const failures = relinkProjectSkill(s, 'sk1', newSrc);
    expect(failures).toEqual([]);
    expect(readlinkSync(join(skillsDir, 'sk1'))).toBe(oldSrc);
    rmSync(home, { recursive: true, force: true });
  });

  it('does not throw when .claude/skills parent is missing', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-rl4-'));
    const proj = join(home, 'proj'); // 没有任何 .claude 目录
    const s = emptyState();
    s.lastApplied[proj] = { mcpJson: {}, localScope: {}, skills: ['sk1'], plugins: [], snippets: [], bundles: [] };
    expect(() => relinkProjectSkill(s, 'sk1', join(home, 'new'))).not.toThrow();
    rmSync(home, { recursive: true, force: true });
  });

  it('leaves real directories untouched and skips missing links', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-rl2-'));
    const proj = join(home, 'proj');
    const skillsDir = join(proj, '.claude', 'skills');
    mkdirSync(join(skillsDir, 'sk1'), { recursive: true }); // 真实目录
    const s = emptyState();
    s.lastApplied[proj] = { mcpJson: {}, localScope: {}, skills: ['sk1'], plugins: [], snippets: [], bundles: [] };
    s.lastApplied['/missing'] = { mcpJson: {}, localScope: {}, skills: ['sk1'], plugins: [], snippets: [], bundles: [] };

    const failures = relinkProjectSkill(s, 'sk1', join(home, 'new'));
    expect(failures).toEqual([]);
    expect(lstatSync(join(skillsDir, 'sk1')).isDirectory()).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });
});

function inferredWith(projectPath: string, opts: { mcp?: string[]; skills?: string[]; plugins?: { id: string; enabled: boolean }[] } = {}): InferredState {
  return {
    userScope: { mcp: [], skills: [], plugins: [] },
    projects: [{
      path: projectPath,
      mcp: (opts.mcp ?? []).map(id => ({ id, scope: 'project-local' as const, def: { command: id }, hasSecrets: false })),
      skills: (opts.skills ?? []).map(id => ({ id, scope: 'project' as const, path: `/src/${id}` })),
      plugins: opts.plugins ?? [],
    }],
  };
}

describe('addProject', () => {
  it('registers projectPath under cj.projects, preserving other top-level keys and project entries', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-add-'));
    const proj = join(home, 'proj');
    const other = join(home, 'other');
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({
      oauthAccount: { id: 'me' },
      projects: { [other]: { history: [1] } },
    }));
    const next = addProject(emptyState(), proj, inferredWith(proj), home);
    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(cj.oauthAccount).toEqual({ id: 'me' });
    expect(cj.projects[other]).toEqual({ history: [1] });
    expect(cj.projects[proj]).toEqual({});
    expect(next.assignments[proj]).toBeTruthy();
    rmSync(home, { recursive: true, force: true });
  });

  it('does not clobber an existing cj.projects entry with settings', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-add2-'));
    const proj = join(home, 'proj');
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({
      projects: { [proj]: { history: [{ display: 'hi' }], hasTrustDialogAccepted: true } },
    }));
    addProject(emptyState(), proj, inferredWith(proj), home);
    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(cj.projects[proj]).toEqual({ history: [{ display: 'hi' }], hasTrustDialogAccepted: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('seeds assignment from inferred state, excluding disabled plugins', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-add3-'));
    const proj = join(home, 'proj');
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: {} }));
    const next = addProject(emptyState(), proj, inferredWith(proj, {
      mcp: ['m1'], skills: ['s1'], plugins: [{ id: 'on', enabled: true }, { id: 'off', enabled: false }],
    }), home);
    expect(next.assignments[proj]).toEqual({ mcp: ['m1'], skills: ['s1'], plugins: ['on'], snippets: [], bundles: [] });
    rmSync(home, { recursive: true, force: true });
  });

  it('throws and leaves ~/.claude.json untouched when it is corrupt JSON', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-add4-'));
    const proj = join(home, 'proj');
    writeFileSync(resolvePaths(home).claudeJson, '{oops');
    expect(() => addProject(emptyState(), proj, inferredWith(proj), home)).toThrow();
    expect(readFileSync(resolvePaths(home).claudeJson, 'utf8')).toBe('{oops');
    rmSync(home, { recursive: true, force: true });
  });
});

describe('unmountProject ~/.claude.json registration', () => {
  it('removes only the target project entry and assignment, preserving siblings', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-um4-'));
    const a = join(home, 'a'); const b = join(home, 'b');
    mkdirSync(a, { recursive: true }); mkdirSync(b, { recursive: true });
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({
      projects: { [a]: { history: [1] }, [b]: { history: [2] } },
    }));
    const s = emptyState();
    s.assignments[a] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    s.assignments[b] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);
    const next = unmountProject(s, a, home);
    expect(next.assignments[a]).toBeUndefined();
    expect(next.assignments[b]).toBeTruthy();
    // sibling 项目条目保留
    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(cj.projects[b]).toEqual({ history: [2] });
    rmSync(home, { recursive: true, force: true });
  });

  it('is a no-op returning the same state when projectPath has no assignment', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-um5-'));
    const s = emptyState();
    expect(unmountProject(s, join(home, 'x'), home)).toBe(s);
    rmSync(home, { recursive: true, force: true });
  });

  it('throws on corrupt ~/.claude.json when the project dir is gone', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-um6-'));
    const proj = join(home, 'gone'); // 目录不存在 → 走 readJsonStrict 分支
    writeFileSync(resolvePaths(home).claudeJson, '{oops');
    const s = emptyState();
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    s.lastApplied[proj] = { mcpJson: {}, localScope: { m: { command: 'm' } }, skills: [], plugins: [], snippets: [], bundles: [] };
    expect(() => unmountProject(s, proj, home)).toThrow();
    expect(readFileSync(resolvePaths(home).claudeJson, 'utf8')).toBe('{oops');
    rmSync(home, { recursive: true, force: true });
  });
});
