import { readFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { StationState } from './types';
import { orbitPaths } from './paths';
import { writeJsonAtomic } from './safeJson';

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
  let raw: any;
  try {
    raw = JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    // state.json 损坏(如写一半被杀截断)——绝不能静默归零后被下一次 saveState 覆盖:
    // lastApplied 是所有清理/diff 逻辑的事实依据。把损坏文件改名保留,供手工/备份恢复。
    try { renameSync(stateFile, `${stateFile}.corrupt-${Date.now()}`); } catch { /* 保留原文件 */ }
    console.warn(`[store] state.json 解析失败,已移至 ${stateFile}.corrupt-*,从空状态启动`);
    return emptyState();
  }
  if (!raw || typeof raw !== 'object') return emptyState();
  {
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
  }
}

export function saveState(state: StationState, home: string = homedir()): void {
  const { stateFile } = orbitPaths(home);
  writeJsonAtomic(stateFile, state);
}
