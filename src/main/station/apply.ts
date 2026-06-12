import { readFileSync, existsSync, mkdirSync, symlinkSync, unlinkSync, lstatSync, readlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { ApplyPlan, FileChange, StationState, AppliedSnapshot } from './types';
import type { McpServerDef } from '../types';
import { compileProjectTargets } from './compile';
import { diffServers } from './diff';
import { projectMcpJson, resolvePaths, projectSettings, projectSkillsDir } from '../scanner/paths';
import { backupFiles } from './backup';
import { mergeMcpJson, mergeLocalScope, mergePluginSettings, mergeSnippetClaudeMd, mergeSnippetSettings, snippetSettingKeys } from './merge';
import { readJsonStrict, writeJsonAtomic, writeTextAtomic } from './safeJson';
import { saveState } from './store';

function mcpChange(file: string, kind: FileChange['kind'], before: any, after: any): FileChange | null {
  const d = diffServers(before, after);
  if (!d.added.length && !d.removed.length && !d.changed.length) return null;
  return { file, kind, before, after, added: d.added, removed: d.removed, changed: d.changed };
}

function listChange(file: string, kind: FileChange['kind'], before: string[], after: string[]): FileChange | null {
  const added = after.filter(x => !before.includes(x));
  const removed = before.filter(x => !after.includes(x));
  if (!added.length && !removed.length) return null;
  return { file, kind, before, after, added, removed, changed: [] };
}

function jsonChange(file: string, kind: FileChange['kind'], before: any, after: any): FileChange | null {
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  const bk = Object.keys(before ?? {}), ak = Object.keys(after ?? {});
  const added = ak.filter(k => !(k in (before ?? {})));
  const removed = bk.filter(k => !(k in (after ?? {})));
  const changed = ak.filter(k => k in (before ?? {}) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return { file, kind, before, after, added, removed, changed };
}

function textChange(file: string, kind: FileChange['kind'], before: string, after: string): FileChange | null {
  if (before === after) return null;
  return { file, kind, before, after, added: [], removed: [], changed: ['content'] };
}

export function computeApplyPlan(state: StationState, projectPaths: string[], home: string = homedir()): ApplyPlan {
  const claudeJson = resolvePaths(home).claudeJson;
  const changes: FileChange[] = [];
  for (const path of projectPaths) {
    const target = compileProjectTargets(state, path);
    const snap: AppliedSnapshot = state.lastApplied[path] ?? { mcpJson: {}, localScope: {}, skills: [], plugins: [], snippets: [], bundles: [] };

    // MCP
    const mj = mcpChange(projectMcpJson(path), 'mcpjson', snap.mcpJson, target.mcpJson);
    const ls = mcpChange(claudeJson, 'localscope', snap.localScope, target.localScope);
    if (mj) changes.push(mj);
    if (ls) changes.push(ls);

    // Skills
    const targetSkillIds = target.skills.map(s => s.id);
    const sk = listChange(projectSkillsDir(path), 'skills', snap.skills, targetSkillIds);
    if (sk) changes.push(sk);

    // Plugins → settings.json
    const targetPlugins = Object.keys(target.enabledPlugins).sort();
    const pk = listChange(projectSettings(path), 'settings', snap.plugins, targetPlugins);
    if (pk) changes.push(pk);

    // 快照里 snippet 的 kind 优先查 library(被 unassign 的 snippet 不在 target 里,
    // 之前按 target 过滤会漏掉"移除"这一变化,导致清理永不执行)
    const snippetKind = (id: string): string | undefined =>
      state.library.snippets[id]?.kind ?? target.snippetBlocks.find(b => b.id === id)?.kind;

    // Snippets → CLAUDE.md
    const claudeMdBlocks = target.snippetBlocks.filter(b => b.kind === 'claudemd');
    const snippetClaudeMdIds = claudeMdBlocks.map(b => b.id);
    const prevClaudeMdIds = snap.snippets.filter(id => (snippetKind(id) ?? 'claudemd') === 'claudemd');
    const sm = listChange(join(path, 'CLAUDE.md'), 'claudemd', prevClaudeMdIds, snippetClaudeMdIds);
    if (sm) changes.push(sm);

    // Snippets → settings.json (hooks + env)
    const settingBlocks = target.snippetBlocks.filter(b => b.kind === 'hooks' || b.kind === 'env');
    const snippetSettingIds = settingBlocks.map(b => b.id);
    const prevSettingIds = snap.snippets.filter(id => { const k = snippetKind(id); return k === 'hooks' || k === 'env'; });
    const ss = listChange(projectSettings(path), 'settings', prevSettingIds, snippetSettingIds);
    if (ss) changes.push(ss);
  }
  return { changes };
}

function readJson(file: string): any {
  if (!existsSync(file)) return undefined;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; }
}

function readText(file: string): string | undefined {
  if (!existsSync(file)) return undefined;
  try { return readFileSync(file, 'utf8'); } catch { return undefined; }
}

/** 清理本软件以前写到 .mcp.json 的 mcpServers——只删 orbitIds(快照记录的 Orbit 写入项),
 *  用户手写的 server 保留。若清理后文件只剩空对象,直接删文件;否则保留其他字段。 */
function cleanupMcpJson(file: string, orbitIds: string[]): void {
  if (!existsSync(file)) return;
  const existing = readJson(file);
  if (existing === undefined || typeof existing !== 'object') {
    // 无法解析的文件不动,避免误删用户手写内容
    return;
  }
  const next = { ...existing };
  if (next.mcpServers && typeof next.mcpServers === 'object') {
    const servers = { ...next.mcpServers };
    for (const id of orbitIds) delete servers[id];
    if (Object.keys(servers).length === 0) delete next.mcpServers;
    else next.mcpServers = servers;
  }
  if (Object.keys(next).length === 0) {
    try { unlinkSync(file); } catch { /* ok */ }
  } else {
    writeJsonAtomic(file, next);
  }
}

export function executeApply(state: StationState, projectPaths: string[], stamp: string, home: string = homedir()): StationState {
  const claudeJson = resolvePaths(home).claudeJson;
  const plan = computeApplyPlan(state, projectPaths, home);
  if (!plan.changes.length) return state;

  backupFiles([...new Set(plan.changes.map(c => c.file))], stamp, home);

  const pendingLocalScope: { path: string; servers: Record<string, McpServerDef>; prevManaged: Record<string, McpServerDef> }[] = [];
  const next = { ...state, lastApplied: { ...state.lastApplied } };
  for (const path of projectPaths) {
    const target = compileProjectTargets(state, path);
    const prevSnap: AppliedSnapshot = state.lastApplied[path] ?? { mcpJson: {}, localScope: {}, skills: [], plugins: [], snippets: [], bundles: [] };

    // MCP
    const mjDiff = diffServers(prevSnap.mcpJson, target.mcpJson);
    const lsDiff = diffServers(prevSnap.localScope, target.localScope);
    if (mjDiff.added.length || mjDiff.removed.length || mjDiff.changed.length) {
      const mcpJsonFile = projectMcpJson(path);
      if (Object.keys(target.mcpJson).length === 0) {
        // 新策略:MCP 全部走 local scope,不再写 .mcp.json。
        // 只清理快照记录的 Orbit 写入项,用户手写的 server 保留。
        cleanupMcpJson(mcpJsonFile, Object.keys(prevSnap.mcpJson));
      } else {
        mkdirSync(dirname(mcpJsonFile), { recursive: true });
        // strict 读:.mcp.json 解析失败时抛错中止,宽松读会把用户手写内容整体覆盖
        writeJsonAtomic(mcpJsonFile, mergeMcpJson(readJsonStrict(mcpJsonFile), target.mcpJson, prevSnap.mcpJson));
      }
    }
    if (lsDiff.added.length || lsDiff.removed.length || lsDiff.changed.length) {
      // ~/.claude.json 由外部进程(Claude Code 会话)频繁重写——先攒 delta,
      // 循环结束后再做一次"读-改-写",把丢失更新的窗口缩到最小。
      pendingLocalScope.push({ path, servers: target.localScope, prevManaged: prevSnap.localScope });
    }

    // Skills — symlink
    const targetSkillIds = target.skills.map(s => s.id);
    const linkedSkillIds: string[] = [];
    const skillChanged = targetSkillIds.sort().join(',') !== [...prevSnap.skills].sort().join(',');
    // 防护:当项目路径就是 home(~)时,<project>/.claude/skills 等于全局源目录
    // ~/.claude/skills 本身。此时建/删"项目 symlink"实际是在操作 skill 源,
    // 会把真实目录当死链删除。直接跳过 skill 装配——home 不该作为普通项目管理。
    const skillsDirIsGlobalSource = resolve(projectSkillsDir(path)) === resolve(resolvePaths(home).globalSkillsDir);
    if (skillChanged && !skillsDirIsGlobalSource) {
      const skillsDir = projectSkillsDir(path);
      mkdirSync(skillsDir, { recursive: true });
      // 移除不再 assigned 的 symlink
      for (const id of prevSnap.skills) {
        if (!targetSkillIds.includes(id)) {
          const linkPath = join(skillsDir, id);
          try {
            if (lstatSync(linkPath).isSymbolicLink()) unlinkSync(linkPath);
          } catch { /* 文件不存在,跳过 */ }
        }
      }
      // 创建新 assigned 的 symlink;失败的不计入快照,下次 apply 重试
      for (const s of target.skills) {
        const linkPath = join(skillsDir, s.id);
        // lstatSync 不跟踪符号链接——existsSync 遇到死 symlink 会返回 false,
        // 导致 symlinkSync 抛 EEXIST 崩溃,阻断后续 plugins/snippets 写入。
        // 已存在的 symlink 必须校验指向:源目录搬迁后旧链是死链,需重建。
        try {
          const st = lstatSync(linkPath);
          if (st.isSymbolicLink()) {
            if (resolve(readlinkSync(linkPath)) === resolve(s.sourcePath)) { linkedSkillIds.push(s.id); continue; }
            unlinkSync(linkPath); // 指向过期源,删除后重建
          } else {
            // 同名真实目录是用户自己的内容,不覆盖
            console.warn(`[apply] ${linkPath} exists and is not a symlink; leaving untouched`);
            linkedSkillIds.push(s.id);
            continue;
          }
        } catch { /* 不存在,继续 */ }
        // skill 源文件夹可能不存在(如被误删或迁移)——跳过并继续
        try {
          symlinkSync(s.sourcePath, linkPath, 'dir');
          linkedSkillIds.push(s.id);
        } catch (e: any) {
          // 源缺失只影响这一个 skill,不应阻断 plugins/snippets 写入
          console.warn(`[apply] symlink failed for skill ${s.id}: ${e.message}`);
        }
      }
    } else {
      linkedSkillIds.push(...prevSnap.skills);
    }

    // Plugins → settings.json
    const targetPluginIds = Object.keys(target.enabledPlugins).sort();
    const pluginChanged = targetPluginIds.join(',') !== [...prevSnap.plugins].sort().join(',');
    if (pluginChanged) {
      const settingsFile = projectSettings(path);
      mkdirSync(dirname(settingsFile), { recursive: true });
      // strict 读:settings.json 解析失败时抛错,避免把用户设置整体覆盖
      writeJsonAtomic(settingsFile, mergePluginSettings(readJsonStrict(settingsFile), target.enabledPlugins, prevSnap.plugins));
    }

    // Snippets
    let snippetMeta = prevSnap.snippetSettingKeys;
    let claudeMdCreatedByOrbit = prevSnap.claudeMdCreatedByOrbit ?? false;
    const snippetChanged = target.snippetBlocks.map(b => b.id).sort().join(',') !== [...prevSnap.snippets].sort().join(',');
    if (snippetChanged) {
      // CLAUDE.md
      const claudeMdBlocks = target.snippetBlocks.filter(b => b.kind === 'claudemd');
      const claudeMdPath = join(path, 'CLAUDE.md');
      const mdExisted = existsSync(claudeMdPath);
      const mdResult = mergeSnippetClaudeMd(readText(claudeMdPath), claudeMdBlocks);
      if (mdResult.shouldDelete) {
        // 清掉所有 snippet 块后内容为空——只有文件本来就是 Orbit 创建的才删除;
        // 用户自建的空文件/占位文件保留(写回清理后的内容)
        if (mdExisted) {
          if (claudeMdCreatedByOrbit) { try { unlinkSync(claudeMdPath); } catch { /* ok */ } }
          else writeTextAtomic(claudeMdPath, mdResult.content);
        }
        claudeMdCreatedByOrbit = false;
      } else if (mdResult.content !== '' || mdExisted) {
        if (!mdExisted && claudeMdBlocks.length > 0) claudeMdCreatedByOrbit = true;
        writeTextAtomic(claudeMdPath, mdResult.content);
      }

      // settings.json (hooks + env) — settingBlocks 为空时也要写,清理上次写入的键
      const settingBlocks = target.snippetBlocks.filter(b => b.kind === 'hooks' || b.kind === 'env');
      const prevKeys = prevSnap.snippetSettingKeys ?? { hooks: [], env: {} };
      const prevEnvCount = Array.isArray(prevKeys.env) ? prevKeys.env.length : Object.keys(prevKeys.env).length;
      if (settingBlocks.length > 0 || prevKeys.hooks.length > 0 || prevEnvCount > 0) {
        const settingsFile = projectSettings(path);
        mkdirSync(dirname(settingsFile), { recursive: true });
        const merged = mergeSnippetSettings(readJsonStrict(settingsFile), settingBlocks, prevKeys);
        writeJsonAtomic(settingsFile, merged.settings);
        snippetMeta = merged.meta;
      }
    }

    next.lastApplied[path] = {
      mcpJson: target.mcpJson,
      localScope: target.localScope,
      skills: linkedSkillIds,
      plugins: targetPluginIds,
      snippets: target.snippetBlocks.map(b => b.id),
      snippetSettingKeys: snippetMeta,
      claudeMdCreatedByOrbit,
      bundles: (state.assignments[path]?.bundles ?? []),
    };
  }

  if (pendingLocalScope.length > 0) {
    // ~/.claude.json 是 Claude Code 的主配置(含 OAuth 等)——解析失败时必须中止,
    // 绝不能当作空对象重写。读-改-写紧贴在一起,避免覆盖外部进程的并发更新。
    let cj = readJsonStrict(claudeJson);
    for (const p of pendingLocalScope) {
      cj = mergeLocalScope(cj, p.path, p.servers, p.prevManaged);
    }
    writeJsonAtomic(claudeJson, cj);
  }

  saveState(next, home);
  return next;
}
