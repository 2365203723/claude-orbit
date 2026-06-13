import { existsSync, statSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { orbitPaths } from './paths';
import type { StationState } from './types';
import { saveState } from './store';
import { syncSkillIntoOrbitLibrary } from './skillLibrarySync';
import { copyDirSafe } from './copyDir';
import { cloneRepoShallow, locateSkillDir } from './installSkill';

export interface DeadSkill {
  id: string;
  sourcePath: string;
  /** lock 文件记录的 Git 来源(若有) */
  sourceUrl?: string;
  /** 仓库内 SKILL.md 相对路径 */
  skillPath?: string;
  /** 全局是否还有健康副本可直接复制 */
  globalCopy?: string;
  /** 可修复策略 */
  fixable: 'global-copy' | 'git-clone' | 'manual';
}

function skillHealthy(dir: string): boolean {
  try {
    return !!dir && statSync(dir).isDirectory() && existsSync(join(dir, 'SKILL.md'));
  } catch { return false; }
}

function readLock(home: string): Record<string, any> {
  const lockPath = join(home, '.agents', '.skill-lock.json');
  try { return JSON.parse(readFileSync(lockPath, 'utf8')).skills ?? {}; } catch { return {}; }
}

/** 列出所有死链/不完整的 skill,并标注每个能用什么策略修复 */
export function diagnoseDeadSkills(state: StationState, home: string = homedir()): DeadSkill[] {
  const lock = readLock(home);
  const globalDirs = [join(home, '.claude', 'skills'), join(home, '.agents', 'skills')];
  const result: DeadSkill[] = [];

  for (const [id, entry] of Object.entries(state.library.skills)) {
    if (skillHealthy(entry.sourcePath)) continue;

    // 1) 全局是否还有健康副本
    let globalCopy: string | undefined;
    for (const gd of globalDirs) {
      const cand = join(gd, id);
      if (skillHealthy(cand)) { globalCopy = cand; break; }
    }

    const info = lock[id] ?? {};
    const fixable: DeadSkill['fixable'] =
      globalCopy ? 'global-copy' : (info.sourceUrl ? 'git-clone' : 'manual');

    result.push({
      id,
      sourcePath: entry.sourcePath,
      sourceUrl: info.sourceUrl,
      skillPath: info.skillPath,
      globalCopy,
      fixable,
    });
  }
  return result;
}

export interface RepairReport {
  repaired: string[];
  failed: { id: string; reason: string }[];
  manual: string[];
}

/** 修复指定的死链 skill。global-copy 直接复制;git-clone 按 lock 来源拉取;manual 跳过。 */
export function repairDeadSkills(
  state: StationState,
  ids: string[],
  home: string = homedir(),
): { state: StationState; report: RepairReport } {
  const dead = diagnoseDeadSkills(state, home);
  const target = new Map(dead.filter(d => ids.includes(d.id)).map(d => [d.id, d]));
  const libDir = join(orbitPaths(home).orbitDir, 'library', 'skills');
  mkdirSync(libDir, { recursive: true });

  const report: RepairReport = { repaired: [], failed: [], manual: [] };
  let next = state;

  // global-copy: 逐个复制
  for (const d of target.values()) {
    if (d.fixable !== 'global-copy' || !d.globalCopy) continue;
    try {
      if (syncSkillIntoOrbitLibrary(next, d.id, d.globalCopy, home)) report.repaired.push(d.id);
      else report.failed.push({ id: d.id, reason: '复制后仍不健康' });
    } catch (e: any) {
      report.failed.push({ id: d.id, reason: e?.message ?? String(e) });
    }
  }

  // git-clone: 按仓库聚合,clone 一次修多个
  const byRepo = new Map<string, DeadSkill[]>();
  for (const d of target.values()) {
    if (d.fixable !== 'git-clone' || !d.sourceUrl) continue;
    const arr = byRepo.get(d.sourceUrl) ?? [];
    arr.push(d); byRepo.set(d.sourceUrl, arr);
  }
  for (const [url, items] of byRepo) {
    let cloned: { tmp: string; repo: string };
    try {
      cloned = cloneRepoShallow(url);
    } catch (e: any) {
      for (const d of items) report.failed.push({ id: d.id, reason: e?.message ?? String(e) });
      continue;
    }
    const { tmp, repo } = cloned;
    try {
      for (const d of items) {
        try {
          // doctor 是 overwrite-in-place,用低层 locateSkillDir 而非带冲突 guard 的 installSkillFromGit
          const srcDir = locateSkillDir(repo, d.skillPath, d.id);
          const dest = join(libDir, d.id);
          copyDirSafe(srcDir, dest);
          next.library.skills[d.id] = { id: d.id, name: d.id, sourcePath: dest };
          report.repaired.push(d.id);
        } catch (e: any) {
          report.failed.push({ id: d.id, reason: e?.message ?? String(e) });
        }
      }
    } finally {
      try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ }
    }
  }

  for (const d of target.values()) {
    if (d.fixable === 'manual') report.manual.push(d.id);
  }

  if (report.repaired.length > 0) saveState(next, home);
  return { state: next, report };
}
