---
name: orbit-capability-manager
description: Manage Claude Code capabilities (skills, MCP servers, plugins, bundles) through Claude Orbit's rules. Use this skill whenever the user asks to install, add, mount, remove, or package a skill/MCP/plugin into the capability library or into this project — e.g. "install X skill", "add this MCP to the project", "package these into a bundle", "fix broken skills", "what's mounted here". Routes all capability changes through the `orbit` CLI so project isolation and the library source-of-truth are never broken.
---

# Orbit Capability Manager

You are operating inside a project managed by **Claude Orbit** — a tool that gives each
Claude Code project its own isolated set of skills, MCP servers, and plugins. This skill
lets you manage those capabilities **correctly**, through the `orbit` CLI, instead of
hand-editing config files (which breaks isolation and the library source-of-truth).

## The golden rules

1. **Never directly edit** `~/.claude.json`, `~/.claude/skills/`, project `.claude/settings.json`,
   or create symlinks by hand. Always go through `orbit`.
2. **Two-step model**: capabilities first live in the **library**
   (`~/.claude-orbit/library/skills/`), then get **mounted** to a project. Install → mount.
3. **MCP isolation**: MCP servers are written to `~/.claude.json` path-exact local scope by
   Orbit — never to `.mcp.json` (which leaks into subdirectories).
4. The current working directory IS the target project unless the user says otherwise.

## Commands

Run `orbit help` to see everything. Common flows:

```bash
# See what's available and what's mounted here
orbit list skills          # or: mcp | plugins | bundles | all
orbit project              # what this project currently has mounted

# Install a skill into the Orbit library (from a local directory containing SKILL.md)
orbit import-skill ./path/to/some-skill
orbit scan-skills ./downloaded-skills   # preview what's importable, no changes

# Mount / unmount a capability to THIS project
orbit mount skill some-skill            # also: mcp <id> | plugin <id> | bundle <id>
orbit unmount skill some-skill

# Bundle several capabilities into one draggable pack
orbit create-bundle my-pack "My Pack" --skills a,b,c --mcp firecrawl

# Diagnose & repair broken skill links
orbit doctor                # list dead-link skills
orbit doctor --fix          # auto-repair (from global copy or git source)
```

Add `--json` to any command to get structured output you can parse.
Add `--project <path>` to target a different project than the cwd.

## How to handle common requests

**"Install / add the X skill to this project"**
1. Locate the skill source. If the user gives a directory → `orbit import-skill <dir>`.
   If they name a known skill, check `orbit list skills --json` first — it may already
   be in the library.
2. `orbit mount skill <id>` to activate it in this project.
3. Confirm with `orbit project`.

**"Add an MCP server (e.g. firecrawl) to this project"**
- If it's already in the library: `orbit mount mcp <id>`.
- If brand new: the user must first define it (MCP definitions live in `~/.claude.json`
  global `mcpServers`, usually added via `claude mcp add`). Then it appears in
  `orbit list mcp` and you can mount it.

**"Package these into a bundle"**
- `orbit create-bundle <id> "<name>" --skills a,b --mcp x --plugins p`

**"Some skills are broken / show dead links"**
- `orbit doctor` to see them, `orbit doctor --fix` to repair.

**"What does this project have?"**
- `orbit project`

## Important

- Always report back the exact `orbit` command you ran and its result.
- If a command fails, read the error — usually it means the id isn't in the library yet
  (import first) or the project path is wrong (pass `--project`).
- Prefer mounting a **bundle** over many individual items when they belong together.
- Do not install capabilities globally to "make them available everywhere" unless the
  user explicitly asks — that defeats Orbit's isolation.
