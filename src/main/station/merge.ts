import type { McpServerDef } from '../types';

export function mergeMcpJson(
  existing: any,
  servers: Record<string, McpServerDef>,
): any {
  return { ...(existing ?? {}), mcpServers: servers };
}

export function mergeLocalScope(
  existing: any,
  projectPath: string,
  servers: Record<string, McpServerDef>,
): any {
  const base = existing ?? {};
  const projects = { ...(base.projects ?? {}) };
  const proj = { ...(projects[projectPath] ?? {}) };
  proj.mcpServers = servers;
  projects[projectPath] = proj;
  return { ...base, projects };
}

/** 合并 enabledPlugins 到 settings.json,保留其他字段。
 *  同时清理不在 target 里的旧条目——否则 unassign 后永远删不掉。 */
export function mergePluginSettings(
  existing: any,
  enabledPlugins: Record<string, boolean>,
): any {
  const base = existing ?? {};
  const current: Record<string, boolean> = { ...(base.enabledPlugins ?? {}) };
  // 删除不在 target 里的插件
  for (const k of Object.keys(current)) {
    if (!(k in enabledPlugins)) delete current[k];
  }
  // 写入 target 里的插件
  for (const [id, on] of Object.entries(enabledPlugins)) {
    if (on) current[id] = true; else delete current[id];
  }
  return { ...base, enabledPlugins: current };
}

const MARKER_START = (id: string) => `<!-- CLAUDE_STATION:SNIPPET:${id}:START -->`;
const MARKER_END = (id: string) => `<!-- CLAUDE_STATION:SNIPPET:${id}:END -->`;

/** 在 CLAUDE.md 中按标记注入/更新/删除 snippet 内容块 */
export function mergeSnippetClaudeMd(
  existingMd: string | undefined,
  blocks: { id: string; content: string }[],
): string | null {
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
      if (ei === -1) break;
      md = md.slice(0, si) + md.slice(ei + end.length);
    }
  }

  // 追加当前 snippet 块
  if (blocks.length === 0) {
    // 清理头部和尾部多余空行
    md = md.replace(/^\n+/, '').replace(/\n{2,}$/g, '').trim();
    return md || null;
  }

  md = md.trimEnd();
  md += '\n\n';
  for (const b of blocks) {
    md += `${MARKER_START(b.id)}\n${b.content.trim()}\n${MARKER_END(b.id)}\n\n`;
  }
  return md || null;
}

/** 合并 snippet 的 hooks/env 到 settings.json */
export function mergeSnippetSettings(
  existing: any,
  blocks: { id: string; kind: string; content: string }[],
): any {
  const base = existing ?? {};
  const result = { ...base };

  const hookBlocks = blocks.filter(b => b.kind === 'hooks');
  if (hookBlocks.length > 0) {
    const hooks: Record<string, any> = {};
    for (const b of hookBlocks) {
      try {
        const parsed = JSON.parse(b.content);
        Object.assign(hooks, parsed);
      } catch {
        // 非 JSON 的 hook snippet 跳过,由用户手工处理
      }
    }
    result.hooks = { ...(result.hooks ?? {}), ...hooks };
  }

  const envBlocks = blocks.filter(b => b.kind === 'env');
  if (envBlocks.length > 0) {
    const env: Record<string, string> = {};
    for (const b of envBlocks) {
      for (const line of b.content.split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
    }
    result.env = { ...(result.env ?? {}), ...env };
  }

  return result;
}
