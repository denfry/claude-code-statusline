# claude-code-statusline

[![test](https://github.com/denfry/claude-code-statusline/actions/workflows/test.yml/badge.svg)](https://github.com/denfry/claude-code-statusline/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![node >=16](https://img.shields.io/badge/node-%3E%3D16-blue)
![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)

A status line for [Claude Code](https://claude.com/claude-code) drawn as framed cards: a context bar with a green→red gradient, tokens, cost, rate limits and git in the main card, plus optional Git, Setup, Plugins and MCP panels on the right. One Node.js file, no dependencies, four color themes.

```
╭─ ◆ Opus 5.5 · effort low · 11:23 ─────────────────╮ ╭─ ⎇ Git v2.0.0 ──────────────────╮ ╭─ ⚙ Setup ────────────╮
│ ▸ my-project · ⎇ main ●2 · +97 −25                │ │ ⎇ main → origin/main            │ │ Plugins   6/19       │
│ Context ███▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  11%  112k / 1M  │ │ Sync      ↑0 ↓0                 │ │ Skills    397        │
│ Session Σ 113k · ↑ in 113k · ↓ out 3 · cache 99%  │ │ Staged    0                     │ │ Agents    87         │
│ Usage   $1.78 · ⏱ 25m 5s · $4.26/h · 5h 24% ↻1h   │ │ Modified  2                     │ │ Commands  100        │
│                                                   │ │ Untracked 0                     │ │ MCP       7          │
│                                                   │ │ 8c2ca33 docs: readme            │ │ Hooks     18 / 13 ev │
╰───────────────────────────────────────────────────╯ ╰─────────────────────────────────╯ ╰──────────────────────╯
```

## Features

**Main card**

- **Title** — model, effort level, permission mode (if Claude Code sends it), output style, clock.
- **Location** — folder, git branch with ahead/behind (`↑ ↓`) and changed files (`●`), lines added/removed this session.
- **Context bar** — tokens currently in the window (input + cache creation + cache reads), window size and percent. Goes green → yellow → red and shows `⚠ compact soon` past a threshold.
- **Session** — total input/output tokens and the share of input served from the prompt cache.
- **Usage** — cost, session and API time, cost per hour, 5-hour and 7-day rate limits with time to reset.

**Side panels** (each can be turned off)

- **Git** — branch → upstream, ahead/behind, staged / modified / untracked / conflicts, stash, last commit, project version from `package.json`.
- **Setup** — enabled/installed plugins and counts of skills, agents, commands, MCP servers and hooks (user, plugins and project).
- **Plugins** — names of enabled plugins.
- **MCP** — server names; `◌ auth` marks servers waiting for authentication.

Panels wrap onto another row when the terminal is too narrow. Missing fields or invalid JSON never crash the script: you get `Context —` and zero totals.

## Requirements

- Node.js 16+
- A terminal with truecolor (24-bit) support: Windows Terminal, iTerm2, kitty, WezTerm, VS Code and most modern terminals.

## Install

```sh
git clone https://github.com/denfry/claude-code-statusline
cd claude-code-statusline
node install.js
```

`install.js` copies `statusline.js` to `~/.claude/` and sets `statusLine` in `~/.claude/settings.json`. An existing `statusLine` is saved to `settings.json.statusline-backup.json` first. Restart Claude Code afterwards.

<details>
<summary>Manual install</summary>

Copy `statusline.js` anywhere and add to `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "node \"/path/to/statusline.js\"" }
```

</details>

## Configuration

Optional. Copy [`statusline.config.example.json`](statusline.config.example.json) to `~/.claude/statusline.config.json` and keep only what you want to change; missing keys fall back to defaults. Changes apply on the next redraw, no restart needed.

```json
{
  "theme": "dracula",
  "compactWarn": 80,
  "maxWidth": 0,
  "panels": { "git": true, "setup": true, "plugins": true, "mcp": true },
  "fields": { "git": true, "lines": true, "usage": true, "cache": true, "mode": true, "clock": true }
}
```

| Key | Meaning |
| --- | --- |
| `theme` | `dracula`, `nord`, `catppuccin` or `mono`. |
| `compactWarn` | Context percentage at which `⚠ compact soon` appears. |
| `maxWidth` | Width used to wrap panels. `0` takes it from `COLUMNS`. |
| `panels.*` | Show or hide the Git, Setup, Plugins and MCP panels. |
| `fields.git` | Branch, ahead/behind and changed files in the main card. |
| `fields.lines` | Lines added/removed this session. |
| `fields.usage` | The `Usage` row: cost, duration, $/h, rate limits. |
| `fields.cache` | Share of input served from the prompt cache. |
| `fields.mode` | Permission mode badge. |
| `fields.clock` | Current time in the title. |

Setting `CCSL_PANELS=0` in the environment turns all side panels off.

Example — only the main card and Git:

```json
{ "panels": { "setup": false, "plugins": false, "mcp": false } }
```

## Uninstall

```sh
node uninstall.js
```

Restores the previous `statusLine` if there was one, otherwise removes it, and deletes `~/.claude/statusline.js`. Delete `~/.claude/statusline.config.json` yourself if you created it.

## How it works

Claude Code runs the command from `statusLine` and sends session data as JSON on stdin; whatever the script prints becomes the status line. It reads `model`, `effort`, `workspace`, `worktree`, `cost`, `rate_limits`, `output_style` and `context_window`, and shows only what is present.

Side panels read local files: `~/.claude/settings.json`, `~/.claude/plugins/installed_plugins.json`, `~/.claude.json`, and the project's `.mcp.json` and `.claude/` folder. Git data comes from one `git status --porcelain=v2 --branch` plus `git log -1`. Both results are cached in the temp directory (git for 5 s, the setup scan for 30 s), so redraws stay cheap. The status line runs locally and adds nothing to the model's context.

Inside the Orca terminal the payload is also passed to Orca's own statusline hook, so its integration keeps working.

## Test

```sh
npm test
```

The tests run with an isolated home directory, so your own `~/.claude` config does not affect them.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Nothing shows up | Restart Claude Code; check that `node` is in the `PATH` Claude Code uses and that `statusLine` in `settings.json` points to an existing file. |
| Strange colors | The terminal lacks truecolor support; try `"theme": "mono"`. |
| Panels are cut off | Set `maxWidth` to your terminal width, or turn some panels off. |
| Git panel lags behind | Git info is cached for 5 s, the setup scan for 30 s. |
| Everything is zero | Normal at the very start of a session; values appear after the first reply. |

## License

[MIT](LICENSE)
