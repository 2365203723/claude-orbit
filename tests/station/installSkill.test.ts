import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeGitUrl, locateSkillDir, installSkillFromGit } from '../../src/main/station/installSkill';
import { diagnoseDeadSkills } from '../../src/main/station/skillDoctor';
import { emptyState } from '../../src/main/station/store';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
};

/** 在 root 建一个含 SKILL.md 的本地 git repo,返回 root(可直接当 opts.url,离线 clone) */
function makeGitRepo(root: string, skillRels: string[]): string {
  for (const rel of skillRels) {
    const dir = join(root, dirname(rel));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(root, rel), '# fixture skill');
  }
  const git = (...a: string[]) => execFileSync('git', a, { cwd: root, stdio: 'pipe', env: GIT_ENV });
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'init');
  return root;
}

describe('normalizeGitUrl', () => {
  it('owner/repo → github https', () => {
    expect(normalizeGitUrl('acme/skills')).toBe('https://github.com/acme/skills.git');
    expect(normalizeGitUrl('acme/skills.git')).toBe('https://github.com/acme/skills.git');
  });
  it('full URL passes through', () => {
    expect(normalizeGitUrl('https://github.com/a/b.git')).toBe('https://github.com/a/b.git');
    expect(normalizeGitUrl('git@github.com:a/b.git')).toBe('git@github.com:a/b.git');
  });
  it('throws on garbage', () => {
    expect(() => normalizeGitUrl('not a url at all !!!')).toThrow();
  });
});

describe('installSkillFromGit (offline local git)', () => {
  it('top-level SKILL.md installs + records provenance', () => {
    const home = mkdtempSync(join(tmpdir(), 'inst-'));
    const repo = makeGitRepo(mkdtempSync(join(tmpdir(), 'repo-')), ['SKILL.md']);
    const { state, id, sourcePath } = installSkillFromGit(emptyState(), { url: repo, id: 'mine', home });
    expect(id).toBe('mine');
    expect(existsSync(join(sourcePath, 'SKILL.md'))).toBe(true);
    expect(state.library.skills['mine'].sourcePath).toBe(sourcePath);
    const lock = JSON.parse(readFileSync(join(home, '.agents', '.skill-lock.json'), 'utf8'));
    expect(lock.skills['mine'].sourceUrl).toBeTruthy();
    rmSync(home, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true });
  });

  it('auto-locates skills/<name>/SKILL.md (single)', () => {
    const home = mkdtempSync(join(tmpdir(), 'inst2-'));
    const repo = makeGitRepo(mkdtempSync(join(tmpdir(), 'repo2-')), ['skills/cool-skill/SKILL.md']);
    const { id } = installSkillFromGit(emptyState(), { url: repo, home });
    expect(id).toBe('cool-skill');
    rmSync(home, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true });
  });

  it('explicit --skill-path picks a nested skill', () => {
    const home = mkdtempSync(join(tmpdir(), 'inst3-'));
    const repo = makeGitRepo(mkdtempSync(join(tmpdir(), 'repo3-')), ['skills/a/SKILL.md', 'skills/b/SKILL.md']);
    const { id } = installSkillFromGit(emptyState(), { url: repo, skillPath: 'skills/b', home });
    expect(id).toBe('b');
    rmSync(home, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true });
  });

  it('monorepo with multiple skills + no skill-path throws listing candidates', () => {
    const home = mkdtempSync(join(tmpdir(), 'inst4-'));
    const repo = makeGitRepo(mkdtempSync(join(tmpdir(), 'repo4-')), ['skills/a/SKILL.md', 'skills/b/SKILL.md']);
    expect(() => installSkillFromGit(emptyState(), { url: repo, home })).toThrow(/多个/);
    rmSync(home, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true });
  });

  it('repo without SKILL.md throws', () => {
    const home = mkdtempSync(join(tmpdir(), 'inst5-'));
    const root = mkdtempSync(join(tmpdir(), 'repo5-'));
    writeFileSync(join(root, 'README.md'), 'no skill here');
    execFileSync('git', ['init', '-q'], { cwd: root, env: GIT_ENV });
    execFileSync('git', ['add', '-A'], { cwd: root, env: GIT_ENV });
    execFileSync('git', ['commit', '-qm', 'init'], { cwd: root, stdio: 'pipe', env: GIT_ENV });
    expect(() => installSkillFromGit(emptyState(), { url: root, home })).toThrow(/未找到 SKILL.md/);
    rmSync(home, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true });
  });

  it('id collision throws on second install', () => {
    const home = mkdtempSync(join(tmpdir(), 'inst6-'));
    const repo = makeGitRepo(mkdtempSync(join(tmpdir(), 'repo6-')), ['SKILL.md']);
    const { state } = installSkillFromGit(emptyState(), { url: repo, id: 'dup', home });
    expect(() => installSkillFromGit(state, { url: repo, id: 'dup', home })).toThrow(/已存在/);
    rmSync(home, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true });
  });

  it('provenance lock lets doctor flag a deleted skill as git-clone fixable', () => {
    const home = mkdtempSync(join(tmpdir(), 'inst7-'));
    const repo = makeGitRepo(mkdtempSync(join(tmpdir(), 'repo7-')), ['SKILL.md']);
    const { state, sourcePath } = installSkillFromGit(emptyState(), { url: repo, id: 'gone', home });
    rmSync(sourcePath, { recursive: true, force: true }); // simulate the library copy vanishing
    const dead = diagnoseDeadSkills(state, home);
    const entry = dead.find(d => d.id === 'gone');
    expect(entry?.fixable).toBe('git-clone');
    rmSync(home, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true });
  });
});

describe('locateSkillDir', () => {
  it('returns repo root when top-level SKILL.md', () => {
    const repo = mkdtempSync(join(tmpdir(), 'loc-'));
    writeFileSync(join(repo, 'SKILL.md'), '#');
    expect(locateSkillDir(repo)).toBe(repo);
    rmSync(repo, { recursive: true, force: true });
  });
});
