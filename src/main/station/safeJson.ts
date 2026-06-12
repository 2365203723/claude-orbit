import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, openSync, fsyncSync, closeSync, unlinkSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

/** 读 JSON:文件不存在返回 undefined;存在但解析失败抛错。
 *  用于 ~/.claude.json 等关键文件——解析失败时绝不能当作空对象重写,
 *  否则会清掉用户的 OAuth/历史等全部内容。 */
export function readJsonStrict(file: string): any {
  if (!existsSync(file)) return undefined;
  const raw = readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`ORBIT_ERR::CORRUPT_JSON::${file}`);
  }
}

const TMP_SUFFIX = '.orbit-tmp';

/** 崩溃安全的原子写:
 *  1. 写临时文件并 fsync(确保数据真正落盘,而非停留在 OS 缓存);
 *  2. rename 覆盖目标(同目录 rename 是原子的);
 *  3. fsync 父目录(确保 rename 这一目录项变更也落盘)。
 *  没有第 1、3 步,断电后可能 rename 已生效但内容仍是空/截断的,
 *  正是 readJsonStrict 想要防的损坏场景。写失败时清理临时文件,不留垃圾。 */
function writeAtomic(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}${TMP_SUFFIX}`;
  try {
    const fd = openSync(tmp, 'w');
    try {
      writeFileSync(fd, content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, file);
  } catch (e) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* 清理失败忽略 */ }
    throw e;
  }
  // 父目录 fsync 让 rename 持久化;部分平台对目录 fsync 不支持,失败可忽略
  try {
    const dfd = openSync(dirname(file), 'r');
    try { fsyncSync(dfd); } finally { closeSync(dfd); }
  } catch { /* 平台不支持目录 fsync,忽略 */ }
}

/** 原子写 JSON */
export function writeJsonAtomic(file: string, data: any): void {
  writeAtomic(file, JSON.stringify(data, null, 2));
}

/** 原子写文本文件(CLAUDE.md 等) */
export function writeTextAtomic(file: string, content: string): void {
  writeAtomic(file, content);
}

/** 清理某目录下崩溃遗留的 *.orbit-tmp 临时文件。启动时扫一遍,
 *  避免写到一半崩溃留下的半成品文件干扰后续目录扫描。 */
export function sweepStaleTempFiles(dir: string): void {
  if (!existsSync(dir)) return;
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name.endsWith(TMP_SUFFIX)) {
      try { unlinkSync(join(dir, name)); } catch { /* 忽略 */ }
    }
  }
}
