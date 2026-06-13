import { homedir } from 'node:os';
import type { InferredState } from '../types';
import type { StationState } from './types';
import { detectBundles } from './bundles';
import { expandProjectBundles } from './bundles';
import { syncSkillIntoOrbitLibrary } from './skillLibrarySync';

export interface BackfillResult {
  state: StationState;
  dirty: boolean;
  bundlesDetected: boolean;
}

/** 纯逻辑回填:把磁盘上新出现的 skills/plugins/MCP 收录进 library,
 *  并补项目 assignments(跳过已被该项目 bundle 覆盖的条目,避免 unassign bundle 后残留)。
 *  library.bundles 为空时才自动检测 bundle。
 *  会就地修改传入的 state(与原 ipc 内联逻辑一致),并返回 dirty/bundlesDetected。 */
export function backfillState(state: StationState, inferred: InferredState, home: string = homedir()): BackfillResult {
  let dirty = false;

  // 补 library。发现全局/外部安装的 skill 时,统一复制进 Orbit 库并指向副本。
  // 即使同名已存在,也会刷新旧副本,避免 global 新装后 UI 看不到/仍指旧源。
  for (const s of inferred.userScope.skills) {
    if (syncSkillIntoOrbitLibrary(state, s.id, s.path, home)) dirty = true;
  }
  for (const pl of inferred.userScope.plugins) {
    if (!state.library.plugins[pl.id]) {
      state.library.plugins[pl.id] = { id: pl.id };
      dirty = true;
    }
  }
  for (const m of inferred.userScope.mcp) {
    if (!state.library.mcp[m.id]) {
      state.library.mcp[m.id] = { id: m.id, def: m.def, hasSecrets: m.hasSecrets };
      dirty = true;
    }
  }

  // 补项目 assignments 中已有的 skills/plugins/MCP。
  // 已被该项目 bundle 覆盖的条目不补——它们本来就是 bundle 展开写盘的,
  // 再补成个体分配会导致 unassign bundle 后残留。
  for (const p of inferred.projects) {
    const a = state.assignments[p.path];
    if (!a) continue;
    const inBundle = expandProjectBundles(state, p.path);
    for (const s of p.skills) {
      if (inBundle.skillIds.has(s.id)) continue;
      if (!a.skills.includes(s.id)) { a.skills.push(s.id); dirty = true; }
    }
    for (const pl of p.plugins) {
      if (inBundle.pluginIds.has(pl.id)) continue;
      if (pl.enabled && !a.plugins.includes(pl.id)) { a.plugins.push(pl.id); dirty = true; }
    }
    for (const m of p.mcp) {
      if (inBundle.mcpIds.has(m.id)) continue;
      if (!a.mcp.includes(m.id)) { a.mcp.push(m.id); dirty = true; }
    }
  }

  // 首次加载时自动检测 bundle(仅当 library.bundles 为空)
  let bundlesDetected = false;
  if (Object.keys(state.library.bundles ?? {}).length === 0) {
    const detected = detectBundles(state);
    if (Object.keys(detected).length > 0) {
      state.library.bundles = { ...state.library.bundles, ...detected };
      bundlesDetected = true;
    }
  }

  return { state, dirty, bundlesDetected };
}
