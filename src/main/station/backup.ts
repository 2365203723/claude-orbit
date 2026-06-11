import { copyFileSync, existsSync, mkdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { orbitPaths } from './paths';

export function backupFiles(files: string[], stamp: string, home: string = homedir()): string {
  const dir = join(orbitPaths(home).backupsDir, stamp);
  mkdirSync(dir, { recursive: true });
  for (const f of files) {
    if (!existsSync(f)) continue;
    // 只备份普通文件——变更清单里也含 skills 目录路径(常是 symlink-to-dir),
    // copyFileSync 复制目录/符号链接会抛 ENOTSUP。skill 装配是建/删 symlink,
    // 可由 state 重建,无需文件备份,跳过即可。
    let st;
    try { st = lstatSync(f); } catch { continue; }
    if (!st.isFile()) continue;
    const flat = f.replace(/[/\\]/g, '__').replace(/^__+/, '');
    copyFileSync(f, join(dir, flat));
  }
  return dir;
}
