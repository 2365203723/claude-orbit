import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { McpServerDef } from '../types';
import type { StationState } from './types';
import { resolvePaths } from '../scanner/paths';
import { backupFiles } from './backup';
import { loadState } from './store';
import { readJsonStrict, writeJsonAtomic } from './safeJson';

export interface GlobalCleanupStatus { eligible: string[]; blocked: string[]; }

export function landedGlobalIds(state: StationState): Set<string> {
  const ids = new Set<string>();
  for (const snap of Object.values(state.lastApplied)) {
    for (const id of Object.keys(snap.mcpJson)) ids.add(id);
    for (const id of Object.keys(snap.localScope)) ids.add(id);
  }
  return ids;
}

export function globalCleanupStatus(topLevelIds: string[], state: StationState): GlobalCleanupStatus {
  const landed = landedGlobalIds(state);
  const eligible: string[] = [];
  const blocked: string[] = [];
  for (const id of topLevelIds) (landed.has(id) ? eligible : blocked).push(id);
  return { eligible, blocked };
}

export function removeGlobalMcp(claudeJson: any, ids: string[]): any {
  const base = claudeJson ?? {};
  const servers: Record<string, McpServerDef> = { ...(base.mcpServers ?? {}) };
  for (const id of ids) delete servers[id];
  return { ...base, mcpServers: servers };
}

export function executeGlobalCleanup(requestedIds: string[], stamp: string, home: string = homedir()): string[] {
  const claudeJsonFile = resolvePaths(home).claudeJson;
  // strict 读:~/.claude.json 解析失败时抛错中止,绝不能当作空对象重写
  const cj = existsSync(claudeJsonFile) ? readJsonStrict(claudeJsonFile) : undefined;
  const topLevelIds = Object.keys(cj?.mcpServers ?? {});
  const { eligible } = globalCleanupStatus(topLevelIds, loadState(home));
  const eligibleSet = new Set(eligible);
  const toRemove = requestedIds.filter(id => eligibleSet.has(id));
  if (!toRemove.length) return [];

  backupFiles([claudeJsonFile], stamp, home);
  writeJsonAtomic(claudeJsonFile, removeGlobalMcp(cj, toRemove));
  return toRemove;
}
