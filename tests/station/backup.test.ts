import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupFiles } from '../../src/main/station/backup';
import { orbitPaths } from '../../src/main/station/paths';

describe('backupFiles', () => {
  it('copies existing files into backups/<stamp>/, skips missing', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-bk-'));
    const f1 = join(home, 'a.json'); writeFileSync(f1, '{"x":1}');
    const missing = join(home, 'gone.json');
    const dir = backupFiles([f1, missing], '20260608-000000', home);
    expect(dir).toBe(join(orbitPaths(home).backupsDir, '20260608-000000'));
    const files = readdirSync(dir).filter(n => n !== 'manifest.json');
    expect(files.length).toBe(1);
    expect(readFileSync(join(dir, files[0]), 'utf8')).toBe('{"x":1}');
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    expect(manifest.files[files[0]].originalPath).toBe(f1);
    rmSync(home, { recursive: true, force: true });
  });
});

import { listBackups, restoreBackup } from '../../src/main/station/backup';

describe('backup restore + retention', () => {
  it('round-trips backup -> modify -> restore', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-bk2-'));
    const f = join(home, '.claude.json');
    writeFileSync(f, '{"x":1}');
    backupFiles([f], 'stamp-a', home);
    writeFileSync(f, '{"x":2}');
    const restored = restoreBackup('stamp-a', home);
    expect(restored).toEqual([f]);
    expect(readFileSync(f, 'utf8')).toBe('{"x":1}');
    rmSync(home, { recursive: true, force: true });
  });

  it('listBackups returns stamps with manifest summaries, newest first', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-bk3-'));
    const f = join(home, '.claude.json'); writeFileSync(f, '{}');
    backupFiles([f], '2026-01-01', home);
    backupFiles([f], '2026-02-02', home);
    const list = listBackups(home);
    expect(list.map(b => b.stamp)).toEqual(['2026-02-02', '2026-01-01']);
    expect(list[0].files[0].originalPath).toBe(f);
    rmSync(home, { recursive: true, force: true });
  });

  it('prunes oldest stamps beyond retention limit', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-bk4-'));
    const f = join(home, '.claude.json'); writeFileSync(f, '{}');
    for (let i = 0; i < 55; i++) backupFiles([f], `stamp-${String(i).padStart(3, '0')}`, home);
    const stamps = readdirSync(orbitPaths(home).backupsDir).sort();
    expect(stamps.length).toBe(50);
    expect(stamps[0]).toBe('stamp-005');
    rmSync(home, { recursive: true, force: true });
  });

  it('restore skips paths outside allowed roots', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-bk5-'));
    const f = join(home, '.claude.json'); writeFileSync(f, '{"ok":1}');
    const dir = backupFiles([f], 'stamp-x', home);
    // 篡改清单使其指向沙箱外
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    for (const k of Object.keys(manifest.files)) manifest.files[k].originalPath = '/etc/evil.json';
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    expect(restoreBackup('stamp-x', home)).toEqual([]);
    rmSync(home, { recursive: true, force: true });
  });

  it('same stamp re-backup keeps the first original copy', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-bk6-'));
    const f = join(home, '.claude.json');
    writeFileSync(f, 'v1');
    backupFiles([f], 'stamp-y', home);
    writeFileSync(f, 'v2');
    backupFiles([f], 'stamp-y', home);
    const restored = restoreBackup('stamp-y', home);
    expect(restored).toEqual([f]);
    expect(readFileSync(f, 'utf8')).toBe('v1');
    rmSync(home, { recursive: true, force: true });
  });
});
