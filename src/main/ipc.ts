import { ipcMain, dialog, shell } from 'electron';
import { homedir } from 'node:os';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve as resolvePath, relative as relativePath, sep as pathSep } from 'node:path';
import { buildState } from './scanner/buildState';
import { loadState, saveState } from './station/store';
import type { StationState } from './station/types';
import { seedStateFromInferred } from './station/seed';
import { assignMcp, unassignMcp, assignSkill, unassignSkill, assignPlugin, unassignPlugin, assignSnippet, unassignSnippet } from './station/assign';
import { executeApply } from './station/apply';
import { orbitPaths } from './station/paths';
import { updateMcpEnv, maskEnvValue } from './station/env';
import { detectBundles, createBundle, updateBundle, deleteBundle, assignBundle, unassignBundle, isInAssignedBundle } from './station/bundles';
import { backfillState } from './station/backfill';
import { unmountProject, addProject, pathExists, relinkProjectSkill } from './station/projects';
import { scanSkillHealth } from './station/skillHealth';
import { importSkill } from './station/skillLibrary';
import { importDiscoveredSkills } from './station/skillScan';
import { checkAllDrift, checkProjectDrift } from './station/drift';
import { listBackups, restoreBackup } from './station/backup';
import { listGlobalMcp, addGlobalMcp, removeGlobalMcp, listGlobalSkills, addGlobalSkill, removeGlobalSkill, listGlobalPlugins, addGlobalPlugin, removeGlobalPlugin, assignGlobalBundle, unassignGlobalBundle } from './station/globalSettings';
import type { GlobalMcpInfo } from './station/globalSettings';

// MCP def 的 env 可能含明文密钥——绝不跨 IPC 发往渲染进程,只暴露展示所需的非敏感字段
export interface DeleteFolderResult { ok: boolean; error?: string; }

const toPublicMcp = (m: GlobalMcpInfo) => ({ id: m.id, hasSecrets: m.hasSecrets, command: m.def?.command, url: (m.def as any)?.url });

// 全局 skill 源目录被搬进 Orbit 库后,同步 library.sourcePath 并重建各项目 symlink。
// relink 遍历 lastApplied 而非 library,library 没收录时也要重建,否则项目链接全部悬空。
function syncMovedSkill(state: StationState, id: string, movedTo: string): boolean {
  const entry = state.library.skills[id];
  if (entry) entry.sourcePath = movedTo;
  const failures = relinkProjectSkill(state, id, movedTo);
  for (const f of failures) console.warn(`[relink] ${f.projectPath}: ${f.error}`);
  return !!entry;
}

export function registerIpc(): void {
  ipcMain.handle('station:getState', () => buildState());

  // 拖拽即应用:保存期望状态后立刻写入真实配置文件,返回带 lastApplied 的新状态。
  // 取代旧的"先攒改动、再点 Apply"两步流程。
  function applyNow(next: StationState, projectPath: string): StationState {
    saveState(next);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return executeApply(next, [projectPath], stamp);
  }

  // Desired state: seed from reverse-import on first run, else read state.json.
  // 向后兼容:如果 state.json 是 M2 遗留(无 skills/plugins),从 inferred 补种。
  // inferredNow 由调用方传入,避免 getState/loadDesired 各扫一次磁盘。
  function loadDesiredFrom(inferredNow: ReturnType<typeof buildState>): StationState {
    const home = homedir();
    if (!existsSync(orbitPaths(home).stateFile)) {
      const seeded = seedStateFromInferred(inferredNow);
      saveState(seeded, home);
      return seeded;
    }
    const state = loadState(home);

    // 增量回填 skills / plugins / MCP + 首次 bundle 检测 — 提取为纯函数 backfillState
    const { state: next, dirty, bundlesDetected } = backfillState(state, inferredNow);
    if (dirty || bundlesDetected) saveState(next, home);

    return next;
  }

  ipcMain.handle('station:loadDesired', () => loadDesiredFrom(buildState()));

  // 聚合通道:一次磁盘扫描同时产出 inferred 与 desired,消除重复扫描与一致性竞争
  ipcMain.handle('station:reload', () => {
    const inferred = buildState();
    const desired = loadDesiredFrom(inferred);
    return { inferred, desired };
  });

  // MCP
  ipcMain.handle('station:assign', (_e, projectPath: string, mcpId: string) => {
    return applyNow(assignMcp(loadState(), projectPath, mcpId), projectPath);
  });
  ipcMain.handle('station:unassign', (_e, projectPath: string, mcpId: string) => {
    const state = loadState();
    if (isInAssignedBundle(state, projectPath, mcpId, 'mcp')) return state;
    return applyNow(unassignMcp(state, projectPath, mcpId), projectPath);
  });

  // Skills
  ipcMain.handle('station:assignSkill', (_e, projectPath: string, skillId: string) => {
    return applyNow(assignSkill(loadState(), projectPath, skillId), projectPath);
  });
  ipcMain.handle('station:unassignSkill', (_e, projectPath: string, skillId: string) => {
    const state = loadState();
    if (isInAssignedBundle(state, projectPath, skillId, 'skill')) return state;
    return applyNow(unassignSkill(state, projectPath, skillId), projectPath);
  });

  // Plugins
  ipcMain.handle('station:assignPlugin', (_e, projectPath: string, pluginId: string) => {
    return applyNow(assignPlugin(loadState(), projectPath, pluginId), projectPath);
  });
  ipcMain.handle('station:unassignPlugin', (_e, projectPath: string, pluginId: string) => {
    const state = loadState();
    if (isInAssignedBundle(state, projectPath, pluginId, 'plugin')) return state;
    return applyNow(unassignPlugin(state, projectPath, pluginId), projectPath);
  });

  // Snippets
  ipcMain.handle('station:assignSnippet', (_e, projectPath: string, snippetId: string) => {
    return applyNow(assignSnippet(loadState(), projectPath, snippetId), projectPath);
  });
  ipcMain.handle('station:unassignSnippet', (_e, projectPath: string, snippetId: string) => {
    return applyNow(unassignSnippet(loadState(), projectPath, snippetId), projectPath);
  });

  // Env editing
  ipcMain.handle('station:getMcpEnv', (_e, mcpId: string) => {
    const state = loadState();
    const entry = state.library.mcp[mcpId];
    if (!entry) return null;
    return {
      id: entry.id,
      env: entry.def.env ?? {},
      envMasked: entry.def.env
        ? Object.fromEntries(Object.entries(entry.def.env).map(([k, v]) => [k, maskEnvValue(v)]))
        : {},
      hasSecrets: entry.hasSecrets,
    };
  });

  ipcMain.handle('station:updateMcpEnv', (_e, mcpId: string, env: Record<string, string>) => {
    const next = updateMcpEnv(loadState(), mcpId, env);
    saveState(next);
    return next;
  });

  // Bundles
  ipcMain.handle('station:detectBundles', () => {
    const state = loadState();
    const bundles = detectBundles(state);
    state.library.bundles = { ...state.library.bundles, ...bundles };
    saveState(state);
    return state;
  });
  ipcMain.handle('station:createBundle', (_e, bundle: any) => {
    const next = createBundle(loadState(), bundle);
    saveState(next);
    return next;
  });
  ipcMain.handle('station:updateBundle', (_e, bundleId: string, updates: any) => {
    const next = updateBundle(loadState(), bundleId, updates);
    saveState(next);
    return next;
  });
  ipcMain.handle('station:deleteBundle', (_e, bundleId: string) => {
    const state = loadState();
    // 删 bundle 前先找出哪些项目挂了它——这些项目的磁盘 symlink/MCP 需随之清理
    const affected = Object.entries(state.assignments)
      .filter(([, a]) => (a.bundles ?? []).includes(bundleId))
      .map(([path]) => path);
    const next = deleteBundle(state, bundleId);
    saveState(next);
    if (affected.length === 0) return next;
    // 对受影响项目重新 apply,移除该 bundle 写下的 symlink/local-scope 条目
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return executeApply(next, affected, stamp);
  });
  ipcMain.handle('station:assignBundle', (_e, projectPath: string, bundleId: string) => {
    return applyNow(assignBundle(loadState(), projectPath, bundleId), projectPath);
  });
  ipcMain.handle('station:unassignBundle', (_e, projectPath: string, bundleId: string) => {
    return applyNow(unassignBundle(loadState(), projectPath, bundleId), projectPath);
  });

  // Projects
  ipcMain.handle('station:unmountProject', (_e, projectPath: string) => {
    const next = unmountProject(loadState(), projectPath);
    saveState(next);
    return next;
  });
  ipcMain.handle('station:addProject', (_e, projectPath: string) => {
    const state = loadState();
    const inferred = buildState();
    const abs = resolvePath(projectPath);
    // 如果是新路径（不在 inferred.projects 中），创建文件夹 + 空 assignment
    const existing = inferred.projects.find(p => p.path === abs);
    if (!existing) {
      if (!pathExists(abs)) mkdirSync(abs, { recursive: true });
    }
    // addProject 内部会把项目注册进 ~/.claude.json(strict 读 + 原子写)
    const next = addProject(state, abs, inferred);
    saveState(next);
    return next;
  });
  // 删除项目文件夹——渲染进程传入的路径必须严格校验:
  // 仅允许已知项目路径,且必须在 home 内、距根至少 3 层;走系统回收站可恢复。
  ipcMain.handle('station:deleteProjectFolder', async (_e, projectPath: string): Promise<DeleteFolderResult> => {
    const abs = resolvePath(projectPath);
    const home = homedir();
    if (abs === '/' || abs === home) return { ok: false, error: '拒绝删除根目录或用户主目录' };
    const rel = relativePath(home, abs);
    if (rel === '' || rel.startsWith('..')) return { ok: false, error: '只允许删除主目录内的项目' };
    if (abs.split(pathSep).filter(Boolean).length < 3) return { ok: false, error: '路径层级过浅，拒绝删除' };
    const state = loadState();
    const known = Object.keys(state.assignments).includes(abs)
      || buildState().projects.some(p => p.path === abs);
    if (!known) return { ok: false, error: '不是已知项目路径' };
    // 目录已不存在 → 目标状态已达成,视为成功(幂等),仍清理残留条目
    if (existsSync(abs)) {
      try {
        await shell.trashItem(abs);
      } catch (e) {
        console.error('[deleteProjectFolder]', abs, e);
        return { ok: false, error: (e as Error).message };
      }
    }
    // 清理残留:state.assignments 与 ~/.claude.json 的项目条目
    if (state.assignments[abs]) {
      saveState(unmountProject(state, abs));
    } else {
      saveState(unmountProject({ ...state, assignments: { ...state.assignments, [abs]: { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] } } }, abs));
    }
    return { ok: true };
  });
  ipcMain.handle('station:createProjectFolder', (_e, parentDir: string, name: string) => {
    const abs = resolvePath(parentDir, name);
    if (existsSync(abs)) return abs;
    mkdirSync(abs, { recursive: true });
    return abs;
  });
  // 文件浏览对话框
  ipcMain.handle('station:browseFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  // Skill 导入:从本机目录复制到 Orbit 库
  ipcMain.handle('station:importSkill', (_e, sourcePath: string) => {
    const next = importSkill(loadState(), sourcePath);
    return next;
  });
  // 一键扫描标准 skill 目录,导入所有未纳入管理的 skill
  ipcMain.handle('station:importDiscoveredSkills', () => {
    const { state, imported, skipped } = importDiscoveredSkills(loadState());
    return { state, imported, skipped };
  });

  // Global settings — 像操作项目一样操作全局
  ipcMain.handle('station:listGlobalMcp', () => listGlobalMcp().map(toPublicMcp));
  ipcMain.handle('station:addGlobalMcp', (_e, id: string, def: any) => { addGlobalMcp(id, def); return true; });
  ipcMain.handle('station:removeGlobalMcp', (_e, id: string) => { removeGlobalMcp(id); return true; });
  ipcMain.handle('station:listGlobalSkills', () => listGlobalSkills());
  ipcMain.handle('station:addGlobalSkill', (_e, id: string, sourcePath?: string) => { addGlobalSkill(id, sourcePath); return true; });
  ipcMain.handle('station:removeGlobalSkill', (_e, id: string) => {
    // 若移除的是真实目录(skill 源),它会被搬进 Orbit 库并返回新路径;
    // 同步更新 library.sourcePath 并把各项目指向旧位置的 symlink 重建到新位置。
    const movedTo = removeGlobalSkill(id);
    if (movedTo) {
      const state = loadState();
      syncMovedSkill(state, id, movedTo);
      saveState(state);
    }
    return true;
  });
  ipcMain.handle('station:listGlobalPlugins', () => listGlobalPlugins());
  ipcMain.handle('station:addGlobalPlugin', (_e, id: string) => { addGlobalPlugin(id); return true; });
  ipcMain.handle('station:removeGlobalPlugin', (_e, id: string) => { removeGlobalPlugin(id); return true; });
  ipcMain.handle('station:assignGlobalBundle', (_e, bundleId: string) => {
    const state = loadState();
    assignGlobalBundle(state, bundleId);
    saveState(state); // 持久化 globalBundleApplied 安装记录
    return true;
  });
  ipcMain.handle('station:unassignGlobalBundle', (_e, bundleId: string) => {
    const state = loadState();
    const moved = unassignGlobalBundle(state, bundleId);
    for (const [id, p] of Object.entries(moved)) syncMovedSkill(state, id, p);
    saveState(state); // 持久化安装记录的删除与 sourcePath 更新
    return true;
  });
  // Skill 健康扫描:检测 sourcePath 失效的死链,供 UI 标红警告
  ipcMain.handle('station:scanSkillHealth', () => scanSkillHealth(loadState()));

  ipcMain.handle('station:getGlobalSnapshot', () => ({
    mcp: listGlobalMcp().map(toPublicMcp),
    skills: listGlobalSkills(),
    plugins: listGlobalPlugins(),
    // 显式分配记录——不能从「MCP 全在全局」推断,用户手动添加会误报
    bundleIds: loadState().globalBundles ?? [],
  }));

  // Drift detection:检测项目磁盘配置与 lastApplied 快照的偏移
  ipcMain.handle('station:checkDrift', (_e, projectPath?: string) => {
    const state = loadState();
    if (projectPath) return checkProjectDrift(state, projectPath);
    return checkAllDrift(state);
  });

  // Backups — 列出与恢复(restoreBackup 内部做路径白名单校验 + 原子写)
  ipcMain.handle('orbit:listBackups', () => listBackups());
  ipcMain.handle('orbit:restoreBackup', (_e, stamp: string) => restoreBackup(stamp));
}
