import { copyFileSync, existsSync, mkdirSync, lstatSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { orbitPaths } from './paths';
import { writeJsonAtomic, writeTextAtomic, readJsonStrict } from './safeJson';

/** 每个 stamp 目录内的清单:扁平文件名 → 原始绝对路径,消除路径压平的不可逆性 */
export interface BackupManifest {
  files: Record<string, { originalPath: string; mtimeMs: number; size: number }>;
}

const MANIFEST = 'manifest.json';
/** 备份保留数量上限——超过后修剪最旧的 stamp 目录 */
const MAX_BACKUPS = 50;

export function backupFiles(files: string[], stamp: string, home: string = homedir()): string {
  const backupsDir = orbitPaths(home).backupsDir;
  const dir = join(backupsDir, stamp);
  mkdirSync(dir, { recursive: true });
  // 同一 stamp 可能被多次调用(bundle 逐项写入)——合并清单,且不覆盖已有副本
  let manifest: BackupManifest = { files: {} };
  try { manifest = readJsonStrict(join(dir, MANIFEST)) ?? { files: {} }; } catch { /* 清单损坏则重建 */ }
  for (const f of files) {
    if (!existsSync(f)) continue;
    // 只备份普通文件——变更清单里也含 skills 目录路径(常是 symlink-to-dir),
    // copyFileSync 复制目录/符号链接会抛 ENOTSUP。skill 装配是建/删 symlink,
    // 可由 state 重建,无需文件备份,跳过即可。
    let st;
    try { st = lstatSync(f); } catch { continue; }
    if (!st.isFile()) continue;
    const flat = f.replace(/[/\\]/g, '__').replace(/^__+/, '');
    if (manifest.files[flat]) continue; // 同 stamp 已备份过,保留最初的原始副本
    copyFileSync(f, join(dir, flat));
    manifest.files[flat] = { originalPath: resolve(f), mtimeMs: st.mtimeMs, size: st.size };
  }
  writeJsonAtomic(join(dir, MANIFEST), manifest);
  pruneBackups(backupsDir);
  return dir;
}

// 超出保留上限时删除最旧的 stamp 目录(stamp 为 ISO 时间串,字典序即时间序)
function pruneBackups(backupsDir: string): void {
  let stamps: string[];
  try {
    stamps = readdirSync(backupsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch { return; }
  for (const old of stamps.slice(0, Math.max(0, stamps.length - MAX_BACKUPS))) {
    try { rmSync(join(backupsDir, old), { recursive: true, force: true }); } catch { /* 忽略 */ }
  }
}

export interface BackupSummary { stamp: string; files: { originalPath: string; size: number }[]; }

export function listBackups(home: string = homedir()): BackupSummary[] {
  const backupsDir = orbitPaths(home).backupsDir;
  if (!existsSync(backupsDir)) return [];
  const out: BackupSummary[] = [];
  for (const e of readdirSync(backupsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = join(backupsDir, e.name);
    let manifest: BackupManifest | undefined;
    try { manifest = readJsonStrict(join(dir, MANIFEST)); } catch { /* 无清单的旧备份 */ }
    if (manifest?.files) {
      out.push({ stamp: e.name, files: Object.values(manifest.files).map(f => ({ originalPath: f.originalPath, size: f.size })) });
    } else {
      // 旧格式(无 manifest)——按扁平名近似还原,仅供展示
      const files = readdirSync(dir).filter(n => n !== MANIFEST).map(n => {
        let size = 0; try { size = statSync(join(dir, n)).size; } catch { /* ignore */ }
        return { originalPath: '/' + n.replace(/__/g, '/'), size };
      });
      out.push({ stamp: e.name, files });
    }
  }
  return out.sort((a, b) => b.stamp.localeCompare(a.stamp));
}

// 恢复路径必须落在预期根内,防止被篡改的清单写出沙箱
function isAllowedRestorePath(p: string, home: string): boolean {
  const abs = resolve(p);
  if (abs === resolve(home, '.claude.json')) return true;
  if (abs.startsWith(resolve(home, '.claude') + '/')) return true;
  if (abs.startsWith(resolve(home) + '/')) {
    // home 内的项目文件,只允许 Orbit 会写的文件名
    const base = abs.split('/').pop()!;
    return ['CLAUDE.md', 'settings.json', '.mcp.json', '.claude.json'].includes(base);
  }
  return false;
}

/** 把指定 stamp 的备份原子地写回各自原始路径,返回成功恢复的路径列表 */
export function restoreBackup(stamp: string, home: string = homedir()): string[] {
  const dir = join(orbitPaths(home).backupsDir, stamp);
  const manifest: BackupManifest | undefined = readJsonStrict(join(dir, MANIFEST));
  if (!manifest?.files) throw new Error(`备份 ${stamp} 缺少 manifest.json,无法自动恢复`);
  const restored: string[] = [];
  for (const [flat, info] of Object.entries(manifest.files)) {
    const src = join(dir, flat);
    if (!existsSync(src)) continue;
    if (!isAllowedRestorePath(info.originalPath, home)) continue;
    writeTextAtomic(info.originalPath, readFileSync(src, 'utf8'));
    restored.push(info.originalPath);
  }
  return restored;
}
