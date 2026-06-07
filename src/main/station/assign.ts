import type { StationState } from './types';

export function assignMcp(state: StationState, projectPath: string, mcpId: string): StationState {
  if (!state.library.mcp[mcpId]) return state;
  const current = state.assignments[projectPath]?.mcp ?? [];
  if (current.includes(mcpId)) return state;
  return {
    ...state,
    assignments: { ...state.assignments, [projectPath]: { mcp: [...current, mcpId] } },
  };
}

export function unassignMcp(state: StationState, projectPath: string, mcpId: string): StationState {
  const current = state.assignments[projectPath]?.mcp ?? [];
  return {
    ...state,
    assignments: { ...state.assignments, [projectPath]: { mcp: current.filter(id => id !== mcpId) } },
  };
}
