import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { StationState } from './types';
import { orbitPaths } from './paths';

export function emptyState(): StationState {
  return { version: 2, library: { mcp: {}, skills: {}, plugins: {}, snippets: {}, bundles: {} }, assignments: {}, lastApplied: {} };
}

export function loadState(home: string = homedir()): StationState {
  const { stateFile } = orbitPaths(home);
  // 从旧名称 .claude-station 迁移到 .claude-orbit
  const legacyStateDir = join(home, '.claude-station');
  const legacyStateFile = join(legacyStateDir, 'state.json');
  const legacyBackupsDir = join(legacyStateDir, 'backups');
  if (!existsSync(stateFile) && existsSync(legacyStateFile)) {
    try {
      mkdirSync(join(home, '.claude-orbit'), { recursive: true });
      renameSync(legacyStateFile, stateFile);
      if (existsSync(legacyBackupsDir)) renameSync(legacyBackupsDir, join(home, '.claude-orbit', 'backups'));
    } catch { /* 迁移失败继续,用新路径从空状态开始 */ }
  }
  if (!existsSync(stateFile)) return emptyState();
  try {
    const raw = JSON.parse(readFileSync(stateFile, 'utf8'));
    // 向后兼容:旧 state.json 可能没有 skills/plugins/snippets 字段
    raw.library ??= {};
    raw.library.skills ??= {};
    raw.library.plugins ??= {};
    raw.library.snippets ??= {};
    raw.library.bundles ??= {};
    raw.version ??= 1;
    for (const a of Object.values(raw.assignments ?? {}) as any[]) {
      a.skills ??= [];
      a.plugins ??= [];
      a.snippets ??= [];
      a.bundles ??= [];
      // 去重——历史 state.json 可能存有重复 id(同一 MCP 既在 .mcp.json 又在本地作用域)
      a.mcp = [...new Set(a.mcp ?? [])];
      a.skills = [...new Set(a.skills)];
      a.plugins = [...new Set(a.plugins)];
      a.snippets = [...new Set(a.snippets)];
      a.bundles = [...new Set(a.bundles)];
    }
    for (const s of Object.values(raw.lastApplied ?? {}) as any[]) {
      s.skills ??= [];
      s.plugins ??= [];
      s.snippets ??= [];
      s.bundles ??= [];
    }
    return raw;
  } catch { return emptyState(); }
}

export function saveState(state: StationState, home: string = homedir()): void {
  const { stateFile } = orbitPaths(home);
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}
