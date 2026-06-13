import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function orbit(home: string, args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('npx', ['tsx', join(process.cwd(), 'src/cli/orbit.ts'), ...args, '--json'], {
      env: { ...process.env, HOME: home },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

describe('orbit CLI', () => {
  it('import-skill then list shows it; mount writes symlink; unmount removes it', () => {
    const home = mkdtempSync(join(tmpdir(), 'orbit-cli-'));
    const src = join(home, 'src-skill');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'SKILL.md'), '# test-skill');
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }));

    let r = orbit(home, ['import-skill', src]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).ok).toBe(true);

    r = orbit(home, ['list', 'skills']);
    expect(JSON.parse(r.out).skills).toContain('src-skill');

    r = orbit(home, ['mount', 'skill', 'src-skill', '--project', proj]);
    expect(r.code).toBe(0);
    expect(existsSync(join(proj, '.claude', 'skills', 'src-skill'))).toBe(true);

    r = orbit(home, ['unmount', 'skill', 'src-skill', '--project', proj]);
    expect(r.code).toBe(0);
    expect(existsSync(join(proj, '.claude', 'skills', 'src-skill'))).toBe(false);

    rmSync(home, { recursive: true, force: true });
  }, 60000);

  it('doctor reports no dead links for empty library', () => {
    const home = mkdtempSync(join(tmpdir(), 'orbit-cli2-'));
    const r = orbit(home, ['doctor']);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).dead).toEqual([]);
    rmSync(home, { recursive: true, force: true });
  }, 60000);
});

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
};
function makeGitRepo(skillRel = 'SKILL.md'): string {
  const root = mkdtempSync(join(tmpdir(), 'orbit-cli-repo-'));
  mkdirSync(join(root, skillRel.includes('/') ? skillRel.split('/').slice(0, -1).join('/') : '.'), { recursive: true });
  writeFileSync(join(root, skillRel), '# cli fixture');
  execFileSync('git', ['init', '-q'], { cwd: root, env: GIT_ENV });
  execFileSync('git', ['add', '-A'], { cwd: root, env: GIT_ENV });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: root, stdio: 'pipe', env: GIT_ENV });
  return root;
}

describe('orbit CLI — install from external sources', () => {
  it('install-skill from local git fixture mounts by default; --no-mount skips', () => {
    const home = mkdtempSync(join(tmpdir(), 'orbit-inst-'));
    const repo = makeGitRepo();
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }));

    let r = orbit(home, ['install-skill', repo, '--id', 'gitskill', '--project', proj]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.ok).toBe(true);
    expect(j.mounted).toBe(true);
    expect(existsSync(join(proj, '.claude', 'skills', 'gitskill'))).toBe(true);

    // --no-mount variant (rename to avoid collision)
    r = orbit(home, ['install-skill', repo, '--id', 'gitskill2', '--no-mount', '--project', proj]);
    expect(JSON.parse(r.out).mounted).toBe(false);
    expect(existsSync(join(proj, '.claude', 'skills', 'gitskill2'))).toBe(false);

    rmSync(home, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true });
  }, 60000);

  it('add-mcp stdio adds def with hasSecrets, then mount writes local scope', () => {
    const home = mkdtempSync(join(tmpdir(), 'orbit-mcp-'));
    const proj = join(home, 'proj'); mkdirSync(proj, { recursive: true });
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }));

    let r = orbit(home, ['add-mcp', 'srv', '--command', 'npx', '--args', '-y,@foo/bar', '--env', 'API_KEY=x']);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.hasSecrets).toBe(true);
    expect(j.def.command).toBe('npx');

    r = orbit(home, ['list', 'mcp']);
    expect(JSON.parse(r.out).mcp).toContain('srv');

    r = orbit(home, ['mount', 'mcp', 'srv', '--project', proj]);
    expect(r.code).toBe(0);
    const cj = JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8'));
    expect(cj.projects[proj].mcpServers.srv.command).toBe('npx');

    rmSync(home, { recursive: true, force: true });
  }, 60000);

  it('add-mcp http (no secrets)', () => {
    const home = mkdtempSync(join(tmpdir(), 'orbit-mcp2-'));
    const r = orbit(home, ['add-mcp', 'remote', '--type', 'http', '--url', 'https://x.example/mcp']);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.def.url).toBe('https://x.example/mcp');
    expect(j.hasSecrets).toBe(false);
    rmSync(home, { recursive: true, force: true });
  }, 60000);

  it('import-mcp pulls an existing global ~/.claude.json MCP into the library', () => {
    const home = mkdtempSync(join(tmpdir(), 'orbit-imcp-'));
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: { existing: { command: 'foo' } } }));
    const r = orbit(home, ['import-mcp', 'existing']);
    expect(r.code).toBe(0);
    const list = orbit(home, ['list', 'mcp']);
    expect(JSON.parse(list.out).mcp).toContain('existing');
    rmSync(home, { recursive: true, force: true });
  }, 60000);

  it('error paths: add-mcp without command/url, import-mcp missing, install-skill no SKILL.md', () => {
    const home = mkdtempSync(join(tmpdir(), 'orbit-err-'));
    expect(JSON.parse(orbit(home, ['add-mcp', 'bad']).out).ok).toBe(false);
    expect(JSON.parse(orbit(home, ['import-mcp', 'nope']).out).ok).toBe(false);
    // a git repo with no SKILL.md
    const root = mkdtempSync(join(tmpdir(), 'orbit-nos-'));
    writeFileSync(join(root, 'README.md'), 'x');
    execFileSync('git', ['init', '-q'], { cwd: root, env: GIT_ENV });
    execFileSync('git', ['add', '-A'], { cwd: root, env: GIT_ENV });
    execFileSync('git', ['commit', '-qm', 'i'], { cwd: root, stdio: 'pipe', env: GIT_ENV });
    expect(JSON.parse(orbit(home, ['install-skill', root, '--no-mount']).out).ok).toBe(false);
    rmSync(home, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true });
  }, 60000);
});
