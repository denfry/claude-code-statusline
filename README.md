# claude-code-statusline

A three-row status line for [Claude Code](https://claude.com/claude-code): context bar with a green→red gradient, session token totals, model, folder and git branch. One Node.js file, no dependencies.

```
◆ Sonnet 5.5 · ▸ my-project · ⎇ main
Context ██░░░░░░░░░░░░░░░░░░░░░░  8%  84.2k / 1M
Session Σ 1.2M · ↑ in 1.1M · ↓ out 90k
```

- **Context** — tokens currently in the window (input + cache creation + cache reads), window size and percentage.
- **Session** — total input and output tokens spent in the session.
- Uses truecolor (24-bit) escapes; needs a terminal that supports them.

## Install

Requires Node.js 16+.

```sh
git clone https://github.com/denfry/claude-code-statusline
cd claude-code-statusline
node install.js
```

`install.js` copies `statusline.js` to `~/.claude/` and sets `statusLine` in `~/.claude/settings.json` (an existing `statusLine` is backed up first). Restart Claude Code afterwards.

Manual install: copy `statusline.js` anywhere and add to `settings.json`:

```json
"statusLine": { "type": "command", "command": "node \"/path/to/statusline.js\"" }
```

## Test

```sh
echo '{"model":{"display_name":"Sonnet"},"workspace":{"current_dir":"."},"context_window":{"total_input_tokens":1100000,"total_output_tokens":90000,"context_window_size":1000000,"used_percentage":8,"current_usage":{"input_tokens":4200,"cache_creation_input_tokens":10000,"cache_read_input_tokens":70000}}}' | node statusline.js
```

Missing fields are handled: an empty `{}` input prints `Context —` and zero totals.

## Customize

Colors are in the `C` object and `heat()` at the top of `statusline.js`; rows are built at the bottom of the file.

## License

MIT
