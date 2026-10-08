#!/usr/bin/env node
'use strict';
// Status line as framed cards: main card (model, git, context, tokens, cost, limits) plus optional
// Git / Setup / Plugins / MCP panels. Reads JSON from stdin, no deps. Config: ~/.claude/statusline.config.json
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (_) {}
let d = {};
try { d = JSON.parse(raw || '{}') || {}; } catch (_) { d = {}; }

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const fmt = (n) => {
  if (n === null) return '?';
  const f = (x, s) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10) + s;
  if (n >= 1e6) return f(n / 1e6, 'M');
  if (n >= 1e3) return f(n / 1e3, 'k');
  return String(Math.round(n));
};
const dur = (ms) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
};

const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const X = '\x1b[0m', B = '\x1b[1m';
// User config: ~/.claude/statusline.config.json (all keys optional)
const CFG = (() => {
  const def = { theme: 'dracula', maxWidth: 0, compactWarn: 80,
    panels: { git: true, setup: true, plugins: true, mcp: true },
    fields: { git: true, lines: true, usage: true, cache: true, mode: true, clock: true } };
  try {
    const u = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'statusline.config.json'), 'utf8'));
    return { ...def, ...u, panels: { ...def.panels, ...u.panels }, fields: { ...def.fields, ...u.fields } };
  } catch (_) { return def; }
})();
if (process.env.CCSL_PANELS === '0') CFG.panels = { git: false, setup: false, plugins: false, mcp: false };

const THEMES = {
  dracula: { frame: [88, 96, 120], dim: [110, 118, 135], track: [98, 106, 128], label: [122, 130, 150],
    model: [189, 147, 249], dir: [130, 170, 255], br: [80, 250, 123], dirty: [241, 250, 140],
    tot: [139, 233, 253], up: [255, 184, 108], dn: [255, 121, 198], add: [80, 250, 123], del: [255, 85, 85], cost: [241, 250, 140] },
  nord: { frame: [76, 86, 106], dim: [106, 116, 136], track: [94, 104, 124], label: [129, 161, 193],
    model: [180, 142, 173], dir: [136, 192, 208], br: [163, 190, 140], dirty: [235, 203, 139],
    tot: [143, 188, 187], up: [208, 135, 112], dn: [191, 97, 106], add: [163, 190, 140], del: [191, 97, 106], cost: [235, 203, 139] },
  catppuccin: { frame: [88, 91, 112], dim: [127, 132, 156], track: [108, 112, 134], label: [147, 153, 178],
    model: [203, 166, 247], dir: [137, 180, 250], br: [166, 227, 161], dirty: [249, 226, 175],
    tot: [148, 226, 213], up: [250, 179, 135], dn: [245, 194, 231], add: [166, 227, 161], del: [243, 139, 168], cost: [249, 226, 175] },
  mono: { frame: [90, 90, 90], dim: [120, 120, 120], track: [100, 100, 100], label: [140, 140, 140],
    model: [230, 230, 230], dir: [200, 200, 200], br: [200, 200, 200], dirty: [180, 180, 180],
    tot: [220, 220, 220], up: [190, 190, 190], dn: [190, 190, 190], add: [200, 200, 200], del: [160, 160, 160], cost: [220, 220, 220] },
};
const C = Object.fromEntries(Object.entries(THEMES[CFG.theme] || THEMES.dracula).map(([k, v]) => [k, rgb(...v)]));
// green -> yellow -> red for t in 0..1
const heat = (t) => t < 0.5 ? rgb(Math.round(80 + 350 * t), 220, 110) : rgb(255, Math.round(220 - 280 * (t - 0.5)), 90);
const bar = (pct, n = 24) => {
  const fill = Math.max(0, Math.min(n, Math.round((pct / 100) * n)));
  let out = '';
  for (let i = 0; i < n; i++) out += i < fill ? heat(i / (n - 1)) + '█' : C.track + '▒';
  return out + X;
};
const lab = (s) => `${C.label}${s.padEnd(8)}${X}`;
const DOT = ` ${C.track}·${X} `;
const vlen = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;

// git: one `status --porcelain=v2 --branch` call, cached per directory
function gitInfo(dir) {
  const key = crypto.createHash('md5').update(path.resolve(dir)).digest('hex').slice(0, 12);
  const file = path.join(os.tmpdir(), `ccsl-git2-${key}.json`);
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - c.t < 5000) return c;
  } catch (_) {}
  const info = { t: Date.now(), branch: '', upstream: '', ahead: 0, behind: 0, changed: 0, staged: 0, modified: 0, untracked: 0, conflicts: 0, stash: 0, hash: '', subject: '', ago: '' };
  try {
    const r = spawnSync('git', ['--no-optional-locks', 'status', '--porcelain=v2', '--branch'], { cwd: dir, encoding: 'utf8', timeout: 1500, windowsHide: true });
    if (r.status === 0) {
      for (const l of (r.stdout || '').split('\n')) {
        if (l.startsWith('# branch.head ')) info.branch = l.slice(14).trim();
        else if (l.startsWith('# branch.upstream ')) info.upstream = l.slice(18).trim();
        else if (l.startsWith('# branch.ab ')) {
          const m = l.match(/\+(\d+) -(\d+)/);
          if (m) { info.ahead = +m[1]; info.behind = +m[2]; }
        } else if (l && !l.startsWith('#')) {
          info.changed++;
          if (l[0] === '?') info.untracked++;
          else if (l[0] === 'u') info.conflicts++;
          else if (l[0] === '1' || l[0] === '2') {
            if (l[2] !== '.') info.staged++;
            if (l[3] !== '.') info.modified++;
          }
        }
      }
      if (info.branch === '(detached)') info.branch = 'detached';
      const git = (args) => spawnSync('git', ['--no-optional-locks', ...args], { cwd: dir, encoding: 'utf8', timeout: 1500, windowsHide: true });
      const lg = git(['log', '-1', '--format=%h%x09%cr%x09%s']);
      if (lg.status === 0) [info.hash, info.ago, info.subject] = (lg.stdout || '').trim().split('\t');
      const st = git(['rev-list', '--walk-reflogs', '--count', 'refs/stash']);
      if (st.status === 0) info.stash = +(st.stdout || '0').trim() || 0;
    }
  } catch (_) {}
  try { fs.writeFileSync(file, JSON.stringify(info)); } catch (_) {}
  return info;
}

const cw = d.context_window || {};
const size = num(cw.context_window_size);
const cu = cw.current_usage;
let used = null;
if (cu && typeof cu === 'object') {
  used = (num(cu.input_tokens) || 0) + (num(cu.cache_creation_input_tokens) || 0) + (num(cu.cache_read_input_tokens) || 0);
}
if (used === null) used = num(cw.total_input_tokens);
let pct = num(cw.used_percentage);
if (pct === null && used !== null && size) pct = (used / size) * 100;

const model = d.model && (d.model.display_name || d.model.id);
const rows = [];

// Location + git + lines changed
{
  const dir = (d.workspace && d.workspace.current_dir) || d.cwd || '';
  const row = [];
  if (dir) {
    row.push(`${C.dir}▸ ${path.basename(path.resolve(dir)) || dir}${X}`);
    const g = CFG.fields.git ? gitInfo(dir) : {};
    const branch = (d.worktree && d.worktree.branch) || g.branch;
    if (branch) {
      let s = `${C.br}⎇ ${branch}${X}`;
      if (g.ahead) s += ` ${C.up}↑${g.ahead}${X}`;
      if (g.behind) s += ` ${C.dn}↓${g.behind}${X}`;
      if (g.changed) s += ` ${C.dirty}●${g.changed}${X}`;
      row.push(s);
    }
  }
  const cost = d.cost || {};
  const add = num(cost.total_lines_added), del = num(cost.total_lines_removed);
  if (CFG.fields.lines && (add || del)) row.push(`${C.add}+${add || 0}${X} ${C.del}−${del || 0}${X}`);
  if (row.length) rows.push(row.join(DOT));
}

// Context bar
if (size) {
  const p = pct === null ? 0 : pct;
  const col = heat(Math.min(1, p / 100));
  const warn = p >= CFG.compactWarn ? `  ${C.del}${B}⚠ compact soon${X}` : '';
  rows.push(`${lab('Context')}${bar(p)}  ${col}${B}${Math.round(p)}%${X}  ${C.dim}${fmt(used || 0)} / ${fmt(size)}${X}${warn}`);
} else {
  rows.push(`${lab('Context')}${C.dim}—${X}`);
}

// Session tokens
{
  const tin = num(cw.total_input_tokens) || 0;
  const tout = num(cw.total_output_tokens) || 0;
  let cacheStr = '';
  if (CFG.fields.cache && cu && typeof cu === 'object' && used) {
    const share = (num(cu.cache_read_input_tokens) || 0) / used;
    cacheStr = `${DOT}${C.label}cache ${X}${heat(1 - share)}${Math.round(share * 100)}%${X}`;
  }
  rows.push(`${lab('Session')}${C.tot}${B}Σ ${fmt(tin + tout)}${X}${DOT}${C.up}↑ in ${fmt(tin)}${X}${DOT}${C.dn}↓ out ${fmt(tout)}${X}` + cacheStr);
}

// Cost, duration, rate limits (only what Claude Code actually sends)
{
  const cost = d.cost || {};
  const row = [];
  const usd = num(cost.total_cost_usd);
  if (usd !== null) row.push(`${C.cost}$${usd.toFixed(2)}${X}`);
  const ms = num(cost.total_duration_ms);
  if (ms !== null) {
    const api = num(cost.total_api_duration_ms);
    row.push(`${C.dim}⏱ ${dur(ms)}${api !== null ? ` (api ${dur(api)})` : ''}${X}`);
  }
  if (usd !== null && ms > 60000) row.push(`${C.dim}${'$'}${(usd / (ms / 3600000)).toFixed(2)}/h${X}`);
  const rl = d.rate_limits || {};
  for (const [k, name] of [['five_hour', '5h'], ['seven_day', '7d']]) {
    const p = rl[k] && num(rl[k].used_percentage);
    if (p !== null && p !== undefined) {
      const reset = num(rl[k].resets_at);
      const left = reset && k === 'five_hour' ? ` ${C.dim}↻${dur(Math.max(0, reset * 1000 - Date.now()))}${X}` : '';
      row.push(`${C.label}${name} ${X}${heat(Math.min(1, p / 100))}${Math.round(p)}%${X}${left}`);
    }
  }
  if (CFG.fields.usage && row.length) rows.push(`${lab('Usage')}${row.join(DOT)}`);
}

// Extensions scan (skills, plugins, MCP, hooks, agents) — cached, it touches many files
function scanSetup(cwd) {
  const home = path.join(os.homedir(), '.claude');
  const key = crypto.createHash('md5').update(cwd || '').digest('hex').slice(0, 12);
  const file = path.join(os.tmpdir(), `ccsl-setup2-${key}.json`);
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - c.t < 30000) return c;
  } catch (_) {}
  const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };
  const dirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }); } catch (_) { return []; } };
  const countSkills = (p) => dirs(p).filter((e) => e.isDirectory() && fs.existsSync(path.join(p, e.name, 'SKILL.md'))).length;
  const countMd = (p) => dirs(p).filter((e) => e.isFile() && e.name.endsWith('.md')).length;

  const settings = readJson(path.join(home, 'settings.json')) || {};
  const installed = (readJson(path.join(home, 'plugins', 'installed_plugins.json')) || {}).plugins || {};
  const enabled = Object.keys(settings.enabledPlugins || {}).filter((k) => settings.enabledPlugins[k]);
  const s = { t: Date.now(), plugins: enabled.map((k) => k.split('@')[0]), pluginsTotal: Object.keys(installed).length };

  s.skills = countSkills(path.join(home, 'skills'));
  s.agents = countMd(path.join(home, 'agents'));
  s.commands = countMd(path.join(home, 'commands'));
  for (const k of enabled) {
    const ip = installed[k] && installed[k][0] && installed[k][0].installPath;
    if (!ip) continue;
    s.skills += countSkills(path.join(ip, 'skills'));
    s.agents += countMd(path.join(ip, 'agents'));
    s.commands += countMd(path.join(ip, 'commands'));
  }
  if (cwd) {
    s.skills += countSkills(path.join(cwd, '.claude', 'skills'));
    s.agents += countMd(path.join(cwd, '.claude', 'agents'));
    s.commands += countMd(path.join(cwd, '.claude', 'commands'));
  }
  const mcp = new Set(Object.keys((readJson(path.join(os.homedir(), '.claude.json')) || {}).mcpServers || {}));
  if (cwd) for (const n of Object.keys((readJson(path.join(cwd, '.mcp.json')) || {}).mcpServers || {})) mcp.add(n);
  s.mcp = mcp.size;
  const auth = Object.keys(readJson(path.join(home, 'mcp-needs-auth-cache.json')) || {}).map((k) => k.split(':').pop());
  s.mcpList = [...mcp].map((n) => ({ n, auth: auth.includes(n) }));
  for (const a of auth) if (!mcp.has(a)) s.mcpList.push({ n: a, auth: true, plugin: true });
  s.hooks = Object.values(settings.hooks || {}).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
  s.hookEvents = Object.keys(settings.hooks || {}).length;
  try { fs.writeFileSync(file, JSON.stringify(s)); } catch (_) {}
  return s;
}

// Cards
const F = (s) => `${C.frame}${s}${X}`;
function card(title, body, minInner = 0) {
  const inner = Math.max(minInner, title ? vlen(title) + 4 : 0, ...body.map(vlen));
  const top = title
    ? F('╭─ ') + title + ' ' + F('─'.repeat(Math.max(0, inner - vlen(title) - 1)) + '╮')
    : F('╭' + '─'.repeat(inner + 2) + '╮');
  return [top, ...body.map((r) => F('│ ') + r + ' '.repeat(inner - vlen(r)) + F(' │')), F('╰' + '─'.repeat(inner + 2) + '╯')];
}
const sideBySide = (cards) => {
  const h = Math.max(...cards.map((c) => c.length));
  const padded = cards.map((c) => {
    const w = vlen(c[0]), inner = w - 4;
    const fill = Array(h - c.length).fill(F('│ ') + ' '.repeat(inner) + F(' │'));
    return [...c.slice(0, -1), ...fill, c[c.length - 1]];
  });
  return Array.from({ length: h }, (_, i) => padded.map((c) => c[i]).join(' '));
};

const MODES = { plan: ['plan', 'tot'], acceptEdits: ['auto-edit', 'up'], bypassPermissions: ['bypass', 'del'], auto: ['auto', 'dirty'] };
const modeRaw = d.permission_mode || d.permissionMode || '';
const mode = CFG.fields.mode && MODES[modeRaw] && `${C[MODES[modeRaw][1]]}${B}● ${MODES[modeRaw][0]}${X}`;
const effort = d.effort && d.effort.level && `${C.dim}effort ${d.effort.level}${X}`;
const clock = CFG.fields.clock && `${C.dim}${new Date().toTimeString().slice(0, 5)}${X}`;
const title = [model && `${C.model}${B}◆ ${model}${X}`, effort, mode, clock, d.output_style && d.output_style.name && d.output_style.name !== 'default' && `${C.dim}${d.output_style.name}${X}`]
  .filter(Boolean).join(DOT);
const cards = [card(title, rows, 46)];

const kv = (k, v, c) => `${C.label}${k.padEnd(10)}${X}${c}${B}${v}${X}`;
const cut = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
{
  const dir = (d.workspace && d.workspace.current_dir) || d.cwd || '';
  const g = dir && CFG.panels.git ? gitInfo(dir) : null;
  if (g && g.branch) {
    const body = [
      `${C.br}${B}⎇ ${cut(g.branch, 22)}${X}${g.upstream ? ` ${C.dim}→ ${cut(g.upstream, 18)}${X}` : ''}`,
      kv('Sync', `${C.up}↑${g.ahead} ${C.dn}↓${g.behind}`, ''),
      kv('Staged', g.staged, C.add),
      kv('Modified', g.modified, C.dirty),
      kv('Untracked', g.untracked, C.dim),
    ];
    if (g.conflicts) body.push(kv('Conflict', g.conflicts, C.del));
    if (g.stash) body.push(kv('Stash', g.stash, C.dir));
    if (g.hash) body.push(`${C.model}${g.hash}${X} ${cut(g.subject || '', 26)}`, `${C.dim}${g.ago}${X}`);
    let ver = '';
    try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || ''; } catch (_) {}
    cards.push(card(`${C.br}${B}⎇ Git${X}${ver ? ` ${C.dim}v${ver}${X}` : ''}`, body));
  }
}
if (CFG.panels.setup || CFG.panels.plugins || CFG.panels.mcp) {
  const dir = (d.workspace && d.workspace.current_dir) || d.cwd || '';
  const st = scanSetup(dir ? path.resolve(dir) : '');
  if (CFG.panels.setup) cards.push(card(`${C.tot}${B}⚙ Setup${X}`, [
    kv('Plugins', `${st.plugins.length}/${st.pluginsTotal}`, C.model),
    kv('Skills', st.skills, C.br),
    kv('Agents', st.agents, C.dir),
    kv('Commands', st.commands, C.up),
    kv('MCP', st.mcp, C.dn),
    kv('Hooks', `${st.hooks} ${C.dim}/ ${st.hookEvents} ev`, C.cost),
  ]));
  if (CFG.panels.plugins && st.plugins.length) {
    const max = Math.max(rows.length, 6);
    const list = st.plugins.slice(0, max).map((p) => `${C.br}●${X} ${p.length > 18 ? p.slice(0, 17) + '…' : p}`);
    if (st.plugins.length > max) list[max - 1] = `${C.dim}+${st.plugins.length - max + 1} more${X}`;
    cards.push(card(`${C.model}${B}✦ Plugins${X}`, list));
  }
  if (CFG.panels.mcp && st.mcpList && st.mcpList.length) {
    const list = st.mcpList.slice(0, 8).map((m) => `${m.auth ? C.dirty + '◌' : C.br + '●'}${X} ${cut(m.n, 16)}${m.auth ? ` ${C.dim}auth${X}` : ''}`);
    if (st.mcpList.length > 8) list[7] = `${C.dim}+${st.mcpList.length - 7} more${X}`;
    cards.push(card(`${C.dn}${B}⌁ MCP${X}`, list));
  }
}

// Drop right-hand panels that don't fit the terminal
const width = CFG.maxWidth || num(+process.env.COLUMNS) || process.stderr.columns || process.stdout.columns || 0;
const grid = [];
for (const c of cards) {
  const row = grid[grid.length - 1];
  if (row && (!width || row.reduce((a, x) => a + vlen(x[0]) + 1, 0) + vlen(c[0]) <= width)) row.push(c);
  else grid.push([c]);
}

// Orca terminal: hand the payload to its own statusline hook (it throttles itself)
if (process.env.ORCA_AGENT_HOOK_PORT && process.platform === 'win32') {
  const hook = path.join(os.homedir(), '.orca', 'agent-hooks', 'claude-statusline.cmd');
  if (fs.existsSync(hook)) {
    try { spawnSync('cmd.exe', ['/d', '/c', hook], { input: raw, timeout: 2000, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] }); } catch (_) {}
  }
}

process.stdout.write(grid.map((r) => sideBySide(r).join(String.fromCharCode(10))).join('\n') + '\n');
