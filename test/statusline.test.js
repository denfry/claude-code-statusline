'use strict';
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.join(__dirname, '..', 'statusline.js');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const run = (input) => strip(spawnSync('node', [script], { input, encoding: 'utf8' }).stdout);

const full = run(JSON.stringify({
  model: { display_name: 'Sonnet' },
  workspace: { current_dir: '.' },
  context_window: {
    total_input_tokens: 1100000, total_output_tokens: 90000, context_window_size: 1000000, used_percentage: 8,
    current_usage: { input_tokens: 4200, cache_creation_input_tokens: 10000, cache_read_input_tokens: 70000 },
  },
}));
assert.match(full, /Context .* 8% {2}84\.2k \/ 1M/);
assert.match(full, /Σ 1\.2M · ↑ in 1\.1M · ↓ out 90k/);
assert.match(full, /◆ Sonnet/);

const empty = run('{}');
assert.match(empty, /Context —/);
assert.match(empty, /Σ 0 · ↑ in 0 · ↓ out 0/);

assert.match(run('not json'), /Context —/);

console.log('ok');
