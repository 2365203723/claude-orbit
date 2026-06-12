// 能力种类色的唯一来源 —— 指向 tokens.css 的 CSS 变量,深浅主题自动切换。
// 绝不在组件里写死 hex。
export type CapabilityKind = 'mcp' | 'skill' | 'plugin' | 'snippet' | 'bundle';

export const KIND_COLOR: Record<CapabilityKind, string> = {
  mcp: 'var(--kind-mcp)',
  skill: 'var(--kind-skill)',
  plugin: 'var(--kind-plugin)',
  snippet: 'var(--kind-snippet)',
  bundle: 'var(--kind-bundle)',
};

// DetailPanel 等处使用首字母大写的展示态 kind('MCP'|'Skill'|'Plugin')——归一化后查色
export function kindColorOf(kind: string): string {
  const k = kind.toLowerCase() as CapabilityKind;
  return KIND_COLOR[k] ?? 'var(--text-muted)';
}
