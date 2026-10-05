#!/usr/bin/env node
'use strict';
// Status line (3 rows): model/location, context bar, session tokens.
// Reads JSON from stdin, no external deps.
const fs = require('fs');
const path = require('path');
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

const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const X = '\x1b[0m', B = '\x1b[1m';
const C = {
  dim: rgb(110, 118, 135), track: rgb(98, 106, 128), label: rgb(122, 130, 150),
  model: rgb(189, 147, 249), dir: rgb(130, 170, 255), br: rgb(80, 250, 123),
  tot: rgb(139, 233, 253), up: rgb(255, 184, 108), dn: rgb(255, 121, 198),
};
// green -> yellow -> red for t in 0..1
const heat = (t) => t < 0.5 ? rgb(Math.round(80 + 350 * t), 220, 110) : rgb(255, Math.round(220 - 280 * (t - 0.5)), 90);
const bar = (pct, n = 24) => {
  const fill = Math.max(0, Math.min(n, Math.round((pct / 100) * n)));
  let out = '';
  for (let i = 0; i < n; i++) out += i < fill ? heat(i / (n - 1)) + '█' : C.track + '░';
  return out + X;
};
const lab = (s) => `${C.label}${s.padEnd(8)}${X}`;
const DOT = ` ${C.track}·${X} `;

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

const lines = [];

// Row 1: model + folder + branch
{
  const model = d.model && (d.model.display_name || d.model.id);
  const dir = (d.workspace && d.workspace.current_dir) || d.cwd || '';
  const row = [];
  if (model) row.push(`${C.model}${B}◆ ${model}${X}`);
  if (dir) {
    const loc = path.basename(path.resolve(dir)) || dir;
    let branch = (d.worktree && d.worktree.branch) || '';
    if (!branch) {
      try {
        const r = spawnSync('git', ['--no-optional-locks', 'branch', '--show-current'], { cwd: dir, encoding: 'utf8', timeout: 1500, windowsHide: true });
        if (r.status === 0) branch = (r.stdout || '').trim();
      } catch (_) {}
    }
    row.push(`${C.dir}▸ ${loc}${X}`);
    if (branch) row.push(`${C.br}⎇ ${branch}${X}`);
  }
  if (row.length) lines.push(row.join(DOT));
}

// Row 2: context bar
if (size) {
  const p = pct === null ? 0 : pct;
  const col = heat(Math.min(1, p / 100));
  lines.push(`${lab('Context')}${bar(p)}  ${col}${B}${Math.round(p)}%${X}  ${C.dim}${fmt(used || 0)} / ${fmt(size)}${X}`);
} else {
  lines.push(`${lab('Context')}${C.dim}—${X}`);
}

// Row 3: session totals
{
  const tin = num(cw.total_input_tokens) || 0;
  const tout = num(cw.total_output_tokens) || 0;
  lines.push(`${lab('Session')}${C.tot}${B}Σ ${fmt(tin + tout)}${X}${DOT}${C.up}↑ in ${fmt(tin)}${X}${DOT}${C.dn}↓ out ${fmt(tout)}${X}`);
}

process.stdout.write(lines.join('\n') + '\n');
