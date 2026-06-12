<p align="center">
  <img src="docs/screenshots/canvas.png" alt="Claude Orbit" width="90%" style="border-radius: 12px;" />
</p>

<div align="center">

<a href="#中文">🇨🇳 中文</a> &nbsp;·&nbsp; <a href="#english">🇺🇸 English</a>

</div>

---

<h1 id="中文">🇨🇳 Claude Orbit</h1>

<p align="center">
  <em>Claude Code 项目的可视化能力装配台——拖拽即应用,完美隔离,数据零风险。</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/测试-通过-green.svg" alt="Tests" />
  <img src="https://img.shields.io/badge/Electron-33%2B-47848f.svg" alt="Electron" />
  <img src="https://img.shields.io/badge/TypeScript-5.6%2B-3178c6.svg" alt="TypeScript" />
  <a href="https://github.com/2365203723/claude-orbit/releases"><img src="https://img.shields.io/badge/下载-最新版本-orange.svg" alt="Download" /></a>
</p>

### 为什么需要 Claude Orbit？

Claude Code 的 MCP 服务器、Skills、Plugins 默认**全局注入所有项目**。想让某个项目只用特定能力？这就是 Orbit 的用途。

```
❌ 没有 Orbit: 全局配置 → 所有项目都能用所有的东西
✅ 有了 Orbit:  每个项目只挂你需要的能力，真正隔离
```

### 功能

| 功能 | 说明 |
|------|------|
| 🔄 **反向导入** | 启动即扫描真实配置文件，自动发现已有项目和能力 |
| 🪐 **星球图谱** | 项目 = 液态玻璃星球，能力 = 轨道卫星，拖拽即装配 |
| ⚡ **拖拽即应用** | 拖到星球 → 立刻写盘，卫星变绿色——无需第二步 |
| 📦 **Bundles** | 能力组合包（如 Firecrawl = 1 MCP + 30 skills），一次拖拽全部挂载 |
| 🔍 **Skill 一键扫描** | 从 `~/.claude/skills` / `~/.agents/skills` 自动发现 Skill，一键收入 Orbit 库 |
| 📥 **Skill 手动导入** | 从本机任意目录导入单个 Skill 到 Orbit 库 |
| 🩺 **死链检测** | 源文件被删/移动的 Skill 在 UI 上标红警告 |
| ⚠️ **漂移检测** | 检测项目配置是否被 Orbit 外部手动改动过，详情面板显示警告 |
| 🔒 **数据安全** | JSON 文件严格读取(解析失败绝不覆盖) + 原子写入 + fsync(崩溃不掉数据) |
| 🔑 **密钥保护** | MCP 密钥不发送到渲染进程；UI 中遮罩显示 |
| 💾 **备份与恢复** | 每次写入前自动备份；可从备份恢复到任意时间点 |
| 🎨 **液态玻璃** | 浅色/深色/跟随系统三态主题，Claude 暖色调 + Apple 液态玻璃 |
| ⌨️ **键盘可达** | aria 标签、焦点陷阱、Escape 关闭、⌘F 搜索 |
| 🌐 **Global 星球** | 管理全局可见的能力 |
| 🗑 **安全删除** | 项目删除走系统废纸篓，可恢复 |

### 安装与使用

```bash
git clone https://github.com/2365203723/claude-orbit.git
cd claude-orbit
npm install
npm run dev      # Electron 开发模式
npm test         # 运行测试套件
npm run build    # 生产构建
```

**下载安装包：**

[📥 下载最新版本](https://github.com/2365203723/claude-orbit/releases) — macOS DMG / Windows EXE

> [!IMPORTANT]
> **macOS 用户必读：** 由于未加入 Apple Developer Program（$99/年），安装包未经公证。
> Gatekeeper 会显示「已损坏，无法打开」。**应用本身完好无损**，请按以下方法打开：
>
> ```bash
> # 方法 1：移除检疫标记（推荐，一劳永逸）
> xattr -cr /Applications/Claude\ Orbit.app
>
> # 方法 2：右键点击应用 → 打开，然后选择「打开」
> ```
>
> 技术原理：macOS 对下载的 DMG 自动打 `com.apple.quarantine` 标记，未经公证的应用被
> Gatekeeper 拦截。移除检疫标记即绕过此检查。

```bash
npm run dist:mac    # macOS → DMG
npm run dist:win    # Windows → EXE
```

### 使用流程

```
安装 Skill / MCP / Plugin
        │
        ▼
   🔍 一键扫描(或 📥 手动导入 Skill)
        │
        ▼
   能力出现在左侧库 → 拖到项目星球
        │
        ▼
   自动写盘(原子写入 + 备份) → Claude Code 即时可用 /skills
```

| 能力类型 | 安装方式 | 分配方式 |
|---------|---------|---------|
| Skill | 🔍 扫描全局安装位置 或 📥 选目录导入 | symlink 到 `<project>/.claude/skills/` |
| MCP | `claude mcp add` 或在 Orbit 编辑 env | 写入 `~/.claude.json` local scope |
| Plugin | `claude plugins install`（Claude Code 命令行） | 写入 `settings.json` enabledPlugins |
| Bundle | Orbit 内 ✚ 新建 | 展开为一组 MCP + Skill + Plugin |

### 架构

```
Library → Desired State → Real Config Files
(能力库)   (state.json)    (~/.claude.json, project/.claude/*)
    ↑                          │
    └── 启动反向导入 ←──────────┘
```

**核心设计原则：**
- 所有 MCP 路由到 **`~/.claude.json` path-exact local scope**（`projects[path].mcpServers`），路径精确——**不写 `.mcp.json`**
- Skills → `<project>/.claude/skills/<id>` symlink，源统一收拢在 `~/.claude-orbit/library/skills/`
- Plugins → `<project>/.claude/settings.json`（`enabledPlugins`）
- 所有配置文件写入：严格读 + 原子写（tmp + rename + fsync）→ 断电零数据损失
- 纯函数核心 + 副作用壳：所有逻辑可脱离 Electron 测试

### 技术栈

| 层 | 技术 |
|---|------|
| 壳 | Electron 33 |
| UI | React 18 + Motion (spring physics) |
| 语言 | TypeScript 5.6 全栈 |
| 测试 | Vitest — 单元测试 |
| 构建 | electron-vite + electron-builder |
| CI | GitHub Actions (typecheck + test + build) |

### 数据布局

| 路径 | 内容 |
|------|------|
| `~/.claude-orbit/state.json` | 期望状态（assignments + library 索引） |
| `~/.claude-orbit/library/skills/` | Skill 源（统一收拢，不受外部工具影响） |
| `~/.claude-orbit/backups/` | 每次写入前的带时间戳备份（可恢复） |
| `~/.claude.json` | 项目级 MCP（local scope），由 Orbit 管理 |
| `<project>/.claude/skills/` | 项目 skill symlink → Orbit 库 |
| `<project>/.claude/settings.json` | 项目启用的插件 |

---

<h1 id="english">🇺🇸 Claude Orbit</h1>

<p align="center">
  <em>Visual capability assembly station for Claude Code — drag to apply, perfect isolation, zero data risk.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/Tests-passing-green.svg" alt="Tests" />
  <img src="https://img.shields.io/badge/Electron-33%2B-47848f.svg" alt="Electron" />
  <img src="https://img.shields.io/badge/TypeScript-5.6%2B-3178c6.svg" alt="TypeScript" />
  <a href="https://github.com/2365203723/claude-orbit/releases"><img src="https://img.shields.io/badge/Download-Latest-orange.svg" alt="Download" /></a>
</p>

### Why Claude Orbit?

Claude Code injects MCP servers, Skills, and Plugins into **every** project by default. Orbit gives you true per-project isolation:

```
❌ Default:   global config → everything reaches every project
✅ With Orbit: drag & drop → project-specific, instant apply
```

### Features

| Feature | Detail |
|---------|--------|
| 🔄 **Reverse Import** | Auto-discovers existing projects and capabilities on launch |
| 🪐 **Planet Graph** | Projects = liquid-glass planets, capabilities = orbiting satellite badges |
| ⚡ **Drag = Apply** | Drop onto a planet → written to disk immediately |
| 📦 **Bundles** | Pre-grouped sets (e.g. Firecrawl = 1 MCP + 30 skills) — drag once, mount all |
| 🔍 **Skill Scan** | One-click import from `~/.claude/skills` and `~/.agents/skills` into Orbit library |
| 📥 **Skill Import** | Import a single skill directory from anywhere on disk |
| 🩺 **Dead Link Detection** | Skills with missing source files are flagged in the UI with ⚠ |
| ⚠️ **Drift Detection** | Detects config changes made outside Orbit and warns in the detail panel |
| 🔒 **Data Safety** | Strict JSON reads (never overwrites corrupt files) + atomic writes + fsync |
| 🔑 **Secret Safety** | MCP credentials masked in UI, never sent to renderer process |
| 💾 **Backup & Restore** | Auto-backup before every write; restore to any timestamp |
| 🎨 **Liquid Glass** | Light / Dark / Auto theme — Claude warm tones + Apple glass |
| ⌨️ **Keyboard Nav** | Aria labels, focus trap, Escape to close, ⌘F search |
| 🌐 **Global Planet** | Manage global capabilities from the canvas |
| 🗑 **Safe Delete** | Project deletion uses system Trash (recoverable) |

### Quick Start

```bash
git clone https://github.com/2365203723/claude-orbit.git
cd claude-orbit
npm install
npm run dev      # Electron dev mode
npm test         # run the test suite
npm run build    # Production build
```

**Download installers:**

[📥 Download Latest](https://github.com/2365203723/claude-orbit/releases) — macOS DMG / Windows EXE

> [!IMPORTANT]
> **macOS users:** The app is unsigned (not in Apple Developer Program, $99/yr).
> Gatekeeper will flag it. **The app is intact.** Fix:
>
> ```bash
> # Method 1: Remove quarantine flag (recommended, permanent)
> xattr -cr /Applications/Claude\ Orbit.app
>
> # Method 2: Right-click → Open, then click "Open" in the dialog
> ```

```bash
npm run dist:mac    # macOS → DMG
npm run dist:win    # Windows → EXE
```

### Workflow

```
Install a Skill / MCP / Plugin
        │
        ▼
   🔍 Scan (or 📥 import single Skill)
        │
        ▼
   Appears in library → drag to project planet
        │
        ▼
   Auto-written to disk (atomic + backup) → available via /skills
```

| Type | Install | Applied As |
|------|---------|------------|
| Skill | 🔍 scan global installs or 📥 pick dir | symlink to `<project>/.claude/skills/` |
| MCP | `claude mcp add` or edit in Orbit | `~/.claude.json` local scope |
| Plugin | `claude plugins install` (CLI) | `settings.json` enabledPlugins |
| Bundle | ✚ in Orbit UI | Expanded to MCP + Skill + Plugin set |

### Architecture & Data Layout

Same as <a href="#架构">中文版</a> above. Pure-function core + side-effect shell — all logic testable without Electron.

---

<p align="center">
  <sub>Fine-grained control over which capabilities reach which project.</sub>
  <br/>
  <sub>MIT · 2026</sub>
</p>
