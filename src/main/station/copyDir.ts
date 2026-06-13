import { existsSync, mkdirSync, readdirSync, lstatSync, copyFileSync, symlinkSync, readlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** 递归复制目录,逐项处理——绕开 node cpSync 在某些 macOS 文件系统上
 *  对 `equivalent` 检查抛 "Operation not supported" 的 bug。
 *  symlink 原样复制(verbatim),不解引用。 */
export function copyDirSafe(src: string, dest: string): void {
  // lstat 检测:坏死 symlink 时 existsSync 返回 false,直接 mkdir 会撞 ELOOP
  try { lstatSync(dest); rmSync(dest, { recursive: true, force: true }); } catch { /* 不存在 */ }
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    let st;
    try { st = lstatSync(s); } catch { continue; }
    if (st.isSymbolicLink()) {
      try { symlinkSync(readlinkSync(s), d); } catch { /* 跳过损坏链接 */ }
    } else if (st.isDirectory()) {
      copyDirSafe(s, d);
    } else if (st.isFile()) {
      copyFileSync(s, d);
    }
    // 设备/管道等特殊文件直接跳过
  }
}
