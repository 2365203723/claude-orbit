import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { orbitPaths } from './paths';
import { copyDirSafe } from './copyDir';
import type { StationState } from './types';
import type { McpServerDef } from '../types';
import { saveState } from './store';
import { listGlobalMcp } from './globalSettings';

/** 把本机任意 skill 目录复制进 Orbit 库,并注册到 library。
 *  返回更新后的 state(已 save)。副本不存在、无 SKILL.md、或 id 冲突时抛错。 */
export function importSkill(state: StationState, sourcePath: string, home: string = homedir()): StationState {
  const abs = resolve(sourcePath);
  if (!existsSync(abs)) throw new Error(`Skill 源目录不存在: ${abs}`);
  const st = statSync(abs);
  if (!st.isDirectory()) throw new Error(`Skill 源必须是目录: ${abs}`);
  if (!existsSync(join(abs, 'SKILL.md'))) throw new Error(`Skill 目录缺少 SKILL.md: ${abs}`);

  const id = basename(abs);
  const libDir = join(orbitPaths(home).orbitDir, 'library', 'skills');
  const dest = join(libDir, id);

  if (existsSync(dest)) throw new Error(`Skill "${id}" 已存在于 Orbit 库`);

  mkdirSync(libDir, { recursive: true });
  copyDirSafe(abs, dest);

  const next: StationState = {
    ...state,
    library: {
      ...state.library,
      skills: {
        ...state.library.skills,
        [id]: { id, name: id, sourcePath: dest },
      },
    },
  };
  saveState(next, home);
  return next;
}

function computeHasSecrets(def: McpServerDef): boolean {
  return !!(def.env && Object.values(def.env).some(v => typeof v === 'string' && v.length > 0));
}

/** 把手动构造的 MCP def 加入 Orbit 库。id 冲突 / def 不合法时抛错。 */
export function addMcpToLibrary(state: StationState, id: string, def: McpServerDef, home: string = homedir()): StationState {
  if (state.library.mcp[id]) throw new Error(`MCP "${id}" 已存在于 Orbit 库`);
  const type = def.type ?? (def.url ? 'http' : 'stdio');
  if (type === 'stdio' && !def.command) throw new Error('stdio 类型 MCP 需要 --command');
  if ((type === 'http' || type === 'sse') && !def.url) throw new Error(`${type} 类型 MCP 需要 --url`);
  const next: StationState = {
    ...state,
    library: {
      ...state.library,
      mcp: { ...state.library.mcp, [id]: { id, def, hasSecrets: computeHasSecrets(def) } },
    },
  };
  saveState(next, home);
  return next;
}

/** 把 ~/.claude.json 里已有的全局 MCP 拉进库。
 *  注意:listGlobalMcp() 用模块级 homedir() 读 ~/.claude.json,不受 home 参数控制。 */
export function importGlobalMcp(state: StationState, id: string, home: string = homedir()): StationState {
  if (state.library.mcp[id]) throw new Error(`MCP "${id}" 已存在于 Orbit 库`);
  const found = listGlobalMcp().find(m => m.id === id);
  if (!found) throw new Error(`全局 ~/.claude.json 中未找到 MCP "${id}"`);
  const next: StationState = {
    ...state,
    library: {
      ...state.library,
      mcp: { ...state.library.mcp, [id]: { id, def: found.def, hasSecrets: found.hasSecrets } },
    },
  };
  saveState(next, home);
  return next;
}
