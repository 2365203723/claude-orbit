import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { diagnoseDeadSkills, repairDeadSkills } from '../../src/main/station/skillDoctor';
import { emptyState } from '../../src/main/station/store';
import { copyDirSafe } from '../../src/main/station/copyDir';

function makeSkill(dir: string, name = 'SKILL.md') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), '# skill');
}

describe('diagnoseDeadSkills', () => {
  it('flags missing sourcePath, marks global-copy when global has a healthy copy', () => {
    const home = mkdtempSync(join(tmpdir(), 'doc-'));
    makeSkill(join(home, '.claude', 'skills', 's1')); // healthy global copy
    const s = emptyState();
    s.library.skills['s1'] = { id: 's1', name: 's1', sourcePath: join(home, '.claude-orbit', 'library', 'skills', 's1') };
    const dead = diagnoseDeadSkills(s, home);
    expect(dead).toHaveLength(1);
    expect(dead[0].fixable).toBe('global-copy');
    rmSync(home, { recursive: true, force: true });
  });

  it('marks manual when no global copy and no lock source', () => {
    const home = mkdtempSync(join(tmpdir(), 'doc2-'));
    const s = emptyState();
    s.library.skills['s1'] = { id: 's1', name: 's1', sourcePath: '/nonexistent/s1' };
    const dead = diagnoseDeadSkills(s, home);
    expect(dead[0].fixable).toBe('manual');
    rmSync(home, { recursive: true, force: true });
  });

  it('healthy skill is not reported', () => {
    const home = mkdtempSync(join(tmpdir(), 'doc3-'));
    const src = join(home, 'lib', 's1'); makeSkill(src);
    const s = emptyState();
    s.library.skills['s1'] = { id: 's1', name: 's1', sourcePath: src };
    expect(diagnoseDeadSkills(s, home)).toHaveLength(0);
    rmSync(home, { recursive: true, force: true });
  });
});

describe('repairDeadSkills (global-copy)', () => {
  it('copies global copy into Orbit library and clears the dead link', () => {
    const home = mkdtempSync(join(tmpdir(), 'doc4-'));
    makeSkill(join(home, '.claude', 'skills', 's1'));
    const s = emptyState();
    s.library.skills['s1'] = { id: 's1', name: 's1', sourcePath: join(home, '.claude-orbit', 'library', 'skills', 's1') };
    const { state, report } = repairDeadSkills(s, ['s1'], home);
    expect(report.repaired).toEqual(['s1']);
    expect(diagnoseDeadSkills(state, home)).toHaveLength(0);
    rmSync(home, { recursive: true, force: true });
  });
});

describe('copyDirSafe', () => {
  it('overwrites a self-referential (broken) symlink at dest without ELOOP', () => {
    const home = mkdtempSync(join(tmpdir(), 'doc5-'));
    const src = join(home, 'src'); makeSkill(src);
    const dest = join(home, 'dest');
    symlinkSync(dest, dest); // self-referential broken symlink
    expect(() => copyDirSafe(src, dest)).not.toThrow();
    rmSync(home, { recursive: true, force: true });
  });
});
