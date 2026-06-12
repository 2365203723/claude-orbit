import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// globalSettings.ts 在模块加载时绑定 homedir()——必须在 import 前 mock(vi.mock 会被提升,
// 因此 fakeHome 也要用 vi.hoisted 提升初始化)
const { fakeHome } = vi.hoisted(() => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  return { fakeHome: fs.mkdtempSync(path.join(os.tmpdir(), 'cs-gb-')) };
});
vi.mock('node:os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:os')>();
  return { ...orig, homedir: () => fakeHome };
});

import { assignGlobalBundle, unassignGlobalBundle, addGlobalMcp, addGlobalPlugin } from '../../src/main/station/globalSettings';
import { emptyState } from '../../src/main/station/store';
import type { StationState } from '../../src/main/station/types';

function makeState(): StationState {
  const s = emptyState();
  s.library.mcp['exa'] = { id: 'exa', def: { command: 'exa' }, hasSecrets: false };
  s.library.plugins['p1'] = { id: 'p1' };
  s.library.bundles['b1'] = { id: 'b1', name: 'B1', version: '1', mcp: ['exa'], skills: [], plugins: ['p1'] };
  return s;
}

describe('global bundle assign/unassign tracking', () => {
  beforeAll(() => {
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
  });
  afterAll(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('add* functions report whether they actually wrote', () => {
    writeFileSync(join(fakeHome, '.claude.json'), JSON.stringify({ mcpServers: { pre: { command: 'p' } } }));
    writeFileSync(join(fakeHome, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { already: true } }));
    expect(addGlobalMcp('pre', { command: 'x' })).toBe(false);
    expect(addGlobalMcp('fresh', { command: 'f' })).toBe(true);
    expect(addGlobalPlugin('already')).toBe(false);
    expect(addGlobalPlugin('newp')).toBe(true);
  });

  it('unassign removes only entries the bundle actually installed', () => {
    // 用户已有同名 exa(自有配置)+ 自有插件 p1 已启用
    writeFileSync(join(fakeHome, '.claude.json'), JSON.stringify({ mcpServers: { exa: { command: 'user-own' } } }));
    writeFileSync(join(fakeHome, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: {} }));
    const state = makeState();

    assignGlobalBundle(state, 'b1');
    // exa 已存在 → 不算 bundle 安装;p1 新启用 → 算
    expect(state.globalBundleApplied?.b1.mcp).toEqual([]);
    expect(state.globalBundleApplied?.b1.plugins).toEqual(['p1']);

    unassignGlobalBundle(state, 'b1');
    const cj = JSON.parse(readFileSync(join(fakeHome, '.claude.json'), 'utf8'));
    expect(cj.mcpServers.exa).toEqual({ command: 'user-own' }); // 用户配置保留
    const settings = JSON.parse(readFileSync(join(fakeHome, '.claude', 'settings.json'), 'utf8'));
    expect(settings.enabledPlugins.p1).toBeUndefined(); // bundle 安装的被回收
    expect(state.globalBundleApplied?.b1).toBeUndefined();
  });

  it('unassign returns moved skill paths when a real source dir is relocated', () => {
    writeFileSync(join(fakeHome, '.claude.json'), JSON.stringify({}));
    writeFileSync(join(fakeHome, '.claude', 'settings.json'), JSON.stringify({}));
    const skillSrc = join(fakeHome, '.claude', 'skills', 'sk');
    mkdirSync(skillSrc, { recursive: true });
    writeFileSync(join(skillSrc, 'SKILL.md'), 'content');

    const state = makeState();
    state.library.skills['sk'] = { id: 'sk', name: 'sk', sourcePath: skillSrc };
    state.library.bundles['b2'] = { id: 'b2', name: 'B2', version: '1', mcp: [], skills: ['sk'], plugins: [] };
    // 模拟该 skill 是 bundle 安装的(实际上 sourcePath 即全局目录,addGlobalSkill 返回 false,
    // 这里直接写入安装记录覆盖该场景)
    state.globalBundleApplied = { b2: { mcp: [], skills: ['sk'], plugins: [] } };

    const moved = unassignGlobalBundle(state, 'b2');
    expect(moved.sk).toBe(join(fakeHome, '.claude-orbit', 'library', 'skills', 'sk'));
    expect(existsSync(skillSrc)).toBe(false);
    expect(readFileSync(join(moved.sk, 'SKILL.md'), 'utf8')).toBe('content');
  });

  it('legacy unassign (no record) skips user-modified MCP and real skill dirs', () => {
    writeFileSync(join(fakeHome, '.claude.json'), JSON.stringify({ mcpServers: { exa: { command: 'user-changed' } } }));
    writeFileSync(join(fakeHome, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { p1: true } }));
    const state = makeState();
    // 没有 globalBundleApplied 记录 → 保守回收
    unassignGlobalBundle(state, 'b1');
    const cj = JSON.parse(readFileSync(join(fakeHome, '.claude.json'), 'utf8'));
    expect(cj.mcpServers.exa).toEqual({ command: 'user-changed' }); // 定义与 library 不同 → 保留
  });
});
