import type { StationState, LibraryBundle } from './types';

// ==================== 自动检测 ====================
export function detectBundles(state: StationState): Record<string, LibraryBundle> {
  const bundles: Record<string, LibraryBundle> = {};
  const claimedSkills = new Set<string>();
  const claimedPlugins = new Set<string>();
  const mcpIds = Object.keys(state.library.mcp).sort((a, b) => b.length - a.length);
  for (const mcpId of mcpIds) {
    const matchingSkills = Object.keys(state.library.skills).filter(sid => !claimedSkills.has(sid) && isPrefixed(sid, mcpId));
    const matchingPlugins = Object.keys(state.library.plugins).filter(pid => !claimedPlugins.has(pid) && isPrefixed(pid, mcpId));
    if (matchingSkills.length > 0 || matchingPlugins.length > 0) {
      matchingSkills.forEach(s => claimedSkills.add(s));
      matchingPlugins.forEach(p => claimedPlugins.add(p));
      bundles[mcpId] = { id: mcpId, name: capitalize(mcpId), description: `Auto-detected bundle for ${mcpId}`, version: '1.0.0', mcp: [mcpId], skills: matchingSkills, plugins: matchingPlugins, autoDetected: true };
    }
  }
  return bundles;
}
function isPrefixed(id: string, prefix: string): boolean { if (!id.startsWith(prefix)) return false; const sep = id.charAt(prefix.length); return sep === '-' || sep === '_' || sep === ':'; }
function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

// ==================== CRUD ====================
export function createBundle(state: StationState, bundle: LibraryBundle): StationState {
  if (state.library.bundles[bundle.id]) return state;
  return { ...state, library: { ...state.library, bundles: { ...state.library.bundles, [bundle.id]: bundle } } };
}
export function updateBundle(state: StationState, bundleId: string, updates: Partial<LibraryBundle>): StationState {
  const existing = state.library.bundles[bundleId];
  if (!existing) return state;
  return { ...state, library: { ...state.library, bundles: { ...state.library.bundles, [bundleId]: { ...existing, ...updates } } } };
}
export function deleteBundle(state: StationState, bundleId: string): StationState {
  const next = { ...state.library.bundles }; delete next[bundleId];
  // 级联清理:从所有项目 assignment 中移除对该 bundle 的引用,
  // 否则会留下悬空引用(assignedBundles 里 filter(Boolean) 掉,但 state 仍脏),
  // 且重建同名 bundle 时旧引用会错误复活。
  const assignments: StationState['assignments'] = {};
  for (const [path, a] of Object.entries(state.assignments)) {
    assignments[path] = { ...a, bundles: (a.bundles ?? []).filter(id => id !== bundleId) };
  }
  return { ...state, library: { ...state.library, bundles: next }, assignments };
}

// ==================== 原子分配：只写 bundles[] ====================
export function assignBundle(state: StationState, projectPath: string, bundleId: string): StationState {
  if (!state.library.bundles[bundleId]) return state;
  const cur = state.assignments[projectPath]?.bundles ?? [];
  if (cur.includes(bundleId)) return state;
  const prev = state.assignments[projectPath] ?? { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
  return { ...state, assignments: { ...state.assignments, [projectPath]: { ...prev, bundles: [...cur, bundleId] } } };
}
export function unassignBundle(state: StationState, projectPath: string, bundleId: string): StationState {
  const cur = state.assignments[projectPath]?.bundles ?? [];
  const prev = state.assignments[projectPath] ?? { mcp: [], skills: [], plugins: [], snippets: [], bundles: [] };
  return { ...state, assignments: { ...state.assignments, [projectPath]: { ...prev, bundles: cur.filter(id => id !== bundleId) } } };
}

// ==================== 查询 ====================
export function resolveBundleIds(state: StationState, bundleId: string): { mcp: string[]; skills: string[]; plugins: string[] } | null {
  const b = state.library.bundles[bundleId];
  if (!b) return null;
  return { mcp: b.mcp, skills: b.skills, plugins: b.plugins };
}

// 展开某项目下所有 bundle → 个体 ID（编译时用）
export function expandProjectBundles(state: StationState, projectPath: string): { mcpIds: Set<string>; skillIds: Set<string>; pluginIds: Set<string> } {
  const result = { mcpIds: new Set<string>(), skillIds: new Set<string>(), pluginIds: new Set<string>() };
  const bidList = state.assignments[projectPath]?.bundles ?? [];
  for (const bid of bidList) {
    const b = state.library.bundles[bid];
    if (!b) continue;
    b.mcp.forEach(id => result.mcpIds.add(id));
    b.skills.forEach(id => result.skillIds.add(id));
    b.plugins.forEach(id => result.pluginIds.add(id));
  }
  return result;
}

// 检查某个个体 item 是否已被本项目上分配的 bundle 覆盖（用于拒绝个体 unassign）
export function isInAssignedBundle(state: StationState, projectPath: string, itemId: string, kind: 'mcp' | 'skill' | 'plugin'): boolean {
  const bidList = state.assignments[projectPath]?.bundles ?? [];
  for (const bid of bidList) {
    const b = state.library.bundles[bid];
    if (!b) continue;
    if (kind === 'mcp' && b.mcp.includes(itemId)) return true;
    if (kind === 'skill' && b.skills.includes(itemId)) return true;
    if (kind === 'plugin' && b.plugins.includes(itemId)) return true;
  }
  return false;
}
