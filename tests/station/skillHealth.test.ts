import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanSkillHealth } from '../../src/main/station/skillHealth';
import { emptyState } from '../../src/main/station/store';

describe('scanSkillHealth', () => {
  it('healthy skill with valid sourcePath and SKILL.md', () => {
    const s = emptyState();
    const dir = mkdtempSync(join(tmpdir(), 'sh-'));
    const src = join(dir, 'myskill'); mkdirSync(src);
    writeFileSync(join(src, 'SKILL.md'), '# title');
    s.library.skills['myskill'] = { id: 'myskill', name: 'm', sourcePath: src };
    const h = scanSkillHealth(s);
    expect(h.healthy).toBe(1);
    expect(h.dead).toEqual([]);
    expect(h.incomplete).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('flags missing sourcePath as dead', () => {
    const s = emptyState();
    s.library.skills['dead'] = { id: 'dead', name: 'd', sourcePath: '/nonexistent/foo' };
    const h = scanSkillHealth(s);
    expect(h.dead).toEqual(['dead']);
  });

  it('flags dir without SKILL.md as incomplete', () => {
    const s = emptyState();
    const dir = mkdtempSync(join(tmpdir(), 'sh2-'));
    const src = join(dir, 'noskmd'); mkdirSync(src);
    s.library.skills['bad'] = { id: 'bad', name: 'b', sourcePath: src };
    const h = scanSkillHealth(s);
    expect(h.incomplete).toEqual(['bad']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns zeroes for empty library', () => {
    const h = scanSkillHealth(emptyState());
    expect(h.total).toBe(0);
    expect(h.healthy).toBe(0);
  });
});
