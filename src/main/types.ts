export type CapabilityKind = 'mcp' | 'skill' | 'plugin';

export interface McpServerDef {
  type?: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

// MCP 来源作用域:user=~/.claude.json 顶层(全局注入),
// project-mcpjson=项目根 .mcp.json,project-local=~/.claude.json 的 projects[路径].mcpServers
export type McpScope = 'user' | 'project-mcpjson' | 'project-local';

export interface McpCapability {
  id: string;            // server 名,如 "firecrawl"
  scope: McpScope;
  def: McpServerDef;
  hasSecrets: boolean;   // env 是否含值(用于 UI 标记)
}

export interface SkillCapability {
  id: string;            // skill 目录名
  scope: 'user' | 'project';
  path: string;          // 绝对路径
}

export interface PluginCapability {
  id: string;            // 如 "superpowers@claude-plugins-official"
  enabled: boolean;
}

export interface ProjectState {
  path: string;
  mcp: McpCapability[];
  skills: SkillCapability[];
  plugins: PluginCapability[];
}

export interface InferredState {
  userScope: {
    mcp: McpCapability[];
    skills: SkillCapability[];
    plugins: PluginCapability[];
  };
  projects: ProjectState[];
}
