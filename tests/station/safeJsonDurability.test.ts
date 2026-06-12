import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeJsonAtomic, writeTextAtomic, sweepStaleTempFiles, readJsonStrict } from '../../src/main/station/safeJson';

describe('writeJsonAtomic durability', () => {
  it('writes valid JSON and leaves no tmp file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aj-'));
    const f = join(dir, 'out.json');
    writeJsonAtomic(f, { a: 1, b: [2, 3] });
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ a: 1, b: [2, 3] });
    expect(existsSync(`${f}.orbit-tmp`)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('overwrites existing file atomically', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aj2-'));
    const f = join(dir, 'out.json');
    writeFileSync(f, JSON.stringify({ old: true }));
    writeJsonAtomic(f, { new: true });
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ new: true });
    rmSync(dir, { recursive: true, force: true });
  });

  it('writeTextAtomic round-trips and leaves no tmp', () => {
    const dir = mkdtempSync(join(tmpdir(), 'at-'));
    const f = join(dir, 'CLAUDE.md');
    writeTextAtomic(f, '# Title\n\nbody');
    expect(readFileSync(f, 'utf8')).toBe('# Title\n\nbody');
    expect(existsSync(`${f}.orbit-tmp`)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('sweepStaleTempFiles', () => {
  it('removes orphaned *.orbit-tmp files, leaves real files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sweep-'));
    writeFileSync(join(dir, '.claude.json'), '{}');
    writeFileSync(join(dir, '.claude.json.orbit-tmp'), '{ truncated');
    writeFileSync(join(dir, 'settings.json.orbit-tmp'), 'partial');
    sweepStaleTempFiles(dir);
    expect(existsSync(join(dir, '.claude.json'))).toBe(true);
    expect(existsSync(join(dir, '.claude.json.orbit-tmp'))).toBe(false);
    expect(existsSync(join(dir, 'settings.json.orbit-tmp'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('is a no-op on a missing directory', () => {
    expect(() => sweepStaleTempFiles('/nonexistent/dir/xyz')).not.toThrow();
  });

  it('a swept temp file does not pollute a subsequent strict read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sweep2-'));
    const f = join(dir, '.claude.json');
    writeJsonAtomic(f, { ok: 1 });
    writeFileSync(`${f}.orbit-tmp`, '{ broken');
    sweepStaleTempFiles(dir);
    expect(readJsonStrict(f)).toEqual({ ok: 1 });
    rmSync(dir, { recursive: true, force: true });
  });
});
