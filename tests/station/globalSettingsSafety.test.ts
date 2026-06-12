import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// globalSettings.ts 在模块加载时绑定 homedir()——必须在 import 前 mock(vi.mock 会被提升,
// 因此 fakeHome 也要用 vi.hoisted 提升初始化)
const { fakeHome } = vi.hoisted(() => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  return { fakeHome: fs.mkdtempSync(path.join(os.tmpdir(), 'cs-gs-')) };
});
vi.mock('node:os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:os')>();
  return { ...orig, homedir: () => fakeHome };
});

import { addGlobalMcp, removeGlobalMcp, addGlobalPlugin, removeGlobalPlugin, removeGlobalSkill } from '../../src/main/station/globalSettings';

const settingsFile = join(fakeHome, '.claude', 'settings.json');
const claudeJsonFile = join(fakeHome, '.claude.json');
const backupsDir = join(fakeHome, '.claude-orbit', 'backups');

function backupCount(): number {
  return existsSync(backupsDir) ? readdirSync(backupsDir).length : 0;
}

describe('globalSettings strict reads + backups', () => {
  beforeAll(() => { mkdirSync(join(fakeHome, '.claude'), { recursive: true }); });
  afterAll(() => { rmSync(fakeHome, { recursive: true, force: true }); });
  beforeEach(() => { rmSync(backupsDir, { recursive: true, force: true }); });

  it('addGlobalPlugin throws on corrupt settings.json without rewriting it', () => {
    writeFileSync(settingsFile, '{ corrupt');
    expect(() => addGlobalPlugin('p1')).toThrow();
    expect(readFileSync(settingsFile, 'utf8')).toBe('{ corrupt');
    expect(() => removeGlobalPlugin('p1')).toThrow();
    expect(readFileSync(settingsFile, 'utf8')).toBe('{ corrupt');
  });

  it('plugin writes preserve unrelated settings keys and create a backup', () => {
    writeFileSync(settingsFile, JSON.stringify({ permissions: { allow: ['Bash'] }, model: 'opus', enabledPlugins: {} }));
    expect(addGlobalPlugin('p1')).toBe(true);
    const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
    expect(settings.permissions).toEqual({ allow: ['Bash'] });
    expect(settings.model).toBe('opus');
    expect(settings.enabledPlugins.p1).toBe(true);
    expect(backupCount()).toBeGreaterThan(0);
    const before = backupCount();
    removeGlobalPlugin('p1');
    expect(backupCount()).toBeGreaterThan(before);
  });

  it('MCP writes create backups; no-op remove takes no backup', () => {
    writeFileSync(claudeJsonFile, JSON.stringify({ mcpServers: {} }));
    expect(addGlobalMcp('m1', { command: 'x' })).toBe(true);
    const after = backupCount();
    expect(after).toBeGreaterThan(0);
    removeGlobalMcp('absent'); // 不存在的条目不写也不备份
    expect(backupCount()).toBe(after);
  });

  it('removeGlobalSkill preserves differing content under a conflict-suffixed path', () => {
    const skillDir = join(fakeHome, '.claude', 'skills', 'dup');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), 'user-modified');
    const libDup = join(fakeHome, '.claude-orbit', 'library', 'skills', 'dup');
    mkdirSync(libDup, { recursive: true });
    writeFileSync(join(libDup, 'SKILL.md'), 'library-copy');

    const movedTo = removeGlobalSkill('dup');
    expect(movedTo).toBeTruthy();
    expect(movedTo).not.toBe(libDup); // 内容不同 → 冲突路径,不得覆盖/删除
    expect(movedTo!.includes('dup-conflict-')).toBe(true);
    expect(readFileSync(join(movedTo!, 'SKILL.md'), 'utf8')).toBe('user-modified');
    expect(readFileSync(join(libDup, 'SKILL.md'), 'utf8')).toBe('library-copy');
    expect(existsSync(skillDir)).toBe(false);
  });

  it('removeGlobalSkill dedupes when library copy has identical content', () => {
    const skillDir = join(fakeHome, '.claude', 'skills', 'same');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), 'identical');
    const libSame = join(fakeHome, '.claude-orbit', 'library', 'skills', 'same');
    mkdirSync(libSame, { recursive: true });
    writeFileSync(join(libSame, 'SKILL.md'), 'identical');

    const movedTo = removeGlobalSkill('same');
    expect(movedTo).toBe(libSame);
    expect(existsSync(skillDir)).toBe(false);
  });
});
