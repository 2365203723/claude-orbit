import { existsSync, mkdirSync, cpSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { orbitPaths } from './paths';
import type { StationState } from './types';
import { saveState } from './store';

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
  cpSync(abs, dest, { recursive: true });

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

