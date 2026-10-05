#!/usr/bin/env node
'use strict';
// Removes the status line from settings.json and restores the previous one if install.js saved it.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = path.join(os.homedir(), '.claude');
const settingsPath = path.join(dir, 'settings.json');
const backupPath = settingsPath + '.statusline-backup.json';

if (!fs.existsSync(settingsPath)) { console.log('Nothing to do: no settings.json.'); process.exit(0); }
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

if (fs.existsSync(backupPath)) {
  settings.statusLine = JSON.parse(fs.readFileSync(backupPath, 'utf8')).statusLine;
  fs.unlinkSync(backupPath);
  console.log('Restored the previous statusLine.');
} else {
  delete settings.statusLine;
  console.log('Removed statusLine from settings.json.');
}
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
try { fs.unlinkSync(path.join(dir, 'statusline.js')); } catch (_) {}
console.log('Restart Claude Code to apply.');
