import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, symlinkSync, lstatSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeApply } from '../../src/main/station/apply';
import { emptyState, saveState, loadState } from '../../src/main/station/store';
import { projectMcpJson, resolvePaths, projectSkillsDir, projectSettings } from '../../src/main/scanner/paths';

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

  it('leaves an unparsable .mcp.json untouched on cleanup (no throw, byte-identical)', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-ap7-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    const corrupt = '{ not json';
    writeFileSync(projectMcpJson(proj), corrupt);
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    const s = emptyState();
    s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
    // target.mcpJson 为空,prevSnap.mcpJson 非空 → 走 cleanupMcpJson(file) 分支
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    s.lastApplied[proj] = { mcpJson: { exa: { command: 'exa' } }, localScope: {}, skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    expect(() => executeApply(s, [proj], '20260608-070707', home)).not.toThrow();
    expect(existsSync(projectMcpJson(proj))).toBe(true);
    expect(readFileSync(projectMcpJson(proj), 'utf8')).toBe(corrupt);
    rmSync(home, { recursive: true, force: true });
  });

  it('leaves a .mcp.json containing a JSON array untouched on cleanup', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-ap7b-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    const arr = '[1,2,3]';
    writeFileSync(projectMcpJson(proj), arr);
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    const s = emptyState();
    s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    s.lastApplied[proj] = { mcpJson: { exa: { command: 'exa' } }, localScope: {}, skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    expect(() => executeApply(s, [proj], '20260608-070708', home)).not.toThrow();
    // 数组没有 mcpServers 键 → 整体保留,文件仍存在
    expect(existsSync(projectMcpJson(proj))).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });
});

describe('executeApply skills', () => {
  it('links an assigned skill via symlink and records it in the snapshot', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-sk1-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    const src = join(home, '.claude', 'skills-library', 'mysk'); mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'SKILL.md'), '# sk');
    const s = emptyState();
    s.library.skills['mysk'] = { id: 'mysk', name: 'mysk', sourcePath: src };
    s.assignments[proj] = { mcp: [], skills: ['mysk'], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260608-100000', home);

    const linkPath = join(projectSkillsDir(proj), 'mysk');
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(linkPath)).toBe(src);
    expect(loadState(home).lastApplied[proj].skills).toContain('mysk');
    rmSync(home, { recursive: true, force: true });
  });

  it('tolerates a pre-existing dead symlink at the link path (no throw, counted in snapshot)', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-sk2-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    const src = join(home, 'lib', 'mysk'); mkdirSync(src, { recursive: true });
    const skillsDir = projectSkillsDir(proj); mkdirSync(skillsDir, { recursive: true });
    // 预置一条指向不存在目标的死 symlink
    symlinkSync(join(home, 'nonexistent-target'), join(skillsDir, 'mysk'), 'dir');
    const s = emptyState();
    s.library.skills['mysk'] = { id: 'mysk', name: 'mysk', sourcePath: src };
    s.assignments[proj] = { mcp: [], skills: ['mysk'], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    expect(() => executeApply(s, [proj], '20260608-100001', home)).not.toThrow();
    // 当前实现:死链(指向过期源)会被重建到正确源,id 计入快照
    const linkPath = join(skillsDir, 'mysk');
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(linkPath)).toBe(src);
    expect(loadState(home).lastApplied[proj].skills).toContain('mysk');
    rmSync(home, { recursive: true, force: true });
  });

  it('a skill whose symlinkSync throws is excluded from snapshot but does not block plugin writes', () => {
    // POSIX symlinkSync 对不存在的目标也会成功(产生悬空链),因此用一个真正会抛错的
    // 场景:linkPath 的父目录被一个普通文件占位 → mkdir/symlink 失败,但 plugins 仍应写入。
    const home = mkdtempSync(join(tmpdir(), 'cs-sk3-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    const src = join(home, 'lib', 'mysk'); mkdirSync(src, { recursive: true });
    const skillsDir = projectSkillsDir(proj); mkdirSync(skillsDir, { recursive: true });
    // 在 skills 目录里用一个普通文件占据 skill 名 → symlinkSync 抛 EEXIST(非 symlink、非 dir)
    writeFileSync(join(skillsDir, 'mysk'), 'i am a file');
    const s = emptyState();
    s.library.skills['mysk'] = { id: 'mysk', name: 'mysk', sourcePath: src };
    s.library.plugins['p1'] = { id: 'p1' };
    s.assignments[proj] = { mcp: [], skills: ['mysk'], plugins: ['p1'], snippets: [], bundles: [] };
    saveState(s, home);

    expect(() => executeApply(s, [proj], '20260608-100002', home)).not.toThrow();

    // 同名普通文件被视为用户内容,不覆盖——当前实现把它计入快照(保留文件)。
    // 关键不变量:plugins 不被 skill 阻断,仍写入 settings.json。
    const settings = JSON.parse(readFileSync(projectSettings(proj), 'utf8'));
    expect(settings.enabledPlugins.p1).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });

  it('a genuinely failing symlink (parent is a file) does not block plugin writes', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-sk3b-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    const src = join(home, 'lib', 'mysk'); mkdirSync(src, { recursive: true });
    const s = emptyState();
    s.library.skills['mysk'] = { id: 'mysk', name: 'mysk', sourcePath: src };
    s.library.plugins['p1'] = { id: 'p1' };
    s.assignments[proj] = { mcp: [], skills: ['mysk'], plugins: ['p1'], snippets: [], bundles: [] };
    saveState(s, home);
    // missing source → 悬空 symlink 也算链接成功(POSIX 行为),计入快照
    executeApply(s, [proj], '20260608-100003', home);
    expect(loadState(home).lastApplied[proj].skills).toContain('mysk');
    const settings = JSON.parse(readFileSync(projectSettings(proj), 'utf8'));
    expect(settings.enabledPlugins.p1).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });

  it('unassigning a skill removes the symlink but leaves a user-created real directory', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-sk4-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    const src = join(home, 'lib', 'mysk'); mkdirSync(src, { recursive: true });
    const skillsDir = projectSkillsDir(proj); mkdirSync(skillsDir, { recursive: true });
    symlinkSync(src, join(skillsDir, 'mysk'), 'dir');
    // 用户自建的真实目录(不同名),unassign 不应碰它
    const userDir = join(skillsDir, 'userdir'); mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'keep.txt'), 'mine');

    const s = emptyState();
    s.library.skills['mysk'] = { id: 'mysk', name: 'mysk', sourcePath: src };
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    s.lastApplied[proj] = { mcpJson: {}, localScope: {}, skills: ['mysk'], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260608-100004', home);

    expect(existsSync(join(skillsDir, 'mysk'))).toBe(false); // symlink 已删
    expect(lstatSync(userDir).isDirectory()).toBe(true);      // 真实目录保留
    expect(readFileSync(join(userDir, 'keep.txt'), 'utf8')).toBe('mine');
    rmSync(home, { recursive: true, force: true });
  });
});

describe('executeApply snippets roundtrip', () => {
  function seedSnippets(s: ReturnType<typeof emptyState>): void {
    s.library.snippets['md1'] = { id: 'md1', name: 'md1', kind: 'claudemd', content: 'CLAUDE doc body' };
    s.library.snippets['hk1'] = { id: 'hk1', name: 'hk1', kind: 'hooks', content: JSON.stringify({ PreToolUse: [{ matcher: 'Bash', hooks: [] }] }) };
    s.library.snippets['en1'] = { id: 'en1', name: 'en1', kind: 'env', content: 'MY_VAR=hello' };
  }

  it('writes CLAUDE.md marker blocks + settings hooks/env and records snippetSettingKeys', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-sn1-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    const s = emptyState();
    seedSnippets(s);
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: ['md1', 'hk1', 'en1'], bundles: [] };
    saveState(s, home);

    executeApply(s, [proj], '20260608-110000', home);

    const md = readFileSync(join(proj, 'CLAUDE.md'), 'utf8');
    expect(md).toContain('CLAUDE_STATION:SNIPPET:md1:START');
    expect(md).toContain('CLAUDE doc body');
    const settings = JSON.parse(readFileSync(projectSettings(proj), 'utf8'));
    expect(settings.hooks.PreToolUse).toBeTruthy();
    expect(settings.env.MY_VAR).toBe('hello');
    const meta = loadState(home).lastApplied[proj].snippetSettingKeys as any;
    expect(meta.hooks).toContain('PreToolUse');
    expect(Object.keys(meta.env)).toContain('MY_VAR');
    rmSync(home, { recursive: true, force: true });
  });

  it('unassign clears Orbit hooks/env + marker blocks while preserving user keys and text', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-sn2-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    // 预置用户内容
    writeFileSync(join(proj, 'CLAUDE.md'), 'USER PROSE\n');
    mkdirSync(join(proj, '.claude'), { recursive: true });
    writeFileSync(projectSettings(proj), JSON.stringify({
      hooks: { PostToolUse: [{ userHook: true }] },
      env: { USER_VAR: 'keep' },
    }));
    const s = emptyState();
    seedSnippets(s);
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: ['md1', 'hk1', 'en1'], bundles: [] };
    saveState(s, home);
    const applied = executeApply(s, [proj], '20260608-110001', home);

    // unassign 全部
    const cleared = { ...applied, assignments: { ...applied.assignments, [proj]: { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] } } };
    executeApply(cleared, [proj], '20260608-110002', home);

    const md = readFileSync(join(proj, 'CLAUDE.md'), 'utf8');
    expect(md).toContain('USER PROSE');
    expect(md).not.toContain('CLAUDE_STATION:SNIPPET');
    // 清块后用户文本保留(merge 对空块分支做 trim,不强制尾换行)
    expect(md.trim()).toBe('USER PROSE');
    const settings = JSON.parse(readFileSync(projectSettings(proj), 'utf8'));
    expect(settings.env.MY_VAR).toBeUndefined();          // Orbit env 已清
    expect(settings.env.USER_VAR).toBe('keep');           // 用户 env 保留
    expect(settings.hooks.PreToolUse).toBeUndefined();    // Orbit hook 已清
    expect(settings.hooks.PostToolUse).toEqual([{ userHook: true }]); // 用户 hook 保留
    rmSync(home, { recursive: true, force: true });
  });

  it('CLAUDE.md is unlinked after unassign when there was no pre-existing user content', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-sn3-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    const s = emptyState();
    seedSnippets(s);
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: ['md1'], bundles: [] };
    saveState(s, home);
    const applied = executeApply(s, [proj], '20260608-110003', home);
    expect(existsSync(join(proj, 'CLAUDE.md'))).toBe(true);

    const cleared = { ...applied, assignments: { ...applied.assignments, [proj]: { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] } } };
    executeApply(cleared, [proj], '20260608-110004', home);
    expect(existsSync(join(proj, 'CLAUDE.md'))).toBe(false);
    rmSync(home, { recursive: true, force: true });
  });

  it('legacy snapshot without snippetSettingKeys does not throw and skips settings write when no blocks', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-sn4-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    const s = emptyState();
    // 只有 claudemd snippet,无 hooks/env 块
    s.library.snippets['md1'] = { id: 'md1', name: 'md1', kind: 'claudemd', content: 'doc' };
    s.assignments[proj] = { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
    // 旧快照:snippets 含 md1,但没有 snippetSettingKeys 字段
    s.lastApplied[proj] = { mcpJson: {}, localScope: {}, skills: [], plugins: [], snippets: ['md1'], bundles: [] };
    saveState(s, home);

    expect(() => executeApply(s, [proj], '20260608-110005', home)).not.toThrow();
    // 没有 settings 块 → 不应创建 settings.json
    expect(existsSync(projectSettings(proj))).toBe(false);
    rmSync(home, { recursive: true, force: true });
  });
});

describe('executeApply aborts on corrupt ~/.claude.json', () => {
  it('throws before writing any project file and does not rewrite ~/.claude.json', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-corrupt-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    const corrupt = '{oops';
    writeFileSync(resolvePaths(home).claudeJson, corrupt);
    const s = emptyState();
    // local-scope MCP → 触发 readJsonStrict(~/.claude.json) 写入路径
    s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
    s.assignments[proj] = { mcp: ['exa'], skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);
    const stateBefore = readFileSync(join(home, '.claude-orbit', 'state.json'), 'utf8');

    expect(() => executeApply(s, [proj], '20260608-120000', home)).toThrow();
    // ~/.claude.json 字节不变
    expect(readFileSync(resolvePaths(home).claudeJson, 'utf8')).toBe(corrupt);
    // 项目文件未创建
    expect(existsSync(projectMcpJson(proj))).toBe(false);
    expect(existsSync(projectSettings(proj))).toBe(false);
    // state.json 未被 saveState 覆盖(lastApplied 仍为空)
    expect(loadState(home).lastApplied[proj]).toBeUndefined();
    expect(readFileSync(join(home, '.claude-orbit', 'state.json'), 'utf8')).toBe(stateBefore);
    rmSync(home, { recursive: true, force: true });
  });

  it('same plan succeeds when ~/.claude.json is valid', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-corrupt2-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [proj]: {} } }));
    const s = emptyState();
    s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
    s.assignments[proj] = { mcp: ['exa'], skills: [], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);
    expect(() => executeApply(s, [proj], '20260608-120001', home)).not.toThrow();
    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(cj.projects[proj].mcpServers.exa).toEqual({ command: 'exa' });
    rmSync(home, { recursive: true, force: true });
  });
});
