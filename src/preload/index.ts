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
  checkDrift: (projectPath?: string): Promise<{ drifted: string[]; total: number } | boolean> => ipcRenderer.invoke('station:checkDrift', projectPath),
  importSkill: (sourcePath: string): Promise<any> => ipcRenderer.invoke('station:importSkill', sourcePath),
  importDiscoveredSkills: (): Promise<{ state: any; imported: string[]; skipped: number }> => ipcRenderer.invoke('station:importDiscoveredSkills'),
  getGlobalSnapshot: (): Promise<{ mcp: PublicGlobalMcp[]; skills: GlobalSkillInfo[]; plugins: GlobalPluginInfo[]; bundleIds: string[] }> => ipcRenderer.invoke('station:getGlobalSnapshot'),
  // Backups
  listBackups: (): Promise<{ stamp: string; files: { originalPath: string; size: number }[] }[]> => ipcRenderer.invoke('orbit:listBackups'),
  restoreBackup: (stamp: string): Promise<string[]> => ipcRenderer.invoke('orbit:restoreBackup', stamp),
} as const;

export type StationApi = typeof api;

contextBridge.exposeInMainWorld('station', api);
