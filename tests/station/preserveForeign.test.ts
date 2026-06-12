import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, symlinkSync, readlinkSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeApply } from '../../src/main/station/apply';
import { emptyState, saveState } from '../../src/main/station/store';
import { projectMcpJson, resolvePaths, projectSettings } from '../../src/main/scanner/paths';

function setup() {
  const home = mkdtempSync(join(tmpdir(), 'cs-pres-'));
  const proj = join(home, 'proj');
  mkdirSync(proj, { recursive: true });
  return { home, proj };
}

describe('executeApply preserves foreign config', () => {
  it('keeps a manually-added local-scope server when assignments change', () => {
    const { home, proj } = setup();
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({
      projects: { [proj]: { mcpServers: { manual: { command: 'mine' } } } },
    }));
    const s = emptyState();
    s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
    s.assignments[proj] = { mcp: ['exa'], skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260612-010101', home);

    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(cj.projects[proj].mcpServers).toEqual({
      manual: { command: 'mine' },
      exa: { command: 'exa' },
    });
    rmSync(home, { recursive: true, force: true });
  });

  it('removes only Orbit-written local-scope servers on unassign', () => {
    const { home, proj } = setup();
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({
      projects: { [proj]: { mcpServers: { manual: { command: 'mine' }, exa: { command: 'exa' } } } },
    }));
    const s = emptyState();
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    s.lastApplied[proj] = { mcpJson: {}, localScope: { exa: { command: 'exa' } }, skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260612-020202', home);

    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(cj.projects[proj].mcpServers).toEqual({ manual: { command: 'mine' } });
    rmSync(home, { recursive: true, force: true });
  });

  it('keeps a foreign server in .mcp.json when cleaning up Orbit entries', () => {
    const { home, proj } = setup();
    writeFileSync(projectMcpJson(proj), JSON.stringify({
      mcpServers: { user: { command: 'u' }, exa: { command: 'exa' } },
    }, null, 2));
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    const s = emptyState();
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    s.lastApplied[proj] = { mcpJson: { exa: { command: 'exa' } }, localScope: {}, skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260612-030303', home);

    expect(existsSync(projectMcpJson(proj))).toBe(true);
    const mj = JSON.parse(readFileSync(projectMcpJson(proj), 'utf8'));
    expect(mj.mcpServers).toEqual({ user: { command: 'u' } });
    rmSync(home, { recursive: true, force: true });
  });

  it('preserves user-enabled plugins not managed by Orbit when plugin assignments change', () => {
    const { home, proj } = setup();
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    mkdirSync(join(proj, '.claude'), { recursive: true });
    writeFileSync(projectSettings(proj), JSON.stringify({ enabledPlugins: { userPlugin: true, userOff: false } }));
    const s = emptyState();
    s.library.plugins['orbitP'] = { id: 'orbitP' };
    s.assignments[proj] = { mcp: [], skills: [], plugins: ['orbitP'], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260612-040404', home);

    const settings = JSON.parse(readFileSync(projectSettings(proj), 'utf8'));
    expect(settings.enabledPlugins).toEqual({ userPlugin: true, userOff: false, orbitP: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('keeps a pre-existing CLAUDE.md (emptied) when the last claudemd snippet is removed; deletes only Orbit-created files', () => {
    const { home, proj } = setup();
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    writeFileSync(join(proj, 'CLAUDE.md'),
      '<!-- CLAUDE_STATION:SNIPPET:s1:START -->\nold content\n<!-- CLAUDE_STATION:SNIPPET:s1:END -->\n');
    const s = emptyState();
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    // 快照未标记 claudeMdCreatedByOrbit——视为用户文件,清块后保留空文件
    s.lastApplied[proj] = { mcpJson: {}, localScope: {}, skills: [], plugins: [], snippets: ['s1'], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260612-050505', home);

    expect(existsSync(join(proj, 'CLAUDE.md'))).toBe(true);
    expect(readFileSync(join(proj, 'CLAUDE.md'), 'utf8')).toBe('');

    // Orbit 创建的文件(快照标记为 true)清空后才删除
    const s2 = emptyState();
    s2.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    s2.lastApplied[proj] = { mcpJson: {}, localScope: {}, skills: [], plugins: [], snippets: ['s1'], bundles: [], claudeMdCreatedByOrbit: true };
    writeFileSync(join(proj, 'CLAUDE.md'),
      '<!-- CLAUDE_STATION:SNIPPET:s1:START -->\nold content\n<!-- CLAUDE_STATION:SNIPPET:s1:END -->\n');
    saveState(s2, home);
    executeApply(s2, [proj], '20260612-050506', home);
    expect(existsSync(join(proj, 'CLAUDE.md'))).toBe(false);
    rmSync(home, { recursive: true, force: true });
  });

  it('keeps user content in CLAUDE.md while stripping marker blocks', () => {
    const { home, proj } = setup();
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    writeFileSync(join(proj, 'CLAUDE.md'),
      '# My Notes\n\n<!-- CLAUDE_STATION:SNIPPET:s1:START -->\nold\n<!-- CLAUDE_STATION:SNIPPET:s1:END -->\n');
    const s = emptyState();
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    s.lastApplied[proj] = { mcpJson: {}, localScope: {}, skills: [], plugins: [], snippets: ['s1'], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260612-060606', home);

    const md = readFileSync(join(proj, 'CLAUDE.md'), 'utf8');
    expect(md).toContain('# My Notes');
    expect(md).not.toContain('CLAUDE_STATION');
    rmSync(home, { recursive: true, force: true });
  });

  it('re-points an existing skill symlink that targets a stale source', () => {
    const { home, proj } = setup();
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    const oldSrc = join(home, 'old-src'); mkdirSync(oldSrc);
    const newSrc = join(home, 'new-src'); mkdirSync(newSrc);
    const skillsDir = join(proj, '.claude', 'skills');
    mkdirSync(skillsDir, { recursive: true });
    symlinkSync(oldSrc, join(skillsDir, 'sk'), 'dir');
    const s = emptyState();
    s.library.skills['sk'] = { id: 'sk', name: 'sk', sourcePath: newSrc };
    s.assignments[proj] = { mcp: [], skills: ['sk'], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260612-070707', home);

    expect(readlinkSync(join(skillsDir, 'sk'))).toBe(newSrc);
    rmSync(home, { recursive: true, force: true });
  });

  it('leaves a real directory with a skill name untouched', () => {
    const { home, proj } = setup();
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    const src = join(home, 'src-dir'); mkdirSync(src);
    const skillsDir = join(proj, '.claude', 'skills');
    mkdirSync(join(skillsDir, 'sk'), { recursive: true });
    writeFileSync(join(skillsDir, 'sk', 'SKILL.md'), 'user-owned');
    const s = emptyState();
    s.library.skills['sk'] = { id: 'sk', name: 'sk', sourcePath: src };
    s.assignments[proj] = { mcp: [], skills: ['sk'], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260612-080808', home);

    expect(lstatSync(join(skillsDir, 'sk')).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(skillsDir, 'sk', 'SKILL.md'), 'utf8')).toBe('user-owned');
    rmSync(home, { recursive: true, force: true });
  });
});
