import { accessSync, constants, lstatSync, unlinkSync, symlinkSync, readlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import type { StationState } from './types';
import type { InferredState } from '../types';
import { readJsonStrict, writeJsonAtomic } from './safeJson';
import { backupFiles } from './backup';
import { executeApply } from './apply';

/** 取消挂载:只回收 Orbit 写入的配置(MCP local scope、skills symlink、plugins、snippets),
 *  绝不删除 ~/.claude.json 中整个 projects[path] 条目——里面还有 Claude Code 的
 *  会话历史、allowedTools、信任状态等用户数据。 */
export function unmountProject(state: StationState, projectPath: string, home: string = homedir()): StationState {
  if (!state.assignments[projectPath]) return state;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let next = state;
  if (pathExists(projectPath)) {
    // 复用 apply 的反向清理:assignments 清空后 executeApply 会按 lastApplied 快照
    // 精确移除 Orbit 写入的 symlink/plugins/snippets/local scope(内部已做备份)
    const cleared = {
      ...state,
      assignments: { ...state.assignments, [projectPath]: { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] } },
    };
    next = executeApply(cleared, [projectPath], stamp, home);
  } else {
    // 项目目录已不存在(如已被删除)——只清 ~/.claude.json local scope 中快照记录的条目
    const cjFile = resolve(home, '.claude.json');
    const managed = Object.keys(state.lastApplied[projectPath]?.localScope ?? {});
    const cj = readJsonStrict(cjFile) ?? {};
    const entry = cj.projects?.[projectPath];
    if (managed.length && entry?.mcpServers) {
      backupFiles([cjFile], stamp, home);
      const servers = Object.fromEntries(Object.entries(entry.mcpServers).filter(([k]) => !managed.includes(k)));
      writeJsonAtomic(cjFile, { ...cj, projects: { ...cj.projects, [projectPath]: { ...entry, mcpServers: servers } } });
    }
  }
  const nextAssign = { ...next.assignments };
  delete nextAssign[projectPath];
  const nextApplied = { ...next.lastApplied };
  delete nextApplied[projectPath];
  return { ...next, assignments: nextAssign, lastApplied: nextApplied };
}

// 挂载项目：写 ~/.claude.json + state.json
export function addProject(state: StationState, projectPath: string, inferred: InferredState, home: string = homedir()): StationState {
  const proj = inferred.projects.find(p => p.path === projectPath);
  const mcp = (proj?.mcp ?? []).map(m => m.id);
  const skills = (proj?.skills ?? []).map(s => s.id);
  const plugins = (proj?.plugins ?? []).filter(pl => pl.enabled).map(pl => pl.id);

  // 确保项目在 ~/.claude.json 中有注册
  const cjFile = resolve(home, '.claude.json');
  const cj = readJsonStrict(cjFile) ?? {};
  if (!cj.projects?.[projectPath]) {
    const projects = { ...(cj.projects ?? {}) };
    projects[projectPath] = {};
    writeJsonAtomic(cjFile, { ...cj, projects });
  }

  return {
    ...state,
    assignments: {
      ...state.assignments,
      [projectPath]: { mcp, skills, plugins, snippets: [], bundles: [] },
    },
  };
}

export function pathExists(absPath: string): boolean {
  try { accessSync(absPath, constants.R_OK); return true; } catch { return false; }
}

export interface RelinkFailure { projectPath: string; error: string; }

// 全局 skill 源目录被搬迁后,把各项目里指向旧位置的 symlink 重建到新位置。
// 返回失败列表(symlink 重建失败且回滚也失败的项目),供 UI 提示悬空链接。
export function relinkProjectSkill(state: StationState, skillId: string, newSource: string): RelinkFailure[] {
  const failures: RelinkFailure[] = [];
  for (const [projectPath, snap] of Object.entries(state.lastApplied)) {
    if (!snap.skills.includes(skillId)) continue;
    const linkPath = join(projectPath, '.claude', 'skills', skillId);
    let oldTarget: string | null = null;
    try {
      if (!lstatSync(linkPath).isSymbolicLink()) continue; // 真实目录是用户内容,不动
      oldTarget = readlinkSync(linkPath);
    } catch { continue; /* 链接不存在则跳过 */ }
    try {
      unlinkSync(linkPath);
      symlinkSync(newSource, linkPath, 'dir');
    } catch (e: any) {
      // 重建失败——尝试回滚到旧指向,避免链接直接消失
      try { if (oldTarget) symlinkSync(oldTarget, linkPath, 'dir'); } catch { /* 回滚也失败 */ }
      failures.push({ projectPath, error: e?.message ?? String(e) });
    }
  }
  return failures;
}
