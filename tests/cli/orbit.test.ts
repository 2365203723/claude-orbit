import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
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
