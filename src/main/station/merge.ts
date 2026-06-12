import type { McpServerDef } from '../types';

/** 差量合并 mcpServers:只删除 prevManaged(上次由 Orbit 写入)中不再需要的条目,
 *  保留用户手工添加的 server——整体替换会无声抹掉 `claude mcp add` 的结果。 */
function mergeManagedServers(
  current: Record<string, McpServerDef>,
  servers: Record<string, McpServerDef>,
  prevManaged: Record<string, McpServerDef>,
): Record<string, McpServerDef> {
  const next = { ...current };
  for (const id of Object.keys(prevManaged)) {
    if (!(id in servers)) delete next[id];
  }
  Object.assign(next, servers);
  return next;
}

export function mergeMcpJson(
  existing: any,
  servers: Record<string, McpServerDef>,
  prevManaged: Record<string, McpServerDef> = {},
): any {
  const base = existing ?? {};
  return { ...base, mcpServers: mergeManagedServers(base.mcpServers ?? {}, servers, prevManaged) };
}

export function mergeLocalScope(
  existing: any,
  projectPath: string,
  servers: Record<string, McpServerDef>,
  prevManaged: Record<string, McpServerDef> = {},
): any {
  const base = existing ?? {};
  const projects = { ...(base.projects ?? {}) };
  const proj = { ...(projects[projectPath] ?? {}) };
  const merged = mergeManagedServers(proj.mcpServers ?? {}, servers, prevManaged);
  if (Object.keys(merged).length === 0) {
    // 清空即意味着原有条目全是 Orbit 管理的(用户条目从不被删)——不留空 {} 占位
    delete proj.mcpServers;
  } else {
    proj.mcpServers = merged;
  }
  projects[projectPath] = proj;
  return { ...base, projects };
}

/** 合并 enabledPlugins 到 settings.json,保留其他字段。
 *  只清理 prevIds(上次由 Orbit 写入)中不再属于 target 的条目——
 *  用户手工启用/禁用的插件不受影响。 */
export function mergePluginSettings(
  existing: any,
  enabledPlugins: Record<string, boolean>,
  prevIds: string[] = [],
): any {
  const base = existing ?? {};
  const current: Record<string, boolean> = { ...(base.enabledPlugins ?? {}) };
  // 删除上次写入、本次不再需要的插件
  for (const k of prevIds) {
    if (!(k in enabledPlugins)) delete current[k];
  }
  // 写入 target 里的插件(false 也显式写入,Orbit 管理的禁用才能生效)
  for (const [id, on] of Object.entries(enabledPlugins)) {
    current[id] = on;
  }
  return { ...base, enabledPlugins: current };
}

const MARKER_START = (id: string) => `<!-- CLAUDE_STATION:SNIPPET:${id}:START -->`;
const MARKER_END = (id: string) => `<!-- CLAUDE_STATION:SNIPPET:${id}:END -->`;

export interface SnippetClaudeMdResult {
  content: string;
  /** 清理后内容为空且无新块——文件应被删除,而非原样保留 */
  shouldDelete: boolean;
}

/** 在 CLAUDE.md 中按标记注入/更新/删除 snippet 内容块。
 *  返回清理/注入后的完整内容;shouldDelete 表示结果为空、调用方应删除文件。 */
export function mergeSnippetClaudeMd(
  existingMd: string | undefined,
  blocks: { id: string; content: string }[],
): SnippetClaudeMdResult {
  let md = existingMd ?? '';

  // 收集所有需要清理的 snippet id:当前传入的 + 文件中已有的
  const idsToClean = new Set(blocks.map(b => b.id));
  const markerRe = /<!-- CLAUDE_STATION:SNIPPET:(.+?):START -->/g;
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(md)) !== null) {
    idsToClean.add(m[1]);
  }

  // 移除所有 Claude Orbit 管理的 snippet 块
  for (const id of idsToClean) {
    const start = MARKER_START(id);
    const end = MARKER_END(id);
    while (true) {
      const si = md.indexOf(start);
      if (si === -1) break;
      const ei = md.indexOf(end, si);
      if (ei === -1) {
        // END 标记缺失(文件被截断/手工编辑)——只删孤儿 START 标记本身,
        // 保留其后的用户内容,且避免该孤儿与后续块的 END 错误配对
        md = md.slice(0, si) + md.slice(si + start.length);
        continue;
      }
      md = md.slice(0, si) + md.slice(ei + end.length);
    }
  }

  // 追加当前 snippet 块
  if (blocks.length === 0) {
    // 清理头部和尾部多余空行
    md = md.replace(/^\n+/, '').replace(/\n{2,}$/g, '').trim();
    return { content: md, shouldDelete: md === '' };
  }

  md = md.trimEnd();
  md += '\n\n';
  for (const b of blocks) {
    md += `${MARKER_START(b.id)}\n${b.content.trim()}\n${MARKER_END(b.id)}\n\n`;
  }
  return { content: md, shouldDelete: false };
}

export interface SnippetSettingKeys { hooks: string[]; env: string[]; }

/** snippet 写入 settings.json 的精确记录:hooks 按事件键内的 Orbit 标记条目追踪,
 *  env 记录写入前的旧值(prior),unassign 时恢复而非粗暴删除 */
export interface SnippetSettingsMeta {
  hooks: string[];
  env: Record<string, { prior: string | null; written: string }>;
}

/** Orbit 注入 hooks 条目时打的标记字段,unassign 时据此精确移除 */
const ORBIT_HOOK_TAG = '_orbitSnippet';

/** 计算 snippet blocks 会写入 settings.json 的键集合(记入快照,供下次清理) */
export function snippetSettingKeys(blocks: { kind: string; content: string }[]): SnippetSettingKeys {
  const hooks = new Set<string>();
  const env = new Set<string>();
  for (const b of blocks) {
    if (b.kind === 'hooks') {
      try { Object.keys(JSON.parse(b.content)).forEach(k => hooks.add(k)); } catch { /* 非 JSON 跳过 */ }
    } else if (b.kind === 'env') {
      for (const line of b.content.split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) env.add(line.slice(0, eq).trim());
      }
    }
  }
  return { hooks: [...hooks], env: [...env] };
}

function isOrbitHookEntry(e: any): boolean {
  return !!e && typeof e === 'object' && ORBIT_HOOK_TAG in e;
}

/** 合并 snippet 的 hooks/env 到 settings.json。
 *  hooks 做条目级合并:Orbit 注入的条目带 _orbitSnippet 标记,清理时只移除
 *  带标记的条目,用户在同一事件键下的自有 hooks 完整保留。
 *  env 记录写入前的旧值,unassign 时恢复;用户改过的值不动。
 *  prevKeys 兼容旧快照(SnippetSettingKeys)——旧键按整键清理。 */
export function mergeSnippetSettings(
  existing: any,
  blocks: { id: string; kind: string; content: string }[],
  prevKeys: SnippetSettingKeys | SnippetSettingsMeta = { hooks: [], env: [] },
): { settings: any; meta: SnippetSettingsMeta } {
  const base = existing ?? {};
  const result = { ...base };
  const target = snippetSettingKeys(blocks);

  const hooks: Record<string, any> = { ...(base.hooks ?? {}) };
  const env: Record<string, string> = { ...(base.env ?? {}) };
  const prevEnvIsMeta = !Array.isArray(prevKeys.env);
  const prevEnvMeta: SnippetSettingsMeta['env'] = prevEnvIsMeta
    ? (prevKeys.env as SnippetSettingsMeta['env'])
    : {};

  // —— hooks 清理:上次涉及的事件键 + 本次目标键,逐条移除 Orbit 标记条目;
  //    旧版快照(env 为数组)的写入未打标记,只能按整键清理(旧行为)
  const hookKeysToScan = new Set([...prevKeys.hooks, ...target.hooks]);
  for (const k of hookKeysToScan) {
    if (!prevEnvIsMeta && prevKeys.hooks.includes(k)) {
      delete hooks[k];
      continue;
    }
    const v = hooks[k];
    if (Array.isArray(v)) {
      const kept = v.filter(e => !isOrbitHookEntry(e));
      if (kept.length > 0) hooks[k] = kept; else delete hooks[k];
    }
  }

  // —— env 清理:恢复写入前的旧值;用户改过的值保留不动
  if (prevEnvIsMeta) {
    for (const [k, rec] of Object.entries(prevEnvMeta)) {
      if (target.env.includes(k)) continue; // 本次仍要写,后面覆盖
      if (env[k] !== rec.written) continue; // 用户改过,不动
      if (rec.prior === null) delete env[k]; else env[k] = rec.prior;
    }
  } else {
    for (const k of prevKeys.env as string[]) {
      if (!target.env.includes(k)) delete env[k];
    }
  }

  // —— 写入当前 blocks
  const meta: SnippetSettingsMeta = { hooks: [], env: {} };
  for (const b of blocks) {
    if (b.kind === 'hooks') {
      try {
        const parsed = JSON.parse(b.content);
        for (const [k, v] of Object.entries(parsed)) {
          const entries = (Array.isArray(v) ? v : [v]).map(e =>
            e && typeof e === 'object' ? { ...e, [ORBIT_HOOK_TAG]: b.id } : e,
          );
          const cur = Array.isArray(hooks[k]) ? hooks[k] : [];
          hooks[k] = [...cur, ...entries];
          if (!meta.hooks.includes(k)) meta.hooks.push(k);
        }
      } catch { /* 非 JSON 的 hook snippet 跳过,由用户手工处理 */ }
    } else if (b.kind === 'env') {
      for (const line of b.content.split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) {
          const k = line.slice(0, eq).trim();
          const written = line.slice(eq + 1).trim();
          // prior 取首次写入前的值:已有记录则沿用,否则取当前文件里的值
          const prior = prevEnvMeta[k] ? prevEnvMeta[k].prior : (env[k] ?? null);
          env[k] = written;
          meta.env[k] = { prior, written };
        }
      }
    }
  }

  if (Object.keys(hooks).length > 0 || 'hooks' in base) result.hooks = hooks;
  if (Object.keys(env).length > 0 || 'env' in base) result.env = env;
  return { settings: result, meta };
}
