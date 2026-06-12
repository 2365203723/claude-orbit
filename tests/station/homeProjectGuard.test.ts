import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, symlinkSync, lstatSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { executeApply } from '../../src/main/station/apply';
import { emptyState, saveState } from '../../src/main/station/store';
import { resolvePaths } from '../../src/main/scanner/paths';

describe('executeApply skill source-dir guard', () => {
  it('does not touch the global skills source when project path is home', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-home-'));
    // 模拟 home 既是 home 又是被管理的"项目"
    const src = join(home, '.claude', 'skills', 'myskill');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'SKILL.md'), '# x');
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ projects: { [home]: {} } }));
    const s = emptyState();
    s.library.skills['myskill'] = { id: 'myskill', name: 'myskill', sourcePath: src };
    s.assignments[home] = { mcp: [], skills: ['myskill'], plugins: [], snippets: [], bundles: [] };
    saveState(s, home);
    expect(() => executeApply(s, [home], '20260612-000000', home)).not.toThrow();
    // 源目录及其 SKILL.md 必须原封不动(没被当死链删除)
    expect(existsSync(join(src, 'SKILL.md'))).toBe(true);
    expect(lstatSync(src).isDirectory()).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });
});
