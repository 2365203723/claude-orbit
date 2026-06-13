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

# Install a skill from GitHub (clones, copies into library, mounts to this project)
orbit install-skill owner/repo                    # or a full git URL
orbit install-skill owner/repo --skill-path skills/x   # monorepo: pick one skill
orbit install-skill owner/repo --id my-name --no-mount # rename / library-only

# Install a skill from a local directory containing SKILL.md
orbit import-skill ./path/to/some-skill
orbit scan-skills ./downloaded-skills   # preview what's importable, no changes

# Add an MCP server to the library (then mount it)
orbit add-mcp myserver --command npx --args -y,@scope/pkg --env API_KEY=xxx
orbit add-mcp remote --type http --url https://mcp.example.com/mcp
orbit import-mcp existing-global-id      # pull an existing ~/.claude.json MCP into the library

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

## Installing from external sources (natural language)

When the user says "install X" / "add the Y skill" / "get me an MCP for Z" and the
capability is **not yet in the library**, you find the source and install it. Use your
own judgment and web search — these commands are the primitives, you supply the reasoning.

### Step 0 — Decide the kind, then find the source

1. Classify: is X a **skill** (a SKILL.md directory), an **MCP server** (a launchable
   stdio command or a remote HTTP/SSE endpoint), or a **plugin** (a Claude Code plugin
   from a marketplace)?
2. If the user didn't give a source, **web-search** for it:
   - skill → search `"<name>" skill SKILL.md github` and find the `owner/repo` (+ subpath).
   - MCP → search `"<name>" MCP server` and read the README for the launch command/URL.
   - plugin → search `"<name>" claude code plugin marketplace` for the marketplace id.
3. State the source you chose before acting (e.g. "Found it at `acme/skills`, installing").

### Skills — prefer GitHub direct

```bash
orbit install-skill owner/repo                 # clones + installs + mounts to this project
orbit install-skill owner/repo --skill-path skills/the-one   # monorepo with many skills
orbit install-skill owner/repo --id better-name              # rename / avoid id collision
orbit install-skill owner/repo --no-mount                    # library-only, mount later
```
- If `install-skill` reports **"含多个 skill"**, re-run with `--skill-path` for the one you want.
- If it reports **id 已存在**, use `--id <new>` or `orbit unmount`/`orbit doctor` first.
- For a **private repo**, pass the `git@github.com:owner/repo.git` SSH form (uses the
  user's git credentials).
- **Fallback** (only if you can't find a git repo): the skills.directory CLI —
  `npx skills add <name>` into a temp dir, then `orbit import-skill <dir>` +
  `orbit mount skill <id>`. It may prompt interactively or be unavailable; if so, fall
  back to `install-skill`/`import-skill`.
- Already a local directory on disk → `orbit import-skill <dir>` then `orbit mount skill <id>`.

### MCP servers — construct the definition from intent

```bash
# stdio: from a README "npx ..." launch command
orbit add-mcp myserver --command npx --args -y,@scope/pkg --env API_KEY=xxx
orbit mount mcp myserver

# remote HTTP/SSE endpoint
orbit add-mcp remote --type http --url https://mcp.example.com/mcp
orbit mount mcp remote

# already defined in ~/.claude.json (user ran `claude mcp add`)
orbit import-mcp existing-id
orbit mount mcp existing-id
```
- `add-mcp` does **not** auto-mount — always follow with `orbit mount mcp <id>`.
- If the server needs a secret the user hasn't given, set a placeholder
  (`--env API_KEY=REPLACE_ME`), note `hasSecrets` from the output, and ask the user
  to fill it in (via the Orbit UI 🔑 editor or by re-running with the real value).

### Plugins — guide install, then mount

Orbit does not install plugin payloads (Claude Code does). Tell the user to run:
```bash
claude plugins install <plugin>@<marketplace>
```
Then, after Orbit re-scans (reopen/refresh the app), `orbit list plugins` will show it
and you can `orbit mount plugin <id>`. A freshly installed plugin may not appear in
`orbit list plugins` until Orbit refreshes — say so if it's missing.

## How to handle common requests

**"Package these into a bundle"** → `orbit create-bundle <id> "<name>" --skills a,b --mcp x --plugins p`

**"Some skills are broken / show dead links"** → `orbit doctor`, then `orbit doctor --fix`

**"What does this project have?"** → `orbit project`

## Important

- Always report back the exact `orbit` command you ran and its result.
- After installing a skill, confirm with `orbit project`.
- If a command fails, read the error — usually the id isn't in the library yet (install
  first), there's an id collision (`--id`), or the project path is wrong (`--project`).
- Prefer mounting a **bundle** over many individual items when they belong together.
- Do not install capabilities globally to "make them available everywhere" unless the
  user explicitly asks — that defeats Orbit's isolation.
