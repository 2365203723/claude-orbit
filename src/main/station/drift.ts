import { existsSync, readdirSync, lstatSync, readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { homedir } from 'node:os';
import type { McpServerDef } from '../types';
import type { AppliedSnapshot, StationState } from './types';
import { projectSkillsDir, projectSettings, projectMcpJson } from '../scanner/paths';

// ── snapshot comparison ──────────────────────────────────────────

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) out[k] = (v as any)[k];
      return out;
    }
    return v;
  });
}

export function detectDrift(snapshot: AppliedSnapshot | undefined, current: AppliedSnapshot): boolean {
  if (!snapshot) return false;
  return stableStringify(snapshot) !== stableStringify(current);
}

// ── disk snapshot builder ─────────────────────────────────────────

function readJson(file: string): unknown {
  if (!existsSync(file)) return undefined;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; }
}

function dirNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() || d.isSymbolicLink()).map(d => d.name); }
  catch { return []; }
}

/** 从磁盘读取一个项目当前的配置快照——等同 executeApply 写盘的内容 */
export function buildCurrentDiskSnapshot(projectPath: string, home: string = homedir()): AppliedSnapshot {
  // MCP from local scope (~/.claude.json)
  const claudeJson = join(home, '.claude.json');
  const cj = readJson(claudeJson) as any;
  const localScope: Record<string, McpServerDef> = cj?.projects?.[projectPath]?.mcpServers ?? {};

  // MCP from .mcp.json (legacy — 只读,不修改)
  const mcpJsonFile = projectMcpJson(projectPath);
  const mj = readJson(mcpJsonFile) as any;
  const mcpJson: Record<string, McpServerDef> = mj?.mcpServers ?? {};

  // Skills — 列出 symlink 名
  const skills = dirNames(projectSkillsDir(projectPath));

  // Plugins — settings.json enabledPlugins
  const settingsFile = projectSettings(projectPath);
  const settings = readJson(settingsFile) as any;
  const plugins = Object.keys(settings?.enabledPlugins ?? {});

  // Snippets — we can't cleanly reverse-detect marker blocks from CLAUDE.md,
  // so omit from drift check (apply 侧的快照比对已足够)
  return {
    mcpJson,
    localScope: Object.fromEntries(
      Object.entries(localScope).map(([k, v]) => [k, v as McpServerDef])
    ),
    skills,
    plugins,
    snippets: [],
    bundles: [],
  };
}

// ── project-level drift report ────────────────────────────────────

export interface DriftReport {
  /** 与 lastApplied 对比后存在偏移的项目路径 */
  drifted: string[];
  /** 所有被管理项目的总数 */
  total: number;
}

/** 扫描所有项目,返回哪些项目的磁盘现状与 lastApplied 快照不一致 */
export function checkAllDrift(state: StationState, home: string = homedir()): DriftReport {
  const projects = Object.keys(state.assignments);
  const drifted: string[] = [];
  for (const path of projects) {
    const snap = state.lastApplied[path];
    if (!snap) continue; // 未 apply 过,跳过
    const disk = buildCurrentDiskSnapshot(path, home);
    if (detectDrift(snap, disk)) drifted.push(path);
  }
  return { drifted, total: projects.length };
}

/** 单项目漂移检测(详情面板用) */
export function checkProjectDrift(state: StationState, projectPath: string, home: string = homedir()): boolean {
  const snap = state.lastApplied[projectPath];
  if (!snap) return false;
  return detectDrift(snap, buildCurrentDiskSnapshot(projectPath, home));
}
