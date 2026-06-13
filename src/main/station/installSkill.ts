import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { orbitPaths } from './paths';
import { copyDirSafe } from './copyDir';
import { saveState } from './store';
import type { StationState } from './types';

export interface InstallSkillOpts {
  /** owner/repo,完整 git URL,或本地 repo 路径 */
  url: string;
  /** 仓库内 skill 目录或其 SKILL.md 的相对路径 */
  skillPath?: string;
  /** 覆盖 library id(默认取定位到的 skill 目录名) */
  id?: string;
  home?: string;
}
export interface InstallSkillResult { state: StationState; id: string; sourcePath: string; }

/** owner/repo → https://github.com/owner/repo.git;
 *  完整 URL / scp 形式 / 本地已存在路径 → 原样返回(本地路径是离线测试关键) */
export function normalizeGitUrl(url: string): string {
  if (/^(https?:|git@|ssh:|git:|file:)/.test(url) || url.includes('://')) return url;
  if (existsSync(url)) return resolve(url);
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    const repo = url.replace(/\.git$/, '');
    return `https://github.com/${repo}.git`;
  }
  throw new Error(`无法识别的 skill 源: ${url}`);
}

/** git clone --depth 1 到临时目录。调用方负责 rmSync(tmp)。 */
export function cloneRepoShallow(url: string): { tmp: string; repo: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'orbit-install-'));
  const repo = join(tmp, 'r');
  try {
    execFileSync('git', ['clone', '--depth', '1', url, repo], { stdio: 'pipe', timeout: 120000 });
  } catch (e: any) {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ }
    const stderr = e?.stderr ? String(e.stderr).trim() : (e?.message ?? String(e));
    throw new Error(`clone 失败: ${stderr}`);
  }
  return { tmp, repo };
}

function hasSkillMd(dir: string): boolean {
  return existsSync(join(dir, 'SKILL.md'));
}

/** 在已 clone 的仓库内定位 skill 源目录。
 *  - 显式 skillPath:sm 后缀去掉文件名;否则当目录;并容忍 join(skillPath, idHint) 形式(兼容旧 lock)
 *  - 无 skillPath:搜 repo/SKILL.md、repo/skills/*​/、repo/*​/;0 个抛"未找到",多个抛"含多个" */
export function locateSkillDir(repo: string, skillPath?: string, idHint?: string): string {
  if (skillPath) {
    const candidates = [
      basename(skillPath) === 'SKILL.md' ? join(repo, dirname(skillPath)) : join(repo, skillPath),
      idHint ? join(repo, skillPath, idHint) : '',
    ].filter(Boolean);
    for (const c of candidates) if (hasSkillMd(c)) return c;
    throw new Error(`--skill-path 指向的目录没有 SKILL.md: ${skillPath}`);
  }

  const found = new Set<string>();
  if (hasSkillMd(repo)) found.add(repo);
  for (const sub of ['skills', '.']) {
    const base = join(repo, sub);
    if (!existsSync(base)) continue;
    let entries;
    try { entries = readdirSync(base, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const d = join(base, e.name);
      if (hasSkillMd(d)) found.add(d);
    }
  }

  const list = [...found];
  if (list.length === 0) throw new Error('仓库内未找到 SKILL.md');
  if (list.length > 1) {
    const names = list.map(d => basename(d)).join(', ');
    throw new Error(`仓库含多个 skill,请用 --skill-path 指定其一: ${names}`);
  }
  return list[0];
}

/** 把溯源写进 ~/.agents/.skill-lock.json,供未来 doctor 重新 clone 修复。
 *  失败不影响安装本身。 */
function writeLockProvenance(home: string, id: string, sourceUrl: string, repoRelPath: string): void {
  try {
    const lockPath = join(home, '.agents', '.skill-lock.json');
    let lock: any = { skills: {} };
    if (existsSync(lockPath)) {
      try { lock = JSON.parse(readFileSync(lockPath, 'utf8')); } catch { lock = { skills: {} }; }
    }
    lock.skills ??= {};
    lock.skills[id] = {
      ...(lock.skills[id] ?? {}),
      source: sourceUrl,
      sourceType: 'github',
      sourceUrl,
      skillPath: repoRelPath ? `${repoRelPath}/SKILL.md` : 'SKILL.md',
    };
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  } catch { /* 溯源写入失败不致命 */ }
}

/** 从 git 源安装 skill 进 Orbit 库(带 id 冲突 guard)。 */
export function installSkillFromGit(state: StationState, opts: InstallSkillOpts): InstallSkillResult {
  const home = opts.home ?? homedir();
  const url = normalizeGitUrl(opts.url);
  const { tmp, repo } = cloneRepoShallow(url);
  try {
    const srcDir = locateSkillDir(repo, opts.skillPath, opts.id);
    if (!hasSkillMd(srcDir)) throw new Error('仓库内未找到 SKILL.md');

    const id = opts.id ?? basename(srcDir);
    const libDir = join(orbitPaths(home).orbitDir, 'library', 'skills');
    mkdirSync(libDir, { recursive: true });
    const dest = join(libDir, id);

    // id 冲突 guard:库里已有且 dest 健康才拒绝(沿用 importSkill 语义)
    if (state.library.skills[id] && hasSkillMd(dest)) {
      throw new Error(`Skill "${id}" 已存在于 Orbit 库(用 --id 改名或先 unmount)`);
    }

    copyDirSafe(srcDir, dest);
    const next: StationState = {
      ...state,
      library: {
        ...state.library,
        skills: { ...state.library.skills, [id]: { id, name: id, sourcePath: dest } },
      },
    };

    // repo 内相对路径(写溯源用)
    const repoRel = srcDir === repo ? '' : srcDir.slice(repo.length + 1);
    writeLockProvenance(home, id, url, repoRel);

    saveState(next, home);
    return { state: next, id, sourcePath: dest };
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ }
  }
}
