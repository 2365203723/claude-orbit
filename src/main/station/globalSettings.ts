import { readFileSync, writeFileSync, existsSync, mkdirSync, symlinkSync, unlinkSync, rmSync, readdirSync, lstatSync, renameSync, cpSync, statSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import type { McpServerDef } from '../types';
import type { StationState, LibraryBundle, GlobalBundleApplied } from './types';
import { readJsonStrict, writeJsonAtomic } from './safeJson';
import { backupFiles } from './backup';

function readJson(file: string): any {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; }
}
function saveJson(file: string, data: any): void {
  writeJsonAtomic(file, data);
}
// 全局配置写入前先备份——这些文件影响面最大,任何调用方都应受保护。
// 同一 stamp 下已备份过的文件跳过:bundle 操作传同一 stamp 逐项写入时,
// 后续备份不能用中间状态覆盖最初的原始副本。
function backupOnce(files: string[], stamp = new Date().toISOString().replace(/[:.]/g, '-')): void {
  const dir = join(home, '.claude-orbit', 'backups', stamp);
  const pending = files.filter(f => !existsSync(join(dir, f.replace(/[/\\]/g, '__').replace(/^__+/, ''))));
  if (pending.length) backupFiles(pending, stamp, home);
}

const home = homedir();
const claudeJsonFile = resolve(home, '.claude.json');
const skillsDir = resolve(home, '.claude', 'skills');
const agentsSkillsDir = resolve(home, '.agents', 'skills');
const settingsFile = resolve(home, '.claude', 'settings.json');

// ==================== Global MCP — 直接写 ~/.claude.json ====================
export interface GlobalMcpInfo { id: string; def: McpServerDef; hasSecrets: boolean; }
export function listGlobalMcp(): GlobalMcpInfo[] {
  const cj = readJson(claudeJsonFile) ?? {};
  const servers = cj.mcpServers ?? {};
  return Object.entries(servers).map(([id, def]) => {
    const d = def as McpServerDef;
    return { id, def: d, hasSecrets: !!(d.env && Object.values(d.env).some((v: any) => typeof v === 'string' && v.length > 0)) };
  });
}
/** 返回是否实际写入——已存在的同名 server 不动(不属于本次安装) */
export function addGlobalMcp(id: string, def: McpServerDef, stamp?: string): boolean {
  // strict 读:~/.claude.json 解析失败时抛错中止,绝不能当作空对象重写
  const cj = readJsonStrict(claudeJsonFile) ?? {};
  const servers = cj.mcpServers ?? {};
  if (servers[id]) return false;
  backupOnce([claudeJsonFile], stamp);
  servers[id] = def;
  saveJson(claudeJsonFile, { ...cj, mcpServers: servers });
  return true;
}
export function removeGlobalMcp(id: string, stamp?: string): void {
  const cj = readJsonStrict(claudeJsonFile) ?? {};
  const servers = cj.mcpServers ?? {};
  if (!(id in servers)) return;
  backupOnce([claudeJsonFile], stamp);
  delete servers[id];
  saveJson(claudeJsonFile, { ...cj, mcpServers: servers });
}

// ==================== Global Skills — 直接操作 ~/.claude/skills/ ====================
export interface GlobalSkillInfo { id: string; isSymlink: boolean; }
export function listGlobalSkills(): GlobalSkillInfo[] {
  const result: GlobalSkillInfo[] = [];
  // scan ~/.claude/skills
  if (existsSync(skillsDir)) {
    for (const e of readdirSync(skillsDir, { withFileTypes: true })) {
      if (e.isDirectory() || e.isSymbolicLink())
        result.push({ id: e.name, isSymlink: e.isSymbolicLink() });
    }
  }
  // scan ~/.agents/skills
  if (existsSync(agentsSkillsDir)) {
    for (const e of readdirSync(agentsSkillsDir, { withFileTypes: true })) {
      if (e.isDirectory() || e.isSymbolicLink()) {
        // avoid duplicates if same skill name exists in both
        if (!result.some(r => r.id === e.name))
          result.push({ id: e.name, isSymlink: e.isSymbolicLink() });
      }
    }
  }
  return result;
}
/** 返回是否实际写入——已存在的同名条目不动(不属于本次安装) */
export function addGlobalSkill(id: string, sourcePath?: string): boolean {
  mkdirSync(skillsDir, { recursive: true });
  const target = join(skillsDir, id);
  try { if (lstatSync(target)) return false; } catch { /* 不存在,继续 */ }
  if (sourcePath) {
    // sourcePath 可能已经指向全局 skills 目录本身(scanSkills 扫描的就是这里),
    // 再建 symlink 会变成自指死链。已存在、或已在全局 skills 里就不用动。
    if (resolve(sourcePath) === resolve(target)) return false;
    symlinkSync(resolve(sourcePath), target, 'dir');
  } else {
    mkdirSync(target, { recursive: true });
  }
  return true;
}
const orbitSkillsLibDir = resolve(home, '.claude-orbit', 'library', 'skills');

// 跨卷 rename 会抛 EXDEV——回退为复制+删除
function moveDir(src: string, dest: string): void {
  try {
    renameSync(src, dest);
  } catch (e: any) {
    if (e?.code !== 'EXDEV') throw e;
    cpSync(src, dest, { recursive: true });
    rmSync(src, { recursive: true, force: true });
  }
}

// 递归内容相等(文件列表 + 字节比较)——用于判断库内同名副本是否就是同一份内容
function dirContentEquals(a: string, b: string): boolean {
  const la = readdirSync(a).sort();
  const lb = readdirSync(b).sort();
  if (la.join('\n') !== lb.join('\n')) return false;
  for (const name of la) {
    const pa = join(a, name), pb = join(b, name);
    const sa = statSync(pa), sb = statSync(pb);
    if (sa.isDirectory() !== sb.isDirectory()) return false;
    if (sa.isDirectory()) { if (!dirContentEquals(pa, pb)) return false; }
    else if (!readFileSync(pa).equals(readFileSync(pb))) return false;
  }
  return true;
}

function removeSkillEntry(target: string): string | null {
  // symlink 直接删;真实目录是 skill 的唯一源——library 里的 sourcePath 和各项目的
  // symlink 都指向它,删掉会全部失效。改为搬进 Orbit 库,返回新位置。
  let st;
  try { st = lstatSync(target); } catch { return null; }
  if (st.isSymbolicLink()) { unlinkSync(target); return null; }
  mkdirSync(orbitSkillsLibDir, { recursive: true });
  let dest = join(orbitSkillsLibDir, basename(target));
  if (existsSync(dest)) {
    // 同名不等于同内容——用户可能改过全局这份。内容相同才能安全去重;
    // 否则搬到冲突后缀路径,绝不静默销毁用户修改。
    let same = false;
    try { same = dirContentEquals(target, dest); } catch { /* 比较失败按不同处理 */ }
    if (same) {
      rmSync(target, { recursive: true, force: true });
      return dest;
    }
    dest = join(orbitSkillsLibDir, `${basename(target)}-conflict-${Date.now()}`);
  }
  moveDir(target, dest);
  return dest;
}

/** 从全局移除 skill。若它是真实目录(skill 源),搬入 ~/.claude-orbit/library/skills
 *  并返回新 sourcePath,调用方需据此更新 state.library 与各项目 symlink。 */
export function removeGlobalSkill(id: string): string | null {
  const moved1 = removeSkillEntry(join(skillsDir, id));
  const moved2 = removeSkillEntry(join(agentsSkillsDir, id));
  return moved1 ?? moved2;
}

// ==================== Global Plugins — 直接操作 settings.json ====================
export interface GlobalPluginInfo { id: string; enabled: boolean; }
export function listGlobalPlugins(): GlobalPluginInfo[] {
  const installedFile = resolve(home, '.claude', 'plugins', 'installed_plugins.json');
  const installed = readJson(installedFile);
  const settings = readJson(settingsFile) ?? {};
  const enabledPlugins: Record<string, boolean> = settings.enabledPlugins ?? {};
  const plugins = installed?.plugins ?? {};
  return Object.keys(plugins).map(id => ({ id, enabled: enabledPlugins[id] === true }));
}
/** 返回是否实际写入——已启用的插件不动(不属于本次安装) */
export function addGlobalPlugin(id: string, stamp?: string): boolean {
  // strict 读:settings.json 解析失败时抛错中止,
  // 宽松读会把用户的 permissions/hooks/env 等整体替换成只剩 enabledPlugins
  const settings = readJsonStrict(settingsFile) ?? {};
  const ep = { ...(settings.enabledPlugins ?? {}) };
  if (ep[id] === true) return false;
  backupOnce([settingsFile], stamp);
  ep[id] = true;
  saveJson(settingsFile, { ...settings, enabledPlugins: ep });
  return true;
}
export function removeGlobalPlugin(id: string, stamp?: string): void {
  const settings = readJsonStrict(settingsFile) ?? {};
  const ep = { ...(settings.enabledPlugins ?? {}) };
  if (!(id in ep)) return;
  backupOnce([settingsFile], stamp);
  delete ep[id];
  saveJson(settingsFile, { ...settings, enabledPlugins: ep });
}

// ==================== Global Bundle 分配（展开为个体 MCP/Skill/Plugin） ====================
/** 记录本次实际写入的条目到 state.globalBundleApplied[bundleId](与已有记录合并),
 *  unassign 时只回收这些;调用方负责 saveState。 */
export function assignGlobalBundle(state: StationState, bundleId: string): void {
  const b = state.library.bundles[bundleId];
  if (!b) return;
  // 同一 stamp:整个 bundle 操作的备份作为一个单元,可整体恢复
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const applied: GlobalBundleApplied = { mcp: [], skills: [], plugins: [] };
  for (const mcpId of b.mcp) {
    const entry = state.library.mcp[mcpId];
    if (entry && addGlobalMcp(mcpId, entry.def, stamp)) applied.mcp.push(mcpId);
  }
  for (const skillId of b.skills) {
    const entry = state.library.skills[skillId];
    if (entry && addGlobalSkill(skillId, entry.sourcePath)) applied.skills.push(skillId);
  }
  for (const pluginId of b.plugins) {
    if (addGlobalPlugin(pluginId, stamp)) applied.plugins.push(pluginId);
  }
  // 重复 assign 时合并而非覆盖,避免丢失早先的安装记录
  const prev = state.globalBundleApplied?.[bundleId];
  const merged: GlobalBundleApplied = prev
    ? {
        mcp: [...new Set([...prev.mcp, ...applied.mcp])],
        skills: [...new Set([...prev.skills, ...applied.skills])],
        plugins: [...new Set([...prev.plugins, ...applied.plugins])],
      }
    : applied;
  state.globalBundleApplied = { ...(state.globalBundleApplied ?? {}), [bundleId]: merged };
  // 显式记录分配——展示层只看这份名单,不做启发式推断
  const gb = state.globalBundles ?? [];
  if (!gb.includes(bundleId)) state.globalBundles = [...gb, bundleId];
}

/** 只回收 assign 时实际写入的条目,用户原有的全局配置不动。
 *  返回被搬迁的 skill 源目录 { skillId: 新路径 },调用方需同步
 *  library.sourcePath 与各项目 symlink,并 saveState。 */
export function unassignGlobalBundle(state: StationState, bundleId: string): Record<string, string> {
  const b = state.library.bundles[bundleId];
  const moved: Record<string, string> = {};
  state.globalBundles = (state.globalBundles ?? []).filter(id => id !== bundleId);
  if (!b) return moved;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const applied = state.globalBundleApplied?.[bundleId];
  if (applied) {
    for (const mcpId of applied.mcp) removeGlobalMcp(mcpId, stamp);
    for (const skillId of applied.skills) {
      const movedTo = removeGlobalSkill(skillId);
      if (movedTo) moved[skillId] = movedTo;
    }
    for (const pluginId of applied.plugins) removeGlobalPlugin(pluginId, stamp);
    delete state.globalBundleApplied![bundleId];
  } else {
    // 旧版本 assign 的 bundle 没有安装记录——保守回收:
    // skill 只删 symlink(真实目录可能是用户自有的,跳过);
    // MCP 只删与 library 定义一致的条目(被用户改过的视为用户所有)。
    for (const mcpId of b.mcp) {
      const entry = state.library.mcp[mcpId];
      const cj = readJson(claudeJsonFile) ?? {};
      const cur = cj.mcpServers?.[mcpId];
      if (entry && cur && JSON.stringify(cur) === JSON.stringify(entry.def)) removeGlobalMcp(mcpId, stamp);
    }
    for (const skillId of b.skills) {
      for (const dir of [skillsDir, agentsSkillsDir]) {
        const t = join(dir, skillId);
        try { if (lstatSync(t).isSymbolicLink()) unlinkSync(t); } catch { /* 不存在,跳过 */ }
      }
    }
    for (const pluginId of b.plugins) removeGlobalPlugin(pluginId, stamp);
  }
  return moved;
}
