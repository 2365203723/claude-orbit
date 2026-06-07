import type { McpServerDef } from '../types';
import type { StationState } from './types';

export interface ProjectTargets {
  mcpJson: Record<string, McpServerDef>;
  localScope: Record<string, McpServerDef>;
}

export function compileProjectTargets(state: StationState, projectPath: string): ProjectTargets {
  const ids = state.assignments[projectPath]?.mcp ?? [];
  const mcpJson: Record<string, McpServerDef> = {};
  const localScope: Record<string, McpServerDef> = {};
  for (const id of ids) {
    const entry = state.library.mcp[id];
    if (!entry) continue;
    if (entry.hasSecrets) localScope[id] = entry.def;
    else mcpJson[id] = entry.def;
  }
  return { mcpJson, localScope };
}
