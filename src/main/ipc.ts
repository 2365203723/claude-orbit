import { ipcMain } from 'electron';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { buildState } from './scanner/buildState';
import { loadState, saveState } from './station/store';
import { seedStateFromInferred } from './station/seed';
import { assignMcp, unassignMcp } from './station/assign';
import { computeApplyPlan, executeApply } from './station/apply';
import { stationPaths } from './station/paths';

export function registerIpc(): void {
  ipcMain.handle('station:getState', () => buildState());

  // Desired state: seed from reverse-import on first run, else read state.json
  ipcMain.handle('station:loadDesired', () => {
    const home = homedir();
    if (!existsSync(stationPaths(home).stateFile)) {
      const seeded = seedStateFromInferred(buildState(home));
      saveState(seeded, home);
      return seeded;
    }
    return loadState(home);
  });

  ipcMain.handle('station:assign', (_e, projectPath: string, mcpId: string) => {
    const next = assignMcp(loadState(), projectPath, mcpId);
    saveState(next);
    return next;
  });
  ipcMain.handle('station:unassign', (_e, projectPath: string, mcpId: string) => {
    const next = unassignMcp(loadState(), projectPath, mcpId);
    saveState(next);
    return next;
  });

  ipcMain.handle('station:plan', (_e, projectPaths: string[]) =>
    computeApplyPlan(loadState(), projectPaths));

  ipcMain.handle('station:apply', (_e, projectPaths: string[]) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return executeApply(loadState(), projectPaths, stamp);
  });
}
