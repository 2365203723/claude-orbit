import { existsSync, statSync } from 'node:fs';
import type { StationState } from './types';

export interface SkillHealth {
  total: number;
  /** sourcePath 可访问且含 SKILL.md 或目录非空的 skill 数 */
  healthy: number;
  /** sourcePath 不存在或不可读 */
  dead: string[];
  /** sourcePath 存在但无 SKILL.md(可能是损坏的安装) */
  incomplete: string[];
}

/** 扫描 library 中所有 skill 的 sourcePath 健康状态,供 UI 展示警告 */
export function scanSkillHealth(state: StationState): SkillHealth {
  const dead: string[] = [];
  const incomplete: string[] = [];
  for (const [id, entry] of Object.entries(state.library.skills)) {
    const src = entry.sourcePath;
    if (!src) { dead.push(id); continue; }
    try {
      if (!existsSync(src)) { dead.push(id); continue; }
      const st = statSync(src);
      if (!st.isDirectory()) { dead.push(id); continue; }
      // 目录存在,检查是否有 SKILL.md
      if (!existsSync(`${src}/SKILL.md`)) { incomplete.push(id); continue; }
    } catch {
      dead.push(id);
    }
  }
  const healthy = Object.keys(state.library.skills).length - dead.length - incomplete.length;
  return { total: Object.keys(state.library.skills).length, healthy, dead, incomplete };
}
