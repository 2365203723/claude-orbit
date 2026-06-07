import type { McpServerDef } from '../types';

export interface ServerDiff { added: string[]; removed: string[]; changed: string[]; }

export function diffServers(
  before: Record<string, McpServerDef>,
  after: Record<string, McpServerDef>,
): ServerDiff {
  const bk = Object.keys(before), ak = Object.keys(after);
  const added = ak.filter(k => !(k in before));
  const removed = bk.filter(k => !(k in after));
  const changed = ak.filter(k => k in before && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return { added, removed, changed };
}
