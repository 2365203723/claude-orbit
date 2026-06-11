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
    const files = readdirSync(dir);
    expect(files.length).toBe(1);
    expect(readFileSync(join(dir, files[0]), 'utf8')).toBe('{"x":1}');
    rmSync(home, { recursive: true, force: true });
  });
});
