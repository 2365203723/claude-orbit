#!/usr/bin/env node
/**
 * orbit — Claude Orbit 命令行,让终端里的 agent(claude/codex)
 * 按 Orbit 规则操作能力库,绝不直接乱写全局或破坏项目隔离。
 *
 * 复用 src/main/station 的纯函数;不依赖 Electron。
 * 全部输出走 stdout;--json 时输出结构化 JSON,便于 agent 解析。
 */
import { homedir } from 'node:os';
import { resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { loadState, saveState } from '../main/station/store';
import { importSkill } from '../main/station/skillLibrary';
import { scanCustomDir } from '../main/station/skillScan';
import { diagnoseDeadSkills, repairDeadSkills } from '../main/station/skillDoctor';
import { assignSkill, unassignSkill, assignMcp, unassignMcp, assignPlugin, unassignPlugin } from '../main/station/assign';
import { assignBundle, unassignBundle } from '../main/station/bundles';
import { createBundle, deleteBundle } from '../main/station/bundles';
import { executeApply } from '../main/station/apply';
import type { StationState } from '../main/station/types';

const HOME = homedir();

function out(json: boolean, human: string, data?: unknown): void {
  if (json) process.stdout.write(JSON.stringify(data ?? { ok: true, message: human }, null, 2) + '\n');
  else process.stdout.write(human + '\n');
}
function fail(json: boolean, msg: string): never {
  if (json) process.stdout.write(JSON.stringify({ ok: false, error: msg }, null, 2) + '\n');
  else process.stderr.write(`错误: ${msg}\n`);
  process.exit(1);
}

function stamp(): string { return new Date().toISOString().replace(/[:.]/g, '-'); }

/** mount 后对受影响项目重新 apply,把 symlink/MCP 真正写盘 */
function applyProject(state: StationState, projectPath: string): StationState {
  saveState(state, HOME);
  return executeApply(state, [projectPath], stamp(), HOME);
}

// ── 参数解析 ──────────────────────────────────────────────
const argv = process.argv.slice(2);
const json = argv.includes('--json');
const args = argv.filter(a => a !== '--json');
const cmd = args[0];
// project 默认取 cwd,可用 --project 覆盖
const projFlag = args.indexOf('--project');
const project = projFlag >= 0 ? resolve(args[projFlag + 1]) : process.cwd();
const positional = args.slice(1).filter((a, i, arr) => a !== '--project' && arr[i - 1] !== '--project');

const HELP = `orbit — Claude Orbit 能力管理 CLI

用法:
  orbit list [skills|mcp|plugins|bundles]      列出库中能力
  orbit project [--project <path>]             查看项目已挂载的能力
  orbit import-skill <dir>                      把本机 skill 目录导入 Orbit 库
  orbit scan-skills <dir>                       扫描目录,列出可导入的 skill(不导入)
  orbit mount <kind> <id> [--project <path>]    挂载能力到项目 (kind: skill|mcp|plugin|bundle)
  orbit unmount <kind> <id> [--project <path>]  从项目卸载能力
  orbit create-bundle <id> <name> --skills a,b  创建能力包
  orbit delete-bundle <id>                      删除能力包
  orbit doctor [--fix]                          诊断死链 skill,--fix 自动修复

规则:
  - skill 源统一存放在 ~/.claude-orbit/library/skills/,挂载用 symlink
  - MCP 走 ~/.claude.json 的 path-exact local scope,实现项目隔离
  - 安装新能力请先 import 到库,再 mount 到项目,绝不直接改全局
  加 --json 输出结构化结果(供 agent 解析)。`;

function getFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { out(false, HELP); return; }

  const state = loadState(HOME);

  switch (cmd) {
    case 'list': {
      const kind = positional[0] ?? 'all';
      const lib = state.library;
      const pick = (k: string) => Object.keys((lib as any)[k] ?? {}).sort();
      const result: Record<string, string[]> = {};
      if (kind === 'all' || kind === 'skills') result.skills = pick('skills');
      if (kind === 'all' || kind === 'mcp') result.mcp = pick('mcp');
      if (kind === 'all' || kind === 'plugins') result.plugins = pick('plugins');
      if (kind === 'all' || kind === 'bundles') result.bundles = pick('bundles');
      if (json) { out(true, '', result); return; }
      for (const [k, ids] of Object.entries(result)) {
        out(false, `${k} (${ids.length}):`);
        ids.forEach(id => out(false, `  ${id}`));
      }
      return;
    }

    case 'project': {
      const a = state.assignments[project];
      if (!a) { out(json, `项目未挂载任何能力: ${project}`, { project, mounted: null }); return; }
      out(json, `项目 ${project}:\n  MCP: ${a.mcp.join(', ') || '—'}\n  Skills: ${a.skills.join(', ') || '—'}\n  Plugins: ${a.plugins.join(', ') || '—'}\n  Bundles: ${a.bundles.join(', ') || '—'}`,
        { project, mounted: a });
      return;
    }

    case 'import-skill': {
      const dir = positional[0];
      if (!dir) fail(json, '需要 skill 目录路径');
      const abs = resolve(dir);
      if (!existsSync(abs)) fail(json, `目录不存在: ${abs}`);
      try {
        const next = importSkill(state, abs, HOME);
        const id = basename(abs);
        out(json, `已导入 skill "${id}" 到 Orbit 库`, { ok: true, id, sourcePath: next.library.skills[id]?.sourcePath });
      } catch (e: any) { fail(json, e?.message ?? String(e)); }
      return;
    }

    case 'scan-skills': {
      const dir = positional[0];
      if (!dir) fail(json, '需要扫描目录');
      const found = scanCustomDir(resolve(dir));
      out(json, found.length ? found.map(f => `  ${f.id}  (${f.sourcePath})`).join('\n') : '未发现含 SKILL.md 的目录',
        { found });
      return;
    }

    case 'mount': {
      const kind = positional[0], id = positional[1];
      if (!kind || !id) fail(json, '用法: orbit mount <skill|mcp|plugin|bundle> <id>');
      let next: StationState;
      if (kind === 'skill') next = assignSkill(state, project, id);
      else if (kind === 'mcp') next = assignMcp(state, project, id);
      else if (kind === 'plugin') next = assignPlugin(state, project, id);
      else if (kind === 'bundle') next = assignBundle(state, project, id);
      else { fail(json, `未知 kind: ${kind}`); }
      next = applyProject(next!, project);
      out(json, `已挂载 ${kind} "${id}" 到 ${project}`, { ok: true, kind, id, project });
      return;
    }

    case 'unmount': {
      const kind = positional[0], id = positional[1];
      if (!kind || !id) fail(json, '用法: orbit unmount <skill|mcp|plugin|bundle> <id>');
      let next: StationState;
      if (kind === 'skill') next = unassignSkill(state, project, id);
      else if (kind === 'mcp') next = unassignMcp(state, project, id);
      else if (kind === 'plugin') next = unassignPlugin(state, project, id);
      else if (kind === 'bundle') next = unassignBundle(state, project, id);
      else { fail(json, `未知 kind: ${kind}`); }
      next = applyProject(next!, project);
      out(json, `已从 ${project} 卸载 ${kind} "${id}"`, { ok: true, kind, id, project });
      return;
    }

    case 'create-bundle': {
      const id = positional[0], name = positional[1];
      if (!id || !name) fail(json, '用法: orbit create-bundle <id> <name> [--skills a,b] [--mcp x] [--plugins p]');
      const parse = (f?: string) => (f ? f.split(',').map(s => s.trim()).filter(Boolean) : []);
      const bundle = {
        id, name, version: '1.0.0',
        mcp: parse(getFlag('--mcp')),
        skills: parse(getFlag('--skills')),
        plugins: parse(getFlag('--plugins')),
      };
      const next = createBundle(state, bundle as any);
      saveState(next, HOME);
      out(json, `已创建 bundle "${id}"(${bundle.mcp.length} MCP / ${bundle.skills.length} skills / ${bundle.plugins.length} plugins)`, { ok: true, bundle });
      return;
    }

    case 'delete-bundle': {
      const id = positional[0];
      if (!id) fail(json, '需要 bundle id');
      const next = deleteBundle(state, id);
      saveState(next, HOME);
      out(json, `已删除 bundle "${id}"`, { ok: true, id });
      return;
    }

    case 'doctor': {
      const dead = diagnoseDeadSkills(state, HOME);
      if (!args.includes('--fix')) {
        out(json, dead.length ? `${dead.length} 个死链:\n` + dead.map(d => `  ${d.id} [${d.fixable}]`).join('\n') : '✅ 无死链',
          { dead });
        return;
      }
      const ids = dead.filter(d => d.fixable !== 'manual').map(d => d.id);
      const { report } = repairDeadSkills(state, ids, HOME);
      out(json, `修复 ${report.repaired.length},失败 ${report.failed.length},需手动 ${report.manual.length}`, { ok: true, report });
      return;
    }

    default:
      fail(json, `未知命令: ${cmd}。运行 orbit help 查看用法`);
  }
}

main().catch(e => fail(json, e?.message ?? String(e)));
