'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.join(__dirname, '..', 'statusline.js');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// Isolated home so the user's ~/.claude config does not affect the output
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsl-test-'));
fs.mkdirSync(path.join(home, '.claude'));
const setConfig = (cfg) => fs.writeFileSync(path.join(home, '.claude', 'statusline.config.json'), JSON.stringify(cfg));
const run = (input, env = {}) => strip(spawnSync('node', [script], {
  input, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, COLUMNS: '', ...env },
}).stdout);

const payload = {
  model: { display_name: 'Sonnet' },
  effort: { level: 'high' },
  workspace: { current_dir: '.' },
  cost: { total_cost_usd: 1.5, total_duration_ms: 3600000, total_lines_added: 12, total_lines_removed: 3 },
  rate_limits: { five_hour: { used_percentage: 24 } },
  context_window: {
    total_input_tokens: 1100000, total_output_tokens: 90000, context_window_size: 1000000, used_percentage: 8,
    current_usage: { input_tokens: 4200, cache_creation_input_tokens: 10000, cache_read_input_tokens: 70000 },
  },
};

// Main card
const full = run(JSON.stringify(payload));
assert.match(full, /^╭─ ◆ Sonnet · effort high/);
assert.match(full, /Context .* 8% {2}84\.2k \/ 1M/);
assert.match(full, /Σ 1\.2M · ↑ in 1\.1M · ↓ out 90k · cache 83%/);
assert.match(full, /\+12 −3/);
assert.match(full, /\$1\.50 · ⏱ 1h 0m · \$1\.50\/h · 5h 24%/);
assert.match(full, /╰─+╯/);
assert.doesNotMatch(full, /compact soon/);

// Every row of a card has the same width
const widths = new Set(full.trimEnd().split('\n').map((l) => [...l].length));
assert.strictEqual(widths.size, 1, 'rows have different widths');

// Compact warning
const hot = run(JSON.stringify({ ...payload, context_window: { ...payload.context_window, used_percentage: 91 } }));
assert.match(hot, /91%.*⚠ compact soon/);

// Config: threshold, fields and panels
setConfig({ compactWarn: 95, fields: { cache: false, usage: false }, panels: { git: false, setup: false, plugins: false, mcp: false } });
const tuned = run(JSON.stringify({ ...payload, context_window: { ...payload.context_window, used_percentage: 91 } }));
assert.doesNotMatch(tuned, /compact soon|cache|Usage|Setup|⎇ Git/);

// Side panels wrap onto a new row in a narrow terminal
setConfig({ panels: { git: false } });
const wide = run(JSON.stringify(payload), { COLUMNS: '300' });
const narrow = run(JSON.stringify(payload), { COLUMNS: '60' });
assert.match(wide.split('\n')[0], /Setup/);
assert.doesNotMatch(narrow.split('\n')[0], /Setup/);
assert.match(narrow, /Setup/);

// Bad input never crashes
const empty = run('{}');
assert.match(empty, /Context —/);
assert.match(empty, /Σ 0 · ↑ in 0 · ↓ out 0/);
assert.match(run('not json'), /Context —/);

fs.rmSync(home, { recursive: true, force: true });
console.log('ok');
