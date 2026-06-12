import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, symlinkSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

// globalSettings.ts 在模块加载时绑定 homedir()——必须在 import 前 mock
const { fakeHome } = vi.hoisted(() => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  return { fakeHome: fs.mkdtempSync(path.join(os.tmpdir(), 'cs-gset-')) };
});
vi.mock('node:os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:os')>();
  return { ...orig, homedir: () => fakeHome };
});

import {
  removeGlobalSkill, addGlobalSkill, addGlobalMcp,
  assignGlobalBundle, unassignGlobalBundle, listGlobalSkills,
} from '../../src/main/station/globalSettings';
import { emptyState } from '../../src/main/station/store';
import type { StationState } from '../../src/main/station/types';

const claudeJsonFile = join(fakeHome, '.claude.json');
const settingsFile = join(fakeHome, '.claude', 'settings.json');
const skillsDir = join(fakeHome, '.claude', 'skills');
const agentsSkillsDir = join(fakeHome, '.agents', 'skills');

describe('removeGlobalSkill relocation semantics', () => {
  beforeAll(() => { mkdirSync(join(fakeHome, '.claude'), { recursive: true }); });
  afterAll(() => { rmSync(fakeHome, { recursive: true, force: true }); });
  beforeEach(() => {
    rmSync(skillsDir, { recursive: true, force: true });
    rmSync(agentsSkillsDir, { recursive: true, force: true });
    rmSync(join(fakeHome, '.claude-orbit', 'library', 'skills'), { recursive: true, force: true });
  });

  it('symlink → unlinks and returns null, leaving the real source untouched', () => {
    const realSrc = join(fakeHome, 'real-src'); mkdirSync(realSrc, { recursive: true });
    writeFileSync(join(realSrc, 'SKILL.md'), 'src');
    mkdirSync(skillsDir, { recursive: true });
    symlinkSync(realSrc, join(skillsDir, 'lk'), 'dir');

    expect(removeGlobalSkill('lk')).toBeNull();
    expect(existsSync(join(skillsDir, 'lk'))).toBe(false);
    expect(readFileSync(join(realSrc, 'SKILL.md'), 'utf8')).toBe('src'); // 源完好
  });

  it('real dir → moves into orbit library and returns the new path', () => {
    const dir = join(skillsDir, 'rd'); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'marker'), 'data');
    const moved = removeGlobalSkill('rd');
    expect(moved).toBe(join(fakeHome, '.claude-orbit', 'library', 'skills', 'rd'));
    expect(readFileSync(join(moved!, 'marker'), 'utf8')).toBe('data');
    expect(existsSync(dir)).toBe(false);
  });

  it('handles a skill living only in ~/.agents/skills (symlink and real dir)', () => {
    // symlink variant
    const realSrc = join(fakeHome, 'agent-src'); mkdirSync(realSrc, { recursive: true });
    mkdirSync(agentsSkillsDir, { recursive: true });
    symlinkSync(realSrc, join(agentsSkillsDir, 'asym'), 'dir');
    expect(removeGlobalSkill('asym')).toBeNull();
    expect(existsSync(join(agentsSkillsDir, 'asym'))).toBe(false);

    // real-dir variant
    const adir = join(agentsSkillsDir, 'ard'); mkdirSync(adir, { recursive: true });
    writeFileSync(join(adir, 'm'), 'x');
    const moved = removeGlobalSkill('ard');
    expect(moved).toBe(join(fakeHome, '.claude-orbit', 'library', 'skills', 'ard'));
    expect(existsSync(adir)).toBe(false);
  });

  it('nonexistent id → returns null, no throw', () => {
    expect(removeGlobalSkill('does-not-exist')).toBeNull();
  });

  it('listGlobalSkills dedupes a name present in both dirs', () => {
    mkdirSync(join(skillsDir, 'shared'), { recursive: true });
    mkdirSync(join(agentsSkillsDir, 'shared'), { recursive: true });
    const ids = listGlobalSkills().map(s => s.id).filter(id => id === 'shared');
    expect(ids).toEqual(['shared']);
  });
});

describe('addGlobalSkill / addGlobalMcp guards', () => {
  beforeAll(() => { mkdirSync(join(fakeHome, '.claude'), { recursive: true }); });
  afterAll(() => { rmSync(fakeHome, { recursive: true, force: true }); });
  beforeEach(() => { rmSync(skillsDir, { recursive: true, force: true }); });

  it('addGlobalSkill no-ops when sourcePath resolves to the global skills target (no self-link)', () => {
    mkdirSync(skillsDir, { recursive: true });
    const selfTarget = join(skillsDir, 'self');
    mkdirSync(selfTarget, { recursive: true });
    // sourcePath === target → 不应建自指 symlink,返回 false(已存在)
    expect(addGlobalSkill('self', selfTarget)).toBe(false);
    // 仍是真实目录,未变成 symlink
    expect(lstatSync(selfTarget).isSymbolicLink()).toBe(false);
  });

  it('addGlobalMcp leaves an existing id untouched and returns false', () => {
    writeFileSync(claudeJsonFile, JSON.stringify({ mcpServers: { dup: { command: 'original' } } }));
    expect(addGlobalMcp('dup', { command: 'replacement' })).toBe(false);
    const cj = JSON.parse(readFileSync(claudeJsonFile, 'utf8'));
    expect(cj.mcpServers.dup).toEqual({ command: 'original' });
  });

  it('addGlobalMcp throws on corrupt ~/.claude.json without rewriting it', () => {
    writeFileSync(claudeJsonFile, '{oops');
    expect(() => addGlobalMcp('x', { command: 'x' })).toThrow();
    expect(readFileSync(claudeJsonFile, 'utf8')).toBe('{oops');
  });
});

describe('assignGlobalBundle writes all three surfaces and unassign reverses them', () => {
  beforeAll(() => { mkdirSync(join(fakeHome, '.claude'), { recursive: true }); });
  afterAll(() => { rmSync(fakeHome, { recursive: true, force: true }); });

  function makeState(): StationState {
    const s = emptyState();
    const skillSrc = join(fakeHome, 'bundle-skill-src'); mkdirSync(skillSrc, { recursive: true });
    writeFileSync(join(skillSrc, 'SKILL.md'), 'body');
    s.library.mcp['bm'] = { id: 'bm', def: { command: 'bm' }, hasSecrets: false };
    s.library.skills['bs'] = { id: 'bs', name: 'bs', sourcePath: skillSrc };
    s.library.plugins['bp'] = { id: 'bp' };
    s.library.bundles['B'] = { id: 'B', name: 'B', version: '1', mcp: ['bm'], skills: ['bs'], plugins: ['bp'] };
    return s;
  }

  it('assign writes mcpServers + symlink + enabledPlugins; unassign reverses all three', () => {
    writeFileSync(claudeJsonFile, JSON.stringify({}));
    writeFileSync(settingsFile, JSON.stringify({}));
    rmSync(skillsDir, { recursive: true, force: true });
    const s = makeState();

    assignGlobalBundle(s, 'B');

    const cj = JSON.parse(readFileSync(claudeJsonFile, 'utf8'));
    expect(cj.mcpServers.bm).toEqual({ command: 'bm' });
    expect(lstatSync(join(skillsDir, 'bs')).isSymbolicLink()).toBe(true);
    const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
    expect(settings.enabledPlugins.bp).toBe(true);

    unassignGlobalBundle(s, 'B');
    const cj2 = JSON.parse(readFileSync(claudeJsonFile, 'utf8'));
    expect(cj2.mcpServers.bm).toBeUndefined();
    expect(existsSync(join(skillsDir, 'bs'))).toBe(false); // symlink 回收
    const settings2 = JSON.parse(readFileSync(settingsFile, 'utf8'));
    expect(settings2.enabledPlugins.bp).toBeUndefined();
  });
});
