# Claude Station — M1 (骨架 + 反向导入 + 只读展示) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭起 Electron 骨架,实现"反向导入"——读真实 Claude 配置文件反推出每个项目当前实际挂了哪些 MCP/Skill/Plugin,并在高保真 Claude 风格的只读画布上展示。本阶段不写任何真实文件。

**Architecture:** 主进程持有一组**纯函数 scanner**(解析 `~/.claude.json`、`.mcp.json`、`.claude/skills/`、`settings.json`/`installed_plugins.json`),合成出 `InferredState`;通过 IPC 暴露给渲染进程;渲染进程用 React Flow 画只读画布(项目=纸卡片,能力=带色条药丸),配浅/深双主题 CSS token。scanner 全部可注入根目录,用临时目录做集成测试。

**Tech Stack:** Electron + electron-vite + TypeScript;React + React Flow(渲染);Vitest(单测);@fontsource(本地字体)。

参考 spec:`docs/superpowers/specs/2026-06-08-claude-station-design.md`(§2 反向导入、§7 数据模型、§11 视觉语言)。

**范围说明:** 这是 spec §10 四个里程碑的 M1。M2(MCP 装配 + Apply)、M3(Skills/Plugins/片段)、M4(Profile/漂移/回滚)各自单独成计划。M1 完成后是一个能正确反推并展示存量项目现状的可用只读工具。

---

## 文件结构

```
claude-station/
  package.json                       # 依赖、脚本
  tsconfig.json                      # TS 配置
  electron.vite.config.ts            # electron-vite 构建配置
  vitest.config.ts                   # 单测配置
  src/
    main/
      index.ts                       # Electron 主入口、建窗
      ipc.ts                         # IPC handler:station:getState
      types.ts                       # 共享类型(scanner 输出)
      scanner/
        paths.ts                     # 解析各配置文件路径(根目录可注入)
        parseClaudeJson.ts           # 解析 ~/.claude.json 顶层+projects
        parseMcpJson.ts              # 解析 .mcp.json
        scanSkills.ts                # 列某目录下的 skill
        parsePlugins.ts              # 解析 installed_plugins + enabledPlugins
        buildState.ts                # 合成 InferredState
    preload/
      index.ts                       # contextBridge 暴露 window.station
    renderer/
      index.html
      main.tsx                       # React 挂载
      App.tsx                        # 顶层布局 + 主题切换
      vite-env.d.ts                  # window.station 类型声明
      theme/
        tokens.css                   # 浅/深双主题 CSS 变量
        fonts.ts                     # @fontsource 引入
      canvas/
        Canvas.tsx                   # React Flow 画布(只读)
        ProjectNode.tsx              # 项目纸卡片节点
        CapabilityChip.tsx           # 能力药丸节点
      panel/
        DetailPanel.tsx              # 右侧项目详情面板
  tests/
    scanner/
      parseClaudeJson.test.ts
      parseMcpJson.test.ts
      scanSkills.test.ts
      parsePlugins.test.ts
      buildState.test.ts
    fixtures/
      fake-home/                     # 测试用假 ~ 结构(运行时生成)
```

---

## Task 1: 项目脚手架

**Files:**
- Create: `claude-station/package.json`
- Create: `claude-station/tsconfig.json`
- Create: `claude-station/electron.vite.config.ts`
- Create: `claude-station/vitest.config.ts`

- [ ] **Step 1: 初始化 package.json**

Create `package.json`:

```json
{
  "name": "claude-station",
  "version": "0.1.0",
  "description": "Visual capability-assembly station for Claude Code projects",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-vite": "^2.3.0",
    "vite": "^5.4.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "reactflow": "^11.11.0",
    "@fontsource/source-serif-4": "^5.1.0",
    "@fontsource/inter": "^5.1.0",
    "@fontsource/jetbrains-mono": "^5.1.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "outDir": "out"
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: 创建 electron-vite 配置**

Create `electron.vite.config.ts`:

```typescript
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: { build: { rollupOptions: { input: 'src/main/index.ts' } } },
  preload: { build: { rollupOptions: { input: 'src/preload/index.ts' } } },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: 'src/renderer/index.html' } },
    plugins: [react()],
  },
});
```

- [ ] **Step 4: 创建 vitest 配置**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 5: 安装依赖并验证**

Run: `cd claude-station && npm install`
Expected: 依赖装好,无 error。

Run: `npx vitest run`
Expected: "No test files found" 或 0 passed(还没写测试)——证明 vitest 可启动。

- [ ] **Step 6: Commit**

```bash
cd claude-station
git add package.json tsconfig.json electron.vite.config.ts vitest.config.ts package-lock.json
git commit -m "chore: scaffold electron-vite + react + vitest"
```

---

## Task 2: 共享类型

**Files:**
- Create: `src/main/types.ts`

- [ ] **Step 1: 定义 scanner 输出类型**

Create `src/main/types.ts`:

```typescript
export type CapabilityKind = 'mcp' | 'skill' | 'plugin';

export interface McpServerDef {
  type?: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

// MCP 来源作用域:user=~/.claude.json 顶层(全局注入),
// project-mcpjson=项目根 .mcp.json,project-local=~/.claude.json 的 projects[路径].mcpServers
export type McpScope = 'user' | 'project-mcpjson' | 'project-local';

export interface McpCapability {
  id: string;            // server 名,如 "firecrawl"
  scope: McpScope;
  def: McpServerDef;
  hasSecrets: boolean;   // env 是否含值(用于 UI 标记)
}

export interface SkillCapability {
  id: string;            // skill 目录名
  scope: 'user' | 'project';
  path: string;          // 绝对路径
}

export interface PluginCapability {
  id: string;            // 如 "superpowers@claude-plugins-official"
  enabled: boolean;
}

export interface ProjectState {
  path: string;
  mcp: McpCapability[];
  skills: SkillCapability[];
  plugins: PluginCapability[];
}

export interface InferredState {
  userScope: {
    mcp: McpCapability[];
    skills: SkillCapability[];
    plugins: PluginCapability[];
  };
  projects: ProjectState[];
}
```

- [ ] **Step 2: 确认类型编译**

Run: `cd claude-station && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 3: Commit**

```bash
git add src/main/types.ts
git commit -m "feat: shared scanner output types"
```

---

## Task 3: 路径解析(可注入根目录)

**Files:**
- Create: `src/main/scanner/paths.ts`

所有 scanner 接受一个 `home` 参数(默认真实 `os.homedir()`),测试时传假目录。

- [ ] **Step 1: 写路径解析**

Create `src/main/scanner/paths.ts`:

```typescript
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface Paths {
  claudeJson: string;        // ~/.claude.json
  globalSkillsDir: string;   // ~/.claude/skills
  installedPlugins: string;  // ~/.claude/plugins/installed_plugins.json
  globalSettings: string;    // ~/.claude/settings.json
}

export function resolvePaths(home: string = homedir()): Paths {
  return {
    claudeJson: join(home, '.claude.json'),
    globalSkillsDir: join(home, '.claude', 'skills'),
    installedPlugins: join(home, '.claude', 'plugins', 'installed_plugins.json'),
    globalSettings: join(home, '.claude', 'settings.json'),
  };
}

// 项目内文件路径
export function projectMcpJson(projectPath: string): string {
  return join(projectPath, '.mcp.json');
}
export function projectSkillsDir(projectPath: string): string {
  return join(projectPath, '.claude', 'skills');
}
export function projectSettings(projectPath: string): string {
  return join(projectPath, '.claude', 'settings.json');
}
```

- [ ] **Step 2: 编译确认**

Run: `cd claude-station && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 3: Commit**

```bash
git add src/main/scanner/paths.ts
git commit -m "feat: config path resolution with injectable home"
```

---

## Task 4: 解析 ~/.claude.json(MCP + projects)

**Files:**
- Create: `src/main/scanner/parseClaudeJson.ts`
- Test: `tests/scanner/parseClaudeJson.test.ts`

- [ ] **Step 1: 写失败测试**

Create `tests/scanner/parseClaudeJson.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseClaudeJson } from '../../src/main/scanner/parseClaudeJson';

describe('parseClaudeJson', () => {
  const raw = {
    mcpServers: {
      firecrawl: { command: 'npx', args: ['-y', 'fc'], env: { FIRECRAWL_API_KEY: 'sk-real' } },
      codegraph: { type: 'stdio', command: 'codegraph', args: ['serve'] },
    },
    projects: {
      '/Users/x/ecc': { mcpServers: { local1: { command: 'foo' } }, disabledMcpServers: ['firecrawl'] },
      '/Users/x/web': {},
    },
  };

  it('extracts user-scope MCP with hasSecrets flag', () => {
    const r = parseClaudeJson(raw);
    expect(r.userMcp.map(m => m.id).sort()).toEqual(['codegraph', 'firecrawl']);
    const fc = r.userMcp.find(m => m.id === 'firecrawl')!;
    expect(fc.scope).toBe('user');
    expect(fc.hasSecrets).toBe(true);   // env 有值
    const cg = r.userMcp.find(m => m.id === 'codegraph')!;
    expect(cg.hasSecrets).toBe(false);  // 无 env
  });

  it('lists project paths', () => {
    const r = parseClaudeJson(raw);
    expect(r.projectPaths.sort()).toEqual(['/Users/x/ecc', '/Users/x/web']);
  });

  it('extracts project-local MCP and disabled list per project', () => {
    const r = parseClaudeJson(raw);
    expect(r.projectLocalMcp['/Users/x/ecc'].map(m => m.id)).toEqual(['local1']);
    expect(r.projectLocalMcp['/Users/x/ecc'][0].scope).toBe('project-local');
    expect(r.disabledByProject['/Users/x/ecc']).toEqual(['firecrawl']);
  });

  it('handles missing keys gracefully', () => {
    const r = parseClaudeJson({});
    expect(r.userMcp).toEqual([]);
    expect(r.projectPaths).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd claude-station && npx vitest run tests/scanner/parseClaudeJson.test.ts`
Expected: FAIL —— "Cannot find module parseClaudeJson"。

- [ ] **Step 3: 写实现**

Create `src/main/scanner/parseClaudeJson.ts`:

```typescript
import type { McpCapability, McpServerDef } from '../types';

export interface ClaudeJsonResult {
  userMcp: McpCapability[];
  projectPaths: string[];
  projectLocalMcp: Record<string, McpCapability[]>;
  disabledByProject: Record<string, string[]>;
}

function hasSecrets(def: McpServerDef): boolean {
  return !!def.env && Object.values(def.env).some(v => typeof v === 'string' && v.length > 0);
}

function toCaps(
  servers: Record<string, McpServerDef> | undefined,
  scope: McpCapability['scope'],
): McpCapability[] {
  if (!servers) return [];
  return Object.entries(servers).map(([id, def]) => ({
    id, scope, def, hasSecrets: hasSecrets(def),
  }));
}

export function parseClaudeJson(raw: any): ClaudeJsonResult {
  const userMcp = toCaps(raw?.mcpServers, 'user');
  const projects = raw?.projects ?? {};
  const projectPaths = Object.keys(projects);
  const projectLocalMcp: Record<string, McpCapability[]> = {};
  const disabledByProject: Record<string, string[]> = {};
  for (const [path, p] of Object.entries<any>(projects)) {
    projectLocalMcp[path] = toCaps(p?.mcpServers, 'project-local');
    disabledByProject[path] = p?.disabledMcpServers ?? [];
  }
  return { userMcp, projectPaths, projectLocalMcp, disabledByProject };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd claude-station && npx vitest run tests/scanner/parseClaudeJson.test.ts`
Expected: PASS(4 个测试)。

- [ ] **Step 5: Commit**

```bash
git add src/main/scanner/parseClaudeJson.ts tests/scanner/parseClaudeJson.test.ts
git commit -m "feat: parse ~/.claude.json user MCP and per-project local MCP"
```

---

## Task 5: 解析 .mcp.json

**Files:**
- Create: `src/main/scanner/parseMcpJson.ts`
- Test: `tests/scanner/parseMcpJson.test.ts`

- [ ] **Step 1: 写失败测试**

Create `tests/scanner/parseMcpJson.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseMcpJson } from '../../src/main/scanner/parseMcpJson';

describe('parseMcpJson', () => {
  it('returns [] when file missing', () => {
    expect(parseMcpJson('/no/such/.mcp.json')).toEqual([]);
  });

  it('parses servers as project-mcpjson scope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cs-'));
    const file = join(dir, '.mcp.json');
    writeFileSync(file, JSON.stringify({
      mcpServers: {
        exa: { type: 'stdio', command: 'exa-mcp', args: ['--x'], env: { EXA_API_KEY: 'k' } },
      },
    }));
    const caps = parseMcpJson(file);
    expect(caps).toHaveLength(1);
    expect(caps[0].id).toBe('exa');
    expect(caps[0].scope).toBe('project-mcpjson');
    expect(caps[0].hasSecrets).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns [] on malformed JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cs-'));
    const file = join(dir, '.mcp.json');
    writeFileSync(file, '{ not json');
    expect(parseMcpJson(file)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd claude-station && npx vitest run tests/scanner/parseMcpJson.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 写实现**

Create `src/main/scanner/parseMcpJson.ts`:

```typescript
import { readFileSync, existsSync } from 'node:fs';
import type { McpCapability, McpServerDef } from '../types';

function hasSecrets(def: McpServerDef): boolean {
  return !!def.env && Object.values(def.env).some(v => typeof v === 'string' && v.length > 0);
}

export function parseMcpJson(filePath: string): McpCapability[] {
  if (!existsSync(filePath)) return [];
  let raw: any;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
  const servers: Record<string, McpServerDef> = raw?.mcpServers ?? {};
  return Object.entries(servers).map(([id, def]) => ({
    id, scope: 'project-mcpjson' as const, def, hasSecrets: hasSecrets(def),
  }));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd claude-station && npx vitest run tests/scanner/parseMcpJson.test.ts`
Expected: PASS(3 个测试)。

- [ ] **Step 5: Commit**

```bash
git add src/main/scanner/parseMcpJson.ts tests/scanner/parseMcpJson.test.ts
git commit -m "feat: parse .mcp.json into project-scope MCP caps"
```

---

## Task 6: 扫描 skill 目录

**Files:**
- Create: `src/main/scanner/scanSkills.ts`
- Test: `tests/scanner/scanSkills.test.ts`

- [ ] **Step 1: 写失败测试**

Create `tests/scanner/scanSkills.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanSkills } from '../../src/main/scanner/scanSkills';

describe('scanSkills', () => {
  it('returns [] when dir missing', () => {
    expect(scanSkills('/no/such/dir', 'user')).toEqual([]);
  });

  it('lists subdirectories as skills with given scope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cs-skills-'));
    mkdirSync(join(dir, 'graphify'));
    mkdirSync(join(dir, 'recall'));
    writeFileSync(join(dir, 'README.md'), 'not a skill'); // 文件应被忽略
    const skills = scanSkills(dir, 'user');
    expect(skills.map(s => s.id).sort()).toEqual(['graphify', 'recall']);
    expect(skills[0].scope).toBe('user');
    expect(skills.find(s => s.id === 'graphify')!.path).toBe(join(dir, 'graphify'));
    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd claude-station && npx vitest run tests/scanner/scanSkills.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 写实现**

Create `src/main/scanner/scanSkills.ts`:

```typescript
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillCapability } from '../types';

export function scanSkills(dir: string, scope: 'user' | 'project'): SkillCapability[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => ({ id: e.name, scope, path: join(dir, e.name) }));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd claude-station && npx vitest run tests/scanner/scanSkills.test.ts`
Expected: PASS(2 个测试)。

- [ ] **Step 5: Commit**

```bash
git add src/main/scanner/scanSkills.ts tests/scanner/scanSkills.test.ts
git commit -m "feat: scan skill directories into skill caps"
```

---

## Task 7: 解析 plugins(已装 + 启用层)

**Files:**
- Create: `src/main/scanner/parsePlugins.ts`
- Test: `tests/scanner/parsePlugins.test.ts`

`installed_plugins.json` 给出已安装清单;`settings.json` 的 `enabledPlugins`(name→bool)给出某作用域启用了哪些。本函数合并:列出已装 plugin,标注是否在给定的 enabledPlugins map 里为 true。

- [ ] **Step 1: 写失败测试**

Create `tests/scanner/parsePlugins.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parsePlugins } from '../../src/main/scanner/parsePlugins';

describe('parsePlugins', () => {
  const installed = {
    version: 2,
    plugins: {
      'superpowers@claude-plugins-official': [{ version: '5.1.0' }],
      'warp@claude-code-warp': [{ version: '2.1.0' }],
    },
  };

  it('marks enabled per the enabledPlugins map', () => {
    const caps = parsePlugins(installed, { 'superpowers@claude-plugins-official': true });
    const sp = caps.find(c => c.id === 'superpowers@claude-plugins-official')!;
    const warp = caps.find(c => c.id === 'warp@claude-code-warp')!;
    expect(sp.enabled).toBe(true);
    expect(warp.enabled).toBe(false);
  });

  it('handles missing installed data', () => {
    expect(parsePlugins(undefined, {})).toEqual([]);
    expect(parsePlugins({ plugins: {} }, {})).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd claude-station && npx vitest run tests/scanner/parsePlugins.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 写实现**

Create `src/main/scanner/parsePlugins.ts`:

```typescript
import type { PluginCapability } from '../types';

export function parsePlugins(
  installed: any,
  enabledPlugins: Record<string, boolean> | undefined,
): PluginCapability[] {
  const plugins = installed?.plugins ?? {};
  const enabled = enabledPlugins ?? {};
  return Object.keys(plugins).map(id => ({ id, enabled: enabled[id] === true }));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd claude-station && npx vitest run tests/scanner/parsePlugins.test.ts`
Expected: PASS(2 个测试)。

- [ ] **Step 5: Commit**

```bash
git add src/main/scanner/parsePlugins.ts tests/scanner/parsePlugins.test.ts
git commit -m "feat: parse installed plugins with per-scope enabled flag"
```

---

## Task 8: 合成 InferredState

**Files:**
- Create: `src/main/scanner/buildState.ts`
- Test: `tests/scanner/buildState.test.ts`

把前面所有 parser 串起来,读真实文件树(根可注入),产出 `InferredState`。每个项目的 MCP = 项目根 `.mcp.json` + 该项目 project-local MCP(去掉 disabled 的)。

- [ ] **Step 1: 写失败测试(临时目录造假 ~ 结构)**

Create `tests/scanner/buildState.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildState } from '../../src/main/scanner/buildState';

let home: string;
let proj: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cs-home-'));
  proj = join(home, 'ecc');
  mkdirSync(join(home, '.claude', 'skills', 'graphify'), { recursive: true });
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true });
  mkdirSync(join(proj, '.claude', 'skills', 'localskill'), { recursive: true });

  writeFileSync(join(home, '.claude.json'), JSON.stringify({
    mcpServers: { firecrawl: { command: 'npx', env: { K: 'v' } } },
    projects: {
      [proj]: { mcpServers: { plocal: { command: 'p' } }, disabledMcpServers: [] },
    },
  }));
  writeFileSync(join(proj, '.mcp.json'), JSON.stringify({
    mcpServers: { exa: { command: 'exa' } },
  }));
  writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({
    plugins: { 'superpowers@claude-plugins-official': [{ version: '5.1.0' }] },
  }));
  writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({
    enabledPlugins: { 'superpowers@claude-plugins-official': true },
  }));
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('buildState', () => {
  it('infers user-scope caps', () => {
    const s = buildState(home);
    expect(s.userScope.mcp.map(m => m.id)).toEqual(['firecrawl']);
    expect(s.userScope.skills.map(k => k.id)).toEqual(['graphify']);
    expect(s.userScope.plugins[0].enabled).toBe(true);
  });

  it('infers per-project caps: .mcp.json + project-local + project skills', () => {
    const s = buildState(home);
    const p = s.projects.find(x => x.path === proj)!;
    expect(p.mcp.map(m => m.id).sort()).toEqual(['exa', 'plocal']);
    expect(p.skills.map(k => k.id)).toEqual(['localskill']);
  });

  it('excludes disabled MCP from project list', () => {
    writeFileSync(join(home, '.claude.json'), JSON.stringify({
      mcpServers: {},
      projects: { [proj]: { mcpServers: { plocal: { command: 'p' } }, disabledMcpServers: ['plocal'] } },
    }));
    const s = buildState(home);
    const p = s.projects.find(x => x.path === proj)!;
    expect(p.mcp.map(m => m.id)).toEqual(['exa']); // plocal 被禁用,剔除
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd claude-station && npx vitest run tests/scanner/buildState.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 写实现**

Create `src/main/scanner/buildState.ts`:

```typescript
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { InferredState, ProjectState } from '../types';
import { resolvePaths, projectMcpJson, projectSkillsDir, projectSettings } from './paths';
import { parseClaudeJson } from './parseClaudeJson';
import { parseMcpJson } from './parseMcpJson';
import { scanSkills } from './scanSkills';
import { parsePlugins } from './parsePlugins';

function readJson(file: string): any {
  if (!existsSync(file)) return undefined;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; }
}

export function buildState(home: string = homedir()): InferredState {
  const paths = resolvePaths(home);
  const claudeJson = readJson(paths.claudeJson) ?? {};
  const cj = parseClaudeJson(claudeJson);
  const installed = readJson(paths.installedPlugins);
  const globalSettings = readJson(paths.globalSettings);

  const userScope = {
    mcp: cj.userMcp,
    skills: scanSkills(paths.globalSkillsDir, 'user'),
    plugins: parsePlugins(installed, globalSettings?.enabledPlugins),
  };

  const projects: ProjectState[] = cj.projectPaths.map(path => {
    const disabled = new Set(cj.disabledByProject[path] ?? []);
    const local = (cj.projectLocalMcp[path] ?? []).filter(m => !disabled.has(m.id));
    const fromMcpJson = parseMcpJson(projectMcpJson(path)).filter(m => !disabled.has(m.id));
    const projSettings = readJson(projectSettings(path));
    return {
      path,
      mcp: [...fromMcpJson, ...local],
      skills: scanSkills(projectSkillsDir(path), 'project'),
      plugins: parsePlugins(installed, projSettings?.enabledPlugins),
    };
  });

  return { userScope, projects };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd claude-station && npx vitest run tests/scanner/buildState.test.ts`
Expected: PASS(3 个测试)。

- [ ] **Step 5: 跑全部 scanner 测试**

Run: `cd claude-station && npx vitest run`
Expected: 全绿(parseClaudeJson 4 + parseMcpJson 3 + scanSkills 2 + parsePlugins 2 + buildState 3 = 14 passed)。

- [ ] **Step 6: Commit**

```bash
git add src/main/scanner/buildState.ts tests/scanner/buildState.test.ts
git commit -m "feat: compose InferredState from all scanners (reverse-import core)"
```

---

## Task 9: IPC + preload 桥

**Files:**
- Create: `src/main/ipc.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/vite-env.d.ts`

- [ ] **Step 1: 写 IPC handler**

Create `src/main/ipc.ts`:

```typescript
import { ipcMain } from 'electron';
import { buildState } from './scanner/buildState';

export function registerIpc(): void {
  ipcMain.handle('station:getState', () => buildState());
}
```

- [ ] **Step 2: 写 preload**

Create `src/preload/index.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { InferredState } from '../main/types';

contextBridge.exposeInMainWorld('station', {
  getState: (): Promise<InferredState> => ipcRenderer.invoke('station:getState'),
});
```

- [ ] **Step 3: 渲染进程类型声明**

Create `src/renderer/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />
import type { InferredState } from '../main/types';

declare global {
  interface Window {
    station: { getState: () => Promise<InferredState> };
  }
}
export {};
```

- [ ] **Step 4: 编译确认**

Run: `cd claude-station && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/renderer/vite-env.d.ts
git commit -m "feat: IPC channel + preload bridge for getState"
```

---

## Task 10: Electron 主入口 + 窗口

**Files:**
- Create: `src/main/index.ts`

- [ ] **Step 1: 写主入口**

Create `src/main/index.ts`:

```typescript
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 832,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#F5F4EE',
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: 编译确认**

Run: `cd claude-station && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: electron main entry + window (cream backdrop)"
```

---

## Task 11: 双主题 token + 字体

**Files:**
- Create: `src/renderer/theme/tokens.css`
- Create: `src/renderer/theme/fonts.ts`

色值取自 spec §11.1。浅色挂 `:root`,深色挂 `[data-theme="dark"]`。

- [ ] **Step 1: 写主题 token**

Create `src/renderer/theme/tokens.css`:

```css
:root {
  --bg-canvas: #F5F4EE;
  --bg-surface: #FBFAF7;
  --bg-rail: #EFEDE4;
  --accent: #D97757;
  --accent-hover: #C2654A;
  --text-primary: #2B2A27;
  --text-muted: #6B6862;
  --border: #E0DDD2;
  --shadow: 0 1px 3px rgba(60,56,48,.08);
  --state-applied: #5B7553;
  --state-pending: #C2965A;
  --state-drift: #B5543A;
  --font-serif: 'Source Serif 4', Georgia, serif;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

[data-theme="dark"] {
  --bg-canvas: #262421;
  --bg-surface: #302D29;
  --bg-rail: #211F1C;
  --accent: #E08A6B;
  --accent-hover: #EDA084;
  --text-primary: #EDE9E0;
  --text-muted: #9A958B;
  --border: #3E3A34;
  --shadow: 0 1px 3px rgba(0,0,0,.3);
  --state-applied: #7E9874;
  --state-pending: #D9AE6E;
  --state-drift: #D17354;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font-sans);
  color: var(--text-primary);
  background: var(--bg-canvas);
}
h1, h2, h3, .serif { font-family: var(--font-serif); }
```

- [ ] **Step 2: 写字体引入**

Create `src/renderer/theme/fonts.ts`:

```typescript
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/jetbrains-mono/400.css';
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/theme/tokens.css src/renderer/theme/fonts.ts
git commit -m "feat: light/dark theme tokens + local fonts"
```

---

## Task 12: 能力药丸节点

**Files:**
- Create: `src/renderer/canvas/CapabilityChip.tsx`

按类型左侧一道色条(spec §11.4)。这是只读展示组件,不接 React Flow 拖拽。

- [ ] **Step 1: 写组件**

Create `src/renderer/canvas/CapabilityChip.tsx`:

```tsx
import React from 'react';

const BAR: Record<string, string> = {
  mcp: '#D97757',     // 陶土橙
  skill: '#5B7553',   // 橄榄绿
  plugin: '#C2965A',  // 琥珀
};

export function CapabilityChip(props: {
  kind: 'mcp' | 'skill' | 'plugin';
  label: string;
  hasSecrets?: boolean;
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px 4px 8px', margin: 3, borderRadius: 8,
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      fontSize: 12, color: 'var(--text-primary)',
    }}>
      <span style={{ width: 3, height: 14, borderRadius: 2, background: BAR[props.kind] }} />
      {props.label}
      {props.hasSecrets && <span title="含密钥" style={{ color: 'var(--text-muted)' }}>🔑</span>}
    </span>
  );
}
```

- [ ] **Step 2: 编译确认**

Run: `cd claude-station && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/CapabilityChip.tsx
git commit -m "feat: capability chip with per-kind color bar"
```

---

## Task 13: 项目纸卡片节点

**Files:**
- Create: `src/renderer/canvas/ProjectNode.tsx`

React Flow 自定义节点。衬线标题 + 角标摘要 + 能力 chip 列表(spec §11.4)。

- [ ] **Step 1: 写组件**

Create `src/renderer/canvas/ProjectNode.tsx`:

```tsx
import React from 'react';
import type { NodeProps } from 'reactflow';
import { CapabilityChip } from './CapabilityChip';
import type { ProjectState } from '../../main/types';

export function ProjectNode({ data }: NodeProps<ProjectState>) {
  const name = data.path.split('/').pop() || data.path;
  const summary = `${data.mcp.length} MCP · ${data.skills.length} skill · ${data.plugins.filter(p => p.enabled).length} plugin`;
  return (
    <div style={{
      width: 260, background: 'var(--bg-surface)',
      border: '1px solid var(--border)', borderRadius: 12,
      boxShadow: 'var(--shadow)', padding: 16,
    }}>
      <div className="serif" style={{ fontSize: 16, fontWeight: 600 }}>{name}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, marginBottom: 10 }}>{summary}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {data.mcp.map(m => <CapabilityChip key={'m'+m.id} kind="mcp" label={m.id} hasSecrets={m.hasSecrets} />)}
        {data.skills.map(s => <CapabilityChip key={'s'+s.id} kind="skill" label={s.id} />)}
        {data.plugins.filter(p => p.enabled).map(p => <CapabilityChip key={'p'+p.id} kind="plugin" label={p.id.split('@')[0]} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 编译确认**

Run: `cd claude-station && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/ProjectNode.tsx
git commit -m "feat: project paper-card node with serif title + chips"
```

---

## Task 14: 画布

**Files:**
- Create: `src/renderer/canvas/Canvas.tsx`

把项目节点平铺成网格;暖灰点阵背景(spec §11.4)。

- [ ] **Step 1: 写画布**

Create `src/renderer/canvas/Canvas.tsx`:

```tsx
import React, { useMemo } from 'react';
import ReactFlow, { Background, BackgroundVariant, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { ProjectNode } from './ProjectNode';
import type { ProjectState } from '../../main/types';

const nodeTypes = { project: ProjectNode };

export function Canvas({ projects, onSelect }: {
  projects: ProjectState[];
  onSelect: (p: ProjectState) => void;
}) {
  const nodes = useMemo(() => projects.map((p, i) => ({
    id: p.path,
    type: 'project',
    position: { x: (i % 3) * 300 + 40, y: Math.floor(i / 3) * 240 + 40 },
    data: p,
  })), [projects]);

  return (
    <div style={{ flex: 1, height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => onSelect(n.data as ProjectState)}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: 编译确认**

Run: `cd claude-station && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/Canvas.tsx
git commit -m "feat: read-only React Flow canvas with dotted warm grid"
```

---

## Task 15: 右侧详情面板

**Files:**
- Create: `src/renderer/panel/DetailPanel.tsx`

只读展示选中项目的全部能力分组(M1 不含开关,后续里程碑加)。

- [ ] **Step 1: 写组件**

Create `src/renderer/panel/DetailPanel.tsx`:

```tsx
import React from 'react';
import type { ProjectState } from '../../main/types';

export function DetailPanel({ project }: { project: ProjectState | null }) {
  if (!project) {
    return (
      <aside style={panelStyle}>
        <p style={{ color: 'var(--text-muted)' }}>点击一个项目查看它挂了哪些能力</p>
      </aside>
    );
  }
  return (
    <aside style={panelStyle}>
      <h2 className="serif" style={{ fontSize: 18, marginTop: 0 }}>
        {project.path.split('/').pop()}
      </h2>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{project.path}</div>
      <Group title={`MCP (${project.mcp.length})`} items={project.mcp.map(m => m.id + (m.hasSecrets ? ' 🔑' : ''))} />
      <Group title={`Skills (${project.skills.length})`} items={project.skills.map(s => s.id)} />
      <Group title={`Plugins (${project.plugins.filter(p => p.enabled).length})`} items={project.plugins.filter(p => p.enabled).map(p => p.id)} />
    </aside>
  );
}

function Group({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="serif" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {items.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</div>
        : items.map(i => <div key={i} style={{ fontSize: 12, padding: '2px 0' }}>{i}</div>)}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 300, height: '100%', padding: 20, overflowY: 'auto',
  background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
};
```

- [ ] **Step 2: 编译确认**

Run: `cd claude-station && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/panel/DetailPanel.tsx
git commit -m "feat: read-only project detail panel"
```

---

## Task 16: App 布局 + 主题切换

**Files:**
- Create: `src/renderer/App.tsx`

左栏库占位(M2 填充)+ 中间画布 + 右侧面板;顶栏一个主题切换按钮。开机调 `window.station.getState()`。

- [ ] **Step 1: 写 App**

Create `src/renderer/App.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Canvas } from './canvas/Canvas';
import { DetailPanel } from './panel/DetailPanel';
import type { InferredState, ProjectState } from '../main/types';

export function App() {
  const [state, setState] = useState<InferredState | null>(null);
  const [selected, setSelected] = useState<ProjectState | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => { window.station.getState().then(setState); }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{
        height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
        WebkitUserSelect: 'none',
      }}>
        <span className="serif" style={{ fontWeight: 600 }}>Claude Station</span>
        <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px',
                   background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer' }}>
          {theme === 'light' ? '🌙 深色' : '☀️ 浅色'}
        </button>
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside style={{ width: 200, background: 'var(--bg-rail)', borderRight: '1px solid var(--border)', padding: 16 }}>
          <div className="serif" style={{ fontSize: 13, color: 'var(--text-muted)' }}>库(M2 启用)</div>
        </aside>
        {state ? <Canvas projects={state.projects} onSelect={setSelected} />
               : <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>读取配置中…</div>}
        <DetailPanel project={selected} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 编译确认**

Run: `cd claude-station && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: app shell with rail/canvas/panel + theme toggle"
```

---

## Task 17: 渲染进程入口

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/main.tsx`

- [ ] **Step 1: 写 HTML**

Create `src/renderer/index.html`:

```html
<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claude Station</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 写 React 挂载**

Create `src/renderer/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme/fonts';
import './theme/tokens.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 3: 编译确认**

Run: `cd claude-station && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/index.html src/renderer/main.tsx
git commit -m "feat: renderer entry (html + react mount)"
```

---

## Task 18: 整体冒烟验证

**Files:** 无(纯验证)

- [ ] **Step 1: 全单测**

Run: `cd claude-station && npx vitest run`
Expected: 14 passed(scanner 全绿)。

- [ ] **Step 2: 类型全过**

Run: `cd claude-station && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 3: 构建**

Run: `cd claude-station && npm run build`
Expected: out/main、out/preload、out/renderer 三处产物生成,无 error。

- [ ] **Step 4: 手动启动(人工确认)**

Run: `cd claude-station && npm run dev`
人工核对:
- 窗口打开,cream 纸感底 + 暖灰点阵网格。
- 画布上出现真实项目卡片(应见 ecc、案管系统、智能体大赛 等 7 个项目)。
- 卡片显示角标 `N MCP · N skill · N plugin`,数字与真实现状吻合(项目里没本地 MCP 的应显示其 .mcp.json/.claude 实况)。
- 点卡片,右侧面板列出该项目能力分组。
- 点右上角切深色,整体变暖炭底、陶土橙提亮,无写死色值残留。

- [ ] **Step 5: Commit(若有微调)**

```bash
git add -A
git commit -m "chore: M1 smoke-test pass — reverse-import + read-only canvas"
```

---

## 完成标准(M1)

- [ ] 14 个 scanner 单测全绿。
- [ ] `npm run build` 无 error。
- [ ] 启动后画布正确反推并展示 7 个存量项目的真实能力归属。
- [ ] 浅/深双主题切换正常,符合 spec §11 高保真 Claude 风格。
- [ ] 全程不写任何真实 Claude 配置文件(只读)。
