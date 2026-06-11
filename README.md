<p align="center">
  <img src="docs/screenshots/canvas.png" alt="Claude Orbit" width="100%" />
</p>

# Claude Orbit

**Visual capability assembly station for Claude Code.** Drag MCP servers, Skills, and Plugins onto project planets — instantly applied, perfectly isolated.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-101%20passed-green)](https://github.com/2365203723/claude-orbit/actions)
[![Electron](https://img.shields.io/badge/Electron-33%2B-47848f)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6%2B-3178c6)](https://www.typescriptlang.org/)

---

## Why Claude Orbit?

Claude Code's MCP servers, Skills, and Plugins are global by default — they inject into **every** project. Want *this* project to use only a specific set of capabilities? That's what Orbit is for.

- **Drag & drop** capabilities from the library rail onto project planets
- **Instant apply** — no separate "Apply" step; changes hit disk the moment you drop
- **True isolation** — every assignment is path-exact; no inheritance leaks between nested projects
- **Visual feedback** — satellites orbit each planet; green = applied, orange = pending on Global

<p align="center">
  <img src="docs/screenshots/detail.png" alt="Detail Panel" width="49%" />
  <span width="2%"></span>
  <span width="49%"></span>
</p>

## Features

| Category | Detail |
|----------|--------|
| **Reverse Import** | Scans your real `~/.claude.json`, `.mcp.json`, skills, plugins on launch — no manual setup |
| **Planet Graph** | Projects are liquid-glass planets with orbiting satellite badges for each capability |
| **Library Rail** | Browse MCPs / Skills / Plugins / Snippets / Bundles in categorized sections |
| **Drag = Apply** | Drag a capability onto a planet → written to disk immediately, satellite turns green |
| **Bundles** | Pre-grouped capability sets (e.g. the Firecrawl bundle = 1 MCP + 29 skills) — drag once |
| **Global Planet** | Manage what's globally available in `~/.claude.json` and `~/.claude/skills/` |
| **Dual Theme** | Light / Dark — warm Claude-toned liquid glass aesthetic |
| **Env Editor** | Edit MCP environment variables (secrets masked, never stored in plaintext) |
| **Undo** | Hover any satellite for a × button; or use the detail panel to unassign any capability |
| **Backups** | Every write backs up affected files to `~/.claude-orbit/backups/` with timestamps |

## Quick Start

```bash
git clone git@github.com:2365203723/claude-orbit.git
cd claude-orbit
npm install
npm run dev      # Electron dev mode with hot reload
```

Production build:

```bash
npm run build    # outputs to out/
npm start        # preview production build
```

Run the test suite:

```bash
npm test         # 101 tests, Vitest
```

## Architecture

```
┌─────────────────┐
│   Library Rail  │  MCP / Skills / Plugins / Snippets / Bundles
│   (left panel)  │
└────────┬────────┘
         │ drag & drop
         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Desired State  │────▶│   executeApply   │────▶│  Real Config Files  │
│  (state.json)   │     │  (diff → backup  │     │  ~/.claude.json     │
│                 │     │   → write → save)│     │  project/.claude/   │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
         ▲                                               │
         │          reverse import on startup            │
         └───────────────────────────────────────────────┘
```

**Key design decisions:**

- **All MCP routing → local scope** (`~/.claude.json` `projects[path].mcpServers`) — path-exact, no inheritance. We deliberately do **not** write `.mcp.json` because it leaks into subdirectories.
- **Skills → symlinks** in `<project>/.claude/skills/<id>` → library source.
- **Plugins → `settings.json`** (`enabledPlugins` key).
- **Secrets stay in `~/.claude.json`** never in project-committable files.

## Data Layout

| Path | Purpose |
|------|---------|
| `~/.claude.json` | Project-scoped MCP servers (local scope), managed by Orbit |
| `<project>/.claude/skills/` | Skill symlinks per project |
| `<project>/.claude/settings.json` | Enabled plugins per project |
| `~/.claude-orbit/state.json` | Desired state (assignments + library index) |
| `~/.claude-orbit/backups/` | Timestamped pre-write backups |

No bundled presets — everything is discovered from your machine on first launch.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | **Electron 33** |
| UI | **React 18** + **React Flow 11** (canvas graph) |
| Animation | **Motion** (spring physics) |
| Language | **TypeScript 5.6** — full stack |
| Testing | **Vitest** — 101 tests, pure-function core |
| Build | **electron-vite** |

Main process follows a **pure-function core + side-effect shell** pattern: all logic (compile, diff, merge, assign) is testable without Electron.

## License

MIT © 2026

---

<p align="center">
  <sub>Built for Claude Code power users who want fine-grained control over which capabilities reach which project.</sub>
</p>
