import { ipcMain, dialog } from 'electron';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { buildState } from './scanner/buildState';
import { loadState, saveState } from './station/store';
import type { StationState } from './station/types';
import { seedStateFromInferred } from './station/seed';
import { assignMcp, unassignMcp, assignSkill, unassignSkill, assignPlugin, unassignPlugin, assignSnippet, unassignSnippet } from './station/assign';
import { computeApplyPlan, executeApply } from './station/apply';
import { orbitPaths } from './station/paths';
import { globalCleanupStatus, executeGlobalCleanup } from './station/cleanup';
import { updateMcpEnv, maskEnvValue } from './station/env';
import { detectBundles, createBundle, updateBundle, deleteBundle, assignBundle, unassignBundle, isInAssignedBundle } from './station/bundles';
import { unmountProject, addProject, pathExists } from './station/projects';
import { listGlobalMcp, addGlobalMcp, removeGlobalMcp, listGlobalSkills, addGlobalSkill, removeGlobalSkill, listGlobalPlugins, addGlobalPlugin, removeGlobalPlugin, assignGlobalBundle, unassignGlobalBundle } from './station/globalSettings';

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
  ipcMain.handle('station:loadDesired', () => {
    const home = homedir();
    if (!existsSync(orbitPaths(home).stateFile)) {
      const seeded = seedStateFromInferred(buildState(home));
      saveState(seeded, home);
      return seeded;
    }
    const state = loadState(home);
    let dirty = false;

    // 补种 skills:如果 library.skills 为空但磁盘上有 skill,则填充
    if (Object.keys(state.library.skills).length === 0 || Object.keys(state.library.plugins).length === 0) {
      const inferred = buildState(home);
      // 补 library
      for (const s of inferred.userScope.skills) {
        if (!state.library.skills[s.id]) {
          state.library.skills[s.id] = { id: s.id, name: s.id, sourcePath: s.path };
          dirty = true;
        }
      }
      for (const pl of inferred.userScope.plugins) {
        if (!state.library.plugins[pl.id]) {
          state.library.plugins[pl.id] = { id: pl.id };
          dirty = true;
        }
      }
      // 补项目 assignments 中已有的 skills/plugins
      for (const p of inferred.projects) {
        const a = state.assignments[p.path];
        if (a && a.skills.length === 0 && p.skills.length > 0) {
          a.skills = p.skills.map(s => s.id);
          dirty = true;
        }
        if (a && a.plugins.length === 0 && p.plugins.filter(pl => pl.enabled).length > 0) {
          a.plugins = p.plugins.filter(pl => pl.enabled).map(pl => pl.id);
          dirty = true;
        }
      }
    }

    if (dirty) saveState(state, home);

    // 首次加载时自动检测 bundle
    if (Object.keys(state.library.bundles ?? {}).length === 0) {
      const detected = detectBundles(state);
      if (Object.keys(detected).length > 0) {
        state.library.bundles = { ...state.library.bundles, ...detected };
        saveState(state, home);
      }
    }

    return state;
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

  ipcMain.handle('station:plan', (_e, projectPaths: string[]) => {
    const state = loadState();
    console.log('[plan] projectPaths=', projectPaths);
    console.log('[plan] assign keys=', Object.keys(state.assignments));
    const plan = computeApplyPlan(state, projectPaths);
    console.log('[plan] changes=', plan.changes.length, plan.changes.map(c => ({kind:c.kind, file:c.file, added:c.added, removed:c.removed})));
    return plan;
  });

  ipcMain.handle('station:apply', (_e, projectPaths: string[]) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const state = loadState();
    console.log('[apply] stamp=', stamp);
    console.log('[apply] projectPaths=', projectPaths);
    console.log('[apply] assignments keys=', Object.keys(state.assignments));
    console.log('[apply] state.assignments=', JSON.stringify(state.assignments, null, 2).slice(0, 500));
    console.log('[apply] lastApplied keys=', Object.keys(state.lastApplied));
    const plan = computeApplyPlan(state, projectPaths);
    console.log('[apply] plan.changes.length=', plan.changes.length);
    const result = executeApply(state, projectPaths, stamp);
    console.log('[apply] result.lastApplied=', JSON.stringify(result.lastApplied, null, 2).slice(0, 500));
    return result;
  });

  ipcMain.handle('station:globalStatus', () => {
    const home = homedir();
    const topLevelIds = buildState(home).userScope.mcp.map(m => m.id);
    return globalCleanupStatus(topLevelIds, loadState(home));
  });

  ipcMain.handle('station:cleanupGlobal', (_e, ids: string[]) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return executeGlobalCleanup(ids, stamp);
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
    const next = deleteBundle(loadState(), bundleId);
    saveState(next);
    return next;
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
    const next = addProject(state, abs, inferred);
    saveState(next);
    return next;
  });
  ipcMain.handle('station:deleteProjectFolder', (_e, projectPath: string) => {
    if (!existsSync(projectPath)) return false;
    try { rmSync(projectPath, { recursive: true }); return true; } catch { return false; }
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

  // Global settings — 像操作项目一样操作全局
  ipcMain.handle('station:listGlobalMcp', () => listGlobalMcp());
  ipcMain.handle('station:addGlobalMcp', (_e, id: string, def: any) => { addGlobalMcp(id, def); return true; });
  ipcMain.handle('station:removeGlobalMcp', (_e, id: string) => { removeGlobalMcp(id); return true; });
  ipcMain.handle('station:listGlobalSkills', () => listGlobalSkills());
  ipcMain.handle('station:addGlobalSkill', (_e, id: string, sourcePath?: string) => { addGlobalSkill(id, sourcePath); return true; });
  ipcMain.handle('station:removeGlobalSkill', (_e, id: string) => { removeGlobalSkill(id); return true; });
  ipcMain.handle('station:listGlobalPlugins', () => listGlobalPlugins());
  ipcMain.handle('station:addGlobalPlugin', (_e, id: string) => { addGlobalPlugin(id); return true; });
  ipcMain.handle('station:removeGlobalPlugin', (_e, id: string) => { removeGlobalPlugin(id); return true; });
  ipcMain.handle('station:assignGlobalBundle', (_e, bundleId: string) => { assignGlobalBundle(loadState(), bundleId); return true; });
  ipcMain.handle('station:unassignGlobalBundle', (_e, bundleId: string) => { unassignGlobalBundle(loadState(), bundleId); return true; });
  // Global snapshot for display
  ipcMain.handle('station:getGlobalSnapshot', () => ({
    mcp: listGlobalMcp(),
    skills: listGlobalSkills(),
    plugins: listGlobalPlugins(),
  }));
}
