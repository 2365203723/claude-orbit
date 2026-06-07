# Claude Station — M2.5 (全局 MCP 清理) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户把已落地的 user-scope MCP 从 `~/.claude.json` 顶层 `mcpServers` 安全删除——这是真正止住"全局注入"的一步。只有已装配到某项目且已 Apply(在 `lastApplied` 里)的全局 MCP 才可删;未落地的拒删并标注。删前备份 + 显式确认,只动顶层指定 key,其余字段一字不动。

**Architecture:** 在 `src/main/station/cleanup.ts` 新增一组**纯函数**(判定每个顶层全局 MCP 的可删资格 + 结构化删除)+ 一个 I/O 编排(备份→读→删→写,内部二次过滤只删合格项,防御不可逆误删)。IPC 暴露 `station:globalStatus`(查 6 个的资格)与 `station:cleanupGlobal`(执行)。渲染层在左栏库底部加一个"全局注入"区,逐项显示 🟢可清理 / 🔒未落地,清理走二次确认弹窗。

**Tech Stack:** 沿用 M2 — Electron + electron-vite + TypeScript;React;Vitest。无新依赖。

参考 spec:`docs/superpowers/specs/2026-06-08-claude-station-design.md` §5.1(安全模型)、§8(写前备份/结构化合并)。已确认决策:**"已落地"前提**——只有已 Apply 到某项目的全局 MCP 才能从顶层删除。

**复用的现有模块(导入勿重写):**
- `src/main/types.ts`:`InferredState`、`McpServerDef`。
- `src/main/station/types.ts`:`StationState`、`AppliedSnapshot`。
- `src/main/station/store.ts`:`loadState`/`saveState`/`emptyState`。
- `src/main/station/backup.ts`:`backupFiles(files, stamp, home?)`。
- `src/main/scanner/paths.ts`:`resolvePaths(home).claudeJson`。
- `src/main/scanner/buildState.ts`:`buildState(home?)`(给顶层全局 MCP 现状)。
- `src/main/ipc.ts`、`src/preload/index.ts`、`src/renderer/vite-env.d.ts`(扩展)。
- `src/renderer/rail/LibraryRail.tsx`、`src/renderer/App.tsx`(扩展)。

**范围:** 只清理 MCP。skill 全局清理留待后续 skill 装配里程碑(机制对称,不在本期)。

---

## 文件结构

```
src/main/station/
  cleanup.ts       # 新增:landedGlobalIds / globalCleanupStatus / removeGlobalMcp(纯)
                   #       + executeGlobalCleanup(I/O 编排,内部只删合格项)
src/main/ipc.ts            # 加 station:globalStatus + station:cleanupGlobal
src/preload/index.ts       # 暴露 globalStatus / cleanupGlobal
src/renderer/vite-env.d.ts # 类型同步
src/renderer/rail/
  GlobalCleanupSection.tsx # 新增:左栏底部"全局注入"区,逐项状态 + 退役按钮
src/renderer/apply/
  ConfirmModal.tsx         # 新增:通用二次确认弹窗(清理用)
src/renderer/App.tsx       # 装入 status、退役流程、清理后 reload
tests/station/
  cleanup.test.ts          # 纯函数
  executeGlobalCleanup.test.ts  # I/O 编排
```

---

## 数据形状(复用,无新类型文件)

```typescript
// station:globalStatus 返回
export interface GlobalCleanupStatus {
  eligible: string[];   // 已落地、可从顶层删除的全局 MCP id
  blocked: string[];    // 未落地、拒删的全局 MCP id(UI 显示"未落地")
}
```
（定义在 `cleanup.ts` 内导出即可,不单开 types 文件。）

---

## Task 1: 清理判定 + 结构化删除(纯函数)

**Files:** Create `src/main/station/cleanup.ts`, Test `tests/station/cleanup.test.ts`

三个纯函数:
- `landedGlobalIds(state)`:扫所有项目 `lastApplied`(mcpJson + localScope 两组的 key 并集),返回"已落地"的 id 集合。
- `globalCleanupStatus(topLevelIds, state)`:把顶层全局 id 分成 `eligible`(已落地)/ `blocked`(未落地)。
- `removeGlobalMcp(claudeJson, ids)`:返回新对象,只从顶层 `mcpServers` 删除给定 id,其余字段(其他全局、projects、lastCost…)不动;不可变。

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest';
import { landedGlobalIds, globalCleanupStatus, removeGlobalMcp } from '../../src/main/station/cleanup';
import { emptyState } from '../../src/main/station/store';

describe('landedGlobalIds', () => {
  it('collects ids from both mcpJson and localScope of all projects lastApplied', () => {
    const s = emptyState();
    s.lastApplied['/a'] = { mcpJson: { exa: { command: 'exa' } }, localScope: { firecrawl: { command: 'npx' } } };
    s.lastApplied['/b'] = { mcpJson: {}, localScope: { memory: { command: 'm' } } };
    expect([...landedGlobalIds(s)].sort()).toEqual(['exa', 'firecrawl', 'memory']);
  });
  it('empty when nothing applied', () => {
    expect([...landedGlobalIds(emptyState())]).toEqual([]);
  });
});

describe('globalCleanupStatus', () => {
  it('splits top-level ids into eligible (landed) and blocked (not landed)', () => {
    const s = emptyState();
    s.lastApplied['/a'] = { mcpJson: {}, localScope: { firecrawl: { command: 'npx' } } };
    const status = globalCleanupStatus(['firecrawl', 'memory', 'codegraph'], s);
    expect(status.eligible).toEqual(['firecrawl']);
    expect(status.blocked.sort()).toEqual(['codegraph', 'memory']);
  });
});

describe('removeGlobalMcp', () => {
  it('removes only given ids from top-level mcpServers, preserves everything else', () => {
    const cj = {
      mcpServers: { firecrawl: { command: 'npx' }, memory: { command: 'm' }, codegraph: { command: 'c' } },
      projects: { '/a': { lastCost: 5, mcpServers: { local: { command: 'l' } } } },
      someKey: 1,
    };
    const next = removeGlobalMcp(cj, ['firecrawl']);
    expect(Object.keys(next.mcpServers).sort()).toEqual(['codegraph', 'memory']); // firecrawl gone
    expect(next.projects['/a'].mcpServers).toEqual({ local: { command: 'l' } });  // project-local untouched
    expect(next.projects['/a'].lastCost).toBe(5);
    expect(next.someKey).toBe(1);
  });
  it('does not mutate input', () => {
    const cj = { mcpServers: { firecrawl: { command: 'npx' } } };
    const snapshot = JSON.stringify(cj);
    removeGlobalMcp(cj, ['firecrawl']);
    expect(JSON.stringify(cj)).toBe(snapshot);
  });
  it('idempotent: removing absent id is a no-op', () => {
    const cj = { mcpServers: { memory: { command: 'm' } } };
    const next = removeGlobalMcp(cj, ['firecrawl']);
    expect(next.mcpServers).toEqual({ memory: { command: 'm' } });
  });
  it('handles missing mcpServers gracefully', () => {
    expect(removeGlobalMcp({}, ['x']).mcpServers).toEqual({});
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `npx vitest run tests/station/cleanup.test.ts` → FAIL(模块不存在)。

- [ ] **Step 3: 写实现**

```typescript
import type { McpServerDef } from '../types';
import type { StationState } from './types';

export interface GlobalCleanupStatus { eligible: string[]; blocked: string[]; }

export function landedGlobalIds(state: StationState): Set<string> {
  const ids = new Set<string>();
  for (const snap of Object.values(state.lastApplied)) {
    for (const id of Object.keys(snap.mcpJson)) ids.add(id);
    for (const id of Object.keys(snap.localScope)) ids.add(id);
  }
  return ids;
}

export function globalCleanupStatus(topLevelIds: string[], state: StationState): GlobalCleanupStatus {
  const landed = landedGlobalIds(state);
  const eligible: string[] = [];
  const blocked: string[] = [];
  for (const id of topLevelIds) (landed.has(id) ? eligible : blocked).push(id);
  return { eligible, blocked };
}

export function removeGlobalMcp(claudeJson: any, ids: string[]): any {
  const base = claudeJson ?? {};
  const servers: Record<string, McpServerDef> = { ...(base.mcpServers ?? {}) };
  for (const id of ids) delete servers[id];
  return { ...base, mcpServers: servers };
}
```

- [ ] **Step 4: 跑测试确认通过**(landed 2 + status 1 + remove 4 = 7)。

- [ ] **Step 5: Commit**
```bash
git add src/main/station/cleanup.ts tests/station/cleanup.test.ts
git commit -m "feat(station): global-cleanup eligibility + structural top-level removal (pure)"
```

---

## Task 2: 清理执行(I/O 编排,防御性二次过滤)

**Files:** Modify `src/main/station/cleanup.ts`(加 `executeGlobalCleanup`), Test `tests/station/executeGlobalCleanup.test.ts`

`executeGlobalCleanup(requestedIds, stamp, home?)`:读 `~/.claude.json` → 取顶层 `mcpServers` 的真实 id → 用 `globalCleanupStatus` 算 eligible → **只删 requested ∩ eligible**(即便调用方传了未落地的 id 也绝不删,这是不可逆操作的防御纵深)→ 无可删项则不写不备份直接返回 `[]` → 否则备份 `~/.claude.json` → `removeGlobalMcp` → 写回。返回实际删除的 id 列表。

- [ ] **Step 1: 写失败测试(临时 home,真写真读)**

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeGlobalCleanup } from '../../src/main/station/cleanup';
import { emptyState, saveState } from '../../src/main/station/store';
import { resolvePaths } from '../../src/main/scanner/paths';

describe('executeGlobalCleanup', () => {
  it('removes only landed+requested ids, backs up, preserves other globals + projects', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-gc-'));
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({
      mcpServers: { firecrawl: { command: 'npx' }, memory: { command: 'm' }, codegraph: { command: 'c' } },
      projects: { '/a': { lastCost: 5 } },
    }));
    const s = emptyState();
    s.lastApplied['/a'] = { mcpJson: {}, localScope: { firecrawl: { command: 'npx' } } }; // only firecrawl landed
    saveState(s, home);

    // request all three, but only firecrawl is landed → only firecrawl removed
    const removed = executeGlobalCleanup(['firecrawl', 'memory', 'codegraph'], '20260608-090909', home);
    expect(removed).toEqual(['firecrawl']);

    const cj = JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8'));
    expect(Object.keys(cj.mcpServers).sort()).toEqual(['codegraph', 'memory']); // memory/codegraph kept (blocked)
    expect(cj.projects['/a'].lastCost).toBe(5);
    expect(existsSync(join(home, '.claude-station', 'backups', '20260608-090909'))).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });

  it('no eligible ids → no write, no backup, returns []', () => {
    const home = mkdtempSync(join(tmpdir(), 'cs-gc2-'));
    writeFileSync(resolvePaths(home).claudeJson, JSON.stringify({ mcpServers: { memory: { command: 'm' } } }));
    saveState(emptyState(), home); // nothing landed
    const removed = executeGlobalCleanup(['memory'], '20260608-101010', home);
    expect(removed).toEqual([]);
    // file unchanged, no backup dir for this stamp
    expect(JSON.parse(readFileSync(resolvePaths(home).claudeJson, 'utf8')).mcpServers).toEqual({ memory: { command: 'm' } });
    expect(existsSync(join(home, '.claude-station', 'backups', '20260608-101010'))).toBe(false);
    rmSync(home, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `executeGlobalCleanup` 未导出。

- [ ] **Step 3: 在 cleanup.ts 追加实现**

加 imports(与现有 import 合并,勿重复):
```typescript
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolvePaths } from '../scanner/paths';
import { backupFiles } from './backup';
import { loadState } from './store';
```
追加:
```typescript
function readJson(file: string): any {
  if (!existsSync(file)) return undefined;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; }
}

export function executeGlobalCleanup(requestedIds: string[], stamp: string, home: string = homedir()): string[] {
  const claudeJsonFile = resolvePaths(home).claudeJson;
  const cj = readJson(claudeJsonFile);
  const topLevelIds = Object.keys(cj?.mcpServers ?? {});
  const { eligible } = globalCleanupStatus(topLevelIds, loadState(home));
  const eligibleSet = new Set(eligible);
  const toRemove = requestedIds.filter(id => eligibleSet.has(id));
  if (!toRemove.length) return [];

  backupFiles([claudeJsonFile], stamp, home);
  writeFileSync(claudeJsonFile, JSON.stringify(removeGlobalMcp(cj, toRemove), null, 2));
  return toRemove;
}
```

- [ ] **Step 4: 跑测试确认通过**(2 个)。关键断言:未落地的 memory/codegraph 即便被请求也没删。

- [ ] **Step 5: 跑全部 cleanup 测试 + tsc** — `npx vitest run tests/station/cleanup.test.ts tests/station/executeGlobalCleanup.test.ts` 全绿;`npx tsc --noEmit` clean。

- [ ] **Step 6: Commit**
```bash
git add src/main/station/cleanup.ts tests/station/executeGlobalCleanup.test.ts
git commit -m "feat(station): executeGlobalCleanup — backup + defensive landed-only removal"
```

---

## Task 3: 清理 IPC

**Files:** Modify `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/vite-env.d.ts`

顶层全局 id 来源:`buildState(home).userScope.mcp`(scope='user' 的就是顶层 `mcpServers`)。

- [ ] **Step 1: 在 ipc.ts 的 registerIpc() 内追加两个 handler**(保留已有的;新增 import)

```typescript
import { globalCleanupStatus, executeGlobalCleanup } from './station/cleanup';
```
在 `registerIpc()` 体内追加:
```typescript
  ipcMain.handle('station:globalStatus', () => {
    const home = homedir();
    const topLevelIds = buildState(home).userScope.mcp.map(m => m.id);
    return globalCleanupStatus(topLevelIds, loadState(home));
  });

  ipcMain.handle('station:cleanupGlobal', (_e, ids: string[]) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return executeGlobalCleanup(ids, stamp);
  });
```
(ipc.ts 已 import `homedir`、`buildState`、`loadState`——若缺则补;勿重复。)

- [ ] **Step 2: preload/index.ts 暴露两个方法**(加在现有 station 对象内)

```typescript
  globalStatus: (): Promise<{ eligible: string[]; blocked: string[] }> => ipcRenderer.invoke('station:globalStatus'),
  cleanupGlobal: (ids: string[]): Promise<string[]> => ipcRenderer.invoke('station:cleanupGlobal', ids),
```

- [ ] **Step 3: vite-env.d.ts 同步类型**(加在 `station: { ... }` 内)

```typescript
      globalStatus: () => Promise<{ eligible: string[]; blocked: string[] }>;
      cleanupGlobal: (ids: string[]) => Promise<string[]>;
```

- [ ] **Step 4: tsc** — `npx tsc --noEmit` clean;channel 名 `station:globalStatus` / `station:cleanupGlobal` 在 ipc.ts 与 preload 逐字一致。

- [ ] **Step 5: Commit**
```bash
git add src/main/ipc.ts src/preload/index.ts src/renderer/vite-env.d.ts
git commit -m "feat(station): IPC for global cleanup status + execute"
```

---

## Task 4: 清理 UI(全局注入区 + 确认弹窗)

**Files:** Create `src/renderer/apply/ConfirmModal.tsx`, Create `src/renderer/rail/GlobalCleanupSection.tsx`, Modify `src/renderer/App.tsx`

- [ ] **Step 1: 写通用确认弹窗 ConfirmModal.tsx**

```tsx
import React from 'react';

export function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'grid', placeItems: 'center', zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow)' }}>
        <h2 className="serif" style={{ marginTop: 0, fontSize: 18 }}>{title}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{body}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer' }}>取消</button>
          <button onClick={onConfirm} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--state-drift)', color: '#fff', cursor: 'pointer' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 写 GlobalCleanupSection.tsx**

```tsx
import React from 'react';

export function GlobalCleanupSection({ status, onRetire }: {
  status: { eligible: string[]; blocked: string[] } | null;
  onRetire: (id: string) => void;
}) {
  if (!status || (status.eligible.length === 0 && status.blocked.length === 0)) return null;
  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div className="serif" style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>全局注入</div>
      {status.eligible.map(id => (
        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12 }}>
          <span title="已落地,可清理" style={{ color: 'var(--state-applied)' }}>🟢</span>
          <span>{id}</span>
          <button onClick={() => onRetire(id)} style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--state-drift)', cursor: 'pointer' }}>退役</button>
        </div>
      ))}
      {status.blocked.map(id => (
        <div key={id} title="未落地到任何项目,不能清理" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12, color: 'var(--text-muted)' }}>
          <span>🔒</span><span>{id}</span><span style={{ marginLeft: 'auto', fontSize: 10 }}>未落地</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 在 App.tsx 接入**。具体改动:

(a) 顶部加 import:
```tsx
import { GlobalCleanupSection } from './rail/GlobalCleanupSection';
import { ConfirmModal } from './apply/ConfirmModal';
```
(b) 加状态:
```tsx
  const [globalStatus, setGlobalStatus] = useState<{ eligible: string[]; blocked: string[] } | null>(null);
  const [retireId, setRetireId] = useState<string | null>(null);
```
(c) `reload` 里同时取全局状态——把 reload 体改为:
```tsx
  const reload = useCallback(async () => {
    const [inferred, d, gs] = await Promise.all([
      window.station.getState(), window.station.loadDesired(), window.station.globalStatus(),
    ]);
    setProjects(inferred.projects);
    setDesired(d);
    setGlobalStatus(gs);
  }, []);
```
(d) 退役确认:
```tsx
  const confirmRetire = async () => {
    if (retireId) await window.station.cleanupGlobal([retireId]);
    setRetireId(null);
    await reload();
  };
```
(e) 在 `<LibraryRail .../>` 之后、同一父层内,渲染 section(LibraryRail 是 aside;把 section 放在它下面——为简单起见,改成把 GlobalCleanupSection 放在 LibraryRail 同级的左侧列。最小改动:用一个包裹 div 同时容纳 LibraryRail 和 section):

把
```tsx
        <LibraryRail mcp={libMcp} />
```
替换为
```tsx
        <div style={{ display: 'flex', flexDirection: 'column', width: 200 }}>
          <LibraryRail mcp={libMcp} />
          <div style={{ padding: '0 16px' }}>
            <GlobalCleanupSection status={globalStatus} onRetire={setRetireId} />
          </div>
        </div>
```
(注:LibraryRail 自带 width:200;包裹后它会撑满父列,可接受。)

(f) 在 `<DiffModal .../>` 之后加退役确认弹窗:
```tsx
      {retireId && (
        <ConfirmModal
          title={`退役全局 MCP:${retireId}`}
          body={`将从 ~/.claude.json 顶层移除 ${retireId}。删除后,未显式装配此 MCP 的项目将不再自动获得它(它仍保留在库中,可随时装配给项目)。已自动备份,可回滚。`}
          confirmLabel="确认退役"
          onConfirm={confirmRetire}
          onCancel={() => setRetireId(null)}
        />
      )}
```

- [ ] **Step 4: tsc + 构建** — `npx tsc --noEmit` clean;`npm run build` 无 error。

- [ ] **Step 5: Commit**
```bash
git add src/renderer/apply/ConfirmModal.tsx src/renderer/rail/GlobalCleanupSection.tsx src/renderer/App.tsx
git commit -m "feat(ui): global-injection cleanup section + retire confirm modal"
```

---

## Task 5: 整体验证

**Files:** 无(纯验证)

- [ ] **Step 1: 全单测** — `npx vitest run`。M2 的 46 + cleanup 7 + executeGlobalCleanup 2 = 55,应全绿。报告总数。
- [ ] **Step 2: 类型** — `npx tsc --noEmit` clean。
- [ ] **Step 3: 构建** — `npm run build` 三产物无 error。
- [ ] **Step 4: 安全自检(临时 home,不碰真实 ~)** — 写一个临时 vitest(tests/station/ 下)用假 home 造 `~/.claude.json`(顶层 3 个全局)+ state(1 个已落地),跑 `executeGlobalCleanup` 请求全部 3 个,断言只删掉已落地那个、其余 2 个保留、备份目录存在。跑完删除该临时测试文件,确认 git 干净。
- [ ] **Step 5: 手动验证(人工)** — `npm run dev`:左栏底部"全局注入"区出现;已落地的显 🟢+退役按钮,未落地显 🔒;点退役 → 确认弹窗讲清残留效应 → 确认后该全局从顶层消失,其余全局 + projects + lastCost 保留;`~/.claude-station/backups/<时间戳>/` 有备份。

---

## 完成标准(M2.5)

- [ ] cleanup 纯函数 + executeGlobalCleanup 集成测试全绿(9 个新测试)。
- [ ] `npm run build` 无 error。
- [ ] 只有已落地的全局 MCP 可删;未落地的资格函数 + UI 双重挡住。
- [ ] 删除只动顶层 `mcpServers` 指定 key;projects / lastCost / 其他全局保留。
- [ ] 删前备份 + 二次确认弹窗讲清残留效应;被删的 MCP 仍留在库中可再装配。
