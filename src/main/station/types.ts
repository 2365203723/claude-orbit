import type { McpServerDef } from '../types';
import type { SnippetSettingKeys, SnippetSettingsMeta } from './merge';

export interface LibraryMcp { id: string; def: McpServerDef; hasSecrets: boolean; }
export interface LibrarySkill { id: string; name: string; sourcePath: string; }
export interface LibraryPlugin { id: string; marketplace?: string; name?: string; version?: string; }
export interface LibrarySnippet { id: string; name: string; kind: 'claudemd' | 'hooks' | 'env'; content: string; }

export interface LibraryBundle {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  homepage?: string;
  version: string;
  mcp: string[];       // library.mcp 中的 MCP ID
  skills: string[];    // library.skills 中的 skill ID
  plugins: string[];   // library.plugins 中的 plugin ID
  autoDetected?: boolean;
}

export interface StationLibrary {
  mcp: Record<string, LibraryMcp>;
  skills: Record<string, LibrarySkill>;
  plugins: Record<string, LibraryPlugin>;
  snippets: Record<string, LibrarySnippet>;
  bundles: Record<string, LibraryBundle>;
}

export interface ProjectAssignment {
  mcp: string[];
  skills: string[];
  plugins: string[];
  snippets: string[];
  bundles: string[];
}

export interface AppliedSnapshot {
  mcpJson: Record<string, McpServerDef>;
  localScope: Record<string, McpServerDef>;
  skills: string[];
  plugins: string[];
  snippets: string[];
  /** 上次 apply 由 snippets 写入 settings.json 的记录,用于 unassign 后精确清理。
   *  旧快照为 SnippetSettingKeys(整键),新快照为 SnippetSettingsMeta(条目级) */
  snippetSettingKeys?: SnippetSettingKeys | SnippetSettingsMeta;
  /** CLAUDE.md 是 Orbit 首次写入时创建的——只有此时清空后才允许删除文件,
   *  用户自建的空文件/占位文件不属于 Orbit,清块后应保留 */
  claudeMdCreatedByOrbit?: boolean;
  bundles: string[];
}

/** assignGlobalBundle 实际写入的条目记录——unassign 时只回收这些,
 *  避免误删用户原有的全局 MCP/skill/plugin */
export interface GlobalBundleApplied {
  mcp: string[];
  skills: string[];
  plugins: string[];
}

export interface StationState {
  version: number;
  library: StationLibrary;
  assignments: Record<string, ProjectAssignment>;
  lastApplied: Record<string, AppliedSnapshot>;
  globalBundleApplied?: Record<string, GlobalBundleApplied>;
  /** 显式分配到全局的 bundle ID——展示判定的唯一来源,
   *  不能用「bundle 的 MCP 全在全局」启发式(用户手动添加会误报) */
  globalBundles?: string[];
}

export interface FileChange {
  file: string;
  kind: 'mcpjson' | 'localscope' | 'skills' | 'settings' | 'claudemd';
  before: unknown;
  after: unknown;
  added: string[];
  removed: string[];
  changed: string[];
}
export interface ApplyPlan { changes: FileChange[]; }
