import { join } from 'node:path';
import { homedir } from 'node:os';

export interface Paths {
  claudeJson: string;        // ~/.claude.json
  globalSkillsDir: string;   // ~/.claude/skills
  agentsSkillsDir: string;   // ~/.agents/skills (alternative skill install location)
  installedPlugins: string;  // ~/.claude/plugins/installed_plugins.json
  globalSettings: string;    // ~/.claude/settings.json
}

export function resolvePaths(home: string = homedir()): Paths {
  return {
    claudeJson: join(home, '.claude.json'),
    globalSkillsDir: join(home, '.claude', 'skills'),
    agentsSkillsDir: join(home, '.agents', 'skills'),
    installedPlugins: join(home, '.claude', 'plugins', 'installed_plugins.json'),
    globalSettings: join(home, '.claude', 'settings.json'),
  };
}

// 项目内文件路径
export function projectMcpJson(projectPath: string): string {
  return join(projectPath, '.mcp.json');
}
export function projectSkillsDir(projectPath: string): string {
  return join(projectPath, '.claude', 'skills');
}
export function projectSettings(projectPath: string): string {
  return join(projectPath, '.claude', 'settings.json');
}
