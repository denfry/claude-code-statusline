#!/usr/bin/env node
'use strict';
// Copies statusline.js to ~/.claude and points settings.json statusLine at it.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = path.join(os.homedir(), '.claude');
const target = path.join(dir, 'statusline.js');
const settingsPath = path.join(dir, 'settings.json');

fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'statusline.js'), target);

let settings = {};
if (fs.existsSync(settingsPath)) {
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
  catch (e) { console.error('settings.json is not valid JSON, fix it first:', e.message); process.exit(1); }
  if (settings.statusLine) {
    const backup = settingsPath + '.statusline-backup.json';
    fs.writeFileSync(backup, JSON.stringify({ statusLine: settings.statusLine }, null, 2));
    console.log('Previous statusLine saved to', backup);
  }
}
settings.statusLine = { type: 'command', command: `node "${target.replace(/\/g, '/')}"` };
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log('Installed. Restart Claude Code to see the new status line.');
