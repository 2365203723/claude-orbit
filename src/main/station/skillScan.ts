import { existsSync, readdirSync, statSync, readFileSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { orbitPaths } from './paths';
import type { StationState } from './types';
import { saveState } from './store';

export interface DiscoveredSkill {
  id: string;
  sourcePath: string;
  /** 该路径是否已被 library 引用(sourcePath) */
  alreadyManaged: boolean;
}

/** 扫描标准 skill 目录,找出所有包含 SKILL.md 的子目录。
 *  返回未注册到 Orbit library 的 skill 列表,供一键导入。 */
export function scanForSkills(home: string = homedir()): DiscoveredSkill[] {
  const knownDirs = [
    join(home, '.claude', 'skills'),
    join(home, '.agents', 'skills'),
  ];

  // 收集所有 library 已知的 sourcePath
  const managed = new Set<string>();
  try {
    const stateFile = join(home, '.claude-orbit', 'state.json');
    const raw = JSON.parse(readFileSync(stateFile, 'utf8'));
    for (const entry of Object.values<any>(raw.library?.skills ?? {})) {
      if (entry.sourcePath) managed.add(entry.sourcePath);
    }
  } catch { /* state 不可用就算了 */ }

  const found: DiscoveredSkill[] = [];
  const seen = new Set<string>();

  for (const dir of knownDirs) {
    if (!existsSync(dir)) continue;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      const fullPath = join(dir, e.name);
      const md = join(fullPath, 'SKILL.md');
      try { if (!statSync(md).isFile()) continue; } catch { continue; }
      found.push({ id: e.name, sourcePath: fullPath, alreadyManaged: managed.has(fullPath) });
    }
  }

  return found;
}

/** 用递归扫描某个目录,找到所有含 SKILL.md 的子目录(深度 2)。
 *  提供给用户自定义扫描路径时使用。 */
export function scanCustomDir(rootDir: string): DiscoveredSkill[] {
  const result: DiscoveredSkill[] = [];
  if (!existsSync(rootDir)) return result;
  try { statSync(rootDir); } catch { return result; }

  function walk(dir: string, depth: number) {
    if (depth > 2) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const fullPath = join(dir, e.name);
      if (existsSync(join(fullPath, 'SKILL.md')))
        result.push({ id: e.name, sourcePath: fullPath, alreadyManaged: false });
      walk(fullPath, depth + 1);
    }
  }

  walk(rootDir, 0);
  return result;
}

/** 批量扫描并导入:从标准位置发现未纳入 Orbit 库的 skill,全部复制入库。
 *  返回更新后的 state 和导入数量。 */
export function importDiscoveredSkills(state: StationState, home: string = homedir()): {
  state: StationState; imported: string[]; skipped: number;
} {
  const discovered = scanForSkills(home);
  const unmanaged = discovered.filter(d => !d.alreadyManaged);

  const libDir = join(orbitPaths(home).orbitDir, 'library', 'skills');
  mkdirSync(libDir, { recursive: true });

  let next = state;
  const imported: string[] = [];
  let skipped = 0;

  for (const d of unmanaged) {
    try {
      const dest = join(libDir, d.id);
      if (existsSync(dest)) { skipped++; continue; }
      cpSync(d.sourcePath, dest, { recursive: true });
      next = {
        ...next,
        library: {
          ...next.library,
          skills: {
            ...next.library.skills,
            [d.id]: { id: d.id, name: d.id, sourcePath: dest },
          },
        },
      };
      imported.push(d.id);
    } catch { skipped++; }
  }

  if (imported.length > 0) saveState(next, home);
  return { state: next, imported, skipped };
}
