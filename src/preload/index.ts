import { contextBridge, ipcRenderer } from 'electron';
import type { InferredState, McpServerDef } from '../main/types';
import type { StationState, LibraryBundle } from '../main/station/types';
import type { GlobalMcpInfo, GlobalSkillInfo, GlobalPluginInfo } from '../main/station/globalSettings';
import type { DeleteFolderResult } from '../main/ipc';

// MCP def 的 env 不跨 IPC 传输——渲染端拿到的是去敏后的公开形状
type PublicGlobalMcp = Omit<GlobalMcpInfo, 'def'> & { command?: string; url?: string };

// API 形状的唯一定义——vite-env.d.ts 通过 `typeof api` 引用,避免手写双份漂移
const api = {
  getState: (): Promise<InferredState> => ipcRenderer.invoke('station:getState'),
  loadDesired: (): Promise<StationState> => ipcRenderer.invoke('station:loadDesired'),
  reload: (): Promise<{ inferred: InferredState; desired: StationState }> => ipcRenderer.invoke('station:reload'),
  assign: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:assign', p, id),
  unassign: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:unassign', p, id),
  assignSkill: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:assignSkill', p, id),
  unassignSkill: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:unassignSkill', p, id),
  assignPlugin: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:assignPlugin', p, id),
  unassignPlugin: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:unassignPlugin', p, id),
  assignSnippet: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:assignSnippet', p, id),
  unassignSnippet: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:unassignSnippet', p, id),
  // Env editing
  getMcpEnv: (mcpId: string): Promise<{ id: string; env: Record<string,string>; envMasked: Record<string,string>; hasSecrets: boolean } | null> => ipcRenderer.invoke('station:getMcpEnv', mcpId),
  updateMcpEnv: (mcpId: string, env: Record<string,string>): Promise<StationState> => ipcRenderer.invoke('station:updateMcpEnv', mcpId, env),
  // Bundles
  detectBundles: (): Promise<StationState> => ipcRenderer.invoke('station:detectBundles'),
  createBundle: (bundle: LibraryBundle): Promise<StationState> => ipcRenderer.invoke('station:createBundle', bundle),
  updateBundle: (id: string, updates: Partial<LibraryBundle>): Promise<StationState> => ipcRenderer.invoke('station:updateBundle', id, updates),
  deleteBundle: (id: string): Promise<StationState> => ipcRenderer.invoke('station:deleteBundle', id),
  assignBundle: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:assignBundle', p, id),
  unassignBundle: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:unassignBundle', p, id),
  // Projects
  unmountProject: (projectPath: string): Promise<StationState> => ipcRenderer.invoke('station:unmountProject', projectPath),
  addProject: (projectPath: string): Promise<StationState> => ipcRenderer.invoke('station:addProject', projectPath),
  deleteProjectFolder: (projectPath: string): Promise<DeleteFolderResult> => ipcRenderer.invoke('station:deleteProjectFolder', projectPath),
  createProjectFolder: (parentDir: string, name: string): Promise<string> => ipcRenderer.invoke('station:createProjectFolder', parentDir, name),
  browseFolder: (): Promise<string | null> => ipcRenderer.invoke('station:browseFolder'),
  // Global settings
  listGlobalMcp: (): Promise<PublicGlobalMcp[]> => ipcRenderer.invoke('station:listGlobalMcp'),
  addGlobalMcp: (id: string, def: McpServerDef): Promise<boolean> => ipcRenderer.invoke('station:addGlobalMcp', id, def),
  removeGlobalMcp: (id: string): Promise<boolean> => ipcRenderer.invoke('station:removeGlobalMcp', id),
  listGlobalSkills: (): Promise<GlobalSkillInfo[]> => ipcRenderer.invoke('station:listGlobalSkills'),
  addGlobalSkill: (id: string, sourcePath?: string): Promise<boolean> => ipcRenderer.invoke('station:addGlobalSkill', id, sourcePath),
  removeGlobalSkill: (id: string): Promise<boolean> => ipcRenderer.invoke('station:removeGlobalSkill', id),
  listGlobalPlugins: (): Promise<GlobalPluginInfo[]> => ipcRenderer.invoke('station:listGlobalPlugins'),
  addGlobalPlugin: (id: string): Promise<boolean> => ipcRenderer.invoke('station:addGlobalPlugin', id),
  removeGlobalPlugin: (id: string): Promise<boolean> => ipcRenderer.invoke('station:removeGlobalPlugin', id),
  assignGlobalBundle: (bundleId: string): Promise<boolean> => ipcRenderer.invoke('station:assignGlobalBundle', bundleId),
  unassignGlobalBundle: (bundleId: string): Promise<boolean> => ipcRenderer.invoke('station:unassignGlobalBundle', bundleId),
  scanSkillHealth: (): Promise<{ total: number; healthy: number; dead: string[]; incomplete: string[] }> => ipcRenderer.invoke('station:scanSkillHealth'),
  importSkill: (sourcePath: string): Promise<any> => ipcRenderer.invoke('station:importSkill', sourcePath),
  importDiscoveredSkills: (): Promise<{ state: any; imported: string[]; skipped: number }> => ipcRenderer.invoke('station:importDiscoveredSkills'),
  diagnoseDeadSkills: (): Promise<{ id: string; sourcePath: string; sourceUrl?: string; globalCopy?: string; fixable: 'global-copy' | 'git-clone' | 'manual' }[]> => ipcRenderer.invoke('station:diagnoseDeadSkills'),
  repairDeadSkills: (ids: string[]): Promise<{ state: any; report: { repaired: string[]; failed: { id: string; reason: string }[]; manual: string[] } }> => ipcRenderer.invoke('station:repairDeadSkills', ids),
  removeDeadSkills: (ids: string[]): Promise<{ state: any; report: { removed: string[]; failed: { id: string; reason: string }[] } }> => ipcRenderer.invoke('station:removeDeadSkills', ids),
  getGlobalSnapshot: (): Promise<{ mcp: PublicGlobalMcp[]; skills: GlobalSkillInfo[]; plugins: GlobalPluginInfo[]; bundleIds: string[] }> => ipcRenderer.invoke('station:getGlobalSnapshot'),
  // Backups
  listBackups: (): Promise<{ stamp: string; files: { originalPath: string; size: number }[] }[]> => ipcRenderer.invoke('orbit:listBackups'),
  restoreBackup: (stamp: string): Promise<string[]> => ipcRenderer.invoke('orbit:restoreBackup', stamp),
} as const;

export type StationApi = typeof api;

contextBridge.exposeInMainWorld('station', api);

// ── 终端桥接(node-pty)──────────────────────────────────────────────
// data/exit 是按 session id 分频道的事件,需用 on/off 包装暴露给渲染端
const terminal = {
  available: (): Promise<{ available: boolean; error: string | null }> => ipcRenderer.invoke('terminal:available'),
  create: (opts: { id: string; cwd?: string; cols?: number; rows?: number }): Promise<{ ok: boolean; pid?: number; cwd?: string; error?: string }> =>
    ipcRenderer.invoke('terminal:create', opts),
  input: (id: string, data: string): void => ipcRenderer.send('terminal:input', id, data),
  resize: (id: string, cols: number, rows: number): void => ipcRenderer.send('terminal:resize', id, cols, rows),
  kill: (id: string): void => ipcRenderer.send('terminal:kill', id),
  onData: (id: string, cb: (data: string) => void): (() => void) => {
    const ch = `terminal:data:${id}`;
    const listener = (_e: unknown, data: string) => cb(data);
    ipcRenderer.on(ch, listener);
    return () => ipcRenderer.off(ch, listener);
  },
  onExit: (id: string, cb: (code: number) => void): (() => void) => {
    const ch = `terminal:exit:${id}`;
    const listener = (_e: unknown, code: number) => cb(code);
    ipcRenderer.on(ch, listener);
    return () => ipcRenderer.off(ch, listener);
  },
} as const;

export type TerminalApi = typeof terminal;

contextBridge.exposeInMainWorld('terminal', terminal);
